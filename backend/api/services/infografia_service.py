"""
Mathós — Servicio de generación de infografías (Mermaid.js).

Genera diagramas Mermaid.js para temas académicos usando DeepSeek/Qwen.
Los diagramas se cachean en disco para no regenerarlos.
"""

import json
import os
import hashlib
import asyncio
from pathlib import Path

import httpx

from shared.settings import settings

# Directorio de caché
CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "infografias"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Prompt sistema para generación de diagramas
SYSTEM_PROMPT = """Eres un generador de diagramas Mermaid.js para estudiantes universitarios de matemáticas e informática.

Dado el contenido de un tema académico, genera UN diagrama Mermaid.js que explique visualmente los conceptos clave.

Reglas:
1. Responde SOLO con el código Mermaid.js, sin markdown, sin explicaciones.
2. Usa ```mermaid ... ``` como formato de respuesta.
3. El diagrama debe ser claro, informativo y apto para estudio.
4. Prefiere flowchart TB (top-bottom) para jerarquías, y graph LR para flujos.
5. Usa colores semánticos con classes: #e1f5fe para conceptos, #fff3e0 para ejemplos, #e8f5e9 para aplicaciones.
6. Máximo 15-20 nodos para mantener legibilidad.
7. Incluye estilos CSS inline con %%{init: ...}%% si es necesario.
8. Usa nombres cortos en los nodos (máx 40 chars) pero descriptivos.
9. Para temas de programación usa flowchart, para matemáticas usa graph.
10. NUNCA incluyas texto fuera del bloque ```mermaid."""


def _cache_key(tema_id: str, contenido_hash: str) -> str:
    """Genera una clave de caché única para el tema + contenido."""
    key = f"{tema_id}_{contenido_hash}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _cached_diagram(cache_key: str) -> str | None:
    """Retorna el diagrama cacheado si existe."""
    cache_file = CACHE_DIR / f"{cache_key}.mermaid"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")
    return None


def _save_diagram(cache_key: str, diagram: str) -> None:
    """Guarda el diagrama en caché."""
    cache_file = CACHE_DIR / f"{cache_key}.mermaid"
    cache_file.write_text(diagram, encoding="utf-8")


def _extract_mermaid(text: str) -> str:
    """Extrae el bloque ```mermaid ... ``` de la respuesta del LLM."""
    # Buscar ```mermaid ... ```
    import re
    match = re.search(r'```mermaid\s*\n(.*?)\n```', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: buscar ``` ... ``` genérico
    match = re.search(r'```\s*\n(.*?)\n```', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Si no hay bloques, devolver el texto tal cual (podría ser código puro)
    return text.strip()


async def generar_infografia(
    tema_id: str,
    tema_nombre: str,
    contenido_teoria: str,
    regenerar: bool = False,
) -> dict:
    """
    Genera (o recupera del caché) un diagrama Mermaid.js para un tema.

    Args:
        tema_id: UUID del tema
        tema_nombre: Nombre del tema
        contenido_teoria: Texto completo de la teoría (markdown)
        regenerar: Si True, ignora el caché y regenera

    Returns:
        dict con {diagram, cached, cache_key}
    """
    contenido_hash = hashlib.sha256(contenido_teoria.encode()).hexdigest()[:12]
    ck = _cache_key(tema_id, contenido_hash)

    # Verificar caché
    if not regenerar:
        cached = _cached_diagram(ck)
        if cached:
            return {"diagram": cached, "cached": True, "cache_key": ck}

    # Construir prompt
    # Truncar contenido a ~4000 chars para no pasarnos de tokens
    truncated = contenido_teoria[:4000]
    user_prompt = f"""Tema: {tema_nombre}

Contenido académico:
{truncated}

Genera un diagrama Mermaid.js que resuma visualmente este tema."""

    # Intentar DeepSeek primero, luego Qwen
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
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 2000,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw = data["choices"][0]["message"]["content"]
                    diagram = _extract_mermaid(raw)
                    if diagram and len(diagram) > 20:
                        _save_diagram(ck, diagram)
                        return {"diagram": diagram, "cached": False, "cache_key": ck}
        except Exception:
            continue

    # Fallback: diagrama genérico
    fallback = f"""graph TB
    A["{tema_nombre}"] --> B[Conceptos clave]
    A --> C[Aplicaciones]
    A --> D[Ejemplos]
    B --> B1[Definición]
    B --> B2[Propiedades]
    C --> C1[Práctica]
    C --> C2[Exámenes]
    D --> D1[Ejercicio 1]
    D --> D2[Ejercicio 2]
    style A fill:#e1f5fe,stroke:#0288d1
    style B fill:#fff3e0,stroke:#f57c00
    style C fill:#e8f5e9,stroke:#388e3c
    style D fill:#fce4ec,stroke:#c62828"""

    return {"diagram": fallback, "cached": False, "cache_key": ck, "fallback": True}
