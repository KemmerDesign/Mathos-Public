"""
Mathós — Router del asistente chat con RAG.

Endpoints:
  POST /api/v1/asistente/preguntar   — Consulta RAG + IA (chat o teoría)
  POST /api/v1/asistente/evaluar     — Evalúa respuesta de taller con IA
  GET  /api/v1/asistente/colecciones — Lista colecciones ChromaDB
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Dominio, Tema
from services.asistente_service import (
    COLECCIONES_MATERIAS,
    evaluar_respuesta,
    preguntar,
    preguntar_con_imagen,
    preguntar_modo_teoria,
)
from shared.database import get_session

router = APIRouter()


# ──────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────
class PreguntarRequest(BaseModel):
    pregunta: str = Field(..., min_length=1, max_length=5000, description="Pregunta del usuario")
    tema_id: Optional[str] = Field(None, description="ID del tema (opcional)")
    codigo_materia: Optional[str] = Field(
        None,
        description="Código UNED de la materia (ej: 6102210-). Si no se especifica, se usa la colección por defecto.",
    )
    nivel: str = Field(
        "normal",
        pattern="^(dummy|normal)$",
        description="Nivel de explicación: 'dummy' para principiantes, 'normal' para estándar",
    )
    modo: str = Field(
        "chat",
        pattern="^(chat|teoria)$",
        description="Modo de respuesta: 'chat' conversacional, 'teoria' estructurada con secciones markdown",
    )


class FuenteItem(BaseModel):
    documento: str
    distancia: float
    metadata: dict


class PreguntarResponse(BaseModel):
    respuesta: str
    fuentes: list[FuenteItem]
    cache: str = "MISS"  # HIT = caché (gratis), MISS = IA generada (tokens $$)


class EvaluarRequest(BaseModel):
    tema_id: str = Field(..., description="UUID del tema a evaluar")
    respuesta: str = Field(
        ..., min_length=1, max_length=5000, description="Respuesta textual del estudiante"
    )
    codigo: Optional[str] = Field(
        None, max_length=5000, description="Código C++ del estudiante (opcional)"
    )
    dificultad: str = Field(
        "intermedio",
        pattern="^(basico|intermedio|avanzado)$",
        description="Dificultad de la evaluación",
    )
    modo_evaluacion: str = Field(
        "tecnico",
        pattern="^(feynman|tecnico)$",
        description="Modo Feynman (explicación simple) o Técnico (código/análisis puro)",
    )


class EvaluarResponse(BaseModel):
    puntuacion: int = Field(..., ge=0, le=100, description="Puntuación 0-100")
    feedback: str = Field(..., description="Feedback detallado en markdown")
    completado: bool = Field(..., description="True si puntuacion >= 70")


class ColeccionItem(BaseModel):
    codigo_materia: str
    nombre_coleccion: str
    nombre_materia: str


class ColeccionesResponse(BaseModel):
    colecciones: list[ColeccionItem]


# Mapeo legible para el endpoint GET colecciones
NOMBRES_MATERIAS: dict[str, str] = {
    "6102210-": "Lenguajes de Programación",
    "61021105": "Geometría Básica",
}


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────
@router.post(
    "/preguntar",
    response_model=PreguntarResponse,
    summary="Hacer una pregunta al asistente con RAG",
    description=(
        "Procesa una pregunta del usuario: consulta ChromaDB para recuperar "
        "contexto relevante de los apuntes de la materia y la envía a DeepSeek "
        "(o Qwen como fallback) para generar una respuesta contextualizada.\n\n"
        "Modo 'chat' (default): respuesta conversacional.\n"
        "Modo 'teoria': respuesta estructurada con Objetivos, Desarrollo, Ejemplos y Ejercicios."
    ),
)
async def preguntar_endpoint(body: PreguntarRequest) -> PreguntarResponse:
    """
    Endpoint principal del asistente RAG.

    Recibe una pregunta, opcionalmente filtrada por tema y/o código de materia.
    Retorna la respuesta del modelo + las fuentes (chunks) usadas de ChromaDB.

    El campo 'modo' controla el formato de la respuesta:
    - "chat" (default): respuesta conversacional normal.
    - "teoria": genera teoría estructurada con secciones markdown.
    """
    try:
        if body.modo == "teoria":
            resultado = await preguntar_modo_teoria(
                pregunta=body.pregunta,
                tema_id=body.tema_id,
                codigo_materia=body.codigo_materia,
            )
        else:
            resultado = await preguntar(
                pregunta=body.pregunta,
                tema_id=body.tema_id,
                codigo_materia=body.codigo_materia,
                nivel=body.nivel,
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error procesando la pregunta: {e}",
        )

    return PreguntarResponse(
        respuesta=resultado["respuesta"],
        fuentes=[
            FuenteItem(
                documento=f["documento"],
                distancia=f["distancia"],
                metadata=f["metadata"],
            )
            for f in resultado.get("fuentes", [])
        ],
        cache=resultado.get("cache", "MISS"),
    )


@router.post(
    "/preguntar-con-imagen",
    response_model=PreguntarResponse,
    summary="Hacer una pregunta al asistente adjuntando una imagen o PDF",
    description=(
        "Acepta una imagen (JPEG, PNG, WebP, GIF) o PDF junto con una pregunta textual. "
        "Gemini Vision transcribe el contenido matemático del adjunto, y DeepSeek/Qwen "
        "responde teniendo en cuenta tanto la pregunta como lo que el estudiante escribió."
    ),
)
async def preguntar_con_imagen_endpoint(
    pregunta: str = Form(
        "",
        max_length=5000,
        description="Pregunta del estudiante (puede estar vacía si la imagen es auto-explicativa)",
    ),
    archivo: UploadFile = File(..., description="Imagen (JPEG/PNG/WebP/GIF) o PDF, máx 15 MB"),
    nivel: str = Form("normal", description="Nivel: 'normal' o 'dummy'"),
    codigo_materia: Optional[str] = Form(None),
    tema_id: Optional[str] = Form(None),
) -> PreguntarResponse:
    """
    Endpoint de chat con adjunto visual.

    1. Lee el archivo subido.
    2. Llama a Gemini Vision para transcribir el contenido matemático.
    3. Combina transcripción + pregunta y llama a preguntar() con RAG.
    """
    TIPOS_PERMITIDOS = {
        "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
    }
    content_type = archivo.content_type or ""
    if content_type and content_type not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo no soportado: {content_type}. Usa imagen (JPEG/PNG/WebP/GIF) o PDF.",
        )

    try:
        archivo_bytes = await archivo.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo el archivo: {e}")

    if not archivo_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    if len(archivo_bytes) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo excede el límite de 15 MB.")

    if nivel not in ("normal", "dummy"):
        nivel = "normal"

    try:
        resultado = await preguntar_con_imagen(
            pregunta=pregunta,
            imagen_bytes=archivo_bytes,
            tema_id=tema_id,
            codigo_materia=codigo_materia,
            nivel=nivel,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando el adjunto: {e}")

    return PreguntarResponse(
        respuesta=resultado["respuesta"],
        fuentes=[
            FuenteItem(
                documento=f["documento"],
                distancia=f["distancia"],
                metadata=f["metadata"],
            )
            for f in resultado.get("fuentes", [])
        ],
        cache=resultado.get("cache", "MISS"),
    )


@router.post(
    "/evaluar",
    response_model=EvaluarResponse,
    summary="Evaluar respuesta de taller con IA",
    description=(
        "Evalúa la respuesta (texto y/o código C++) de un estudiante contra "
        "los objetivos de aprendizaje del tema, usando DeepSeek como 'profesor "
        "estricto de la UNED'. Retorna puntuación 0-100, feedback detallado en "
        "markdown, y si está completado (>=70).\n\n"
        "Si completado=true, actualiza la tabla Dominio: nivel='dominado', "
        "tests_superados+=1, ultimo_estudio=now()."
    ),
)
async def evaluar_endpoint(
    body: EvaluarRequest,
    session: AsyncSession = Depends(get_session),
) -> EvaluarResponse:
    """
    Evalúa la respuesta de un taller usando IA.

    1. Consulta el nombre del tema y código de materia desde la BD.
    2. Consulta ChromaDB para obtener contexto RAG.
    3. Envía a DeepSeek prompt de "profesor estricto de la UNED".
    4. Si completado, actualiza Dominio en BD.
    """
    # Obtener información del tema desde la BD
    tema_result = await session.execute(
        select(Tema)
        .options(selectinload(Tema.materia))
        .where(Tema.id == body.tema_id)
    )
    tema = tema_result.scalar_one_or_none()
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    tema_nombre = tema.nombre
    # Usar código UNED si existe; si no, usar nombre de la materia (filosofía, etc.)
    codigo_materia = (
        tema.materia.codigo_uned or tema.materia.nombre
    ) if tema.materia else None

    try:
        resultado = await evaluar_respuesta(
            tema_nombre=tema_nombre,
            respuesta=body.respuesta,
            codigo_materia=codigo_materia,
            codigo=body.codigo,
            dificultad=body.dificultad,
            modo_evaluacion=body.modo_evaluacion,
            tema_id=body.tema_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error evaluando la respuesta: {e}",
        )

    # Si completado, actualizar/crear registro Dominio
    if resultado["completado"]:
        dom_result = await session.execute(
            select(Dominio).where(Dominio.tema_id == body.tema_id)
        )
        dominio = dom_result.scalar_one_or_none()
        if not dominio:
            dominio = Dominio(tema_id=body.tema_id)
            session.add(dominio)

        dominio.nivel = "dominado"
        dominio.tests_superados = (dominio.tests_superados or 0) + 1
        dominio.ultimo_estudio = datetime.now(timezone.utc)

    await session.flush()

    return EvaluarResponse(
        puntuacion=resultado["puntuacion"],
        feedback=resultado["feedback"],
        completado=resultado["completado"],
    )


@router.get(
    "/colecciones",
    response_model=ColeccionesResponse,
    summary="Listar colecciones disponibles en ChromaDB",
    description=(
        "Devuelve las colecciones de ChromaDB disponibles para Mathós, "
        "mapeadas por código UNED de materia."
    ),
)
async def listar_colecciones() -> ColeccionesResponse:
    """
    Retorna la lista de colecciones ChromaDB configuradas para Mathós.
    """
    items = []
    for codigo, nombre_col in COLECCIONES_MATERIAS.items():
        items.append(
            ColeccionItem(
                codigo_materia=codigo,
                nombre_coleccion=nombre_col,
                nombre_materia=NOMBRES_MATERIAS.get(codigo, "Desconocida"),
            )
        )

    return ColeccionesResponse(colecciones=items)
