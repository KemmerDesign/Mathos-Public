"""
Mathos — Vision Service.

Servicio que recibe una imagen (bytes), la codifica a base64 y la envía a
Gemini Vision API (gemini-2.0-flash) para analizarla.

Endpoint usado:
  POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
"""

import base64
from mimetypes import guess_type

import httpx

from shared.settings import settings

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-2.5-flash:generateContent"
)

# ──────────────────────────────────────────────
# Public helpers
# ──────────────────────────────────────────────


def _guess_mime_type(imagen_bytes: bytes, fallback: str = "image/jpeg") -> str:
    """
    Intenta adivinar el MIME type de los bytes usando la firma mágica.

    Args:
        imagen_bytes: Contenido binario de la imagen.
        fallback: Tipo MIME por defecto si no se puede detectar.

    Returns:
        str con el MIME type (image/jpeg, image/png, image/webp, …).
    """
    if imagen_bytes[:4] == b"%PDF":
        return "application/pdf"
    if imagen_bytes[:4] == b"\x89PNG":
        return "image/png"
    if imagen_bytes[:2] in (b"\xff\xd8",):
        return "image/jpeg"
    if imagen_bytes[:4] == b"RIFF" and imagen_bytes[8:12] == b"WEBP":
        return "image/webp"
    if imagen_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if imagen_bytes[:4] == b"\x89P5":
        return "image/x-portable-pixmap"
    return fallback


async def analizar_imagen(
    imagen_bytes: bytes,
    prompt: str = "Resuelve este ejercicio paso a paso",
) -> str:
    """
    Envía una imagen a Gemini Vision API y devuelve la respuesta textual.

    Args:
        imagen_bytes: Contenido binario de la imagen a analizar.
        prompt: Texto opcional que acompaña la imagen.

    Returns:
        Texto de la respuesta generada por Gemini, o un mensaje de error.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return (
            "Error: No hay GEMINI_API_KEY configurada. "
            "Agrega GEMINI_API_KEY=tu-clave en el archivo .env"
        )

    # Codificar imagen a base64
    img_b64 = base64.b64encode(imagen_bytes).decode("utf-8")
    mime_type = _guess_mime_type(imagen_bytes)

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": img_b64,
                        }
                    },
                ]
            }
        ]
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            GEMINI_API_URL,
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )

        if resp.status_code == 200:
            data = resp.json()
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError) as exc:
                return f"Error: formato de respuesta inesperado de Gemini — {exc}"

        # Intentar extraer mensaje de error detallado
        try:
            error_detail = resp.json()
        except Exception:
            error_detail = resp.text[:500]

        return (
            f"Error Gemini: HTTP {resp.status_code} — "
            f"{error_detail}"
        )
