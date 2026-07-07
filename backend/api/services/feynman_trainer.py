"""
Mathós — Servicio de entrenamiento Feynman.

Evalúa explicaciones estilo Feynman (analogías para niños) y da
feedback detallado para mejorar la capacidad de crear analogías.
"""

import json
import hashlib
import httpx
from pathlib import Path

from shared.settings import settings

# ── Cache directory ──────────────────────────────
FEYNMAN_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache" / "feynman"
FEYNMAN_CACHE_DIR.mkdir(parents=True, exist_ok=True)

FEYNMAN_SYSTEM_PROMPT = """Eres un tutor experto en la Técnica Feynman. Tu trabajo es ayudar a estudiantes universitarios a mejorar su capacidad de explicar conceptos complejos con analogías simples.

La Técnica Feynman tiene 4 pasos:
1. Elegir un concepto
2. Explicarlo como si se lo enseñaras a un niño de 10 años (sin jerga, con analogías cotidianas)
3. Identificar lo que no puedes explicar simplemente (huecos de comprensión)
4. Volver a estudiar y simplificar aún más

Evalúa la explicación del estudiante según:
- **Claridad (0-25 pts):** ¿Se entiende sin conocimientos previos?
- **Analogía (0-30 pts):** ¿La analogía es relevante, concreta y memorable?
- **Precisión (0-25 pts):** ¿Es correcta conceptualmente? (sin sacrificar rigor por simplicidad)
- **Simplicidad (0-20 pts):** ¿Evita jerga innecesaria? ¿Usa lenguaje llano?

Responde SIEMPRE en este formato JSON (sin markdown, sin texto fuera del JSON):
{
  "puntuacion": 85,
  "claridad": 22,
  "analogia": 25,
  "precision": 20,
  "simplicidad": 18,
  "feedback": "## Evaluación de tu explicación\\n\\n### Lo que funciona bien\\n- ...\\n\\n### Cómo mejorar\\n- ...\\n\\n### Analogía alternativa sugerida\\n*Aquí va una analogía de ejemplo que podrías usar*",
  "huecos": ["Concepto que necesita más estudio", "Otro punto débil"],
  "aprobado": true
}"""


async def evaluar_feynman(
    tema_nombre: str,
    explicacion_estudiante: str,
    nivel: str = "normal",
) -> dict:
    """
    Evalúa una explicación estilo Feynman y da feedback para mejorar.

    Args:
        tema_nombre: Nombre del tema académico
        explicacion_estudiante: La explicación escrita por el estudiante
        nivel: "dummy" para respuesta rápida, "normal" para evaluación completa

    Returns:
        dict con puntuacion, feedback, huecos, aprobado
    """
    if nivel == "dummy":
        # Respuesta rápida simulada
        return {
            "puntuacion": 72,
            "claridad": 20,
            "analogia": 22,
            "precision": 15,
            "simplicidad": 15,
            "feedback": (
                "## 🧠 Evaluación Feynman (modo rápido)\n\n"
                "### 👍 Lo que funciona\n"
                "- Tu explicación transmite la idea general correctamente\n"
                "- Se nota el esfuerzo por usar lenguaje sencillo\n\n"
                "### 🔧 Cómo mejorar\n"
                "- **Concreción:** Usa objetos cotidianos en tu analogía (cocina, deportes, mascotas)\n"
                "- **Estructura:** Empieza con 'Imagina que...' y termina con 'Así que en resumen...'\n"
                "- **Precisión:** No sacrifiques corrección por simplicidad — verifica los detalles\n\n"
                "### 💡 Analogía de ejemplo\n"
                f'*Para explicar "{tema_nombre}", imagina que eres un chef explicando '
                f"una receta a un aprendiz. Cada ingrediente es un concepto, cada paso "
                f"es una operación lógica, y el plato final es la solución.*\n\n"
                "**Vuelve a intentarlo** aplicando estos consejos. ¡Cada iteración te acerca a la maestría!"
            ),
            "huecos": ["Falta analogía concreta con objetos cotidianos", "Estructura narrativa débil"],
            "aprobado": False,
        }

    # ── Cache check ──────────────────────────────────
    cache_key = hashlib.sha256(
        f"{tema_nombre}:{explicacion_estudiante[:300]}:{nivel}".encode()
    ).hexdigest()[:16]
    cache_file = FEYNMAN_CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except Exception:
            cache_file.unlink(missing_ok=True)

    # Evaluación real con IA
    prompt = (
        f"Tema académico: {tema_nombre}\n\n"
        f"Explicación del estudiante:\n{explicacion_estudiante}\n\n"
        f"Evalúa esta explicación según la Técnica Feynman. "
        f"Sé constructivo y amable. El objetivo es ayudar al estudiante a mejorar, no desmotivarlo. "
        f"Si la puntuación es >= 70, 'aprobado' debe ser true."
    )

    for provider in ["deepseek", "qwen"]:
        try:
            if provider == "deepseek":
                api_key = settings.DEEPSEEK_API_KEY_RESOLVED
                api_url = "https://api.deepseek.com/v1/chat/completions"
                model = "deepseek-chat"
            else:
                api_key = settings.QWEN_API_KEY_RESOLVED
                if not api_key:
                    continue
                api_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
                model = "qwen-max"

            if not api_key:
                continue

            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    api_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": FEYNMAN_SYSTEM_PROMPT},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.7,
                        "max_tokens": 1500,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw = data["choices"][0]["message"]["content"]
                    # Intentar parsear JSON
                    try:
                        # Limpiar posibles markdown ```
                        clean = raw.strip()
                        if clean.startswith("```"):
                            clean = clean.split("\n", 1)[1]
                            if clean.endswith("```"):
                                clean = clean[:-3]
                        result = json.loads(clean)
                        # Guardar en caché
                        try:
                            cache_file.write_text(json.dumps(result, ensure_ascii=False))
                        except Exception:
                            pass
                        return result
                    except json.JSONDecodeError:
                        # Si no es JSON válido, devolver el texto como feedback
                        return {
                            "puntuacion": 0,
                            "claridad": 0,
                            "analogia": 0,
                            "precision": 0,
                            "simplicidad": 0,
                            "feedback": raw,
                            "huecos": [],
                            "aprobado": False,
                            "error_parse": True,
                        }
        except Exception:
            continue

    # Fallback
    return {
        "puntuacion": 0,
        "claridad": 0,
        "analogia": 0,
        "precision": 0,
        "simplicidad": 0,
        "feedback": "**Servicio no disponible.** La IA no pudo evaluar tu explicación en este momento. Intenta de nuevo.",
        "huecos": [],
        "aprobado": False,
    }


EJEMPLOS_ANALOGIAS = {
    "arquitectura de von neumann": [
        "Imagina una fábrica de galletas: la memoria es el libro de recetas, la CPU es el chef, los buses son cintas transportadoras.",
        "Imagina una biblioteca: los libros son datos, el bibliotecario es la CPU, el mostrador es el bus.",
    ],
    "puntero": [
        "Un puntero es como un papelito pegado en la nevera que dice dónde está la leche.",
        "Un puntero es como la dirección en un sobre: no contiene la carta, pero sabe dónde entregarla.",
    ],
    "algoritmo": [
        "Un algoritmo es como una receta de cocina: una secuencia de pasos para obtener un resultado.",
        "Un algoritmo es como las instrucciones de un GPS: te guían paso a paso hasta el destino.",
    ],
    "funcion": [
        "Una función es como una batidora: le das ingredientes (parámetros) y te devuelve la mezcla (resultado).",
        "Una función es como un buzón: introduces una carta (input) y recibes una respuesta (output).",
    ],
    "variable": [
        "Una variable es como una caja etiquetada donde guardas cosas. La etiqueta es el nombre, el contenido es el valor.",
        "Una variable es como un casillero con un número: guardas algo dentro y lo recuperas por su número.",
    ],
    "bucle": [
        "Un bucle es como un disco rayado que repite la misma canción hasta que alguien lo detiene.",
        "Un bucle es como lavar platos: repites la misma acción (fregar, enjuagar) hasta que no quedan platos.",
    ],
}


def obtener_ejemplos(tema_nombre: str) -> list[str]:
    """Busca ejemplos de analogías para un tema."""
    tema_lower = tema_nombre.lower()
    results = []
    for key, ejemplos in EJEMPLOS_ANALOGIAS.items():
        if key in tema_lower or any(word in tema_lower for word in key.split()):
            results.extend(ejemplos)
    if not results:
        # Devolver ejemplos genéricos
        results = [
            f'Imagina que "{tema_nombre}" es como una cocina: cada elemento tiene su función específica y juntos crean algo mayor.',
            f'Piensa en "{tema_nombre}" como un juego de construcción: cada pieza es importante y el orden determina el resultado.',
        ]
    return results
