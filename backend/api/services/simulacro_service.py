"""
Mathós — Servicio de simulacro de examen.

Genera exámenes simulados usando IA y corrige las respuestas del estudiante.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

from shared.settings import settings

# Directorio de caché de simulacros
CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "simulacros"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


SYSTEM_PROMPT_MCQ = """Eres un instructor certificado Oracle DBA creando preguntas de tipo test para el examen Oracle Database Administration I (1Z0-082).

FORMATO DE RESPUESTA (JSON):
{{
  "titulo": "Simulacro Oracle Database Administration I (1Z0-082)",
  "instrucciones": "Lee cada pregunta con atención y elige la mejor respuesta. Tienes {duracion_minutos} minutos para {num_preguntas} preguntas. El mínimo para aprobar el examen real es 63%.",
  "duracion_minutos": {duracion_minutos},
  "preguntas": [
    {{
      "id": 1,
      "tema": "Nombre del tema Oracle",
      "tipo": "mcq",
      "enunciado": "Enunciado completo de la pregunta",
      "opciones": [
        "A. Primera opción",
        "B. Segunda opción",
        "C. Tercera opción",
        "D. Cuarta opción"
      ],
      "respuesta_correcta": "A",
      "explicacion": "Breve explicación de por qué A es correcta y las demás son incorrectas.",
      "puntuacion_maxima": 1,
      "criterios_evaluacion": []
    }}
  ]
}}

TEMAS A CUBRIR (distribución equilibrada):
- Arquitectura Oracle: instancia, SGA, PGA, background processes
- SQL: SELECT, JOIN, subconsultas, funciones de grupo, DDL/DML
- Gestión de objetos: tablas, índices, vistas, secuencias, sinónimos
- Gestión de usuarios y privilegios: CREATE USER, GRANT, REVOKE, roles
- Gestión de transacciones: COMMIT, ROLLBACK, SAVEPOINT
- Backup y recovery conceptos básicos: RMAN, tipos de backup
- Gestión del espacio: tablespaces, datafiles, segments
- Rendimiento básico: explain plan, índices

REGLAS:
- Genera exactamente {num_preguntas} preguntas.
- Solo UNA respuesta correcta por pregunta — la letra en "respuesta_correcta" es "A", "B", "C" o "D".
- Las opciones incorrectas deben ser plausibles (como en el examen real).
- La "explicacion" es breve (2-3 frases máximo).
- Mezcla preguntas conceptuales y prácticas (sintaxis SQL, comandos DBA).
- Responde SOLO con el JSON, sin markdown ni texto adicional."""


SYSTEM_PROMPT_GENERAR = """Eres un profesor de la UNED creando un examen de evaluación.

Genera preguntas de examen basadas en el contenido de los temas proporcionados.
Las preguntas deben cubrir balanceadamente todos los temas.

FORMATO DE RESPUESTA (JSON):
{{
  "titulo": "Examen de [materia]",
  "instrucciones": "Instrucciones generales para el estudiante",
  "duracion_minutos": 120,
  "preguntas": [
    {{
      "id": 1,
      "tema": "Nombre del tema del que proviene",
      "tipo": "desarrollo",
      "enunciado": "Enunciado completo de la pregunta",
      "puntuacion_maxima": 10,
      "criterios_evaluacion": ["Criterio 1", "Criterio 2"]
    }}
  ]
}}

REGLAS:
- Genera exactamente {num_preguntas} preguntas.
- Mezcla preguntas de desarrollo (60%) y ejercicios prácticos (40%).
- La dificultad debe ser similar a un examen real de la UNED.
- Cubre TODOS los temas proporcionalmente — no te centres solo en los primeros.
- Incluye preguntas que requieran demostraciones y razonamiento, no solo definiciones.
- Para temas de programación, incluye preguntas de escribir código.
- Para temas de geometría, incluye preguntas de demostración geométrica.
- La puntuación total debe sumar 100 puntos.
- Responde SOLO con el JSON, sin markdown ni texto adicional."""


SYSTEM_PROMPT_CORREGIR = """Eres un profesor de la UNED corrigiendo un examen.

Evalúa cada respuesta del estudiante y asigna una puntuación basada en:
- Corrección conceptual
- Rigor matemático
- Claridad de la explicación
- Uso correcto de notación

FORMATO DE RESPUESTA (JSON):
{
  "puntuacion_total": 85,
  "aprobado": true,
  "feedback_general": "Comentario general sobre el desempeño del estudiante",
  "preguntas": [
    {
      "id": 1,
      "puntuacion": 8.5,
      "puntuacion_maxima": 10,
      "feedback": "Retroalimentación detallada: qué hizo bien, qué puede mejorar",
      "respuesta_modelo": "Una respuesta modelo breve para comparar"
    }
  ]
}

REGLAS:
- Sé justo pero riguroso — es un examen universitario real.
- Si el estudiante deja una pregunta en blanco, asigna 0.
- Si la respuesta es parcialmente correcta, asigna puntuación parcial.
- Proporciona SIEMPRE una respuesta modelo para que el estudiante aprenda.
- Destaca los errores de notación matemática.
- La puntuación total debe reflejar fielmente el desempeño.
- Responde SOLO con el JSON, sin markdown ni texto adicional."""


async def _llamar_ia(prompt_sistema: str, prompt_usuario: str) -> str:
    """Llama a la IA (DeepSeek → QWEN fallback)."""
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

            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    api_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": prompt_sistema},
                            {"role": "user", "content": prompt_usuario},
                        ],
                        "temperature": 0.7 if "generar" in prompt_sistema.lower() else 0.3,
                        "max_tokens": 4096,
                    },
                )
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[Simulacro] {provider} falló: {e}")
            continue

    raise Exception("Ningún proveedor IA disponible para el simulacro")


def _extraer_json(texto: str) -> dict:
    """Extrae JSON de una respuesta LLM que podría tener markdown, texto extra, o faltar llaves externas."""
    texto = texto.strip()
    if not texto:
        raise ValueError("Respuesta vacía de la IA")

    # Caso 1: ```json ... ``` o ```...```
    m = re.search(r'```(?:json)?\s*(.*?)\s*```', texto, re.DOTALL)
    if m:
        inner = m.group(1).strip()
        if inner:
            return _extraer_json(inner)  # Recursivo para procesar el interior

    # Caso 2: El texto no empieza con { o [ → probablemente le faltan las llaves externas
    #   Ej: \n  "titulo": "...",\n  "preguntas": [...]
    if not texto.startswith('{') and not texto.startswith('['):
        # Intentar envolver en {}
        try:
            return json.loads('{' + texto + '}')
        except json.JSONDecodeError:
            pass
        # Intentar envolver en []
        try:
            return json.loads('[' + texto + ']')
        except json.JSONDecodeError:
            pass

    # Caso 3: Parsear objeto { ... } con balanceo de llaves
    if texto.startswith('{'):
        depth = 0
        end = 0
        for i, ch in enumerate(texto):
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0: end = i + 1; break
        if end > 0:
            try:
                return json.loads(texto[:end])
            except json.JSONDecodeError:
                pass

    # Caso 4: Parsear array [ ... ] con balanceo
    if texto.startswith('['):
        depth = 0
        end = 0
        for i, ch in enumerate(texto):
            if ch == '[': depth += 1
            elif ch == ']':
                depth -= 1
                if depth == 0: end = i + 1; break
        if end > 0:
            try:
                return json.loads(texto[:end])
            except json.JSONDecodeError:
                pass

    raise ValueError(f"No se pudo extraer JSON de la respuesta IA: {texto[:300]}...")


def corregir_mcq(preguntas: list[dict], respuestas: list[dict]) -> dict:
    """
    Corrección instantánea para exámenes MCQ — no consume tokens de IA.

    Compara la opción seleccionada por el estudiante con respuesta_correcta.
    El umbral de aprobado para Oracle 1Z0-082 es 63%.
    """
    respuestas_map = {r["pregunta_id"]: r.get("respuesta_texto", "").strip().upper() for r in respuestas}
    correctas = 0
    total = len(preguntas)
    preguntas_corregidas = []

    for p in preguntas:
        pid = p.get("id")
        respuesta_est = respuestas_map.get(pid, "")
        correcta = p.get("respuesta_correcta", "").strip().upper()
        acertada = respuesta_est == correcta and bool(respuesta_est)

        if acertada:
            correctas += 1

        preguntas_corregidas.append({
            "id": pid,
            "puntuacion": 1.0 if acertada else 0.0,
            "puntuacion_maxima": 1.0,
            "acertada": acertada,
            "respuesta_estudiante": respuesta_est,
            "respuesta_correcta": correcta,
            "feedback": "✅ Correcto" if acertada else f"❌ Respuesta correcta: {correcta}",
            "respuesta_modelo": p.get("explicacion", ""),
        })

    porcentaje = round((correctas / total) * 100) if total > 0 else 0
    aprobado = (correctas / total) >= 0.63 if total > 0 else False

    return {
        "puntuacion_total": porcentaje,
        "aprobado": aprobado,
        "feedback_general": (
            f"Acertaste {correctas} de {total} preguntas ({porcentaje}%). "
            + ("¡Aprobado! Superas el 63% requerido por Oracle." if aprobado else f"Necesitas al menos el 63% ({round(total * 0.63)} correctas). ¡Sigue practicando!")
        ),
        "preguntas": preguntas_corregidas,
        "corregido_en": datetime.now(timezone.utc).isoformat(),
        "tipo": "mcq",
        "correctas": correctas,
        "total": total,
    }


async def generar_examen(
    materia_nombre: str,
    temas_contenido: list[dict],
    num_preguntas: int = 10,
    tipo_examen: str = "desarrollo",
) -> dict:
    """
    Genera un examen simulado basado en el contenido de los temas.

    Args:
        materia_nombre: Nombre de la materia
        temas_contenido: Lista de {tema_nombre, contenido_teoria}
        num_preguntas: Número de preguntas a generar

    Returns:
        Dict con el examen generado
    """
    if tipo_examen == "mcq":
        # MCQ: duración proporcional al examen real (90 preguntas = 150 min)
        duracion = max(20, round((num_preguntas / 90) * 150))
        system_prompt = SYSTEM_PROMPT_MCQ.format(
            num_preguntas=num_preguntas,
            duracion_minutos=duracion,
        )
        temas_texto = ", ".join(t["tema_nombre"] for t in temas_contenido)
        user_prompt = (
            f"MATERIA: {materia_nombre}\n"
            f"TEMAS: {temas_texto}\n\n"
            f"Genera {num_preguntas} preguntas MCQ tipo 1Z0-082 cubriendo los temas listados."
        )
    else:
        # Desarrollo: prompt original
        temas_texto = ""
        for i, t in enumerate(temas_contenido, 1):
            contenido = t.get("contenido_teoria", t.get("descripcion", ""))
            if contenido:
                temas_texto += f"\n\n### Tema {i}: {t['tema_nombre']}\n{contenido[:800]}"
            else:
                temas_texto += f"\n\n### Tema {i}: {t['tema_nombre']}\n[Tema sin contenido teórico — generar preguntas conceptuales básicas]"

        system_prompt = SYSTEM_PROMPT_GENERAR.format(num_preguntas=num_preguntas)
        user_prompt = (
            f"MATERIA: {materia_nombre}\n\n"
            f"CONTENIDO DE LOS TEMAS:\n{temas_texto}\n\n"
            f"Genera un examen de {num_preguntas} preguntas que cubra balanceadamente todos los temas."
        )

    respuesta = await _llamar_ia(system_prompt, user_prompt)
    examen = _extraer_json(respuesta)

    # Añadir metadatos
    examen["materia"] = materia_nombre
    examen["generado_en"] = datetime.now(timezone.utc).isoformat()
    examen["num_preguntas"] = len(examen.get("preguntas", []))

    return examen


async def corregir_examen(
    materia_nombre: str,
    preguntas: list[dict],
    respuestas: list[dict],
) -> dict:
    """
    Corrige las respuestas del estudiante usando IA.

    Args:
        materia_nombre: Nombre de la materia
        preguntas: Lista de preguntas del examen
        respuestas: Lista de {pregunta_id, respuesta_texto}

    Returns:
        Dict con corrección y puntuaciones
    """
    # Construir el examen con las respuestas del estudiante
    examen_texto = f"EXAMEN DE: {materia_nombre}\n\n"
    respuestas_map = {r["pregunta_id"]: r.get("respuesta_texto", "") for r in respuestas}

    for p in preguntas:
        pid = p.get("id", p.get("pregunta_id", "?"))
        enunciado = p.get("enunciado", "")
        punt_max = p.get("puntuacion_maxima", 10)
        respuesta_estudiante = respuestas_map.get(pid, "[SIN RESPUESTA]")
        examen_texto += (
            f"---\n"
            f"Pregunta {pid} ({punt_max} pts): {enunciado}\n\n"
            f"RESPUESTA DEL ESTUDIANTE:\n{respuesta_estudiante}\n"
        )

    user_prompt = (
        f"{examen_texto}\n\n"
        "Corrige este examen y proporciona puntuaciones y feedback detallado."
    )

    respuesta = await _llamar_ia(SYSTEM_PROMPT_CORREGIR, user_prompt)
    correccion = _extraer_json(respuesta)

    correccion["corregido_en"] = datetime.now(timezone.utc).isoformat()
    return correccion
