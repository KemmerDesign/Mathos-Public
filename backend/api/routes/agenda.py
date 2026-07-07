"""
GET /api/v1/agenda/hoy

Devuelve en una sola llamada todo lo que el estudiante necesita hacer hoy:
  - SRS flashcards vencidas (por materia)
  - Temas con dominio bajo o no iniciados
  - Errores más repetidos (Libro de Errores)
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Dominio, ErrorLog, Flashcard, Materia, SesionEstudio, Tema
from shared.database import get_session

router = APIRouter()


@router.get("/hoy", summary="Agenda del día: SRS vencidas, temas pendientes y errores frecuentes")
async def agenda_hoy(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    # ── 1. SRS vencidas por materia ─────────────────────────────────────
    srs_q = await session.execute(
        select(
            Flashcard.materia_id,
            func.count(Flashcard.id).label("cantidad"),
        )
        .where(Flashcard.fecha_proxima <= now)
        .group_by(Flashcard.materia_id)
        .order_by(func.count(Flashcard.id).desc())
        .limit(5)
    )
    srs_rows = srs_q.all()

    # Enriquecer con nombre de materia
    materia_ids_srs = [r.materia_id for r in srs_rows]
    srs_vencidas: list[dict] = []
    if materia_ids_srs:
        mat_q = await session.execute(
            select(Materia.id, Materia.nombre).where(Materia.id.in_(materia_ids_srs))
        )
        mat_map = {r.id: r.nombre for r in mat_q.all()}
        for r in srs_rows:
            srs_vencidas.append({
                "materia_id": r.materia_id,
                "materia_nombre": mat_map.get(r.materia_id, r.materia_id),
                "cantidad": r.cantidad,
            })

    total_srs = sum(r["cantidad"] for r in srs_vencidas)

    # ── 2. Temas con dominio bajo (no dominados, ordenados por puntuacion asc) ──
    temas_q = await session.execute(
        select(
            Dominio.tema_id,
            Dominio.nivel,
            Dominio.puntuacion_maxima,
            Dominio.ultimo_estudio,
            Tema.nombre.label("tema_nombre"),
            Tema.materia_id,
        )
        .join(Tema, Dominio.tema_id == Tema.id)
        .where(Dominio.nivel.in_(["no_iniciado", "en_curso", "practicando"]))
        .order_by(Dominio.puntuacion_maxima.asc(), Dominio.ultimo_estudio.asc())
        .limit(6)
    )
    temas_rows = temas_q.all()

    materia_ids_temas = list({r.materia_id for r in temas_rows})
    temas_pendientes: list[dict] = []
    if materia_ids_temas:
        mat_q2 = await session.execute(
            select(Materia.id, Materia.nombre).where(Materia.id.in_(materia_ids_temas))
        )
        mat_map2 = {r.id: r.nombre for r in mat_q2.all()}
        for r in temas_rows:
            temas_pendientes.append({
                "tema_id": r.tema_id,
                "materia_id": r.materia_id,
                "tema_nombre": r.tema_nombre,
                "materia_nombre": mat_map2.get(r.materia_id, r.materia_id),
                "nivel": r.nivel,
                "puntuacion_maxima": float(r.puntuacion_maxima or 0),
                "ultimo_estudio": r.ultimo_estudio.isoformat() if r.ultimo_estudio else None,
            })

    # ── 3. Errores más frecuentes ────────────────────────────────────────
    err_q = await session.execute(
        select(
            ErrorLog.materia_id,
            ErrorLog.tema_id,
            ErrorLog.pregunta_texto,
            ErrorLog.veces_fallada,
            ErrorLog.fuente,
        )
        .order_by(ErrorLog.veces_fallada.desc())
        .limit(4)
    )
    err_rows = err_q.all()

    materia_ids_err = list({r.materia_id for r in err_rows if r.materia_id})
    errores_frecuentes: list[dict] = []
    if materia_ids_err:
        mat_q3 = await session.execute(
            select(Materia.id, Materia.nombre).where(Materia.id.in_(materia_ids_err))
        )
        mat_map3 = {r.id: r.nombre for r in mat_q3.all()}
        for r in err_rows:
            # Truncar texto largo
            texto = r.pregunta_texto or ""
            if len(texto) > 90:
                texto = texto[:87] + "…"
            errores_frecuentes.append({
                "materia_id": r.materia_id,
                "tema_id": r.tema_id,
                "pregunta_texto": texto,
                "veces_fallada": r.veces_fallada,
                "fuente": r.fuente,
                "materia_nombre": mat_map3.get(r.materia_id or "", ""),
            })

    # ── 4. Racha de estudio + heatmap 28 días ──────────────────────────
    sesiones_q = await session.execute(
        select(SesionEstudio.created_at).order_by(SesionEstudio.created_at.desc())
    )
    all_times = sesiones_q.scalars().all()
    unique_dates = sorted(set(dt.date() for dt in all_times), reverse=True)
    today = now.date()
    racha_dias = 0
    for i, d in enumerate(unique_dates):
        if d == today - timedelta(days=i):
            racha_dias += 1
        else:
            break

    # Heatmap: 4 semanas completas (lun→dom) ancladas al lunes de la semana actual
    active_set = set(unique_dates)
    days_since_monday = today.weekday()          # Mon=0, Sun=6
    this_monday = today - timedelta(days=days_since_monday)
    heatmap_start = this_monday - timedelta(weeks=3)
    heatmap_28d = [
        {
            "date": (heatmap_start + timedelta(days=i)).isoformat(),
            "active": (heatmap_start + timedelta(days=i)) in active_set,
            "future": (heatmap_start + timedelta(days=i)) > today,
        }
        for i in range(28)
    ]

    return {
        "fecha": today.isoformat(),
        "total_srs_vencidas": total_srs,
        "srs_vencidas": srs_vencidas,
        "temas_pendientes": temas_pendientes,
        "errores_frecuentes": errores_frecuentes,
        "racha_dias": racha_dias,
        "heatmap_28d": heatmap_28d,
    }
