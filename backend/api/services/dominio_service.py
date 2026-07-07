"""
Mathós — Servicio compartido para actualizar el nivel de dominio de un tema.

Centraliza la lógica de progresión para que temas, simulacros y SRS
usen exactamente las mismas reglas.

Filosofía de niveles:
  no_iniciado → en_curso   (cualquier intento, incluso fallido)
  en_curso    → practicando (primera sesión aprobada ≥ 70)
  practicando → dominado    (segunda sesión aprobada ≥ 70, o una ≥ 90)
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Dominio


async def actualizar_dominio(
    session: AsyncSession,
    tema_id: str,
    puntuacion: float,
    tipo: str = "taller",
) -> str:
    """
    Actualiza (o crea) el registro Dominio para un tema y devuelve el nivel resultante.

    tipo: "ejercicio" | "test" | "simulacro" | "taller"
    puntuacion: 0-100
    """
    dom_result = await session.execute(
        select(Dominio).where(Dominio.tema_id == tema_id)
    )
    dominio = dom_result.scalar_one_or_none()
    if not dominio:
        dominio = Dominio(tema_id=tema_id)
        session.add(dominio)

    dominio.ultimo_estudio = datetime.now(timezone.utc)

    if tipo == "ejercicio":
        dominio.ejercicios_resueltos += 1
    elif tipo in ("test", "simulacro"):
        dominio.tests_superados += 1

    if puntuacion > float(dominio.puntuacion_maxima or 0):
        dominio.puntuacion_maxima = puntuacion

    if puntuacion >= 90:
        mapa = {
            "no_iniciado": "dominado",
            "en_curso": "dominado",
            "practicando": "dominado",
        }
        dominio.nivel = mapa.get(dominio.nivel, dominio.nivel)
    elif puntuacion >= 70:
        mapa = {
            "no_iniciado": "practicando",
            "en_curso": "practicando",
            "practicando": "dominado",
        }
        dominio.nivel = mapa.get(dominio.nivel, dominio.nivel)
    elif puntuacion > 0:
        if dominio.nivel == "no_iniciado":
            dominio.nivel = "en_curso"
    else:
        if dominio.nivel == "no_iniciado":
            dominio.nivel = "en_curso"

    await session.flush()
    return dominio.nivel


async def touch_dominio_srs(session: AsyncSession, tema_id: str) -> None:
    """
    Toque ligero tras una revisión SRS correcta (calificacion >= 4).

    Solo avanza el nivel si está en no_iniciado → en_curso.
    El SRS por sí solo no lleva a "practicando" ni "dominado";
    eso requiere una evaluación real (taller / simulacro).
    """
    dom_result = await session.execute(
        select(Dominio).where(Dominio.tema_id == tema_id)
    )
    dominio = dom_result.scalar_one_or_none()
    if not dominio:
        dominio = Dominio(tema_id=tema_id)
        session.add(dominio)

    dominio.ultimo_estudio = datetime.now(timezone.utc)
    if dominio.nivel == "no_iniciado":
        dominio.nivel = "en_curso"

    await session.flush()
