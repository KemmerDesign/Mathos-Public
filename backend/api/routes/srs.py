"""
Mathós — Router SRS (Spaced Repetition System).

Endpoints:
  POST /api/v1/srs/generar        — Genera flashcards de un tema con IA
  GET  /api/v1/srs/cola/{mid}     — Tarjetas pendientes hoy para una materia
  POST /api/v1/srs/revisar        — Registra el resultado de revisar una tarjeta (SM-2)
  GET  /api/v1/srs/stats/{mid}    — Estadísticas del SRS para una materia
  GET  /api/v1/srs/errores/{mid}  — Log de errores para una materia
  POST /api/v1/srs/error          — Registra un error (desde simulacro/taller)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import DemostracionAtomo, ErrorLog, Flashcard, Materia, Tema
from services.srs_service import generar_flashcards_ia, proxima_revision, sm2_update
from services.dominio_service import touch_dominio_srs
from shared.database import get_session

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────

class GenerarFlashcardsRequest(BaseModel):
    materia_id: str
    tema_id: str
    tema_nombre: str
    materia_nombre: str
    contenido: str
    num: int = Field(default=5, ge=2, le=10)


class RevisarFlashcardRequest(BaseModel):
    flashcard_id: str
    # 0=Blackout 2=Difícil 4=Bien 5=Fácil (subset SM-2 quality)
    calificacion: int = Field(..., ge=0, le=5)


class RegistrarErrorRequest(BaseModel):
    materia_id: str
    tema_id: str | None = None
    pregunta_texto: str
    respuesta_correcta: str
    respuesta_estudiante: str = ""
    fuente: str = "simulacro_mcq"


# ── Endpoints ──────────────────────────────────────────────

@router.post("/generar", status_code=status.HTTP_201_CREATED)
async def generar_flashcards(
    body: GenerarFlashcardsRequest,
    session: AsyncSession = Depends(get_session),
):
    """Genera flashcards de un tema con IA y las persiste en BD."""
    # Validar que materia y tema existen
    materia = await session.get(Materia, body.materia_id)
    if not materia:
        raise HTTPException(404, "Materia no encontrada")

    try:
        cards_data = await generar_flashcards_ia(
            tema_nombre=body.tema_nombre,
            materia_nombre=body.materia_nombre,
            contenido=body.contenido,
            num=body.num,
        )
    except Exception as e:
        raise HTTPException(502, f"Error al generar flashcards: {e}")

    created = []
    for c in cards_data:
        if not c.get("pregunta") or not c.get("respuesta"):
            continue
        fc = Flashcard(
            materia_id=body.materia_id,
            tema_id=body.tema_id,
            pregunta=c["pregunta"],
            respuesta=c["respuesta"],
            fuente="teoria",
        )
        session.add(fc)
        created.append(fc)

    await session.flush()

    return {
        "generadas": len(created),
        "flashcards": [
            {
                "id": fc.id,
                "pregunta": fc.pregunta,
                "respuesta": fc.respuesta,
                "fecha_proxima": fc.fecha_proxima.isoformat(),
            }
            for fc in created
        ],
    }


@router.get("/cola/{materia_id}")
async def cola_revision(
    materia_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Devuelve las tarjetas pendientes de revisión hoy (fecha_proxima <= ahora)."""
    ahora = datetime.now(timezone.utc)
    result = await session.execute(
        select(Flashcard)
        .where(
            Flashcard.materia_id == materia_id,
            Flashcard.fecha_proxima <= ahora,
        )
        .order_by(Flashcard.fecha_proxima)
        .limit(50)
    )
    cards = result.scalars().all()

    return {
        "materia_id": materia_id,
        "pendientes": len(cards),
        "flashcards": [
            {
                "id": fc.id,
                "tema_id": fc.tema_id,
                "pregunta": fc.pregunta,
                "respuesta": fc.respuesta,
                "repeticiones": fc.repeticiones,
                "intervalo": fc.intervalo,
            }
            for fc in cards
        ],
    }


@router.post("/revisar")
async def revisar_flashcard(
    body: RevisarFlashcardRequest,
    session: AsyncSession = Depends(get_session),
):
    """Aplica SM-2 a una tarjeta tras revisarla."""
    fc = await session.get(Flashcard, body.flashcard_id)
    if not fc:
        raise HTTPException(404, "Flashcard no encontrada")

    nuevas_reps, nueva_facilidad, nuevo_intervalo = sm2_update(
        repeticiones=fc.repeticiones,
        facilidad=float(fc.facilidad),
        intervalo=fc.intervalo,
        calificacion=body.calificacion,
    )

    fc.repeticiones = nuevas_reps
    fc.facilidad = nueva_facilidad
    fc.intervalo = nuevo_intervalo
    fc.fecha_proxima = proxima_revision(nuevo_intervalo)

    # Toque ligero de dominio: calificacion >= 4 (Bien / Fácil)
    if fc.tema_id and body.calificacion >= 4:
        try:
            await touch_dominio_srs(session, fc.tema_id)
        except Exception:
            pass

    return {
        "flashcard_id": fc.id,
        "intervalo": nuevo_intervalo,
        "repeticiones": nuevas_reps,
        "fecha_proxima": fc.fecha_proxima.isoformat(),
        "aprendida": nuevo_intervalo >= 21,
    }


@router.get("/stats/{materia_id}")
async def stats_srs(
    materia_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Estadísticas del SRS para una materia."""
    ahora = datetime.now(timezone.utc)

    total_r = await session.execute(
        select(func.count()).where(Flashcard.materia_id == materia_id)
    )
    total = total_r.scalar() or 0

    pendientes_r = await session.execute(
        select(func.count()).where(
            Flashcard.materia_id == materia_id,
            Flashcard.fecha_proxima <= ahora,
        )
    )
    pendientes = pendientes_r.scalar() or 0

    # Aprendidas = intervalo >= 21 días (3 semanas consolidadas)
    aprendidas_r = await session.execute(
        select(func.count()).where(
            Flashcard.materia_id == materia_id,
            Flashcard.intervalo >= 21,
        )
    )
    aprendidas = aprendidas_r.scalar() or 0

    errores_r = await session.execute(
        select(func.count()).where(ErrorLog.materia_id == materia_id)
    )
    errores = errores_r.scalar() or 0

    return {
        "materia_id": materia_id,
        "total": total,
        "pendientes_hoy": pendientes,
        "aprendidas": aprendidas,
        "nuevas": total - aprendidas,
        "errores_registrados": errores,
    }


@router.get("/errores/{materia_id}")
async def errores_materia(
    materia_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Devuelve el log de errores ordenado por frecuencia."""
    result = await session.execute(
        select(ErrorLog)
        .where(ErrorLog.materia_id == materia_id)
        .order_by(ErrorLog.veces_fallada.desc(), ErrorLog.ultima_vez.desc())
        .limit(50)
    )
    errores = result.scalars().all()

    return {
        "materia_id": materia_id,
        "errores": [
            {
                "id": e.id,
                "tema_id": e.tema_id,
                "pregunta": e.pregunta_texto,
                "respuesta_correcta": e.respuesta_correcta,
                "veces_fallada": e.veces_fallada,
                "fuente": e.fuente,
                "ultima_vez": e.ultima_vez.isoformat(),
            }
            for e in errores
        ],
    }


@router.post("/error", status_code=status.HTTP_201_CREATED)
async def registrar_error(
    body: RegistrarErrorRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Registra o incrementa un error en el log.

    Busca si ya existe una entrada con el mismo pregunta_texto+materia_id
    para incrementar veces_fallada en lugar de duplicar.
    """
    existing_r = await session.execute(
        select(ErrorLog).where(
            ErrorLog.materia_id == body.materia_id,
            ErrorLog.pregunta_texto == body.pregunta_texto,
        )
    )
    existing = existing_r.scalar_one_or_none()

    if existing:
        existing.veces_fallada += 1
        existing.ultima_vez = datetime.now(timezone.utc)
        existing.respuesta_estudiante = body.respuesta_estudiante
        return {"updated": True, "id": existing.id, "veces_fallada": existing.veces_fallada}

    nuevo = ErrorLog(
        materia_id=body.materia_id,
        tema_id=body.tema_id,
        pregunta_texto=body.pregunta_texto,
        respuesta_correcta=body.respuesta_correcta,
        respuesta_estudiante=body.respuesta_estudiante,
        fuente=body.fuente,
    )
    session.add(nuevo)
    await session.flush()
    return {"updated": False, "id": nuevo.id, "veces_fallada": 1}


# ──────────────────────────────────────────────
# POST /api/v1/srs/atomizar-prueba
# ──────────────────────────────────────────────

class AtomizarRequest(BaseModel):
    tema_id: str
    materia_id: str
    teorema: str = Field(..., description="Nombre o enunciado del teorema a demostrar")
    texto_base: str = Field("", description="Texto de la demostración (opcional, si vacío la IA lo genera)")


@router.post("/atomizar-prueba", summary="Atomiza una demostración en pasos lógicos mínimos")
async def atomizar_prueba(
    body: AtomizarRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Descompone una demostración matemática en pasos atómicos.
    Cada paso: premisa → conclusión + explicación llana + razón formal.
    Genera flashcards SRS para cada paso.
    """
    from services.srs_service import _llamar_ia_srs

    tema = await session.get(Tema, body.tema_id)
    if not tema:
        raise HTTPException(404, "Tema no encontrado")

    prompt_sistema = (
        "Eres un tutor de matemáticas que atomiza demostraciones en pasos lógicos mínimos. "
        "Cada paso es una relación simple: dado lo que ya sé, ¿qué nuevo hecho se sigue y por qué? "
        "El lenguaje llano debe ser comprensible para alguien que encuentra los términos formales difíciles. "
        "Respondes SOLO con JSON válido, sin texto adicional."
    )

    contexto = f"Texto de apoyo:\n{body.texto_base}" if body.texto_base else ""
    prompt_usuario = (
        f"Teorema/resultado a demostrar: \"{body.teorema}\"\n{contexto}\n\n"
        "Descompón la demostración en pasos atómicos (máximo 7). Devuelve un JSON array:\n"
        '[\n'
        '  {\n'
        '    "orden": 1,\n'
        '    "premisa": "qué sabemos o asumimos en este punto (lenguaje llano)",\n'
        '    "conclusion": "qué concluimos a partir de esa premisa (lenguaje llano)",\n'
        '    "razon_llana": "por qué esta conclusión se sigue, explicado como a alguien que nunca vio esto",\n'
        '    "razon_formal": "el argumento matemático preciso: axioma, definición o teorema aplicado"\n'
        '  }\n'
        ']\n'
        "El último paso debe ser la conclusión final del teorema. Solo JSON, sin markdown."
    )

    raw = await _llamar_ia_srs(prompt_sistema, prompt_usuario)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        pasos_data = json.loads(raw)
    except Exception:
        raise HTTPException(502, "La IA no devolvió JSON válido. Inténtalo de nuevo.")

    if not isinstance(pasos_data, list) or not pasos_data:
        raise HTTPException(502, "No se pudieron generar pasos atómicos.")

    # Borrar átomos previos del mismo teorema en este tema
    existing = await session.execute(
        select(DemostracionAtomo).where(
            DemostracionAtomo.tema_id == body.tema_id,
            DemostracionAtomo.teorema == body.teorema,
        )
    )
    for atomo in existing.scalars().all():
        await session.delete(atomo)

    atomos_creados = []
    for paso in pasos_data[:7]:
        if not paso.get("premisa") or not paso.get("conclusion"):
            continue

        # Crear flashcard para este paso
        pregunta = f"[{body.teorema}] Paso {paso['orden']}: Si {paso['premisa']}, ¿qué se concluye y por qué?"
        respuesta = f"{paso['conclusion']}\n\n💡 {paso['razon_llana']}\n\n📐 Formal: {paso['razon_formal']}"
        fc = Flashcard(
            materia_id=body.materia_id,
            tema_id=body.tema_id,
            pregunta=pregunta,
            respuesta=respuesta,
            fuente="manual",
        )
        session.add(fc)

        atomo = DemostracionAtomo(
            tema_id=body.tema_id,
            teorema=body.teorema,
            orden=paso.get("orden", len(atomos_creados) + 1),
            premisa=paso["premisa"],
            conclusion=paso["conclusion"],
            razon_llana=paso["razon_llana"],
            razon_formal=paso.get("razon_formal", ""),
            flashcard_id=fc.id,
        )
        session.add(atomo)
        atomos_creados.append(atomo)

    await session.flush()

    return {
        "teorema": body.teorema,
        "pasos": len(atomos_creados),
        "atomos": [
            {
                "id": a.id,
                "orden": a.orden,
                "premisa": a.premisa,
                "conclusion": a.conclusion,
                "razon_llana": a.razon_llana,
                "razon_formal": a.razon_formal,
                "flashcard_id": a.flashcard_id,
            }
            for a in atomos_creados
        ],
        "flashcards_generadas": len(atomos_creados),
    }


# ──────────────────────────────────────────────
# GET /api/v1/srs/demostraciones/{tema_id}
# ──────────────────────────────────────────────

@router.get("/demostraciones/{tema_id}", summary="Obtener demostraciones atomizadas de un tema")
async def listar_demostraciones(
    tema_id: str,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(DemostracionAtomo)
        .where(DemostracionAtomo.tema_id == tema_id)
        .order_by(DemostracionAtomo.teorema, DemostracionAtomo.orden)
    )
    atomos = result.scalars().all()

    # Agrupar por teorema
    grupos: dict[str, list] = {}
    for a in atomos:
        grupos.setdefault(a.teorema, []).append({
            "id": a.id,
            "orden": a.orden,
            "premisa": a.premisa,
            "conclusion": a.conclusion,
            "razon_llana": a.razon_llana,
            "razon_formal": a.razon_formal,
            "flashcard_id": a.flashcard_id,
        })

    return [
        {"teorema": t, "atomos": pasos}
        for t, pasos in grupos.items()
    ]


class CrearFlashcardRequest(BaseModel):
    materia_id: str
    tema_id: str | None = None
    pregunta: str
    respuesta: str
    fuente: str = "manual"


@router.post("/flashcards", status_code=status.HTTP_201_CREATED)
async def crear_flashcard(
    body: CrearFlashcardRequest,
    session: AsyncSession = Depends(get_session),
):
    """Crea una flashcard manual en el SRS."""
    materia = await session.get(Materia, body.materia_id)
    if not materia:
        raise HTTPException(404, "Materia no encontrada")

    if body.tema_id:
        tema = await session.get(Tema, body.tema_id)
        if not tema:
            raise HTTPException(404, "Tema no encontrado")

    fc = Flashcard(
        materia_id=body.materia_id,
        tema_id=body.tema_id,
        pregunta=body.pregunta,
        respuesta=body.respuesta,
        fuente=body.fuente,
    )
    session.add(fc)
    await session.commit()
    return {
        "id": fc.id,
        "materia_id": fc.materia_id,
        "pregunta": fc.pregunta,
        "respuesta": fc.respuesta,
        "fuente": fc.fuente,
    }
