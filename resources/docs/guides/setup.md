# Guía de Setup de Mathós

## Requisitos del sistema

- **Linux** (probado en Fedora 40+)
- **Python 3.12+**
- **Node.js 22+** con npm
- **Compilador C++** (gcc/clang) para el kernel sandbox
- **Docker** (opcional, para PostgreSQL+Redis)

## Instalación rápida

```bash
# 1. Clonar el repositorio
git clone <repo> /ruta/a/Mathos
cd /ruta/a/Mathos

# 2. Configurar .env
cp .env.example .env
# Editar .env con las API keys necesarias

# 3. Ver/iniciar todo
bash mathos.sh --status    # ver estado actual
bash mathos.sh             # arrancar todo (kernel + API + frontend)
bash mathos.sh --seed      # sembrar datos UNED
```

## Estructura del proyecto

```
Mathos/
├── backend/
│   ├── api/                      ← Backend Python FastAPI
│   │   ├── main.py               ← Entry point FastAPI
│   │   ├── models.py             ← Modelos SQLAlchemy
│   │   ├── schemas.py            ← Schemas Pydantic
│   │   ├── routes/               ← Routers de API
│   │   │   ├── materias.py       ← CRUD de materias
│   │   │   ├── temas.py          ← CRUD de temas
│   │   │   ├── asistente.py      ← Chat IA con RAG
│   │   │   ├── vision.py         ← Análisis de imágenes
│   │   │   ├── infografias.py    ← Diagramas Mermaid.js
│   │   │   ├── feynman_trainer.py← Técnica Feynman
│   │   │   ├── audio.py          ← Podcast NotebookLM
│   │   │   ├── taller.py         ← Talleres manuscritos
│   │   │   ├── simulacro.py      ← Exámenes simulados
│   │   │   ├── sandbox_sql.py    ← Sandbox SQL
│   │   │   ├── srs.py            ← Repetición espaciada
│   │   │   └── libros.py         ← Biblioteca EPUB/PDF
│   │   ├── services/             ← Lógica de negocio
│   │   │   ├── asistente_service.py
│   │   │   ├── embeddings.py     ← TurboVec (RAG vectorial)
│   │   │   ├── vision_service.py ← Gemini Vision
│   │   │   ├── notebooklm_service.py
│   │   │   ├── simulacro_service.py
│   │   │   ├── srs_service.py    ← SM-2 algorithm
│   │   │   ├── dominio_service.py
│   │   │   ├── feynman_trainer.py
│   │   │   ├── infografia_service.py
│   │   │   ├── taller_service.py
│   │   │   └── sandbox_sql_service.py
│   │   ├── shared/               ← Módulos compartidos
│   │   │   ├── settings.py       ← Config (.env)
│   │   │   ├── database.py       ← SQLAlchemy async
│   │   │   ├── auth.py           ← JWT + API Key
│   │   │   ├── cors.py           ← CORS middleware
│   │   │   └── rate_limit.py     ← Rate limiter
│   │   ├── data/                 ← Datos locales generados
│   │   ├── seed.py               ← Seed de datos UNED
│   │   └── requirements.txt
│   └── kernel/                   ← Sandbox C++ (Drogon)
│       ├── build.sh
│       └── requirements.txt
├── frontend/                     ← React + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx               ← Router principal
│   │   ├── main.tsx              ← Entry point
│   │   ├── pages/                ← Páginas
│   │   │   ├── Landing.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── MateriaDetail.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── FeynmanTrainer.tsx
│   │   │   ├── SimulacroExam.tsx
│   │   │   ├── SRSReview.tsx
│   │   │   ├── Vision.tsx
│   │   │   ├── Biblioteca.tsx
│   │   │   ├── Lector.tsx
│   │   │   └── LibroErrores.tsx
│   │   ├── components/           ← Componentes
│   │   │   ├── ChatSidebar.tsx
│   │   │   ├── MateriaContent.tsx
│   │   │   ├── TemarioSidebar.tsx
│   │   │   ├── GraficaRenderer.tsx
│   │   │   ├── InfografiaPopup.tsx
│   │   │   ├── ManuscritoUpload.tsx
│   │   │   ├── SandboxSQL.tsx
│   │   │   ├── TopicQuiz.tsx
│   │   │   ├── RichAnswerInput.tsx
│   │   │   ├── IkaroAvatar.tsx
│   │   │   └── TeoAvatar.tsx
│   │   └── services/
│   │       ├── store.ts          ← Zustand store
│   │       └── api.ts            ← Cliente Axios
│   ├── vite.config.ts
│   └── package.json
├── infra/                        ← Docker Compose
│   └── docker-compose.yml
├── mathos.sh                     ← Script de arranque
├── .env                          ← Variables de entorno
└── resources/docs/               ← Documentación
```

## Configuración del Backend

### 1. Entorno virtual Python

```bash
# Opción A: con uv (recomendado)
uv venv /home/user/.venv-mathos-api
uv pip install --python /home/user/.venv-mathos-api/bin/python \
  -r backend/api/requirements.txt \
  turbovec sentence-transformers beautifulsoup4

# Opción B: con pip estándar
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/api/requirements.txt
pip install turbovec sentence-transformers beautifulsoup4

# Exportar variable de entorno para mathos.sh
export MATHOS_PYTHON=/home/user/.venv-mathos-api/bin/python3
```

**Nota:** `turbovec`, `sentence-transformers` y `beautifulsoup4` no están en requirements.txt porque se instalaron posteriormente a la creación del archivo. Añádelos explícitamente.

### 2. Variables de entorno (.env)

```
# API Keys — REQUERIDAS para usar funcionalidades IA
DEEPSEEK_API_KEY=sk-...
QWEN_API_KEY=sk-...                          # Fallback
GEMINI_API_KEY=AIza...                       # Para visión y manuscritos

# Base de datos
DATABASE_URL=sqlite+aiosqlite:///mathos_dev.db  # Desarrollo
# DATABASE_URL=postgresql+asyncpg://mathos:pass@localhost:5432/mathos  # Producción

# Redis (opcional)
REDIS_URL=redis://localhost:6379/0

# Seguridad
JWT_SECRET=mi-secreto-seguro
MATHOS_API_KEY=mi-api-key-local              # Para auth frontend→backend

# Kernel C++
KERNEL_URL=http://localhost:8100
COMPILE_TIMEOUT_SECONDS=10
```

### 3. Base de datos

El backend auto-crea las tablas al iniciar. Para datos de prueba:

```bash
cd backend/api
python seed.py
```

El seed incluye materias UNED de Lenguajes de Programación, Geometría Básica, y Filosofía (Nietzsche, Marx).

Si no hay Docker, el backend usa SQLite automáticamente. Para PostgreSQL:

```bash
cd infra
docker compose up -d
```

### 4. Kernel C++ (Sandbox)

```bash
cd backend/kernel
bash build.sh
```

El kernel (Drogon) corre en `:8100`. Si no está compilado, el resto de Mathós funciona sin él (solo el sandbox C++ no estará disponible).

### 5. Poblar RAG (TurboVec)

Para que el asistente IA funcione con RAG, los apuntes deben estar indexados en TurboVec:

```bash
# El script de migración desde ChromaDB está disponible
cd backend/api
python scripts/migrar_chromadb_a_turbovec.py
```

O indexar contenido nuevo usando la API del asistente.

## Configuración del Frontend

### 1. Dependencias

```bash
cd frontend
npm install
```

### 2. Proxy de desarrollo (vite.config.ts)

El frontend usa Vite proxy para redirigir peticiones:
- `/api/*` → `http://localhost:8001` (backend FastAPI)
- `/compile-api/*` → `http://localhost:8100` (kernel C++)

No requiere configuración adicional.

## Módulos específicos — Setup adicional

### Sandbox SQL (Oracle HR)

El sandbox SQL se auto-inicializa la primera vez que se usa. Crea una BD SQLite con el esquema HR de Oracle en `backend/api/data/oracle_sandbox.db`.

No requiere configuración adicional.

### Audio (NotebookLM)

```bash
# Requiere autenticación previa en NotebookLM
# Ejecutar una vez para hacer login:
notebooklm-mcp

# Luego el servicio lo gestiona automáticamente
```

### Vision (Gemini)

Requiere `GEMINI_API_KEY` en `.env`.

### Biblioteca (EPUB/PDF)

Los libros se suben desde el frontend. Los EPUB se sirven estáticamente. No requiere configuración adicional.

## Verificar instalación

```bash
# Ver estado de todos los servicios
bash mathos.sh --status

# O manualmente:
curl http://localhost:8001/health
curl http://localhost:8100/api/v1/health
curl http://localhost:5173/
```

## Solución de problemas comunes

### `fuseblk` y permisos de ejecución (frontend en /tmp)

```bash
# Si el frontend está en una partición fuseblk (sin permisos Unix):
# mathos.sh lo sincroniza automáticamente a /tmp/mathos-frontend
# Si falla manualmente:
cp -r frontend /tmp/mathos-frontend
cd /tmp/mathos-frontend
npm install
chmod +x node_modules/.bin/*
npx vite --host 0.0.0.0 --port 5173
```

### Error: `X-API-Key requerido`

Si ves este error en POST/PUT/DELETE:
1. Asegúrate de que `MATHOS_API_KEY` está configurado en `.env`
2. El frontend debe enviar el header `X-API-Key` en todas las peticiones

### DeepSeek no disponible / error 502

El sistema fallback automáticamente a Qwen. Si ambos fallan, verifica las API keys en `.env`.

### El sandbox SQL no ejecuta consultas

```bash
# Verificar que la BD existe
ls -la backend/api/data/oracle_sandbox.db

# Si no existe, reiniciar el backend (se crea automáticamente)
```

## Arranque manual (sin mathos.sh)

```bash
# Terminal 1: Backend
cd backend/api
source /home/user/.venv-mathos-api/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8001

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Kernel C++ (opcional)
cd backend/kernel
./build/mathos-kernel
```
