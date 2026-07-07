"""Mathós — API router for temas (topics)."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Dominio, Materia, SesionEstudio, Tema, Test
from services.dominio_service import actualizar_dominio
from shared.settings import settings
from services.srs_service import _llamar_ia_srs as _llamar_ia
from schemas import (
    DominioResponse,
    SesionCreate,
    SesionResponse,
    TestCreateRequest,
    TestResponderRequest,
    TestResponse,
    TemaResponse,
)
from shared.database import get_session

router = APIRouter()


def _extraer_json(raw: str) -> dict:
    """Extrae el primer objeto JSON de una respuesta IA, quitando fences de markdown."""
    cleaned = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```\s*$', '', cleaned, flags=re.MULTILINE).strip()
    m = re.search(r'\{[\s\S]*\}', cleaned)
    if not m:
        raise ValueError("Sin JSON en la respuesta")
    return json.loads(m.group(0))


# ──────────────────────────────────────────────
# GET /api/v1/temas/{id} — detalle de tema
# ──────────────────────────────────────────────
@router.get("/{id}", response_model=TemaResponse)
async def obtener_tema(
    id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get topic detail with its dominio level."""
    query = (
        select(Tema)
        .options(selectinload(Tema.dominio))
        .where(Tema.id == id)
    )
    result = await session.execute(query)
    tema = result.scalar_one_or_none()
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    nivel = "no_iniciado"
    if tema.dominio:
        nivel = tema.dominio.nivel

    return TemaResponse(
        id=tema.id,
        materia_id=tema.materia_id,
        nombre=tema.nombre,
        orden=tema.orden,
        descripcion=tema.descripcion,
        nivel_dominio=nivel,
        created_at=tema.created_at,
    )


# ──────────────────────────────────────────────
# POST /api/v1/temas/{id}/estudiar — registrar sesión
# ──────────────────────────────────────────────
@router.post("/{id}/estudiar", response_model=SesionResponse, status_code=status.HTTP_201_CREATED)
async def registrar_sesion_estudio(
    id: str,
    data: SesionCreate,
    session: AsyncSession = Depends(get_session),
):
    """Register a study session for a topic."""
    # Verify topic exists
    tema_result = await session.execute(select(Tema).where(Tema.id == id))
    tema = tema_result.scalar_one_or_none()
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    # Derivar materia_id del tema si no se envió
    materia_id = data.materia_id or tema.materia_id

    sesion = SesionEstudio(
        materia_id=materia_id,
        tema_id=id,
        tipo=data.tipo,
        duracion_minutos=data.duracion_minutos,
        nota=data.nota,
    )
    session.add(sesion)

    puntuacion = float(data.puntuacion or 0)
    nivel_nuevo = await actualizar_dominio(
        session, id, puntuacion, tipo=data.tipo
    )

    # Leer puntuacion_maxima actualizada para devolverla
    dom_result = await session.execute(
        select(Dominio).where(Dominio.tema_id == id)
    )
    dominio = dom_result.scalar_one_or_none()

    response = SesionResponse.model_validate(sesion)
    response.nivel_dominio = nivel_nuevo
    response.puntuacion = float(dominio.puntuacion_maxima or 0) if dominio else puntuacion
    return response


# ──────────────────────────────────────────────
# POST /api/v1/temas/{id}/test — generar test
# ──────────────────────────────────────────────
@router.post("/{id}/test", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
async def generar_test(
    id: str,
    data: TestCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    """Generate a test for a topic (calls IA to create questions).

    For now this creates a placeholder test. Full IA integration will be
    added when the assistant module is connected.
    """
    tema_result = await session.execute(select(Tema).where(Tema.id == id))
    tema = tema_result.scalar_one_or_none()
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    # Placeholder: create a basic test structure
    preguntas_placeholder = {
        "preguntas": [
            {
                "id": i + 1,
                "enunciado": f"Pregunta {i + 1} sobre {tema.nombre}",
                "tipo": "desarrollo",
            }
            for i in range(data.num_preguntas)
        ],
        "tema_id": id,
        "tema_nombre": tema.nombre,
    }

    test = Test(
        tema_id=id,
        tipo=data.tipo,
        preguntas=preguntas_placeholder,
    )
    session.add(test)

    # Ensure dominio record exists
    dom_result = await session.execute(
        select(Dominio).where(Dominio.tema_id == id)
    )
    dominio = dom_result.scalar_one_or_none()
    if not dominio:
        dominio = Dominio(tema_id=id)
        session.add(dominio)

    await session.flush()
    return TestResponse.model_validate(test)


# ──────────────────────────────────────────────
# POST /api/v1/temas/{id}/test/{test_id}/responder
# ──────────────────────────────────────────────
@router.post("/{id}/test/{test_id}/responder", response_model=TestResponse)
async def responder_test(
    id: str,
    test_id: str,
    data: TestResponderRequest,
    session: AsyncSession = Depends(get_session),
):
    """Submit answers for a test and get grading.

    For now uses a placeholder scoring. Full IA-based correction
    will be added when the assistant module is connected.
    """
    # Verify topic and test
    tema_result = await session.execute(select(Tema).where(Tema.id == id))
    tema = tema_result.scalar_one_or_none()
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    test_result = await session.execute(
        select(Test).where(Test.id == test_id, Test.tema_id == id)
    )
    test = test_result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test no encontrado")

    if test.respuestas_usuario is not None:
        raise HTTPException(
            status_code=409,
            detail="Este test ya ha sido respondido",
        )

    # Store answers and calculate placeholder score
    test.respuestas_usuario = data.respuestas

    # Placeholder scoring: 70% as a default until IA grading is wired
    test.puntuacion = 7.00

    # Update dominio based on result
    dom_result = await session.execute(
        select(Dominio).where(Dominio.tema_id == id)
    )
    dominio = dom_result.scalar_one_or_none()
    if not dominio:
        dominio = Dominio(tema_id=id)
        session.add(dominio)

    # Simple progression logic
    if test.puntuacion >= 5.0:
        dominio.tests_superados += 1
        if dominio.tests_superados >= 3 and dominio.nivel == "en_curso":
            dominio.nivel = "practicando"
        if dominio.tests_superados >= 5:
            dominio.nivel = "dominado"
    else:
        dominio.tests_fallados += 1

    dominio.ultimo_estudio = datetime.now(timezone.utc)
    await session.flush()

    return TestResponse.model_validate(test)


# ──────────────────────────────────────────────
# GET /api/v1/temas/{id}/dominio — nivel de dominio
# ──────────────────────────────────────────────
@router.get("/{id}/dominio", response_model=DominioResponse)
async def obtener_dominio(
    id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get current dominio level for a topic."""
    tema_result = await session.execute(
        select(Tema).options(selectinload(Tema.dominio)).where(Tema.id == id)
    )
    tema = tema_result.scalar_one_or_none()
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    if not tema.dominio:
        # Return default empty dominio
        return DominioResponse(
            tema_id=tema.id,
            tema_nombre=tema.nombre,
            nivel="no_iniciado",
            tests_superados=0,
            tests_fallados=0,
            ejercicios_resueltos=0,
            ultimo_estudio=None,
            updated_at=tema.created_at,
        )

    return DominioResponse(
        tema_id=tema.id,
        tema_nombre=tema.nombre,
        nivel=tema.dominio.nivel,
        tests_superados=tema.dominio.tests_superados,
        tests_fallados=tema.dominio.tests_fallados,
        ejercicios_resueltos=tema.dominio.ejercicios_resueltos,
        ultimo_estudio=tema.dominio.ultimo_estudio,
        updated_at=tema.dominio.updated_at,
    )


# ──────────────────────────────────────────────
# GET /api/v1/temas/{id}/ruta-adaptativa
# ──────────────────────────────────────────────
@router.get("/{id}/ruta-adaptativa", summary="Ruta de aprendizaje personalizada para el tema")
async def ruta_adaptativa(id: str, session: AsyncSession = Depends(get_session)):
    """
    Devuelve una secuencia de pasos adaptada al estado actual del estudiante.
    Los pasos cambian según nivel de dominio, puntuación máxima y errores previos.
    """
    tema = await session.get(Tema, id)
    if not tema:
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    dom_result = await session.execute(select(Dominio).where(Dominio.tema_id == id))
    dominio = dom_result.scalar_one_or_none()

    nivel = dominio.nivel if dominio else "no_iniciado"
    puntuacion = float(dominio.puntuacion_maxima or 0) if dominio else 0.0
    tests_superados = dominio.tests_superados if dominio else 0
    tests_fallados = dominio.tests_fallados if dominio else 0

    # Detectar señales reales por tipo de sesión
    sesiones_result = await session.execute(
        select(SesionEstudio.tipo).where(SesionEstudio.tema_id == id)
    )
    tipos_realizados = {r[0] for r in sesiones_result.fetchall()}
    chat_realizado = "chat" in tipos_realizados
    flashcards_realizadas = "ejercicio" in tipos_realizados

    UMBRAL = 60

    pasos = [
        {
            "id": "teoria",
            "titulo": "Lee la teoría del tema",
            "descripcion": "Construye la intuición primero. No memorices — entiende el porqué de cada concepto.",
            "tipo": "teoria",
            "accion": "tab:teoria",
            "completado": nivel != "no_iniciado",
            "prioritario": nivel == "no_iniciado",
        },
        {
            "id": "preguntas",
            "titulo": "Pregunta lo que no entendiste",
            "descripcion": "Usa el asistente para que Ikaro te traduzca los términos que no te quedaron claros.",
            "tipo": "asistente",
            "accion": "chat",
            "completado": chat_realizado or nivel in ("practicando", "dominado"),
            "prioritario": nivel == "en_curso" and not chat_realizado and tests_fallados == 0,
        },
        {
            "id": "flashcards",
            "titulo": "Fija los términos clave",
            "descripcion": "Repasa los conceptos con repetición espaciada hasta que los términos formales suenen naturales.",
            "tipo": "flashcards",
            "accion": "tab:taller",
            "completado": flashcards_realizadas or nivel in ("practicando", "dominado"),
            "prioritario": False,
        },
        {
            "id": "taller",
            "titulo": f"Demuestra que lo entiendes (meta: {UMBRAL}%)",
            "descripcion": (
                f"Resuelve el taller. Tu mejor resultado hasta ahora: {int(puntuacion)}%. "
                f"Necesitas al menos {UMBRAL}% para desbloquear el siguiente tema."
            ),
            "tipo": "taller",
            "accion": "tab:taller",
            "completado": puntuacion >= UMBRAL,
            "prioritario": nivel not in ("no_iniciado",) and puntuacion < UMBRAL,
        },
    ]

    # Paso de remediación si ha fallado el taller al menos una vez
    if tests_fallados > 0 and puntuacion < UMBRAL:
        pasos.insert(3, {
            "id": "remediacion",
            "titulo": "Refuerza antes de reintentar",
            "descripcion": (
                f"Has intentado el taller {tests_fallados} vez(es) sin llegar al {UMBRAL}%. "
                "Pregúntale a Ikaro: '¿Qué conceptos debo repasar antes de reintentar el taller?'"
            ),
            "tipo": "asistente",
            "accion": "chat:remediar",
            "completado": False,
            "prioritario": True,
        })

    # Mensaje adaptativo según estado
    if nivel == "no_iniciado":
        mensaje = "Empieza por leer la teoría. Si un término no te queda claro, Ikaro lo traduce al momento."
    elif tests_fallados > 0 and puntuacion < UMBRAL:
        mensaje = f"Llevas {tests_fallados} intento(s) en el taller. Antes de reintentar, usa el asistente para aclarar qué falló."
    elif puntuacion >= UMBRAL:
        mensaje = f"Superaste el umbral mínimo con {int(puntuacion)}%. El siguiente tema está desbloqueado."
    elif nivel == "en_curso":
        mensaje = "Has empezado el tema. Pregunta dudas al asistente y luego intenta el taller."
    else:
        mensaje = "Sigue el camino paso a paso — cada uno construye sobre el anterior."

    paso_actual_idx = next(
        (i for i, p in enumerate(pasos) if not p["completado"]),
        len(pasos)
    )

    return {
        "pasos": pasos,
        "mensaje": mensaje,
        "nivel_actual": nivel,
        "puntuacion_actual": int(puntuacion),
        "paso_actual": paso_actual_idx,
        "completado": puntuacion >= UMBRAL,
    }


# ──────────────────────────────────────────────
# GET /api/v1/temas/{id}/andamio-visual
# ──────────────────────────────────────────────

_ANDAMIO_CACHE_DIR = Path(__file__).parent.parent / "data" / "andamio_cache"
_ANDAMIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_ANDAMIO_SYSTEM = """Eres un tutor de matemáticas especializado en reducir la ansiedad ante las matemáticas.
Tu misión: antes de presentar cualquier teoría formal, construyes un andamio conceptual —
la intuición visual y el porqué humano del concepto — para que el estudiante ya "lo vea"
antes de leer la definición formal.

El estudiante tiene dificultades con la terminología matemática formal y necesita
partir siempre de imágenes mentales concretas y analogías de la vida cotidiana.

Respondes SOLO con JSON válido (sin texto ni markdown extra)."""

_ANDAMIO_USER = """Materia: {materia}
Tema: {tema}

Genera el andamio conceptual con esta estructura JSON exacta:
{{
  "titulo_intuitivo": "El nombre del concepto en lenguaje cotidiano (máx 10 palabras)",
  "pregunta_gancho": "La pregunta que este concepto responde, formulada como algo que cualquiera se preguntaría (ej: '¿Cómo sé cuánto espacio ocupa una figura sin medirla?')",
  "imagen_mental": "La imagen visual más simple para entender esto, descrita sin usar términos matemáticos formales (2-3 frases)",
  "analogia": "Una analogía de la vida cotidiana que capture la esencia del concepto (2 frases max)",
  "por_que_importa": "Un motivo concreto y práctico por el que este concepto existe y se usa (1-2 frases, evita 'es importante porque...')"
}}"""


@router.get("/{id}/andamio-visual", summary="Andamio conceptual — intuición visual antes de la teoría formal")
async def andamio_visual(id: str, regenerar: bool = False, session: AsyncSession = Depends(get_session)):
    tema = await session.get(Tema, id)
    if not tema:
        raise HTTPException(404, "Tema no encontrado")

    materia = await session.get(Materia, tema.materia_id)
    materia_nombre = materia.nombre if materia else ""

    cache_file = _ANDAMIO_CACHE_DIR / f"{id}.json"
    if cache_file.exists() and not regenerar:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        data["cached"] = True
        return data

    user_prompt = _ANDAMIO_USER.format(materia=materia_nombre, tema=tema.nombre)

    try:
        raw = await _llamar_ia(_ANDAMIO_SYSTEM, user_prompt)
    except Exception:
        raise HTTPException(502, "No se pudo generar el andamio conceptual")

    try:
        data = _extraer_json(raw)
    except Exception:
        raise HTTPException(502, "Respuesta IA sin JSON válido")
    data["cached"] = False
    cache_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


# ──────────────────────────────────────────────
# POST /api/v1/temas/{id}/problema-visual
# ──────────────────────────────────────────────

_PROBLEMA_CACHE_DIR = Path(__file__).parent.parent / "data" / "problema_cache"
_PROBLEMA_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_PROBLEMA_SYSTEM = """Eres un generador de problemas de geometría y matemáticas con representación visual.
Cada problema incluye una figura geométrica descrita como primitivas para dibujar en un canvas HTML5 de 480×320 píxeles.

REGLAS CRÍTICAS de coordenadas:
- Origen (0,0) en esquina superior-izquierda
- Usa coordenadas x entre 60 y 420, y entre 40 y 280
- Deja margen de 60px en todos los bordes para las etiquetas
- Los segmentos deben ser claramente visibles (longitud mínima 60px)
- Los ángulos deben ser claramente distintos (no menos de 20° ni más de 160°)
- Para un triángulo rectángulo típico: A=(80,240), B=(320,240), C=(80,80)

Primitivas disponibles en "setup":
  {"t":"point",  "x":N,   "y":N,   "label":"A"}
  {"t":"line",   "x1":N,  "y1":N,  "x2":N,  "y2":N, "label":"AB=5cm"}
  {"t":"circle", "cx":N,  "cy":N,  "r":N,   "label":"r=3"}
  {"t":"rect",   "x":N,   "y":N,   "w":N,   "h":N,  "label":"ABCD"}
  {"t":"angle",  "vx":N,  "vy":N,  "p1x":N, "p1y":N, "p2x":N, "p2y":N, "label":"90°"}
  {"t":"text",   "x":N,   "y":N,   "text":"medida o dato"}

REGLA CRÍTICA para ángulos: el primitivo "angle" SIEMPRE debe incluir p1x,p1y (coordenadas del primer vértice vecino) y p2x,p2y (coordenadas del segundo vértice vecino). Esto permite dibujar el marcador de ángulo orientado correctamente hacia el interior de la figura.
Ejemplo para ángulo recto en C=(80,80) entre vértices A=(80,240) y B=(320,240):
  {"t":"angle", "vx":80, "vy":80, "p1x":80, "p1y":240, "p2x":320, "p2y":240, "label":"90°"}

Respondes SOLO con JSON válido, sin texto extra."""

_PROBLEMA_USER = """Materia: {materia}
Tema: {tema}
Dificultad: {dificultad}

Genera UN problema visual para este tema con la estructura JSON exacta:
{{
  "enunciado": "Descripción clara del problema en 2-3 frases. Menciona qué hay que encontrar.",
  "pregunta": "La pregunta concreta a resolver (1 frase)",
  "setup": [ /* lista de primitivas — mínimo 3, máximo 8 */ ],
  "datos": ["dato 1 (ej: AB = 6 cm)", "dato 2 (ej: ángulo A = 45°)"],
  "pistas": ["pista 1 — orientación sin revelar la respuesta", "pista 2"],
  "nivel": "{dificultad}"
}}"""


@router.post("/{id}/problema-visual", summary="Genera un problema visual para el tema")
async def problema_visual(
    id: str,
    dificultad: str = "basico",
    regenerar: bool = False,
    session: AsyncSession = Depends(get_session),
):
    tema = await session.get(Tema, id)
    if not tema:
        raise HTTPException(404, "Tema no encontrado")

    materia = await session.get(Materia, tema.materia_id)
    materia_nombre = materia.nombre if materia else ""

    dificultad = dificultad if dificultad in ("basico", "intermedio", "avanzado") else "basico"
    cache_file = _PROBLEMA_CACHE_DIR / f"{id}_{dificultad}.json"

    if cache_file.exists() and not regenerar:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        data["cached"] = True
        return data

    user_prompt = _PROBLEMA_USER.format(
        materia=materia_nombre,
        tema=tema.nombre,
        dificultad=dificultad,
    )

    try:
        raw = await _llamar_ia(_PROBLEMA_SYSTEM, user_prompt)
    except Exception:
        raise HTTPException(502, "No se pudo generar el problema visual")

    try:
        data = _extraer_json(raw)
    except Exception:
        raise HTTPException(502, "Respuesta IA sin JSON válido")
    data["cached"] = False
    cache_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
