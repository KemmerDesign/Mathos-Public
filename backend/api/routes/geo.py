"""
GeoMathos persistence — guardar/cargar construcciones geométricas.

POST   /geo/guardar          — crear nueva construcción
PUT    /geo/{id}             — actualizar nombre/datos de una existente
GET    /geo/lista            — listar todas (id, nombre, created_at, preview)
DELETE /geo/{id}             — eliminar
"""
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import GeoConstruccion
from shared.database import get_session

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class GuardarRequest(BaseModel):
    nombre: str
    data: dict  # GState completo


class ActualizarRequest(BaseModel):
    nombre: Optional[str] = None
    data: Optional[dict] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _preview(data: dict) -> str:
    """Extrae hasta 4 etiquetas de puntos para mostrar en la lista."""
    pts = data.get("pts", [])
    labels = [p.get("label", "?") for p in pts[:4]]
    if len(pts) > 4:
        labels.append("…")
    return ", ".join(labels) if labels else "vacía"


def _serialize(c: GeoConstruccion) -> dict[str, Any]:
    return {
        "id": c.id,
        "nombre": c.nombre,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
        "preview": _preview(c.data),
        "n_puntos": len(c.data.get("pts", [])),
        "n_objetos": sum(
            len(c.data.get(k, []))
            for k in ("segs", "circles", "angles", "lines", "rays", "vectors", "polys")
        ),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/guardar", summary="Guardar construcción GeoMathos")
async def guardar(
    body: GuardarRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    c = GeoConstruccion(nombre=body.nombre.strip() or "Sin nombre", data=body.data)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return {"ok": True, **_serialize(c)}


@router.put("/{construccion_id}", summary="Actualizar construcción existente")
async def actualizar(
    construccion_id: str,
    body: ActualizarRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    c = await session.get(GeoConstruccion, construccion_id)
    if not c:
        raise HTTPException(status_code=404, detail="Construcción no encontrada")
    if body.nombre is not None:
        c.nombre = body.nombre.strip() or c.nombre
    if body.data is not None:
        c.data = body.data
    c.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(c)
    return {"ok": True, **_serialize(c)}


@router.get("/lista", summary="Listar construcciones guardadas")
async def lista(
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(GeoConstruccion).order_by(GeoConstruccion.updated_at.desc())
    )
    return [_serialize(c) for c in result.scalars().all()]


@router.get("/{construccion_id}", summary="Cargar una construcción (datos completos)")
async def cargar(
    construccion_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    c = await session.get(GeoConstruccion, construccion_id)
    if not c:
        raise HTTPException(status_code=404, detail="Construcción no encontrada")
    return {**_serialize(c), "data": c.data}


@router.delete("/{construccion_id}", summary="Eliminar construcción")
async def eliminar(
    construccion_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    c = await session.get(GeoConstruccion, construccion_id)
    if not c:
        raise HTTPException(status_code=404, detail="Construcción no encontrada")
    await session.delete(c)
    await session.commit()
    return {"ok": True, "id": construccion_id}
