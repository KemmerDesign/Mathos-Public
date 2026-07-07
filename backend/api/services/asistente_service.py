"""Mathós — Asistente con RAG.

Servicio que recibe preguntas del usuario, consulta TurboVec (Google TurboQuant)
para recuperar contexto relevante de los apuntes, y envía a DeepSeek (o Qwen
como fallback) vía API HTTP para generar una respuesta contextualizada.

Incluye:
  - preguntar()            — modo chat o teoría
  - preguntar_modo_teoria() — teoría estructurada
  - evaluar_respuesta()    — corrección IA con puntuación
"""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from shared.settings import settings

# ── TurboVec (reemplaza ChromaDB) ───────────────
from services.embeddings import buscar, agregar_texto
from services.vision_service import analizar_imagen
from services.graph_service import expandir_con_grafo

# Mapeo de códigos UNED de materia a nombres de materia en la DB de chunks
COLECCIONES_MATERIAS: dict[str, str] = {
    # Por código UNED
    "6102210-": "lenguajes-programacion",
    "61021105": "geometria-euclidiana",
    # Por nombre de materia (fallback para materias sin código UNED)
    "Friedrich Nietzsche": "nietzsche",
    "Karl Marx": "karl-marx",
}

COLECCION_DEFECTO = "general"


# ── RAG: consulta a TurboVec ─────────────────────
async def consultar_rag(
    pregunta: str,
    coleccion: str = COLECCION_DEFECTO,
    n_results: int = 3,
) -> list[dict]:
    """
    Consulta TurboVec y devuelve los chunks más relevantes.

    TurboVec usa cuantización 4-bit + kernels SIMD (AVX-512/NEON)
    para búsqueda ultra-rápida. El texto se guarda en SQLite local.

    Returns:
        Lista de dicts con keys: texto, materia, tema, distancia, metadata.
    """
    try:
        docs = buscar(pregunta, materia=coleccion, k=n_results)
        chunks = [
            {
                "documento": d["texto"][:500],
                "distancia": d.get("distancia", 0.0),
                "metadata": {
                    "materia": d.get("materia", ""),
                    "tema": d.get("tema", ""),
                    "fuente": d.get("fuente", ""),
                },
            }
            for d in docs
        ]

        # Expandir con grafo de conocimiento
        texto_para_grafo = pregunta + " " + " ".join(c["documento"] for c in chunks)
        contexto_grafo = expandir_con_grafo(texto_para_grafo, coleccion=coleccion)
        if contexto_grafo:
            chunks.append({"documento": contexto_grafo, "distancia": 0.0, "metadata": {"fuente": "graph"}})

        return chunks
    except ImportError as e:
        return [{"error": f"turbovec o sentence-transformers no instalado: {e}"}]
    except Exception as e:
        return [{"error": f"Error consultando TurboVec: {e}"}]


# ── IA: llamada a DeepSeek / Qwen ──────────────────
async def llamar_ia(
    system: str,
    user: str,
) -> str:
    try:
        import httpx
    except ImportError as e:
        return f"Error: httpx no instalado ({e})"

    proveedores = [
        {
            "url": "https://api.deepseek.com/v1/chat/completions",
            "key": settings.DEEPSEEK_API_KEY_RESOLVED,
            "model": "deepseek-chat",
        },
        {
            "url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            "key": settings.QWEN_API_KEY_RESOLVED,
            "model": "qwen-max",
        },
    ]

    for prov in proveedores:
        if not prov["key"]:
            continue
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    prov["url"],
                    headers={
                        "Authorization": f"Bearer {prov['key']}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": prov["model"],
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "max_tokens": 2000,
                        "temperature": 0.7,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
        except Exception:
            continue

    return "Error: No se pudo conectar con ningún proveedor de IA. Verifica DEEPSEEK_API_KEY o QWEN_API_KEY en .env"


# ── Orquestación principal ─────────────────────────
_CONFUSION_SIGNALS = {
    "no entiendo", "no me queda", "no sé", "no se", "no comprendo",
    "me perdí", "me perdi", "confundido", "confundida", "ayuda",
    "por qué", "por que", "no lo veo", "no lo cojo", "qué significa",
    "que significa", "no sigo", "explícame", "explicame", "no está claro",
    "no esta claro", "fallé", "falle", "me equivoqué", "salió mal",
    "no pase", "repite", "otra vez", "de nuevo",
}

def _detectar_confusion(pregunta: str) -> bool:
    p = pregunta.lower()
    return any(s in p for s in _CONFUSION_SIGNALS)


async def _obtener_contexto_errores(tema_id: str) -> str:
    """Devuelve un resumen de los errores recientes del estudiante en este tema."""
    try:
        from shared.database import async_session_factory
        from sqlalchemy import select, desc
        from models import Test, Dominio
        async with async_session_factory() as session:
            # Tests fallados recientes
            tests = await session.execute(
                select(Test)
                .where(Test.tema_id == tema_id)
                .order_by(desc(Test.created_at))
                .limit(3)
            )
            tests_rows = tests.scalars().all()

            # Nivel de dominio actual
            dom = await session.execute(
                select(Dominio).where(Dominio.tema_id == tema_id)
            )
            dominio = dom.scalar_one_or_none()

            lineas = []
            if dominio:
                lineas.append(
                    f"Nivel de dominio actual: {dominio.nivel} "
                    f"(tests superados: {dominio.tests_superados}, fallados: {dominio.tests_fallados})"
                )
            for t in tests_rows:
                if t.puntuacion is not None and t.puntuacion < 70:
                    lineas.append(f"Test reciente con puntuación {t.puntuacion}/100")

            return "\n".join(lineas) if lineas else ""
    except Exception:
        return ""


async def preguntar(
    pregunta: str,
    tema_id: Optional[str] = None,
    codigo_materia: Optional[str] = None,
    nivel: str = "normal",
) -> dict:
    coleccion = COLECCIONES_MATERIAS.get(codigo_materia, COLECCION_DEFECTO)
    contexto = await consultar_rag(pregunta, coleccion)

    contexto_texto = "\n\n".join(
        [c["documento"] for c in contexto if "error" not in c]
    )

    # Contexto de errores recientes si tenemos tema_id
    errores_ctx = ""
    if tema_id:
        errores_ctx = await _obtener_contexto_errores(tema_id)

    grafica_instruccion = (
        "\n\nGRÁFICAS INTERACTIVAS (incluir cuando aporte valor pedagógico):\n"
        "Si el tema involucra funciones matemáticas, curvas, comparaciones numéricas o datos estadísticos, "
        "incluye UN bloque de gráfica en tu respuesta usando este formato exacto:\n\n"
        "```grafica\n"
        "{\"tipo\": \"funcion\", \"titulo\": \"Título descriptivo\", "
        "\"funciones\": [\"x*x\", \"2*x\"], \"etiquetas\": [\"f(x)=x²\", \"f'(x)=2x\"], "
        "\"rango_x\": [-3, 3]}\n"
        "```\n\n"
        "O para datos estadísticos/comparaciones:\n"
        "```grafica\n"
        "{\"tipo\": \"barras\", \"titulo\": \"...\", \"eje_x\": \"Categoría\", \"eje_y\": \"Valor\", "
        "\"datos\": [{\"etiqueta\": \"A\", \"valor\": 15}, {\"etiqueta\": \"B\", \"valor\": 28}]}\n"
        "```\n\n"
        "Tipos: \"funcion\" (expresiones JS: \"Math.sin(x)\", \"Math.exp(-x*x)\", \"1/(1+x*x)\"), "
        "\"barras\", \"linea\" (datos con {etiqueta, valor}), \"dispersion\" (datos con {x, y}).\n"
        "NO incluyas gráficas para C++ puro o SQL. SÍ para cálculo, álgebra, estadística, geometría analítica."
    )

    if nivel == "dummy":
        system_prompt = (
            "Eres Mathós, tutor personal de matemáticas para el Grado de la UNED. "
            "El estudiante arrastra desde niño la sensación de que las matemáticas no son para él — "
            "tu trabajo es demostrar que eso es falso, una explicación a la vez.\n\n"
            "METODOLOGÍA PEDAGÓGICA OBLIGATORIA — aplica en TODAS las materias:\n"
            "1. PRIMERO la intuición: antes de cualquier término técnico, explica la idea con palabras "
            "normales o una analogía de la vida cotidiana. El cerebro necesita un gancho antes de un nombre.\n"
            "2. LUEGO el término: introduce el nombre formal DESPUÉS, como 'a eso se le llama...' o "
            "'el término técnico es...' — nunca al revés.\n"
            "3. Cada símbolo tiene voz: si escribes una fórmula, léela en voz alta antes: "
            "'esto dice que el área es base por altura, partido por dos — en símbolos: A = (b·h)/2'.\n"
            "4. El 'para qué' antes del 'qué es': explica por qué alguien inventó este concepto, "
            "qué problema resolvía.\n"
            "5. Pasos muy pequeños: una idea por párrafo. Si hay tres partes, ve una a una.\n"
            "6. Si algo puede sonar a galimatías, pararás y lo traducirás inmediatamente entre paréntesis.\n"
            "7. Tono de conversación, no de libro de texto. Sin solemnidad innecesaria.\n\n"
            "El objetivo no es simplificar — es construir comprensión real para que el término formal "
            "se instale sobre algo que ya tiene sentido. El examen tendrá los términos; tu trabajo "
            "es que cuando aparezcan, el estudiante piense 'ah, eso ya lo entiendo'.\n\n"
            "Si es relevante, incluye fórmulas en LaTeX pero siempre explicadas en lenguaje natural primero."
            + grafica_instruccion
        )
    else:
        system_prompt = (
            "Eres Mathós, tutor personal de matemáticas para el Grado de la UNED. "
            "El estudiante quiere dominar los temas, no solo memorizarlos.\n\n"
            "METODOLOGÍA PEDAGÓGICA OBLIGATORIA — aplica en TODAS las materias:\n"
            "1. PRIMERO la intuición, LUEGO la formalidad: nunca arranques con la definición técnica. "
            "Empieza siempre con la idea en lenguaje normal, luego introduce el término preciso.\n"
            "2. Cuando uses un término técnico, tradúcelo de inmediato: "
            "'isometría (mover una figura sin deformarla)', 'axioma (regla que aceptamos como punto de partida)'.\n"
            "3. Explica el 'para qué existe esto' antes del 'qué es esto'.\n"
            "4. Las fórmulas se leen antes de escribirse: primero di qué expresa, luego muéstrala en LaTeX.\n"
            "5. Si el contexto de los apuntes es muy técnico, tradúcelo — no lo copies tal cual.\n"
            "6. Tono cercano y directo, como un compañero que ya dominó el tema explicándotelo.\n\n"
            "El estudiante necesita que los términos formales del examen le resulten familiares — "
            "tu trabajo es crear ese puente entre la intuición y la formalidad."
            + grafica_instruccion
        )

    # Construir el prompt de usuario con contexto de errores si aplica
    partes_user = []
    if contexto_texto:
        partes_user.append(f"Contexto del temario:\n{contexto_texto}")
    if errores_ctx:
        partes_user.append(f"Historial reciente del estudiante:\n{errores_ctx}")

    # Si detectamos confusión, pedir estructura empática de 3 partes
    confusion = _detectar_confusion(pregunta)
    if confusion:
        partes_user.append(
            "INSTRUCCIÓN ESPECIAL — el estudiante expresa confusión o dificultad. "
            "Responde OBLIGATORIAMENTE en esta estructura:\n"
            "**Lo que creo que está pasando:** [identifica el malentendido concreto]\n"
            "**La intuición:** [explica la idea en lenguaje completamente llano, sin términos técnicos]\n"
            "**Cómo lo verás en el examen:** [restatement formal con el vocabulario del examen]\n"
            "Sé directo, cálido y sin condescendencia."
        )

    partes_user.append(f"Pregunta: {pregunta}")
    user_prompt = "\n\n".join(partes_user)

    respuesta = await llamar_ia(system_prompt, user_prompt)

    # Auto-extraer términos técnicos y guardarlos en el glosario (fire-and-forget)
    asyncio.create_task(
        _extraer_y_guardar_terminos(respuesta, codigo_materia)
    )

    return {
        "respuesta": respuesta,
        "fuentes": [c for c in contexto if "error" not in c],
    }


async def _extraer_y_guardar_terminos(respuesta: str, codigo_materia: Optional[str]) -> None:
    """Extrae términos técnicos de la respuesta y los upserta en el glosario."""
    try:
        prompt_extraccion = (
            "Lee el siguiente texto pedagógico de matemáticas y extrae los términos técnicos "
            "que se explican. Para cada término devuelve un JSON array con objetos:\n"
            '{"termino": "nombre formal", "nombre_informal": "nombre en lenguaje común", '
            '"definicion_formal": "definición precisa en una oración", '
            '"definicion_informal": "explicación en lenguaje llano sin jerga", '
            '"ejemplo": "ejemplo concreto o null"}\n\n'
            "Solo extrae términos que el texto realmente explica (no los que solo menciona). "
            "Máximo 5 términos. Si no hay ninguno claro, devuelve [].\n\n"
            "RESPONDE SOLO CON EL JSON ARRAY, sin texto adicional.\n\n"
            f"Texto:\n{respuesta[:2000]}"
        )
        raw = await llamar_ia("Eres un extractor de vocabulario matemático. Respondes solo JSON.", prompt_extraccion)
        raw = raw.strip()
        # Limpiar markdown si viene envuelto
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        terminos = json.loads(raw)
        if not isinstance(terminos, list):
            return

        # Obtener materia_id desde el código si existe
        materia_id: Optional[str] = None
        if codigo_materia:
            try:
                from shared.database import async_session_factory
                from sqlalchemy import select
                from models import Materia
                async with async_session_factory() as session:
                    res = await session.execute(
                        select(Materia.id).where(
                            (Materia.codigo_uned == codigo_materia) |
                            (Materia.nombre == codigo_materia)
                        )
                    )
                    row = res.scalar_one_or_none()
                    if row:
                        materia_id = str(row)
            except Exception:
                pass

        # Upsert cada término
        try:
            from shared.database import async_session_factory
            from sqlalchemy import select, func
            from models import Glosario
            async with async_session_factory() as session:
                for t in terminos[:5]:
                    if not t.get("termino") or not t.get("definicion_informal"):
                        continue
                    stmt = select(Glosario).where(
                        func.lower(Glosario.termino) == t["termino"].lower(),
                        Glosario.materia_id == materia_id,
                    )
                    result = await session.execute(stmt)
                    entry = result.scalar_one_or_none()
                    if not entry:
                        session.add(Glosario(
                            termino=t["termino"],
                            nombre_informal=t.get("nombre_informal", t["termino"]),
                            definicion_formal=t.get("definicion_formal", ""),
                            definicion_informal=t["definicion_informal"],
                            ejemplo=t.get("ejemplo"),
                            materia_id=materia_id,
                        ))
                await session.commit()
        except Exception:
            pass
    except Exception:
        pass


# ── Caché de teoría ─────────────────────────────────
import hashlib

TEORIA_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "teoria_cache"
TEORIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_key_teoria(tema_id: str, codigo_materia: str) -> str:
    """Clave de caché basada en tema + materia."""
    raw = f"{tema_id}:{codigo_materia}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _teoria_from_cache(tema_id: str, codigo_materia: str) -> str | None:
    """Recupera teoría cacheada si existe."""
    cache_file = TEORIA_CACHE_DIR / f"{_cache_key_teoria(tema_id, codigo_materia)}.md"
    if cache_file.exists():
        # Invalidar caché después de 7 días (la IA puede mejorar)
        age_days = (datetime.now(timezone.utc) - datetime.fromtimestamp(cache_file.stat().st_mtime, tz=timezone.utc)).days
        if age_days < 7:
            return cache_file.read_text(encoding="utf-8")
    return None


def _teoria_to_cache(tema_id: str, codigo_materia: str, teoria: str) -> None:
    """Guarda teoría en caché."""
    cache_file = TEORIA_CACHE_DIR / f"{_cache_key_teoria(tema_id, codigo_materia)}.md"
    cache_file.write_text(teoria, encoding="utf-8")


# ── Modo Teoría: generar teoría estructurada ──────────
async def preguntar_modo_teoria(
    pregunta: str,
    tema_id: Optional[str] = None,
    codigo_materia: Optional[str] = None,
) -> dict:
    """
    Genera una explicación teórica estructurada en markdown.

    Usa caché en disco (7 días) para no regenerar contenido ya generado.
    Si el contenido está cacheado, se devuelve instantáneamente sin costo de tokens.

    Consulta ChromaDB con la pregunta y envía a DeepSeek un prompt
    que pide una respuesta dividida en:
      - Objetivos de aprendizaje
      - Desarrollo teórico
      - Ejemplos
      - Ejercicios resueltos
    """
    codigo = codigo_materia or "default"
    tid = tema_id or hashlib.sha256(pregunta.encode()).hexdigest()[:16]

    # Intentar caché primero
    cached = _teoria_from_cache(tid, codigo)
    if cached:
        return {
            "respuesta": cached,
            "fuentes": [],
            "cache": "HIT",
        }

    coleccion = COLECCIONES_MATERIAS.get(codigo_materia, COLECCION_DEFECTO)
    contexto = await consultar_rag(pregunta, coleccion, n_results=5)

    contexto_texto = "\n\n".join(
        [c["documento"] for c in contexto if "error" not in c]
    )

    system_prompt = (
        "Eres Mathós, un profesor de matemáticas de la UNED. "
        "Genera una explicación teórica ESTRUCTURADA del tema solicitado "
        "basándote exclusivamente en el contexto proporcionado. "
        "Si el contexto es insuficiente, indícalo claramente.\n\n"
        "FORMATO OBLIGATORIO (markdown):\n"
        "## Tema: [nombre del tema]\n\n"
        "### Objetivos de aprendizaje\n"
        "- Lista de objetivos que el estudiante debe alcanzar\n\n"
        "### Desarrollo teórico\n"
        "Explicación detallada de los conceptos, definiciones, teoremas...\n"
        "Incluye fórmulas en LaTeX cuando sea necesario.\n\n"
        "### Ejemplos\n"
        "Ejemplos prácticos que ilustran la teoría.\n\n"
        "### Ejercicios resueltos\n"
        "Ejercicios paso a paso con solución detallada.\n\n"
        "⚠️ INSTRUCCIONES CRÍTICAS PARA PRINCIPIANTES:\n"
        "- SIEMPRE explica la notación matemática la primera vez que aparezca. "
        "Ejemplo: si usas Σ (sigma mayúscula), explica: Σ (sumatorio) significa "
        "sumar todos los elementos desde i=1 hasta n.\n"
        "- Define cada símbolo y operador: ∀ = para todo, ∃ = existe, ∈ = pertenece a, "
        "⊂ = subconjunto, ⇒ = implica, ⇔ = si y solo si, ℝ = números reales, etc.\n"
        "- Si introduces una fórmula como a² + b² = c², explica: 'a y b son los catetos "
        "(lados que forman el ángulo recto), c es la hipotenusa (lado opuesto al ángulo recto)'.\n"
        "- NO asumas que el estudiante conoce la notación. Si usas notación de conjuntos, "
        "lógica, cálculo o álgebra, explica cada símbolo.\n"
        "- Añade una subsección '### Notación utilizada' cuando introduzcas 3+ símbolos nuevos.\n\n"
        "GRÁFICAS INTERACTIVAS (incluir en la sección de Ejemplos cuando sea útil):\n"
        "Cuando el tema incluya funciones, curvas o datos comparativos, inserta UNA gráfica:\n"
        "```grafica\n"
        "{\"tipo\": \"funcion\", \"titulo\": \"...\", \"funciones\": [\"expr_js\"], "
        "\"etiquetas\": [\"label\"], \"rango_x\": [xMin, xMax]}\n"
        "```\n"
        "Tipos soportados: \"funcion\" (expresiones JS válidas: Math.sin, Math.exp, Math.log, Math.abs, Math.pow, Math.PI), "
        "\"barras\", \"linea\", \"dispersion\". "
        "Coloca la gráfica donde pedagógicamente tenga más sentido dentro del texto."
    )

    user_prompt = (
        f"Tema/consulta: {pregunta}\n\n"
        f"Contexto de los apuntes:\n{contexto_texto}\n\n"
        "Genera la teoría estructurada siguiendo el formato indicado."
    )

    respuesta = await llamar_ia(system_prompt, user_prompt)

    # Guardar en caché para no regenerar
    if respuesta and len(respuesta) > 200:
        _teoria_to_cache(tid, codigo, respuesta)

    return {
        "respuesta": respuesta,
        "fuentes": [c for c in contexto if "error" not in c],
        "cache": "MISS",
    }


# ── Chat con imagen adjunta ────────────────────────────
async def preguntar_con_imagen(
    pregunta: str,
    imagen_bytes: bytes,
    tema_id: Optional[str] = None,
    codigo_materia: Optional[str] = None,
    nivel: str = "normal",
) -> dict:
    """
    Procesa una pregunta del estudiante que incluye una imagen o PDF adjunto.

    Flujo:
      1. Gemini Vision lee y transcribe el contenido matemático de la imagen/PDF.
      2. La transcripción se inyecta como contexto adicional en el prompt de chat.
      3. DeepSeek/Qwen responde como Ikaro teniendo en cuenta lo que el estudiante escribió.
    """
    vision_prompt = (
        "Eres un asistente matemático experto. Analiza esta imagen que muestra "
        "trabajo matemático (puede ser escrito a mano, tipografiado, o un PDF).\n\n"
        "Tarea:\n"
        "1. Transcribe TODO el contenido matemático visible: fórmulas, pasos, anotaciones, "
        "diagramas (descríbelos), enunciados.\n"
        "2. Usa LaTeX para fórmulas (formato $...$ o $$...$$).\n"
        "3. Si hay pasos resueltos, transcríbelos en orden con sus resultados.\n"
        "4. Si detectas errores, nótalos brevemente.\n"
        "5. Responde SOLO con la transcripción/descripción, sin comentarios adicionales."
    )

    transcripcion = await analizar_imagen(imagen_bytes, vision_prompt)

    pregunta_enriquecida = (
        f"[El estudiante ha adjuntado una imagen/documento con este contenido:]\n\n"
        f"{transcripcion}\n\n"
        f"[Pregunta del estudiante:] {pregunta if pregunta.strip() else 'Revisa mi trabajo y dime si está bien.'}"
    )

    resultado = await preguntar(
        pregunta=pregunta_enriquecida,
        tema_id=tema_id,
        codigo_materia=codigo_materia,
        nivel=nivel,
    )

    return resultado


# ── Evaluación de respuestas de talleres ──────────────
async def evaluar_respuesta(
    tema_nombre: str,
    respuesta: str,
    codigo_materia: Optional[str] = None,
    codigo: Optional[str] = None,
    dificultad: str = "intermedio",
    modo_evaluacion: str = "tecnico",
    tema_id: Optional[str] = None,
) -> dict:
    """
    Evalúa la respuesta de un estudiante contra los objetivos del tema.

    Contexto de evaluación (en orden de prioridad):
      1. Teoría cacheada — el texto exacto que el estudiante estudió.
      2. RAG — chunks complementarios del knowledge base.
    """
    coleccion = COLECCIONES_MATERIAS.get(codigo_materia, COLECCION_DEFECTO)

    # 1. Teoría que el estudiante estudió (misma fuente que vio en pantalla)
    teoria_cache = None
    if tema_id and codigo_materia:
        teoria_cache = _teoria_from_cache(tema_id, codigo_materia)

    # 2. Chunks RAG como contexto complementario
    contexto = await consultar_rag(tema_nombre, coleccion, n_results=3)
    rag_texto = "\n\n".join(
        [c["documento"] for c in contexto if "error" not in c]
    )

    # Construir contexto de evaluación: teoría primero, RAG como suplemento
    if teoria_cache:
        contexto_texto = f"--- TEORÍA ESTUDIADA POR EL ALUMNO ---\n{teoria_cache}"
        if rag_texto:
            contexto_texto += f"\n\n--- FUENTES ACADÉMICAS ADICIONALES ---\n{rag_texto}"
    else:
        contexto_texto = rag_texto

    # Mapa de descripciones de dificultad
    dificultad_desc = {
        "basico": (
            "NIVEL BÁSICO: Evalúa si el estudiante comprende los conceptos "
            "fundamentales y puede aplicarlos en ejercicios simples."
        ),
        "intermedio": (
            "NIVEL INTERMEDIO: Evalúa si el estudiante domina los conceptos "
            "y puede resolver problemas que requieren combinar varias ideas."
        ),
        "avanzado": (
            "NIVEL AVANZADO: Evalúa si el estudiante tiene un dominio profundo "
            "y puede resolver problemas complejos o demostrar teoremas."
        ),
    }

    nivel_texto = dificultad_desc.get(dificultad, dificultad_desc["intermedio"])

    # Descripción del modo de evaluación
    modo_desc = {
        "feynman": (
            "MODO FEYNMAN: Evalúa qué tan bien el estudiante explica el concepto "
            "de forma SIMPLIFICADA. Premia la claridad, las analogías efectivas "
            "y la precisión conceptual expresada en lenguaje sencillo. "
            "PENALIZA el uso excesivo de jerga técnica sin explicación, "
            "las explicaciones vagas y la falta de ejemplos concretos."
        ),
        "tecnico": (
            "MODO TÉCNICO: Evalúa el dominio conceptual del estudiante con rigor "
            "académico. Si la materia es de ciencias/ingeniería, valora corrección "
            "formal y precisión técnica. Si es humanidades/filosofía, valora la "
            "argumentación, el uso correcto de los conceptos clave y la coherencia "
            "del razonamiento. Adapta el criterio a la disciplina del tema."
        ),
    }
    modo_texto = modo_desc.get(modo_evaluacion, modo_desc["tecnico"])

    system_prompt = (
        "Eres un profesor ESTRICTO de la UNED evaluando la respuesta de un "
        "estudiante. Debes ser riguroso pero justo.\n\n"
        "INSTRUCCIONES:\n"
        "1. Compara la respuesta del estudiante contra los apuntes proporcionados "
        "y los objetivos de aprendizaje del tema.\n"
        "2. Asigna una PUNTUACIÓN del 0 al 100 basada en:\n"
        "   - Corrección conceptual (40%)\n"
        "   - Completitud (30%)\n"
        "   - Claridad y estructura (15%)\n"
        "   - Uso correcto de notación/fórmulas (15% si aplica)\n"
        f"3. {modo_texto}\n"
        f"4. {nivel_texto}\n"
        "5. Proporciona FEEDBACK detallado en markdown.\n\n"
        "FORMATO DE RESPUESTA (devuelve SOLO el JSON, sin markdown envolvente):\n"
        "{\n"
        '  "puntuacion": <int 0-100>,\n'
        '  "feedback": "<markdown detallado con: qué está bien, qué falta, '
        'errores conceptuales, cómo mejorar>"\n'
        "}\n\n"
        "CRITERIO DE APROBADO: puntuacion >= 70.\n"
    )

    user_prompt = (
        f"Tema evaluado: {tema_nombre}\n\n"
        f"Contexto de los apuntes:\n{contexto_texto}\n\n"
        f"Respuesta del estudiante:\n{respuesta}\n"
    )

    if codigo:
        user_prompt += f"\nCódigo C++ entregado:\n```cpp\n{codigo}\n```\n"

    user_prompt += (
        "\nEvalúa la respuesta siguiendo las instrucciones del "
        "sistema. Devuelve SOLO el objeto JSON con puntuacion y feedback."
    )

    respuesta_ia = await llamar_ia(system_prompt, user_prompt)

    # Parsear la respuesta JSON
    import json
    import re

    puntuacion = 50
    feedback = respuesta_ia

    # Intentar extraer JSON de la respuesta
    json_match = re.search(
        r'\{[^{}]*"puntuacion"[^{}]*"feedback"[^{}]*\}',
        respuesta_ia,
        re.DOTALL,
    )
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            puntuacion = int(parsed.get("puntuacion", 50))
            feedback = parsed.get("feedback", respuesta_ia)
        except (json.JSONDecodeError, ValueError, TypeError):
            pass
    else:
        # Fallback: buscar puntuacion en el texto
        score_match = re.search(r'puntuacion["\s:]+(\d{1,3})', respuesta_ia)
        if score_match:
            puntuacion = int(score_match.group(1))

    # Acotar puntuación
    puntuacion = max(0, min(100, puntuacion))
    completado = puntuacion >= 70

    return {
        "puntuacion": puntuacion,
        "feedback": feedback,
        "completado": completado,
        "tema_nombre": tema_nombre,
    }
