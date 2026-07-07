"""
Mathós — Servicio de taller manuscrito con Gemini Vision.

Evalúa trabajos escritos a mano (imágenes, PDFs) usando Gemini Vision.
Funciona para todos los módulos (matemáticas, programación, etc.).
"""

import base64
import asyncio
import json
from pathlib import Path
from typing import Optional

import httpx

from shared.settings import settings

# Gemini Vision API
GEMINI_VISION_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-2.5-flash:generateContent"
)

# Prompt del sistema para evaluación de manuscritos
EVALUACION_MANUSCRITO_PROMPT = """Eres un profesor universitario de la UNED corrigiendo un trabajo escrito a mano por un estudiante.

Tu tarea:
1. **Leer** el texto manuscrito de la imagen/PDF (puede tener letra irregular)
2. **Interpretar** fórmulas matemáticas, diagramas o código si los hay
3. **Evaluar** la respuesta según el tema "{tema_nombre}" de la materia "{materia_nombre}"
4. **Asignar puntuación 0-100** con criterios:
   - Corrección conceptual (40 pts): ¿Entiende los conceptos?
   - Desarrollo y razonamiento (30 pts): ¿Muestra el proceso paso a paso?
   - Claridad y legibilidad (15 pts): ¿Se entiende lo escrito?
   - Completitud (15 pts): ¿Cubre todos los aspectos del ejercicio?

Responde EXCLUSIVAMENTE con un objeto JSON válido. NO uses markdown. NO uses ```json. NO añadas texto antes o después del JSON. Solo devuelve el objeto JSON crudo, empezando con {{ y terminando con }}.

El campo "transcripcion" debe contener el texto manuscrito leído. ESCAPA las comillas dobles internas con \\\" y los saltos de línea con \\n.

{{
  "puntuacion": 85,
  "correccion": 34,
  "desarrollo": 25,
  "claridad": 13,
  "completitud": 13,
  "transcripcion": "Lo que el estudiante escribió (transcrito del manuscrito, con comillas escapadas)",
  "feedback": "## Evaluación\\n\\n### Lo que está bien\\n- ...\\n\\n### Errores detectados\\n- ...\\n\\n### Sugerencias de mejora\\n- ...",
  "aprobado": true
}}

IMPORTANTE:
- Responde SOLO el JSON, sin markdown alrededor.
- Si la letra es ilegible, indícalo en feedback y asigna puntuación baja.
- Sé constructivo y motiva al estudiante.
- Si hay fórmulas, evalúa su corrección matemática.
- Si hay código, evalúa sintaxis y lógica.
- ESCAPA las comillas dobles dentro de strings con \\\"."""


SQL_WORKSHOP_PROMPT = """Eres un instructor Oracle DBA diseñando ejercicios SQL para Oracle Database 19c.

Tema: {tema_nombre}
Materia: {materia_nombre}
Dificultad: {dificultad}

El estudiante ejecutará las consultas en un sandbox con el esquema HR de Oracle:
- EMPLOYEES (employee_id, first_name, last_name, email, salary, department_id, job_id, manager_id, hire_date)
- DEPARTMENTS (department_id, department_name, manager_id, location_id)
- JOBS (job_id, job_title, min_salary, max_salary)
- LOCATIONS (location_id, street_address, city, state_province, country_id)
- JOB_HISTORY (employee_id, start_date, end_date, job_id, department_id)

Diseña 3-4 ejercicios SQL relacionados con el tema "{tema_nombre}".
Cada ejercicio debe tener un enunciado claro y describir qué resultado se espera.
Los ejercicios deben poder ejecutarse en el sandbox.

Responde en formato JSON:
{{
  "titulo": "Ejercicios SQL: {tema_nombre}",
  "enunciado": "## Ejercicios SQL\\n\\nEjecuta las siguientes consultas en el sandbox. Para cada ejercicio, escribe la consulta, ejecútala y verifica el resultado.\\n\\n**Ejercicio 1:** [enunciado]\\n*Resultado esperado:* [descripción breve]\\n\\n**Ejercicio 2:** [enunciado]\\n*Resultado esperado:* [descripción]\\n\\n**Ejercicio 3:** [enunciado]\\n*Resultado esperado:* [descripción]",
  "formato_esperado": "Consultas SQL ejecutadas en el sandbox — copia el output para verificar",
  "tiempo_estimado": "20 minutos",
  "rubrica": [
    {{"criterio": "Sintaxis SQL correcta", "peso": 30, "descripcion": "Las consultas son sintácticamente válidas y ejecutan sin error"}},
    {{"criterio": "Resultado correcto", "peso": 40, "descripcion": "Las consultas devuelven exactamente los datos solicitados"}},
    {{"criterio": "Uso adecuado de cláusulas", "peso": 20, "descripcion": "Uso correcto de JOIN, WHERE, GROUP BY, ORDER BY según corresponda"}},
    {{"criterio": "Eficiencia", "peso": 10, "descripcion": "Sin redundancias innecesarias, subconsultas solo cuando aporten valor"}}
  ]
}}"""


WORKSHOP_GENERATION_PROMPT = """Eres un profesor de la UNED diseñando un taller para evaluar conocimientos.

Tema: {tema_nombre}
Materia: {materia_nombre}
Dificultad: {dificultad}

Diseña un ejercicio que el estudiante debe resolver **a mano** (en papel o tablet) y luego subir como foto/PDF para que lo corrijas.

El ejercicio debe:
1. Ser apropiado para el nivel de dificultad
2. Requerir desarrollo paso a paso (no solo respuesta final)
3. Incluir instrucciones claras de qué se espera
4. Para temas de programación: pedir escribir código a mano
5. Para temas de matemáticas: pedir demostraciones o cálculos
6. Incluir rúbrica de evaluación (qué se calificará)

Responde en formato JSON:
{{
  "titulo": "Título del taller",
  "enunciado": "Texto completo del enunciado con instrucciones",
  "formato_esperado": "Descripción de lo que el estudiante debe entregar (ej: 'Una hoja con el desarrollo paso a paso')",
  "tiempo_estimado": "30 minutos",
  "rubrica": [
    {{"criterio": "Corrección conceptual", "peso": 40, "descripcion": "..."}},
    {{"criterio": "Desarrollo y razonamiento", "peso": 30, "descripcion": "..."}},
    {{"criterio": "Claridad", "peso": 15, "descripcion": "..."}},
    {{"criterio": "Completitud", "peso": 15, "descripcion": "..."}}
  ]
}}"""


def _guess_mime_type(data: bytes, filename: str = "") -> str:
    """Detecta MIME type desde firma mágica o extensión."""
    if data[:4] == b"\x89PNG":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"%PDF":
        return "application/pdf"
    # Por extensión
    ext = Path(filename).suffix.lower() if filename else ""
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    if ext == ".pdf":
        return "application/pdf"
    return "image/jpeg"  # fallback


async def analizar_manuscrito(
    archivo_bytes: bytes,
    filename: str,
    tema_nombre: str,
    materia_nombre: str,
    dificultad: str = "intermedio",
    prompt_extra: str = "",
) -> dict:
    """
    Evalúa un trabajo manuscrito (imagen o PDF) usando Gemini Vision.

    Args:
        archivo_bytes: Contenido del archivo
        filename: Nombre original del archivo
        tema_nombre: Nombre del tema a evaluar
        materia_nombre: Nombre de la materia
        dificultad: Nivel de dificultad esperado
        prompt_extra: Instrucciones adicionales para la IA

    Returns:
        dict con puntuacion, feedback, transcripcion, aprobado
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return {
            "puntuacion": 0,
            "correccion": 0,
            "desarrollo": 0,
            "claridad": 0,
            "completitud": 0,
            "transcripcion": "",
            "feedback": "**Error:** No hay GEMINI_API_KEY configurada. Agrega tu clave en `.env`.",
            "aprobado": False,
            "error": "no_api_key",
        }

    mime_type = _guess_mime_type(archivo_bytes, filename)
    b64_data = base64.b64encode(archivo_bytes).decode("utf-8")

    system_prompt = EVALUACION_MANUSCRITO_PROMPT.format(
        tema_nombre=tema_nombre,
        materia_nombre=materia_nombre,
    )
    if prompt_extra:
        system_prompt += f"\n\nInstrucción adicional del estudiante: {prompt_extra}"

    # Construir partes del mensaje
    parts = [{"text": system_prompt}]

    if mime_type == "application/pdf":
        # Gemini acepta PDF directamente
        parts.append({
            "inline_data": {
                "mime_type": "application/pdf",
                "data": b64_data,
            }
        })
    else:
        parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": b64_data,
            }
        })

    payload = {
        "contents": [
            {
                "parts": parts,
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 2000,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                GEMINI_VISION_URL,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json=payload,
            )

            if resp.status_code != 200:
                return {
                    "puntuacion": 0,
                    "feedback": f"**Error de Gemini Vision:** HTTP {resp.status_code}",
                    "aprobado": False,
                    "error": f"gemini_http_{resp.status_code}",
                }

            data = resp.json()
            try:
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError):
                return {
                    "puntuacion": 0,
                    "feedback": "**Error:** Formato de respuesta inesperado de Gemini.",
                    "aprobado": False,
                    "error": "bad_response_format",
                }

    except Exception as e:
        return {
            "puntuacion": 0,
            "feedback": f"**Error de conexión:** {e}",
            "aprobado": False,
            "error": "connection_error",
        }

    # Parsear JSON de la respuesta de Gemini
    import re

    def _extract_json(text: str) -> dict | None:
        """Intenta extraer y parsear JSON, con múltiples estrategias de fallback."""
        clean = text.strip()

        # 1. Quitar bloques markdown
        if clean.startswith("```json"):
            clean = clean[7:]
        elif clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        # 2. Intentar parseo directo
        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            pass

        # 3. Extraer campos individualmente con regex (más tolerante a errores)
        def _extract_field(field_name: str, default: any = "") -> any:
            # Buscar "field_name": valor (maneja strings, números, booleanos)
            p = rf'"{field_name}"\s*:\s*'
            if default == 0 or isinstance(default, int):
                p += r'(\d+)'
            elif isinstance(default, bool):
                p += r'(true|false)'
            else:
                # String: capturar hasta la siguiente coma o cierre, manejando escapes
                p += r'"((?:[^"\\]|\\.)*)"'
            m = re.search(p, clean, re.IGNORECASE if isinstance(default, bool) else 0)
            if m:
                val = m.group(1)
                if isinstance(default, int):
                    return int(val)
                if isinstance(default, bool):
                    return val.lower() == "true"
                return val
            return default

        puntuacion = _extract_field("puntuacion", 0)
        correccion = _extract_field("correccion", 0)
        desarrollo = _extract_field("desarrollo", 0)
        claridad = _extract_field("claridad", 0)
        completitud = _extract_field("completitud", 0)
        aprobado = _extract_field("aprobado", False)
        transcripcion = _extract_field("transcripcion", "")
        feedback = _extract_field("feedback", "")

        if puntuacion > 0 or feedback:
            return {
                "puntuacion": puntuacion,
                "correccion": correccion,
                "desarrollo": desarrollo,
                "claridad": claridad,
                "completitud": completitud,
                "aprobado": aprobado,
                "transcripcion": transcripcion,
                "feedback": feedback,
            }

        return None

    result = _extract_json(raw_text)
    if result:
        # Forzar coherencia: puntuación >= 60 implica aprobado
        puntuacion = result.get("puntuacion", 0)
        if puntuacion >= 60:
            result["aprobado"] = True
        else:
            result["aprobado"] = False
        return result

    # Fallback: texto crudo como feedback
    return {
        "puntuacion": 0, "correccion": 0, "desarrollo": 0,
        "claridad": 0, "completitud": 0,
        "transcripcion": "",
        "feedback": raw_text[:2000],
        "aprobado": False,
        "raw_response": True,
    }


async def generar_taller(
    tema_nombre: str,
    materia_nombre: str,
    dificultad: str = "intermedio",
    sandbox_tipo: str | None = None,
) -> dict:
    """
    Genera un taller usando IA.

    Para sandbox_tipo='sql' genera ejercicios SQL sobre el esquema HR de Oracle.
    Para el resto genera un taller manuscrito genérico.

    Returns:
        dict con titulo, enunciado, formato_esperado, tiempo_estimado, rubrica
    """
    es_sql = sandbox_tipo == "sql" or "oracle" in materia_nombre.lower() or "sql" in tema_nombre.lower()

    if es_sql:
        prompt = SQL_WORKSHOP_PROMPT.format(
            tema_nombre=tema_nombre,
            materia_nombre=materia_nombre,
            dificultad=dificultad,
        )
        system_msg = "Eres un instructor Oracle DBA. Responde SIEMPRE en JSON válido, sin markdown, sin texto fuera del JSON."
    else:
        prompt = WORKSHOP_GENERATION_PROMPT.format(
            tema_nombre=tema_nombre,
            materia_nombre=materia_nombre,
            dificultad=dificultad,
        )
        system_msg = "Eres un profesor universitario diseñando talleres. Responde SIEMPRE en JSON válido, sin markdown, sin texto fuera del JSON."

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
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.7,
                        "max_tokens": 1500,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw = data["choices"][0]["message"]["content"]
                    clean = raw.strip()
                    if clean.startswith("```json"):
                        clean = clean[7:]
                    if clean.startswith("```"):
                        clean = clean[3:]
                    if clean.endswith("```"):
                        clean = clean[:-3]
                    try:
                        return json.loads(clean.strip())
                    except json.JSONDecodeError:
                        return {
                            "titulo": f"Taller de {tema_nombre}",
                            "enunciado": raw,
                            "formato_esperado": "Desarrollo paso a paso en papel",
                            "tiempo_estimado": "30 minutos",
                            "rubrica": [],
                        }
        except Exception:
            continue

    # Fallback
    return {
        "titulo": f"Taller: {tema_nombre}",
        "enunciado": f"Resuelve los siguientes ejercicios sobre {tema_nombre}:\n\n1. Define los conceptos principales.\n2. Desarrolla un ejemplo práctico.\n3. Explica el razonamiento paso a paso.",
        "formato_esperado": "Una o dos hojas con desarrollo manuscrito",
        "tiempo_estimado": "30-45 minutos",
        "rubrica": [
            {"criterio": "Corrección conceptual", "peso": 40, "descripcion": "¿Los conceptos son correctos?"},
            {"criterio": "Desarrollo y razonamiento", "peso": 30, "descripcion": "¿Muestra el proceso?"},
            {"criterio": "Claridad y legibilidad", "peso": 15, "descripcion": "¿Se entiende la letra y la estructura?"},
            {"criterio": "Completitud", "peso": 15, "descripcion": "¿Cubre todos los aspectos?"},
        ],
    }
