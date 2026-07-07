"""
Mathós — Servicio SRS (Spaced Repetition System).

Implementa el algoritmo SM-2 para flashcards y genera tarjetas con IA
a partir del contenido de un tema.
"""

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx

from shared.settings import settings

# ── Cache directory ──────────────────────────────
CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache" / "srs"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ──────────────────────────────────────────────
# SM-2 Algorithm
# ──────────────────────────────────────────────

def sm2_update(
    repeticiones: int,
    facilidad: float,
    intervalo: int,
    calificacion: int,
) -> tuple[int, float, int]:
    """
    Actualiza los parámetros SM-2 tras una revisión.

    calificacion: 0-5
      0 = Blackout (no recuerdo nada)
      1 = Error grave
      2 = Error con pista
      3 = Correcto con dificultad
      4 = Correcto
      5 = Perfecto, sin dudas

    Retorna (nuevas_repeticiones, nueva_facilidad, nuevo_intervalo_días)
    """
    if calificacion >= 3:
        if repeticiones == 0:
            nuevo_intervalo = 1
        elif repeticiones == 1:
            nuevo_intervalo = 6
        else:
            nuevo_intervalo = round(intervalo * facilidad)
        nuevas_reps = repeticiones + 1
        nueva_facilidad = facilidad + (0.1 - (5 - calificacion) * (0.08 + (5 - calificacion) * 0.02))
        nueva_facilidad = max(1.3, nueva_facilidad)
    else:
        # Respuesta incorrecta — reiniciar
        nuevo_intervalo = 1
        nuevas_reps = 0
        nueva_facilidad = max(1.3, facilidad - 0.2)

    return nuevas_reps, round(nueva_facilidad, 2), nuevo_intervalo


def proxima_revision(intervalo_dias: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=intervalo_dias)


# ──────────────────────────────────────────────
# AI — Generación de flashcards
# ──────────────────────────────────────────────

SYSTEM_PROMPT_FLASHCARDS = """Eres un experto en técnicas de memorización activa.
A partir del contenido de un tema de estudio, genera flashcards de alta calidad.

REGLAS:
- Cada flashcard tiene una PREGUNTA concisa y una RESPUESTA precisa.
- Las preguntas deben forzar RECALL activo, no reconocimiento.
- Prefiere preguntas de tipo "¿Qué es...?", "¿Para qué sirve...?", "¿Cuál es la diferencia entre X e Y?", "¿Cómo funciona...?", "¿Qué pasa si...?".
- Las respuestas son breves (1-3 líneas), directas, con la información clave.
- Para SQL/Oracle: incluye sintaxis exacta o ejemplos mínimos en la respuesta cuando aplique.
- NO generes preguntas triviales de definición si hay conceptos más profundos.

FORMATO JSON (responde SOLO con el JSON):
{
  "flashcards": [
    {"pregunta": "...", "respuesta": "..."},
    {"pregunta": "...", "respuesta": "..."}
  ]
}"""


async def generar_flashcards_ia(
    tema_nombre: str,
    materia_nombre: str,
    contenido: str,
    num: int = 5,
) -> list[dict]:
    """Genera flashcards usando IA a partir del contenido teórico de un tema. Usa caché en disco."""
    
    # ── Cache check ──────────────────────────────
    cache_key = hashlib.sha256(
        f"{tema_nombre}:{materia_nombre}:{contenido[:500]}:{num}".encode()
    ).hexdigest()[:16]
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text())
            if isinstance(cached, list) and len(cached) >= num:
                return cached[:num]
        except Exception:
            cache_file.unlink(missing_ok=True)
    
    contenido_recortado = contenido[:3000] if len(contenido) > 3000 else contenido
    user_prompt = (
        f"MATERIA: {materia_nombre}\n"
        f"TEMA: {tema_nombre}\n\n"
        f"CONTENIDO:\n{contenido_recortado}\n\n"
        f"Genera exactamente {num} flashcards para este tema."
    )

    for provider in ["deepseek", "qwen"]:
        try:
            if provider == "deepseek":
                api_key = settings.DEEPSEEK_API_KEY_RESOLVED
                api_url = "https://api.deepseek.com/v1/chat/completions"
                model = "deepseek-chat"
            else:
                api_key = settings.QWEN_API_KEY_RESOLVED
                api_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
                model = "qwen-max"

            if not api_key:
                continue

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    api_url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT_FLASHCARDS},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.4,
                        "max_tokens": 2048,
                    },
                )
                texto = resp.json()["choices"][0]["message"]["content"]
                data = _extraer_json(texto)
                cards = data.get("flashcards", [])
                if isinstance(cards, list) and cards:
                    # Guardar en caché
                    try:
                        cache_file.write_text(json.dumps(cards, ensure_ascii=False))
                    except Exception:
                        pass
                    return cards[:num]
        except Exception as e:
            print(f"[SRS] {provider} falló al generar flashcards: {e}")
            continue

    raise Exception("No se pudieron generar flashcards — proveedores IA no disponibles")


async def _llamar_ia_srs(system_prompt: str, user_prompt: str) -> str:
    """Llamada genérica a la IA para el módulo SRS."""
    for provider in ["deepseek", "qwen"]:
        try:
            if provider == "deepseek":
                api_key = settings.DEEPSEEK_API_KEY_RESOLVED
                api_url = "https://api.deepseek.com/v1/chat/completions"
                model = "deepseek-chat"
            else:
                api_key = settings.QWEN_API_KEY_RESOLVED
                api_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
                model = "qwen-max"

            if not api_key:
                continue

            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    api_url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 3000,
                    },
                )
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[SRS] {provider} falló: {e}")
            continue
    raise Exception("Proveedores IA no disponibles")


def _extraer_json(texto: str) -> dict:
    texto = texto.strip()
    m = re.search(r'```(?:json)?\s*(.*?)\s*```', texto, re.DOTALL)
    if m:
        texto = m.group(1).strip()
    # Balanceo de llaves
    if texto.startswith('{'):
        depth, end = 0, 0
        for i, ch in enumerate(texto):
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end:
            return json.loads(texto[:end])
    return json.loads(texto)
