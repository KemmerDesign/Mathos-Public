# Mathós — Plataforma de Estudio Asistido por IA para Matemáticas UNED

## Concepto

Plataforma web para estudiar las asignaturas del Grado de Matemáticas de la UNED con asistencia de IA. Cada materia es un módulo independiente con recursos específicos: sandbox de compilación, visor geométrico, generación de tests adaptativos, y asistente contextual con RAG sobre los apuntes del usuario.

## Stack

| Capa | Tecnología | Propósito |
|------|-----------|-----------|
| **Kernel** | C++20 (Drogon) | Sandbox de compilación, motor geométrico, procesamiento de imágenes |
| **API** | Python FastAPI | IA, RAG, lógica de estudio, tracking de progreso |
| **Frontend** | React 19 + TS + Tailwind CSS 4 + Vite | UI, visor p5.js, KaTeX, Monaco Editor |
| **DB** | PostgreSQL 16 | Usuarios, materias, temas, sesiones de estudio, tests |
| **Cache/Colas** | Redis | Sesiones, rate limiting, cola de compilación |
| **RAG** | ChromaDB | Apuntes PDF indexados por materia |
| **Auth** | Python FastAPI (JWT HS256) | Registro/login multi-usuario con bcrypt + Bearer token 24h
|| **IA** | DeepSeek + Qwen + Gemini Vision | Razonamiento, generación, lectura de imágenes |

## Módulos Iniciales (Semestre actual)

### 1. Lenguajes de Programación (UNED, código 6102210-)

#### Stack del módulo
| Componente | Tecnología | Versión | Propósito |
|-----------|-----------|---------|-----------|
| **Editor de código** | Monaco Editor (@monaco-editor/react) | 4.6+ | El mismo editor de VS Code: resaltado sintaxis C++, autocompletado, indent con Tab, plegado, multi-cursor |
| **File Explorer** | React component propio | — | Explorador lateral con pestañas de archivos: main.cpp, funciones.h, funciones.cpp. Crear, renombrar, eliminar archivos |
| **Compilación** | g++ (kernel Drogon C++20) | g++ 15+ | Compila y ejecuta código C++ con timeout, captura stdout/stderr, devuelve exit_code |
| **IA Asistente** | DeepSeek (primario) / Qwen (fallback) | deepseek-chat / qwen-max | Explica conceptos con RAG sobre apuntes UNED, modo normal y dummy |
| **Evaluación** | DeepSeek | deepseek-chat | Evalúa código y respuestas con modo Feynman (simplificado) y Técnico (rigor académico) |
| **RAG** | TurboVec (Google TurboQuant) + SentenceTransformer | 0.7+ / all-MiniLM-L6-v2 | Búsqueda vectorial 4-bit, embeddings locales, sin API externa |
| **Renderizado** | KaTeX | 0.16+ | Fórmulas matemáticas en respuestas del asistente |

#### Funcionalidades obligatorias del sandbox

1. **Monaco Editor** con configuración C++:
   - Tema oscuro (vs-dark)
   - Lenguaje C++ con autocompletado de std (iostream, vector, string, etc.)
   - Indentación con Tab (4 espacios)
   - Números de línea, plegado de código, bracket matching
   - Fuente monoespaciada (JetBrains Mono o Fira Code como fallback)

2. **File Explorer lateral** (ancho ~200px):
   - Lista de archivos del proyecto actual
   - main.cpp (archivo por defecto, editable)
   - Crear nuevos archivos: .h y .cpp
   - Cambiar entre archivos actualiza el editor
   - NO se requiere arrastrar y soltar

3. **Panel de compilación** (debajo del editor):
   - Botón "▶ Ejecutar" que envía el código al kernel C++
   - Botón "🤖 Revisar con IA" que envía el código al asistente para revisión
   - Salida de compilación en panel tipo terminal (fondo oscuro, letra verde)
   - Separación de stdout y stderr
   - Indicador de loading mientras compila

4. **NO incluye** (para evitar cambios arbitrarios futuros):
   - Depurador paso a paso
   - IntelliSense avanzado (Clangd)
   - Compilación en el navegador (Wasm)
   - Testing unitario automatizado
   - Perfilamiento de código
   - Integración con git

5. **Integración con el sistema de progreso**:
   - Al completar un taller con puntuación >= 70, el tema se marca como "dominado"
   - El siguiente tema en la progresión se desbloquea
   - El historial de código compilado se guarda en la sesión

#### Flujo de usuario esperado
1. Usuario selecciona un tema en el sidebar izquierdo
2. Se carga la teoría del tema (via POST /asistente/preguntar con modo="teoria")
3. Usuario pasa al sandbox y escribe/edita código en Monaco
4. Usuario hace clic en "▶ Ejecutar" → código se envía al kernel C++ → se muestra output
5. Usuario puede crear archivos .h y .cpp desde el file explorer
6. Usuario puede enviar el código a "🤖 Revisar con IA" para obtener feedback
7. Usuario envía solución al taller → IA evalúa (modo Feynman o Técnico) → si >=70, avanza

### 2. Geometría Euclidiana
- **Visor interactivo**: p5.js — dibuja figuras, permite rotar, medir
- **LaTeX paso a paso**: KaTeX renderiza cada paso de una demostración
- **Lector de ejercicios**: foto → Gemini Vision extrae el problema → lo explica
- **Generador de problemas**: propone variantes hasta que el usuario demuestre dominio

## Arquitectura

```
                        ┌──────────────────────┐
                        │   Frontend React      │ ← p5.js, KaTeX, Monaco
                        │   :5173               │
                        └──────────┬───────────┘
                                   │ HTTP REST
                        ┌──────────▼───────────┐
                        │   API FastAPI         │ ← IA, RAG, progreso
                        │   :8001               │
                        └──────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌───────────────┐   ┌────────────────┐   ┌────────────────┐
     │ Kernel C++    │   │  PostgreSQL    │   │  ChromaDB      │
     │ Drogon :8100  │   │  :5432         │   │  (local)       │
     │ sandbox/g++   │   │  progreso      │   │  apuntes PDF   │
     │ geometría     │   │  tests         │   │  investigaciones│
     │ visión (cv)   │   │  sesiones      │   │                │
     └───────────────┘   └────────────────┘   └────────────────┘
                                   │
                          ┌────────▼────────┐
                          │    Redis :6379   │
                          │ cola compile     │
                          │ rate limit       │
                          └─────────────────┘
```

## Sistema de Progreso

### Materias → Temas → Lecciones → Dominio
Cada materia tiene N temas. Cada tema tiene:
- **Estado**: No iniciado / En curso / Practicando / Dominado
- **Tests superados**: cuántos tests de ese tema has pasado
- **Último estudio**: timestamp
- **Ejercicios resueltos**: contador
- **Dudas frecuentes**: preguntas que hiciste sobre ese tema

Cuando avances de semestre, puedes volver a temas anteriores. El sistema recuerda tu nivel de dominio y te ofrece repaso si detecta que ha pasado tiempo.

## IA

### Asistente de consulta
- Entrada: texto, imagen (ejercicio escaneado), o código
- Busca en ChromaDB (apuntes indexados) primero
- Si no encuentra, responde con conocimiento general del modelo
- Respuestas con KaTeX para fórmulas y p5.js para figuras

### Generación de tests
- Por tema: "genera un test de 5 preguntas sobre punteros en C++"
- Adaptativo: si fallas, el siguiente test se enfoca en lo que fallaste
- Con corrección: cada respuesta se evalúa y se explica

### Visión para ejercicios
- Foto de un ejercicio de geometría → Gemini Vision extrae el enunciado
- Mathós lo resuelve paso a paso con figuras
- Propone variantes para practicar

## Estructura de directorios

```
Mathos/
├── PROYECTO.md
├── .env.example
├── .gitignore
├── backend/
│   ├── kernel/               ← C++20 (Drogon)
│   │   ├── CMakeLists.txt
│   │   ├── src/
│   │   │   ├── main.cpp
│   │   │   ├── sandbox/      ← Compilación de C++
│   │   │   ├── geometry/     ← Motor geométrico
│   │   │   └── vision/       ← Procesamiento de imágenes (OpenCV)
│   │   └── include/
│   ├── api/                  ← Python FastAPI
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   ├── routes/
│   │   ├── services/
│   │   └── shared/
│   └── db/
│       └── migrations/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SandboxCpp.tsx
│   │   │   ├── VisorGeometria.tsx
│   │   │   ├── KaTeXStep.tsx
│   │   │   └── AsistenteChat.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── LenguajesProgramacion.tsx
│   │   │   └── GeometriaEuclidiana.tsx
│   │   └── services/
│   │       └── api.ts
│   └── package.json
├── ia/
│   ├── chroma_db/
│   ├── scripts/
│   │   └── indexar_apuntes.py
│   └── docs/                 ← PDFs de apuntes por materia
│       ├── lenguajes-programacion/
│       └── geometria-euclidiana/
├── infra/
│   └── docker-compose.yml
├── resources/
│   └── docs/
├── .hermes/
│   └── protocol/
│       └── api-contract.yaml
```

## Roadmap

- [x] **Multi-usuario JWT**: Registro/login con bcrypt, middleware JWT, API key rotation, kernel C++ bind seguro
- [x] **MVP**: Scaffold + asistente chat básico para las 2 materias
- [x] **Sandbox C++**: editor + compilación remota + tests
- [ ] **Geometría**: visor p5.js + LaTeX + lectura de imágenes
- [ ] **Progreso**: tracking de dominio por tema, tests adaptativos
- [ ] **RAG**: indexación de apuntes PDF por materia
- [ ] **Más materias**: modular, agregar materia = crear módulo
- [ ] **Repaso inteligente**: cuando pase tiempo sin practicar un tema, sugerir repaso
