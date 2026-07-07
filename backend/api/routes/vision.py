"""
Mathos — Router de Vision.

Endpoints:
  POST /api/v1/vision/analizar  — Analiza una foto de ejercicio con Gemini Vision
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from services.vision_service import analizar_imagen

router = APIRouter()

# ──────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────


class AnalizarResponse(BaseModel):
    respuesta: str
    modelo_usado: str = "gemini-2.5-flash"


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────


@router.post(
    "/analizar",
    response_model=AnalizarResponse,
    summary="Analizar una imagen de ejercicio con Gemini Vision",
    description=(
        "Recibe una imagen (JPEG, PNG, WebP, GIF) de un ejercicio matemático "
        "y opcionalmente un prompt textual. La imagen se envía a Gemini Vision "
        "(gemini-2.0-flash) que la procesa y devuelve la solución o explicación "
        "paso a paso."
    ),
)
async def analizar_imagen_endpoint(
    imagen: UploadFile = File(
        ...,
        description="Archivo de imagen (JPEG, PNG, WebP, GIF)",
    ),
    prompt: Optional[str] = Form(
        "Resuelve este ejercicio paso a paso",
        description="Prompt opcional que acompaña la imagen",
        max_length=2000,
    ),
) -> AnalizarResponse:
    """
    Endpoint para analizar una foto de ejercicio escrito a mano.

    Args:
        imagen: Archivo de imagen subido via multipart/form-data.
        prompt: Texto opcional que guía el análisis.

    Returns:
        AnalizarResponse con la respuesta de Gemini y el modelo usado.
    """
    # Validar tipo de contenido
    content_type = imagen.content_type or ""
    allowed_types = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ]
    if content_type and content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tipo de imagen no soportado: {content_type}. "
                f"Usa uno de: {', '.join(allowed_types)}"
            ),
        )

    # Leer los bytes de la imagen
    try:
        imagen_bytes = await imagen.read()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error leyendo el archivo de imagen: {e}",
        )

    if not imagen_bytes:
        raise HTTPException(
            status_code=400,
            detail="El archivo de imagen está vacío",
        )

    # Limitar tamaño (10 MB)
    max_size = 10 * 1024 * 1024
    if len(imagen_bytes) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"La imagen excede el límite de 10 MB ({len(imagen_bytes)} bytes)",
        )

    # Llamar al servicio
    try:
        respuesta = await analizar_imagen(
            imagen_bytes=imagen_bytes,
            prompt=prompt or "Resuelve este ejercicio paso a paso",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error procesando la imagen con Gemini Vision: {e}",
        )

    return AnalizarResponse(
        respuesta=respuesta,
        modelo_usado="gemini-2.5-flash",
    )


@router.post(
    "/transcribir",
    summary="Transcribir trabajo escrito/dibujado de un estudiante (imagen o PDF)",
)
async def transcribir_respuesta(
    archivo: UploadFile = File(...),
    tema_nombre: str = Form(""),
) -> AnalizarResponse:
    """Transcribe el contenido matemático/geométrico de una imagen o PDF."""
    content_type = archivo.content_type or ""
    allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]
    if content_type and content_type not in allowed:
        raise HTTPException(400, f"Tipo no soportado: {content_type}")

    imagen_bytes = await archivo.read()
    if not imagen_bytes:
        raise HTTPException(400, "Archivo vacío")
    if len(imagen_bytes) > 15 * 1024 * 1024:
        raise HTTPException(413, "El archivo excede 15 MB")

    contexto = f" sobre el tema '{tema_nombre}'" if tema_nombre else ""
    prompt = (
        f"Eres un asistente que transcribe el trabajo escrito de un estudiante{contexto}. "
        "Transcribe con exactitud TODO lo que ves: texto, fórmulas matemáticas (en LaTeX cuando sea posible), "
        "pasos numerados, diagramas geométricos (descríbelos detalladamente: puntos, líneas, ángulos, medidas), "
        "construcciones con regla y compás, gráficas. "
        "Si hay errores, transcríbelos tal como están — no los corrijas. "
        "Responde SOLO con la transcripción, sin comentarios adicionales."
    )

    try:
        respuesta = await analizar_imagen(imagen_bytes=imagen_bytes, prompt=prompt)
    except Exception as e:
        raise HTTPException(500, f"Error con Gemini Vision: {e}")

    return AnalizarResponse(respuesta=respuesta, modelo_usado="gemini-2.5-flash")
