"""
Mathós — Router de talleres manuscritos.

Endpoints:
  POST /api/v1/taller/manuscrito        — Subir PDF/imagen de trabajo a mano para evaluar
  POST /api/v1/taller/generar           — Generar un taller para resolver a mano
  GET  /api/v1/taller/historial/{tema_id} — Historial de talleres enviados
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional

from services.taller_service import analizar_manuscrito, generar_taller
from shared.settings import settings

router = APIRouter()

# Directorio de uploads
UPLOADS_DIR = Path(__file__).resolve().parent.parent / ".." / ".." / "uploads" / "taller"
UPLOADS_DIR = UPLOADS_DIR.resolve()


class EvaluacionManuscritoResponse(BaseModel):
    puntuacion: int = 0
    correccion: int = 0
    desarrollo: int = 0
    claridad: int = 0
    completitud: int = 0
    transcripcion: str = ""
    feedback: str = ""
    aprobado: bool = False
    error: Optional[str] = None
    saved_path: Optional[str] = None


class GenerarTallerRequest(BaseModel):
    tema_nombre: str = Field(..., min_length=1, max_length=200)
    materia_nombre: str = Field(..., min_length=1, max_length=200)
    dificultad: str = Field("intermedio", pattern="^(basico|intermedio|avanzado)$")
    sandbox_tipo: Optional[str] = Field(None, description="Tipo de sandbox: 'sql', 'cpp', etc.")


class GenerarTallerResponse(BaseModel):
    titulo: str
    enunciado: str
    formato_esperado: str = ""
    tiempo_estimado: str = "30 minutos"
    rubrica: list[dict] = []


@router.post(
    "/manuscrito",
    response_model=EvaluacionManuscritoResponse,
    summary="Evaluar trabajo manuscrito con Gemini Vision",
    description=(
        "Sube una imagen o PDF de un trabajo escrito a mano. "
        "Gemini Vision lo leerá, transcribirá y evaluará según el tema indicado."
    ),
)
async def evaluar_manuscrito_endpoint(
    archivo: UploadFile = File(..., description="Imagen (JPEG, PNG) o PDF del trabajo manuscrito"),
    tema_nombre: str = Form(..., description="Nombre del tema a evaluar"),
    materia_nombre: str = Form(..., description="Nombre de la materia"),
    dificultad: str = Form("intermedio", description="Dificultad esperada"),
    prompt_extra: str = Form("", description="Instrucciones adicionales"),
) -> EvaluacionManuscritoResponse:
    # Validar tipo
    content_type = archivo.content_type or ""
    allowed = [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "application/pdf",
    ]
    if content_type and content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado: {content_type}. Usa JPEG, PNG, WebP, GIF o PDF.",
        )

    # Leer bytes
    try:
        archivo_bytes = await archivo.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    if not archivo_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    # Límite 15 MB
    if len(archivo_bytes) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo excede el límite de 15 MB")

    # Evaluar
    try:
        result = await analizar_manuscrito(
            archivo_bytes=archivo_bytes,
            filename=archivo.filename or "archivo",
            tema_nombre=tema_nombre,
            materia_nombre=materia_nombre,
            dificultad=dificultad,
            prompt_extra=prompt_extra,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error evaluando manuscrito: {e}")

    # Guardar archivo y resultado en disco
    saved_path = None
    try:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        safe_materia = "".join(c if c.isalnum() or c in "_-" else "_" for c in materia_nombre)[:50]
        safe_tema = "".join(c if c.isalnum() or c in "_-" else "_" for c in tema_nombre)[:50]
        folder = UPLOADS_DIR / safe_materia / safe_tema
        folder.mkdir(parents=True, exist_ok=True)

        # Guardar archivo original
        ext = Path(archivo.filename or "archivo.pdf").suffix or ".png"
        file_id = f"{ts}_{uuid.uuid4().hex[:8]}"
        file_path = folder / f"{file_id}{ext}"
        file_path.write_bytes(archivo_bytes)

        # Guardar resultado como JSON al lado
        result_path = folder / f"{file_id}_evaluacion.json"
        result_data = {
            "id": file_id,
            "filename": archivo.filename,
            "tema": tema_nombre,
            "materia": materia_nombre,
            "dificultad": dificultad,
            "fecha": ts,
            "evaluacion": {
                "puntuacion": result.get("puntuacion", 0),
                "correccion": result.get("correccion", 0),
                "desarrollo": result.get("desarrollo", 0),
                "claridad": result.get("claridad", 0),
                "completitud": result.get("completitud", 0),
                "transcripcion": result.get("transcripcion", ""),
                "feedback": result.get("feedback", ""),
                "aprobado": result.get("aprobado", False),
            },
        }
        result_path.write_text(json.dumps(result_data, indent=2, ensure_ascii=False), encoding="utf-8")
        saved_path = str(file_path)
    except Exception:
        # No fatal si falla el guardado
        pass

    return EvaluacionManuscritoResponse(
        puntuacion=result.get("puntuacion", 0),
        correccion=result.get("correccion", 0),
        desarrollo=result.get("desarrollo", 0),
        claridad=result.get("claridad", 0),
        completitud=result.get("completitud", 0),
        transcripcion=result.get("transcripcion", ""),
        feedback=result.get("feedback", ""),
        aprobado=result.get("aprobado", False),
        error=result.get("error"),
        saved_path=saved_path,
    )


@router.post(
    "/generar",
    response_model=GenerarTallerResponse,
    summary="Generar taller para resolver a mano",
    description="La IA genera un taller diseñado para ser resuelto en papel o tablet y luego subido como foto/PDF.",
)
async def generar_taller_endpoint(body: GenerarTallerRequest) -> GenerarTallerResponse:
    try:
        result = await generar_taller(
            tema_nombre=body.tema_nombre,
            materia_nombre=body.materia_nombre,
            dificultad=body.dificultad,
            sandbox_tipo=body.sandbox_tipo,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando taller: {e}")

    return GenerarTallerResponse(
        titulo=result.get("titulo", f"Taller de {body.tema_nombre}"),
        enunciado=result.get("enunciado", ""),
        formato_esperado=result.get("formato_esperado", ""),
        tiempo_estimado=result.get("tiempo_estimado", "30 minutos"),
        rubrica=result.get("rubrica", []),
    )


class EvaluarCanvasRequest(BaseModel):
    canvas_base64: str = Field(..., description="PNG del canvas en base64")
    enunciado: str = Field(..., description="Enunciado del problema")
    pregunta: str = Field("", description="Pregunta específica")
    tema_nombre: str
    materia_nombre: str
    explicacion: str = Field("", description="Explicación escrita del estudiante")
    archivo_base64: str = Field("", description="Imagen o PDF del trabajo manuscrito (base64, opcional)")
    archivo_mime: str = Field("", description="MIME type del archivo adjunto, ej. image/jpeg")


@router.post("/evaluar-canvas", summary="Evaluar solución visual de un problema geométrico con IA")
async def evaluar_canvas(body: EvaluarCanvasRequest):
    """Envía el canvas PNG + contexto del problema a Gemini Vision para evaluación."""
    import base64 as b64lib
    from services.taller_service import GEMINI_VISION_URL

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise HTTPException(502, "GEMINI_API_KEY no configurada")

    prompt_eval = (
        f"Eres un profesor de matemáticas corrigiendo un ejercicio de {body.materia_nombre}.\n\n"
        f"TEMA: {body.tema_nombre}\n"
        f"PROBLEMA: {body.enunciado}\n"
        f"PREGUNTA: {body.pregunta}\n"
        f"EXPLICACIÓN ESCRITA DEL ESTUDIANTE: {body.explicacion or '(no proporcionó explicación escrita)'}\n\n"
        "La imagen adjunta es el canvas donde el estudiante dibujó/anotó su solución.\n\n"
        "Evalúa la respuesta y devuelve un JSON con esta estructura exacta:\n"
        '{"puntuacion": 0-100, "correcto": true/false, "feedback": "retroalimentación constructiva en español (3-5 frases)", '
        '"errores": ["error específico si lo hay"], "aciertos": ["lo que hizo bien"]}'
        "\n\nSolo JSON, sin texto extra."
    )

    try:
        image_data = body.canvas_base64
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        parts: list = [
            {"text": prompt_eval},
            {"inline_data": {"mime_type": "image/png", "data": image_data}},
        ]
        if body.archivo_base64 and body.archivo_mime:
            archivo_data = body.archivo_base64
            if "," in archivo_data:
                archivo_data = archivo_data.split(",", 1)[1]
            parts.append({"text": "Trabajo manuscrito del estudiante (imagen adjunta):"})
            parts.append({"inline_data": {"mime_type": body.archivo_mime, "data": archivo_data}})

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{GEMINI_VISION_URL}?key={api_key}",
                json={
                    "contents": [{"parts": parts}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800},
                },
            )
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        import re as _re

        # Strip markdown fences
        cleaned = _re.sub(r'^```(?:json)?\s*', '', raw, flags=_re.MULTILINE)
        cleaned = _re.sub(r'\s*```\s*$', '', cleaned, flags=_re.MULTILINE).strip()

        def _extract_eval_json(text: str) -> dict:
            # Strategy 1: direct parse
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
            # Strategy 2: find JSON object and try again
            m2 = _re.search(r'\{[\s\S]*\}', text)
            if m2:
                try:
                    return json.loads(m2.group(0))
                except json.JSONDecodeError:
                    pass
            # Strategy 3: regex field extraction (handles unescaped newlines in strings)
            source = m2.group(0) if m2 else text

            def _int(f): r = _re.search(rf'"{f}"\s*:\s*(\d+)', source); return int(r.group(1)) if r else 0
            def _bool(f): r = _re.search(rf'"{f}"\s*:\s*(true|false)', source, _re.I); return r.group(1).lower() == 'true' if r else False
            def _str(f):
                # [^"\\] matches any char including \n (DOTALL not needed for char classes)
                r = _re.search(rf'"{f}"\s*:\s*"((?:[^"\\]|\\.)*)"', source)
                return r.group(1).replace('\\n', '\n').replace('\\"', '"') if r else ""
            def _list(f):
                r = _re.search(rf'"{f}"\s*:\s*\[([^\]]*)\]', source)
                if not r: return []
                return [x.strip().strip('"') for x in r.group(1).split(',') if x.strip().strip('"')]

            puntuacion = _int("puntuacion")
            correcto = _bool("correcto")
            feedback = _str("feedback") or "Evaluación recibida — no se pudo extraer el detalle."
            return {"puntuacion": puntuacion, "correcto": correcto, "feedback": feedback,
                    "errores": _list("errores"), "aciertos": _list("aciertos")}

        data = _extract_eval_json(cleaned)

        # Asegurar tipos correctos
        data["puntuacion"] = int(data.get("puntuacion", 0))
        data["correcto"] = bool(data.get("correcto", False))
        data.setdefault("errores", [])
        data.setdefault("aciertos", [])
        return data
    except Exception as e:
        raise HTTPException(502, f"Error evaluando canvas: {e}")


@router.get(
    "/historial/{tema_id}",
    summary="Historial de talleres manuscritos enviados para un tema",
)
async def historial_taller(tema_id: str = ""):
    """Devuelve los archivos y evaluaciones guardados para un tema."""
    resultados = []
    if UPLOADS_DIR.exists():
        for folder in UPLOADS_DIR.rglob("*"):
            if folder.is_dir():
                for json_file in sorted(folder.glob("*_evaluacion.json"), reverse=True):
                    try:
                        data = json.loads(json_file.read_text(encoding="utf-8"))
                        # Filtrar por tema si se proporcionó
                        if tema_id and data.get("tema") and tema_id.lower() not in data["tema"].lower():
                            continue
                        resultados.append(data)
                    except Exception:
                        continue
    return {
        "tema_id": tema_id,
        "total": len(resultados),
        "entregas": resultados[:20],
    }
