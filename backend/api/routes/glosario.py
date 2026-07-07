"""Mathós — Router de glosario dual.

  GET  /api/v1/glosario              — listar/buscar términos
  GET  /api/v1/glosario/{termino}    — obtener término exacto
  POST /api/v1/glosario              — upsert un término (llamado por asistente)
  DELETE /api/v1/glosario/{id}       — borrar un término
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Glosario
from shared.database import get_session

router = APIRouter()


class GlosarioIn(BaseModel):
    termino: str
    nombre_informal: str
    definicion_formal: str
    definicion_informal: str
    ejemplo: Optional[str] = None
    materia_id: Optional[str] = None


class GlosarioOut(BaseModel):
    id: str
    termino: str
    nombre_informal: str
    definicion_formal: str
    definicion_informal: str
    ejemplo: Optional[str]
    materia_id: Optional[str]

    class Config:
        from_attributes = True


@router.get("", response_model=list[GlosarioOut], summary="Buscar términos del glosario")
async def listar_glosario(
    q: Optional[str] = Query(None, description="Texto a buscar en término o definición"),
    materia_id: Optional[str] = Query(None),
    limit: int = Query(30, le=100),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Glosario)
    if materia_id:
        stmt = stmt.where(
            or_(Glosario.materia_id == materia_id, Glosario.materia_id.is_(None))
        )
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Glosario.termino).contains(q.lower()),
                func.lower(Glosario.nombre_informal).contains(q.lower()),
                func.lower(Glosario.definicion_informal).contains(q.lower()),
            )
        )
    stmt = stmt.order_by(Glosario.termino).limit(limit)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/{termino_slug}", response_model=GlosarioOut, summary="Obtener término exacto")
async def obtener_termino(
    termino_slug: str,
    materia_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Glosario).where(
        func.lower(Glosario.termino) == termino_slug.lower()
    )
    if materia_id:
        stmt = stmt.where(
            or_(Glosario.materia_id == materia_id, Glosario.materia_id.is_(None))
        )
    result = await session.execute(stmt)
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Término no encontrado")
    return entry


@router.post("", response_model=GlosarioOut, summary="Añadir o actualizar término")
async def upsert_termino(
    body: GlosarioIn,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Glosario).where(
        func.lower(Glosario.termino) == body.termino.lower(),
        Glosario.materia_id == body.materia_id,
    )
    result = await session.execute(stmt)
    entry = result.scalar_one_or_none()

    if entry:
        entry.nombre_informal = body.nombre_informal
        entry.definicion_formal = body.definicion_formal
        entry.definicion_informal = body.definicion_informal
        entry.ejemplo = body.ejemplo
    else:
        entry = Glosario(
            termino=body.termino,
            nombre_informal=body.nombre_informal,
            definicion_formal=body.definicion_formal,
            definicion_informal=body.definicion_informal,
            ejemplo=body.ejemplo,
            materia_id=body.materia_id,
        )
        session.add(entry)

    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete("/{entry_id}", summary="Borrar término")
async def borrar_termino(
    entry_id: str,
    session: AsyncSession = Depends(get_session),
):
    entry = await session.get(Glosario, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Término no encontrado")
    await session.delete(entry)
    await session.commit()
    return {"ok": True}
