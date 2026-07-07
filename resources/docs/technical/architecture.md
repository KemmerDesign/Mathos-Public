# Arquitectura de Mathós

## Visión General

Mathós es una plataforma de estudio asistida por IA para el grado de Matemáticas de la UNED. Consta de tres capas principales: Frontend React, Backend FastAPI y Kernel C++ nativo, más un motor RAG vectorial (TurboVec) y bases de datos.

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (Navegador)                    │
│  React 19 + Vite 6 + TailwindCSS 4 + Zustand + TanStack  │
│                    http://localhost:5173                   │
└────────────────────────┬────────────────────────────────┘
                         │ proxy Vite (/api → :8001)
                         │ (/compile-api → :8100)
                         ▼
┌─────────────────────────────────────────────────────────┐
│            BACKEND API  —  FastAPI (Python)              │
│              http://localhost:8001                        │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  MIDDLEWARE                                         │  │
│  │  • CORS                                             │  │
│  │  • API Key (MATHOS_API_KEY)                         │  │
│  │  • Rate Limiter (100 gen / 10 IA req/min)           │  │
│  │  • Security Headers (HSTS, XSS, nosniff, DENY)      │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  ROUTES (API v1)                                   │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │  │
│  │  │ materias │  temas   │ asistente│   vision      │ │  │
│  │  │ (CRUD)   │  (CRUD)  │ (RAG+IA) │ (Gemini)     │ │  │
│  │  ├──────────┼──────────┼──────────┼──────────────┤ │  │
│  │  │infografias│ feynman │  audio   │    taller     │ │  │
│  │  │(Mermaid) │(Feynman) │(NotebookLM)│(manuscrito) │ │  │
│  │  ├──────────┼──────────┼──────────┼──────────────┤ │  │
│  │  │ simulacro│ sandbox  │   srs    │    libros     │ │  │
│  │  │(examen)  │  (SQL)   │  (SM-2)  │ (biblioteca)  │ │  │
│  │  └──────────┴──────────┴──────────┴──────────────┘ │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  SERVICES                                          │  │
│  │  • asistente_service.py  — RAG + DeepSeek/Qwen     │  │
│  │  • embeddings.py         — TurboVec (vectores 4-bit)│  │
│  │  • vision_service.py     — Gemini Vision API       │  │
│  │  • notebooklm_service.py — Audio Overview MCP      │  │
│  │  • simulacro_service.py  — Generación/corrección   │  │
│  │  • srs_service.py        — SM-2 algorithm          │  │
│  │  • dominio_service.py    — Progresión de dominio   │  │
│  │  • feynman_trainer.py    — Técnica Feynman         │  │
│  │  • infografia_service.py — Diagramas Mermaid.js    │  │
│  │  • taller_service.py     — Evaluación manuscritos  │  │
│  │  • sandbox_sql_service.py— Sandbox SQL (Oracle HR) │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  SHARED                                            │  │
│  │  • settings.py    — Config .env                    │  │
│  │  • database.py    — SQLAlchemy async engine        │  │
│  │  • auth.py        — JWT + API Key                  │  │
│  │  • cors.py        — CORS middleware                │  │
│  │  • rate_limit.py  — Rate limiter                   │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  PostgreSQL  │ │   SQLite     │ │   TurboVec   │
│  (o SQLite)  │ │ (sandbox SQL)│ │ (vectores)   │
│  ─ modelos   │ │ ─ schema HR  │ │ ─ chunks.db  │
│  ORM         │ │   Oracle     │ │ ─ .tvim      │
└──────────────┘ └──────────────┘ └──────────────┘
         ▲                              ▲
         │                              │
┌────────┴────────┐          ┌──────────┴──────────┐
│  Redis (opc.)   │          │  IA APIs (HTTP)      │
│  ─ caché        │          │  • DeepSeek Chat     │
│  ─ rate limit   │          │  • Qwen (fallback)   │
└─────────────────┘          │  • Gemini Vision     │
                             │  • NotebookLM MCP    │
                             └─────────────────────┘
                                    ▲
                                    │
┌───────────────────────────────────┴──────────────────┐
│          KERNEL C++ (Drogon) — :8100                  │
│  Sandbox de compilación/ejecución C++ (aislado)      │
│  Compila código del estudiante y devuelve salida     │
└──────────────────────────────────────────────────────┘
```

## Puertos

| Servicio       | Puerto | Tecnología      |
|----------------|--------|-----------------|
| Frontend       | 5173   | Vite dev server |
| Backend API    | 8001   | Uvicorn/FastAPI |
| Kernel C++     | 8100   | Drogon          |
| PostgreSQL     | 5432   | (opcional)      |
| Redis          | 6379   | (opcional)      |

## Flujo de datos típico

1. **Frontend** (React + Zustand) envía petición AJAX vía `api.ts`
2. **Vite proxy** redirige `/api/*` a backend (:8001) o `/compile-api/*` al kernel (:8100)
3. **FastAPI middleware** valida API Key, rate-limita y aplica security headers
4. **Router** despacha al endpoint correspondiente
5. **Service** ejecuta lógica de negocio: consulta BD, llama a APIs externas, actualiza estado
6. **IA calls**: DeepSeek/Qwen para chat y corrección, Gemini Vision para imágenes, NotebookLM para audio
7. **RAG**: TurboVec (SQLite + vectores cuantizados 4-bit) para búsqueda semántica de apuntes
8. **Respuesta** viaja de vuelta al frontend como JSON

## Módulos existentes

### Backend Routes (10 + 1 módulo biblioteca)
- `materias.py` — CRUD de materias UNED, progreso por materia
- `temas.py` — CRUD de temas, sesiones de estudio, tests, dominio
- `asistente.py` — Chat IA con RAG, evaluación de respuestas, listado de colecciones
- `vision.py` — Análisis de imágenes/PDF con Gemini Vision, transcripción
- `infografias.py` — Generación/recuperación de diagramas Mermaid.js
- `feynman_trainer.py` — Evaluación de explicaciones estilo Feynman
- `audio.py` — Generación de podcasts estilo NotebookLM Audio Overview
- `taller.py` — Evaluación de trabajos manuscritos, generación de talleres
- `simulacro.py` — Generación y corrección de exámenes simulados
- `sandbox_sql.py` — Sandbox SQL interactivo con esquema Oracle HR
- `srs.py` — Sistema de Repetición Espaciada (algoritmo SM-2)

### Frontend Pages (8 + 3 de biblioteca)
- `Landing.tsx` — Página de inicio con tarjetas de materias y progreso
- `Dashboard.tsx` — Panel de estudio de una materia (wrapper de MateriaContent)
- `MateriaDetail.tsx` — Vista detalle de materia con temario
- `Chat.tsx` — Chat con el asistente IA
- `FeynmanTrainer.tsx` — Entrenador de técnica Feynman con evaluación y ejemplos
- `SimulacroExam.tsx` — Simulacro de examen con temporizador y corrección IA
- `SRSReview.tsx` — Revisión de flashcards con algoritmo SM-2
- `Vision.tsx` — Análisis visual de ejercicios con IA

### Frontend Components
- `ChatSidebar.tsx` — Sidebar de chat (layout A) o FAB (layout C)
- `MateriaContent.tsx` — Contenido principal de estudio (teoría, editor código, herramientas)
- `GraficaRenderer.tsx` — Renderizador de diagramas Mermaid.js
- `InfografiaPopup.tsx` — Popup de infografías generadas
- `ManuscritoUpload.tsx` — Subida de trabajos manuscritos
- `SandboxSQL.tsx` — Editor SQL interactivo
- `TopicQuiz.tsx` — Quiz rápido de un tema
- `RichAnswerInput.tsx` — Editor de respuestas enriquecido con LaTeX
- `IkaroAvatar.tsx` — Avatar del asistente Ikaro
- `TeoAvatar.tsx` — Avatar del asistente Teo
- `TemarioSidebar.tsx` — Sidebar de navegación de temas

### Infraestructura
- `mathos.sh` — Script de arranque unificado que levanta kernel + API + frontend
- Docker compose (infra/) — PostgreSQL y Redis opcionales
