"""
Mathós — Router de simulacro de examen.

Endpoints:
  POST /api/v1/simulacro/generar  — Genera examen usando IA
  POST /api/v1/simulacro/corregir — Corrige respuestas usando IA
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from datetime import datetime, timezone

from models import ErrorLog, Materia, Tema, Dominio
from services.simulacro_service import generar_examen, corregir_examen, corregir_mcq
from services.dominio_service import actualizar_dominio
from shared.database import get_session

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────
class GenerarSimulacroRequest(BaseModel):
    materia_id: str = Field(..., description="UUID de la materia")
    num_preguntas: int = Field(default=10, ge=1, le=50, description="Número de preguntas")
    tipo_examen: str = Field(default="desarrollo", description="'desarrollo' (open-ended) o 'mcq' (multiple choice)")
    tema_ids: list[str] | None = Field(default=None, description="Si se indica, solo genera preguntas de esos temas")


class PreguntaSimulacro(BaseModel):
    id: int
    tema: str
    tipo: str
    enunciado: str
    puntuacion_maxima: float = 10.0
    criterios_evaluacion: list[str] = []


class GenerarSimulacroResponse(BaseModel):
    examen_id: str
    materia_id: str
    titulo: str
    instrucciones: str
    duracion_minutos: int
    preguntas: list[dict]
    generado_en: str


class RespuestaItem(BaseModel):
    pregunta_id: int
    respuesta_texto: str = ""


class CorregirSimulacroRequest(BaseModel):
    materia_id: str
    materia_nombre: str
    preguntas: list[dict]
    respuestas: list[RespuestaItem]
    tipo_examen: str = Field(default="desarrollo")


class PreguntaCorregida(BaseModel):
    id: int
    puntuacion: float
    puntuacion_maxima: float
    feedback: str
    respuesta_modelo: str


class CorregirSimulacroResponse(BaseModel):
    puntuacion_total: float
    aprobado: bool
    feedback_general: str
    preguntas: list[dict]
    corregido_en: str
    # MCQ extras
    tipo: str = "desarrollo"
    correctas: int = 0
    total: int = 0


# ── Endpoints ─────────────────────────────────────────────

@router.post(
    "/generar",
    response_model=GenerarSimulacroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generar examen simulado con IA",
)
async def generar_simulacro(
    body: GenerarSimulacroRequest,
    session: AsyncSession = Depends(get_session),
):
    """Genera un examen simulado basado en todos los temas de la materia."""
    # Cargar materia con todos sus temas
    result = await session.execute(
        select(Materia)
        .options(selectinload(Materia.temas).selectinload(Tema.dominio))
        .where(Materia.id == body.materia_id)
    )
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if not materia.temas:
        raise HTTPException(status_code=422, detail="La materia no tiene temas")

    # Construir lista de temas — filtrar si se pidieron temas específicos
    temas_fuente = materia.temas
    if body.tema_ids:
        temas_fuente = [t for t in materia.temas if t.id in body.tema_ids]
        if not temas_fuente:
            raise HTTPException(status_code=422, detail="Ningún tema_id coincide con los temas de esta materia")

    temas_contenido = []
    for tema in temas_fuente:
        temas_contenido.append({
            "tema_id": tema.id,
            "tema_nombre": tema.nombre,
            "descripcion": tema.descripcion or "",
            "nivel": tema.dominio.nivel if tema.dominio else "no_iniciado",
        })

    try:
        examen = await generar_examen(
            materia_nombre=materia.nombre,
            temas_contenido=temas_contenido,
            num_preguntas=body.num_preguntas,
            tipo_examen=body.tipo_examen,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error al generar el examen con IA: {str(e)}"
        )

    return GenerarSimulacroResponse(
        examen_id=f"sim-{materia.id[:8]}-{examen.get('generado_en', '')}",
        materia_id=body.materia_id,
        titulo=examen.get("titulo", f"Examen de {materia.nombre}"),
        instrucciones=examen.get("instrucciones", ""),
        duracion_minutos=examen.get("duracion_minutos", 120),
        preguntas=examen.get("preguntas", []),
        generado_en=examen.get("generado_en", ""),
    )


@router.post(
    "/corregir",
    response_model=CorregirSimulacroResponse,
    summary="Corregir examen simulado con IA",
)
async def corregir_simulacro(
    body: CorregirSimulacroRequest,
    session: AsyncSession = Depends(get_session),
):
    """Corrige las respuestas del estudiante.

    Para MCQ: corrección instantánea sin IA (compara opción seleccionada vs correcta).
    Para desarrollo: corrección con IA (DeepSeek/QWEN).
    """
    if not body.respuestas:
        raise HTTPException(status_code=422, detail="No hay respuestas para corregir")

    try:
        if body.tipo_examen == "mcq":
            correccion = corregir_mcq(
                preguntas=body.preguntas,
                respuestas=[r.model_dump() for r in body.respuestas],
            )
            # Persistir errores en ErrorLog para análisis posterior
            preguntas_map = {p["id"]: p for p in body.preguntas}
            for pc in correccion.get("preguntas", []):
                if not pc.get("acertada"):
                    p_orig = preguntas_map.get(pc["id"], {})
                    existing = await session.execute(
                        select(ErrorLog).where(
                            ErrorLog.materia_id == body.materia_id,
                            ErrorLog.pregunta_texto == p_orig.get("enunciado", ""),
                        )
                    )
                    ex = existing.scalar_one_or_none()
                    if ex:
                        ex.veces_fallada += 1
                        ex.ultima_vez = datetime.now(timezone.utc)
                        ex.respuesta_estudiante = pc.get("respuesta_estudiante", "")
                    else:
                        session.add(ErrorLog(
                            materia_id=body.materia_id,
                            pregunta_texto=p_orig.get("enunciado", ""),
                            respuesta_correcta=pc.get("respuesta_correcta", ""),
                            respuesta_estudiante=pc.get("respuesta_estudiante", ""),
                            fuente="simulacro_mcq",
                        ))
        else:
            correccion = await corregir_examen(
                materia_nombre=body.materia_nombre,
                preguntas=body.preguntas,
                respuestas=[r.model_dump() for r in body.respuestas],
            )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error al corregir el examen: {str(e)}"
        )

    # ── Actualizar dominio por tema ────────────────────────────────────────
    try:
        temas_result = await session.execute(
            select(Tema).where(Tema.materia_id == body.materia_id)
        )
        temas_map = {t.nombre: t.id for t in temas_result.scalars().all()}

        if body.tipo_examen == "mcq":
            # Calcular aciertos por tema
            tema_hits: dict[str, list[bool]] = {}
            preguntas_idx = {p["id"]: p for p in body.preguntas}
            for pc in correccion.get("preguntas", []):
                p_orig = preguntas_idx.get(pc["id"], {})
                nombre = p_orig.get("tema", "")
                tema_hits.setdefault(nombre, []).append(bool(pc.get("acertada")))
            for nombre, hits in tema_hits.items():
                tid = temas_map.get(nombre)
                if tid:
                    pct = sum(hits) / len(hits) * 100
                    await actualizar_dominio(session, tid, pct, tipo="simulacro")
        else:
            # Desarrollo: score global para todos los temas del examen
            puntaje = float(correccion.get("puntuacion_total", 0))
            nombres = {p.get("tema") for p in body.preguntas if p.get("tema") in temas_map}
            for nombre in nombres:
                await actualizar_dominio(session, temas_map[nombre], puntaje, tipo="simulacro")
    except Exception:
        pass  # El dominio es best-effort — no falla la corrección

    return CorregirSimulacroResponse(
        puntuacion_total=correccion.get("puntuacion_total", 0),
        aprobado=correccion.get("aprobado", False),
        feedback_general=correccion.get("feedback_general", ""),
        preguntas=correccion.get("preguntas", []),
        corregido_en=correccion.get("corregido_en", ""),
        tipo=correccion.get("tipo", "desarrollo"),
        correctas=correccion.get("correctas", 0),
        total=correccion.get("total", 0),
    )
