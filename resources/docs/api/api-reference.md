# API Reference — Mathós

## URL base

```
http://localhost:8001/api/v1
```

Documentación interactiva (OpenAPI/Swagger):

```
http://localhost:8001/docs
```

## Autenticación

### API Key (middleware global)

Los endpoints POST/PUT/DELETE/PATCH requieren el header:

```
X-API-Key: <MATHOS_API_KEY>
```

Configura `MATHOS_API_KEY` en `.env`. Si está vacío, la autenticación se omite (modo desarrollo).

### JWT (preparado, no activo)

`shared/auth.py` implementa JWT completo con bcrypt, pero no hay endpoints de login/registro aún. Los decoradores `require_role()` y `get_current_user()` están listos para usar cuando se implemente auth.

---

## Materias

### `GET /api/v1/materias`

Lista todas las materias. Filtro opcional `?activo=true|false`.

```json
{
  "materias": [{
    "id": "uuid",
    "nombre": "Lenguajes de Programación",
    "codigo_uned": "6102210-",
    "curso": 1,
    "semestre": 2,
    "activo": true,
    "categoria": "carrera",
    "sandbox_tipo": "cpp"
  }],
  "total": 1
}
```

### `GET /api/v1/materias/{id}`

Detalle de materia con temas y nivel de dominio.

```json
{
  "id": "uuid",
  "nombre": "Lenguajes de Programación",
  "temas": [{
    "id": "uuid",
    "nombre": "Introducción",
    "orden": 1,
    "nivel_dominio": "en_curso",
    "puntuacion": 82.5
  }]
}
```

### `POST /api/v1/materias`

Crear materia (admin only).

```json
{
  "nombre": "Nueva Materia",
  "codigo_uned": "61022XX-",
  "curso": 1,
  "semestre": 1,
  "categoria": "carrera",
  "sandbox_tipo": "cpp"
}
```

### `GET /api/v1/materias/{id}/temas`

Lista temas de una materia con nivel de dominio.

### `GET /api/v1/materias/{id}/progreso`

Progreso agregado de una materia.

```json
{
  "materia_id": "uuid",
  "materia_nombre": "Lenguajes de Programación",
  "total_temas": 10,
  "temas_dominados": 3,
  "temas_en_curso": 2,
  "porcentaje": 40.0,
  "tiempo_total_minutos": 360
}
```

---

## Temas

### `GET /api/v1/temas/{id}`

Detalle de tema con nivel de dominio.

### `POST /api/v1/temas/{id}/estudiar`

Registrar una sesión de estudio y actualizar dominio.

```json
{
  "tipo": "lectura",
  "duracion_minutos": 45,
  "puntuacion": 85
}
```

### `POST /api/v1/temas/{id}/test`

Generar un test (placeholder — integración IA próxima).

```json
{
  "tipo": "practica",
  "num_preguntas": 5
}
```

### `POST /api/v1/temas/{id}/test/{test_id}/responder`

Enviar respuestas de un test. Placeholder — la corrección IA real se integra con el asistente.

### `GET /api/v1/temas/{id}/dominio`

Nivel actual de dominio del tema.

```json
{
  "tema_id": "uuid",
  "tema_nombre": "Introducción",
  "nivel": "practicando",
  "tests_superados": 3,
  "ultimo_estudio": "2026-06-13T10:00:00Z"
}
```

---

## Asistente IA

### `POST /api/v1/asistente/preguntar`

**Pregunta al asistente con RAG.** Consulta TurboVec para contexto y lo envía a DeepSeek/Qwen.

```json
{
  "pregunta": "¿Qué es un puntero en C++?",
  "tema_id": "uuid (opcional)",
  "codigo_materia": "6102210- (opcional)",
  "nivel": "normal",
  "modo": "chat"
}
```

Campos:
- `nivel`: `"normal"` (estándar) o `"dummy"` (para principiantes, evita jerga)
- `modo`: `"chat"` (respuesta conversacional) o `"teoria"` (estructurada con Objetivos, Desarrollo, Ejemplos, Ejercicios)

Respuesta:
```json
{
  "respuesta": "Un puntero es una variable que almacena la dirección de memoria de otra variable...",
  "fuentes": [{
    "documento": "Texto del chunk relevante...",
    "distancia": 0.15,
    "metadata": { "materia": "lenguajes-programacion", "tema": "Punteros" }
  }],
  "cache": "MISS"
}
```

`cache`: `"HIT"` si DeepSeek respondió desde su caché (sin coste), `"MISS"` si fue generación nueva.

### `POST /api/v1/asistente/preguntar-con-imagen`

Sube imagen/PDF + pregunta textual. Gemini Vision transcribe, luego DeepSeek responde con RAG.

Multipart form: `pregunta` (text), `archivo` (file), `nivel`, `codigo_materia`, `tema_id`.

Tipos permitidos: JPEG, PNG, WebP, GIF, PDF. Máx 15 MB.

### `POST /api/v1/asistente/evaluar`

Evalúa respuesta de taller con IA (como profesor estricto de la UNED).

```json
{
  "tema_id": "uuid",
  "respuesta": "Solución del estudiante...",
  "codigo": "código C++ opcional",
  "dificultad": "intermedio",
  "modo_evaluacion": "tecnico"
}
```

Campos:
- `dificultad`: `"basico"`, `"intermedio"`, `"avanzado"`
- `modo_evaluacion`: `"feynman"` (explicación simple) o `"tecnico"` (análisis puro)

Respuesta:
```json
{
  "puntuacion": 85,
  "feedback": "## Evaluación\n\n### Aciertos\n- ...",
  "completado": true
}
```

### `GET /api/v1/asistente/colecciones`

Lista colecciones TurboVec disponibles.

```json
{
  "colecciones": [{
    "codigo_materia": "6102210-",
    "nombre_coleccion": "lenguajes-programacion",
    "nombre_materia": "Lenguajes de Programación"
  }]
}
```

---

## Visión (Gemini)

### `POST /api/v1/vision/analizar`

Analiza una imagen de ejercicio con Gemini Vision.

Multipart: `imagen` (file), `prompt` (texto opcional, default: "Resuelve este ejercicio paso a paso").

Tipos permitidos: JPEG, PNG, WebP, GIF. Máx 10 MB.

```json
{
  "respuesta": "Solución paso a paso...",
  "modelo_usado": "gemini-2.5-flash"
}
```

### `POST /api/v1/vision/transcribir`

Transcribe trabajo escrito/dibujado de un estudiante (imagen o PDF).

Multipart: `archivo` (file), `tema_nombre` (texto opcional).

Tipos permitidos: JPEG, PNG, WebP, GIF, PDF. Máx 15 MB.

---

## Infografías (Mermaid.js)

### `POST /api/v1/infografias/{tema_id}`

Genera o recupera un diagrama Mermaid.js que resume visualmente un tema.

```json
{
  "contenido_teoria": "Texto markdown de la teoría del tema...",
  "regenerar": false
}
```

Respuesta:
```json
{
  "tema_id": "uuid",
  "diagram": "```mermaid\nflowchart TD\n  A[Concepto] --> B...",
  "cached": true,
  "cache_key": "abc123"
}
```

---

## Feynman Trainer

### `POST /api/v1/feynman/evaluar`

Evalúa una explicación estilo Feynman.

```json
{
  "tema_nombre": "Punteros en C++",
  "explicacion": "Un puntero es como una nota adhesiva que te dice dónde encontrar la información...",
  "nivel": "normal"
}
```

Respuesta:
```json
{
  "puntuacion": 72,
  "claridad": 20,
  "analogia": 22,
  "precision": 15,
  "simplicidad": 15,
  "feedback": "## Evaluación...",
  "huecos": ["Falta analogía concreta"],
  "aprobado": false
}
```

### `GET /api/v1/feynman/ejemplos`

Obtiene ejemplos de analogías para un tema.

```
GET /api/v1/feynman/ejemplos?tema=Punteros%20en%20C%2B%2B
```

```json
{
  "tema": "Punteros en C++",
  "ejemplos": ["...", "..."],
  "total": 2
}
```

---

## Audio (NotebookLM)

### `POST /api/v1/audio/{tema_id}`

Genera un podcast estilo Audio Overview con NotebookLM.

```json
{
  "tema_nombre": "Introducción a C++",
  "contenido_teoria": "Texto de teoría...",
  "regenerar": false
}
```

Respuesta:
```json
{
  "tema_id": "uuid",
  "url": "/resources/audio/abc123.m4a",
  "cached": false,
  "cache_key": "abc123"
}
```

### `GET /api/v1/audio/{tema_id}/status`

Estado de la generación de audio.

```json
{
  "tema_id": "uuid",
  "status": "complete",
  "url": "/resources/audio/abc123.m4a"
}
```

### `GET /api/v1/audio/play/{filename}`

Sirve el archivo de audio `.m4a` generado.

---

## Taller (Manuscrito)

### `POST /api/v1/taller/manuscrito`

Evalúa un trabajo manuscrito subido como imagen o PDF.

Multipart: `archivo` (file), `tema_nombre`, `materia_nombre`, `dificultad`, `prompt_extra`.

Tipos permitidos: JPEG, PNG, WebP, GIF, PDF. Máx 15 MB.

```json
{
  "puntuacion": 85,
  "correccion": 34,
  "desarrollo": 25,
  "claridad": 13,
  "completitud": 13,
  "transcripcion": "Lo que el estudiante escribió...",
  "feedback": "## Evaluación...",
  "aprobado": true,
  "saved_path": "/path/to/archivo.pdf"
}
```

### `POST /api/v1/taller/generar`

Genera un taller para resolver a mano.

```json
{
  "tema_nombre": "Ecuaciones Diferenciales",
  "materia_nombre": "Cálculo",
  "dificultad": "intermedio"
}
```

### `GET /api/v1/taller/historial/{tema_id}`

Historial de talleres manuscritos enviados para un tema.

---

## Simulacro de Examen

### `POST /api/v1/simulacro/generar`

Genera un examen simulado con IA.

```json
{
  "materia_id": "uuid",
  "num_preguntas": 10,
  "tipo_examen": "desarrollo",
  "tema_ids": ["uuid", "uuid"] // opcional, filtra temas
}
```

`tipo_examen`: `"desarrollo"` (preguntas abiertas) o `"mcq"` (multiple choice).

### `POST /api/v1/simulacro/corregir`

Corrige las respuestas del estudiante.

```json
{
  "materia_id": "uuid",
  "materia_nombre": "Lenguajes de Programación",
  "preguntas": [{"id": 1, "tema": "Punteros", "enunciado": "¿Qué es...?"}],
  "respuestas": [{"pregunta_id": 1, "respuesta_texto": "Es una variable que..."}],
  "tipo_examen": "desarrollo"
}
```

Para MCQ: corrección instantánea (compara opción vs respuesta_correcta).  
Para desarrollo: corrección con IA.

Actualiza dominio automáticamente. Persiste errores en `ErrorLog`.

---

## Sandbox SQL

### `POST /api/v1/sandbox/sql/ejecutar`

Ejecuta SQL contra el sandbox HR.

```json
{
  "sql": "SELECT * FROM employees WHERE department_id = 10",
  "tema_nombre": "Oracle SQL",
  "analizar_con_ia": true
}
```

### `POST /api/v1/sandbox/sql/analizar`

Solo análisis IA sin ejecutar (útil para PL/SQL o consultas largas).

### `GET /api/v1/sandbox/sql/schema`

Devuelve el esquema HR disponible en el sandbox.

---

## SRS (Spaced Repetition System)

### `POST /api/v1/srs/generar`

Genera flashcards de un tema con IA y las persiste en BD.

```json
{
  "materia_id": "uuid",
  "tema_id": "uuid",
  "tema_nombre": "Punteros",
  "materia_nombre": "Lenguajes de Programación",
  "contenido": "Texto markdown del tema...",
  "num": 5
}
```

### `GET /api/v1/srs/cola/{materia_id}`

Tarjetas pendientes de revisión hoy.

### `POST /api/v1/srs/revisar`

Registra el resultado de revisar una flashcard (algoritmo SM-2).

```json
{
  "flashcard_id": "uuid",
  "calificacion": 4
}
```

Calificación SM-2: `0` (Blackout), `1-2` (Difícil), `3` (Con dificultad), `4` (Bien), `5` (Perfecto).

### `GET /api/v1/srs/stats/{materia_id}`

Estadísticas SRS: total, pendientes hoy, aprendidas, nuevas, errores registrados.

### `GET /api/v1/srs/errores/{materia_id}`

Log de errores ordenado por frecuencia.

### `POST /api/v1/srs/error`

Registra un error (desde simulacro o taller).

```json
{
  "materia_id": "uuid",
  "tema_id": "uuid (opcional)",
  "pregunta_texto": "¿Qué es un puntero?",
  "respuesta_correcta": "Variable que almacena dirección de memoria",
  "respuesta_estudiante": "Tipo de dato",
  "fuente": "simulacro_mcq"
}
```

---

## Sistema

### `GET /health`

Health check del backend.

```json
{
  "status": "ok",
  "service": "mathos-api"
}
```

---

## Modelos de datos (base de datos)

| Tabla              | Propósito                                          |
|--------------------|----------------------------------------------------|
| `materias`         | Materias UNED con código, curso, semestre, sandbox |
| `temas`            | Temas de cada materia, ordenados                   |
| `sesiones_estudio` | Registro de sesiones de estudio (lectura, test...) |
| `tests`            | Tests generados (preguntas, respuestas, puntuación)|
| `dominio`          | Nivel de dominio por tema (SM-2 tracking)          |
| `consultas`        | Historial de preguntas al asistente                |
| `flashcards`       | Tarjetas SRS con parámetros SM-2                   |
| `error_logs`       | Registro de errores para análisis                  |
| `libros`           | Biblioteca personal del lector (EPUB/PDF)          |
| `anotaciones_lector`| Highlights, notas y bookmarks                      |
