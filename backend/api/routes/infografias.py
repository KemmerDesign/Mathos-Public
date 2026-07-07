"""
Mathós — Router de infografías (Mermaid.js).

Endpoints:
  POST /api/v1/infografias/{tema_id}  — Genera/recupera infografía para un tema
  GET  /api/v1/infografias/{tema_id}  — Obtiene infografía cacheada
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Tema, Materia
from services.infografia_service import generar_infografia
from shared.database import get_session

router = APIRouter()


class InfografiaRequest(BaseModel):
    contenido_teoria: str = Field(..., min_length=50, description="Texto de teoría del tema (markdown)")
    regenerar: bool = Field(False, description="Si True, ignora caché y regenera")


class InfografiaResponse(BaseModel):
    tema_id: str
    diagram: str
    cached: bool
    cache_key: str


@router.post(
    "/{tema_id}",
    response_model=InfografiaResponse,
    summary="Generar infografía Mermaid.js para un tema",
)
async def generar_infografia_endpoint(
    tema_id: str,
    body: InfografiaRequest,
) -> InfografiaResponse:
    """Genera o recupera un diagrama Mermaid.js que resume visualmente un tema."""
    try:
        result = await generar_infografia(
            tema_id=tema_id,
            tema_nombre="Tema",  # Se infiere del contenido
            contenido_teoria=body.contenido_teoria,
            regenerar=body.regenerar,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando infografía: {e}")

    return InfografiaResponse(
        tema_id=tema_id,
        diagram=result["diagram"],
        cached=result["cached"],
        cache_key=result["cache_key"],
    )
