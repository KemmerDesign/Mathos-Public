"""
Mathós — Router de audio (NotebookLM MCP).

Endpoints:
  POST /api/v1/audio/{tema_id}  — Genera audio overview para un tema
  GET  /api/v1/audio/{tema_id}/status — Estado de la generación
"""

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services.notebooklm_service import generate_audio, AUDIO_DIR

router = APIRouter()

# Jobs en progreso (simples, en memoria — para producción usaría Redis)
_audio_jobs: dict[str, dict] = {}


class AudioRequest(BaseModel):
    tema_nombre: str = Field(..., min_length=1, max_length=200)
    contenido_teoria: str = Field(..., min_length=50, description="Texto de teoría del tema")
    regenerar: bool = Field(False)


class AudioResponse(BaseModel):
    tema_id: str
    url: str
    cached: bool
    cache_key: str


class AudioStatus(BaseModel):
    tema_id: str
    status: str  # "generating" | "complete" | "error"
    url: str | None = None
    message: str | None = None


@router.post(
    "/{tema_id}",
    response_model=AudioResponse,
    summary="Generar audio overview para un tema con NotebookLM",
    description=(
        "Genera un podcast estilo Audio Overview usando Google NotebookLM. "
        "El audio se cachea en disco. La primera generación puede tardar 3-5 minutos. "
        "Requiere autenticación previa en NotebookLM (ejecutar notebooklm-mcp una vez)."
    ),
)
async def generar_audio_endpoint(
    tema_id: str,
    body: AudioRequest,
) -> AudioResponse:
    try:
        result = await generate_audio(
            tema_id=tema_id,
            tema_nombre=body.tema_nombre,
            contenido_teoria=body.contenido_teoria,
            regenerar=body.regenerar,
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generando audio: {e}. Asegúrate de haber ejecutado 'notebooklm-mcp' al menos una vez para autenticarte.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {e}")

    return AudioResponse(
        tema_id=tema_id,
        url=result["url"],
        cached=result["cached"],
        cache_key=result["cache_key"],
    )


@router.get(
    "/{tema_id}/status",
    response_model=AudioStatus,
    summary="Consultar estado de generación de audio",
)
async def status_audio_endpoint(tema_id: str) -> AudioStatus:
    job = _audio_jobs.get(tema_id)
    if not job:
        # Verificar si ya existe en caché
        from services.notebooklm_service import _audio_cache_key
        import hashlib
        # Buscar cualquier archivo de audio para este tema
        audio_files = list(AUDIO_DIR.glob("*.m4a"))
        if audio_files:
            return AudioStatus(
                tema_id=tema_id,
                status="complete",
                url=f"/resources/audio/{audio_files[0].name}",
                message="Audio disponible (cacheado)",
            )
        return AudioStatus(
            tema_id=tema_id,
            status="unknown",
            message="No hay audio generado para este tema",
        )

    return AudioStatus(
        tema_id=tema_id,
        status=job.get("status", "unknown"),
        url=job.get("url"),
        message=job.get("message"),
    )


@router.get(
    "/play/{filename}",
    summary="Servir archivo de audio",
)
async def servir_audio(filename: str):
    """Sirve un archivo de audio .m4a desde el directorio de caché."""
    audio_path = AUDIO_DIR / filename
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio no encontrado")
    return FileResponse(
        path=str(audio_path),
        media_type="audio/mp4",
        filename=filename,
    )
