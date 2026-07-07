# Stack Tecnológico de Mathós

## Backend

| Tecnología         | Versión (real)  | Propósito                                              |
|--------------------|-----------------|--------------------------------------------------------|
| Python             | 3.12+           | Lenguaje principal del backend                         |
| FastAPI            | ≥0.115.0        | Framework web asíncrono para la API REST               |
| Uvicorn            | ≥0.30.0         | Servidor ASGI para FastAPI                             |
| SQLAlchemy         | ≥2.0.0          | ORM asíncrono para base de datos                       |
| Pydantic           | ≥2.0.0          | Validación de esquemas y settings                      |
| Pydantic-Settings  | ≥2.0.0          | Configuración desde .env                               |
| httpx              | ≥0.27.0         | Cliente HTTP asíncrono para llamadas a APIs externas   |
| asyncpg            | ≥0.29.0         | Driver PostgreSQL asíncrono (opcional)                 |
| aiosqlite          | ≥0.22.0         | Driver SQLite asíncrono (desarrollo)                   |
| python-jose        | ≥3.3.0          | JWT para autenticación                                 |
| passlib            | ≥1.7.4          | Hashing de contraseñas (bcrypt)                        |
| python-multipart   | ≥0.0.9          | Procesamiento de formularios multipart (subida archivos)|
| cryptography       | ≥43.0.0         | Criptografía para JWT y seguridad                      |
| Redis              | ≥5.0.0          | Cliente Redis (caché, rate limiting futuro)            |

### IA y RAG

| Tecnología         | Versión         | Propósito                                              |
|--------------------|-----------------|--------------------------------------------------------|
| TurboVec           | (local)         | Biblioteca de vectores cuantizados 4-bit (Google TurboQuant) |
| sentence-transformers| (local)        | Modelo all-MiniLM-L6-v2 para embeddings (dimensión 384)|
| DeepSeek API       | chat API        | Modelo principal de lenguaje para chat y corrección    |
| Qwen API           | chat API        | Fallback cuando DeepSeek no está disponible            |
| Gemini Vision API  | gemini-2.5-flash| Análisis de imágenes, PDFs, manuscritos               |
| NotebookLM MCP     | (local)         | Generación de Audio Overviews (podcasts educativos)    |

## Frontend

| Tecnología         | Versión (real)  | Propósito                                              |
|--------------------|-----------------|--------------------------------------------------------|
| React              | 19.2.6          | Framework UI                                           |
| TypeScript         | ~6.0.2          | Tipado estático                                        |
| Vite               | 6.4.2           | Bundler y dev server                                   |
| TailwindCSS        | 4.3.0           | Framework CSS utility-first                            |
| Zustand            | 5.0.1           | Estado global liviano                                  |
| TanStack React Query| 5.101.0        | Fetching y caché de datos del servidor                 |
| React Router DOM   | 7.17.0          | Enrutamiento SPA                                       |
| Axios              | 1.17.0          | Cliente HTTP                                           |
| Framer Motion      | 12.40.0         | Animaciones                                            |
| KaTeX              | 0.16.11         | Renderizado de fórmulas LaTeX                          |
| Lucide React       | 1.17.0          | Iconos SVG                                             |
| Mermaid            | 11.15.0         | Renderizado de diagramas UML/flowcharts                |
| Monaco Editor      | (react) 4.7.0   | Editor de código (C++)                                 |
| epubjs             | 0.3.93          | Lector de libros EPUB (biblioteca)                     |
| tailwind-merge     | 3.6.0           | Utilidad de merging de clases Tailwind                 |
| clsx               | 2.1.1           | Utilidad de clases condicionales                       |

## Kernel C++

| Tecnología         | Versión         | Propósito                                              |
|--------------------|-----------------|--------------------------------------------------------|
| C++                | C++20           | Lenguaje del sandbox de compilación                    |
| Drogon             | (local)         | Framework HTTP asíncrono C++ para la API del kernel    |
| GCC/Clang          | (sistema)       | Compilador para el código del estudiante               |

## Base de Datos

| Tecnología         | Propósito                                              |
|--------------------|--------------------------------------------------------|
| PostgreSQL         | Base de datos principal (producción)                   |
| SQLite             | Base de datos de desarrollo (automático si no hay PG)  |
| SQLite (sandbox)   | Base de datos sandbox SQL con esquema HR de Oracle     |
| SQLite (TurboVec)  | Almacenamiento de chunks de texto para RAG             |

## Infraestructura (opcional)

| Tecnología         | Propósito                                              |
|--------------------|--------------------------------------------------------|
| Docker Compose     | Orquestación de PostgreSQL y Redis                     |
| Redis              | Caché y rate limiting distribuido                      |

## Herramientas de desarrollo

| Herramienta        | Propósito                                              |
|--------------------|--------------------------------------------------------|
| npm                | Gestor de dependencias frontend                        |
| uv                 | Gestor de dependencias Python (entorno virtual)        |
| pgrep/pkill        | Gestión de procesos en mathos.sh                       |
