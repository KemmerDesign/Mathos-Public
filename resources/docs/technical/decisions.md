# ADRs — Decisiones Arquitectónicas (Architecture Decision Records)

## ADR-001: FastAPI como framework backend

**Fecha:** 2025-01  
**Contexto:** Necesitábamos un framework web Python moderno con soporte asíncrono nativo para manejar múltiples conexiones simultáneas (chat, subida de archivos, llamadas a APIs externas).  
**Decisión:** Usar FastAPI con lifespan async, SQLAlchemy asíncrono y Uvicorn.  
**Consecuencias:**  
- Velocidad de desarrollo alta gracias a Pydantic + autogeneración de OpenAPI docs  
- Dependencias async bien integradas (httpx, aiosqlite, asyncpg)  
- Middleware pipeline fácil de extender (CORS, rate limit, API key)  

## ADR-002: TurboVec en lugar de ChromaDB para RAG

**Fecha:** 2026-03  
**Contexto:** ChromaDB se usaba inicialmente para búsqueda vectorial, pero requería un proceso servidor aparte y tenía latencia alta en consultas.  
**Decisión:** Migrar a TurboVec (Google TurboQuant) con cuantización 4-bit + SQLite local para chunks de texto.  
**Consecuencias:**  
- Búsqueda ultra-rápida con kernels SIMD (AVX-512/NEON)  
- Sin servidor externo — todo en SQLite local  
- Embeddings con all-MiniLM-L6-v2 (384 dimensiones)  
- Código de migración en `scripts/migrar_chromadb_a_turbovec.py`  

## ADR-003: Rate Limiter en middleware (sin Redis por defecto)

**Fecha:** 2025-06  
**Contexto:** Los endpoints de IA consumen créditos de API externa (DeepSeek, Gemini). Necesitábamos proteger contra abuso sin añadir dependencias de infraestructura.  
**Decisión:** Rate limiter en memoria (middleware Starlette) con límites diferenciados:  
- Endpoints IA: 10 req/min  
- Endpoints generales: 100 req/min  
**Consecuencias:**  
- Funciona sin Redis en desarrollo  
- Los límites se pierden al reiniciar el servidor (aceptable para desarrollo)  
- Fácil de migrar a Redis-based en producción: solo cambiar la implementación del almacén  

## ADR-004: Dos layouts de estudio (A y C)

**Fecha:** 2026-02  
**Contexto:** El chat con el asistente IA ocupa espacio en pantalla. Algunos estudiantes prefieren tenerlo siempre visible; otros lo quieren oculto y acceder mediante un botón flotante.  
**Decisión:** Implementar dos layouts seleccionables por el usuario:  
- **Layout A (Clásico):** Sidebar del chat siempre visible a la derecha  
- **Layout C (Enfocado):** Chat como FAB (Floating Action Button) que se expande al hacer clic  
**Consecuencias:**  
- Estado persistido en Zustand (layoutEstudio)  
- El avatar del asistente Ikaro aparece en ambos modos  
- Implementación limpia con toggle en la parte inferior izquierda  

## ADR-005: API Key + JWT para autenticación (híbrido)

**Fecha:** 2025-06  
**Contexto:** Mathós no tiene aún un sistema completo de usuarios/registro, pero necesita proteger endpoints sensibles.  
**Decisión:** Usar un enfoque híbrido:  
- **X-API-Key** en el middleware principal para operaciones POST/PUT/DELETE (protección básica)  
- **JWT** preparado en shared/auth.py para cuando se implemente el sistema de usuarios  
- **require_role("admin")** como dependencia FastAPI para endpoints administrativos  
**Consecuencias:**  
- Fácil de configurar desde el frontend (header X-API-Key)  
- Migración a auth completa sin cambios disruptivos  
- JWT ya implementado con bcrypt + expiración  

## ADR-006: Dos motores de IA (DeepSeek primario, Qwen fallback)

**Fecha:** 2025-09  
**Contexto:** Depender de un solo proveedor de IA crea riesgo de outage. DeepSeek tiene mejor rendimiento en español y matemáticas, pero puede no estar disponible.  
**Decisión:** DeepSeek como primario, Qwen como fallback automático cuando DeepSeek devuelve error.  
**Consecuencias:**  
- Lógica de failover en asistente_service.py  
- Configuración separada de API keys en .env  
- Gemini Vision siempre es Google (único proveedor con análisis multimodal fiable)  

## ADR-007: SM-2 para Spaced Repetition System

**Fecha:** 2026-01  
**Contexto:** Necesitábamos un algoritmo probado para repaso espaciado de flashcards. SM-2 (SuperMemo 2) es simple, eficaz y ampliamente usado.  
**Decisión:** Implementar SM-2 exacto con calificación 0-5, sin modificaciones.  
**Consecuencias:**  
- 4 niveles de calificación disponibles en frontend: No lo sé (0), Difícil (2), Bien (4), Fácil (5)  
- Flashcards se generan con IA desde el contenido de los temas  
- Dominio se actualiza ligeramente al acertar flashcards (calificación ≥ 4)  

## ADR-008: Sandbox SQL con esquema Oracle HR en SQLite

**Fecha:** 2026-03  
**Contexto:** El módulo de certificación Oracle necesita un sandbox SQL donde los estudiantes puedan practicar consultas sin conexión a una BD Oracle real.  
**Decisión:** Usar SQLite con el esquema HR de Oracle adaptado (compatible con SQLite). Para DML/DDL se usa una copia en memoria para no corromper los datos base.  
**Consecuencias:**  
- Las consultas SELECT se ejecutan directamente sobre la BD base  
- Las consultas DML/DDL crean una copia en memoria de los datos  
- Análisis opcional con IA de la consulta del estudiante  
- Sin dependencias externas (todo SQLite local)  

## ADR-009: Múltiples endpoints de IA vs. un solo gateway

**Fecha:** 2025-06  
**Contexto:** Cada módulo de estudio (asistente, corrección, Feynman, infografías, etc.) necesita llamar a APIs de IA con prompts muy diferentes.  
**Decisión:** Cada service tiene su propio prompt y llama directamente a las APIs externas, en lugar de centralizar en un gateway de IA.  
**Consecuencias:**  
- Cada módulo es autónomo y testeable independientemente  
- Los prompts están cerca del código que los usa (mejor mantenibilidad)  
- No hay cuello de botella centralizado  
- Ligera duplicación de lógica HTTP (mitigada con httpx compartido)  

## ADR-010: mathos.sh como entry point unificado

**Fecha:** 2026-02  
**Contexto:** Levantar Mathós requiere: kernel C++, backend API, frontend Vite, PostgreSQL y seed de datos. Tener que ejecutar 5+ comandos es propenso a error.  
**Decisión:** Un único script bash (mathos.sh) que:  
1. Verifica/crea .env  
2. Arranca PostgreSQL con Docker Compose (o fallback a SQLite)  
3. Compila/arranca kernel C++ (Drogon)  
4. Arranca backend FastAPI (Uvicorn)  
5. Sincroniza frontend a /tmp (para evitar problemas de noexec en fuseblk)  
6. Arranca frontend Vite  
7. Maneja Ctrl+C para detener todo limpio  
**Consecuencias:**  
- Un solo comando: `bash mathos.sh`  
- Flags útiles: `--build`, `--seed`, `--kernel`, `--status`  
- Workaround para sistemas de archivos sin permisos Unix (fuseblk) con copia a /tmp  
- Seed automático si la BD está vacía  
