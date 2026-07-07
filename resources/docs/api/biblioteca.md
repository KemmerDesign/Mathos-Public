# Mathós — Biblioteca y Lector Electrónico

## Resumen

Módulo completo de lectura digital: biblioteca personal con libros de filosofía pre-cargados y posibilidad de registrar libros propios, lector EPUB/PDF con personalización visual, sistema de anotaciones (highlights, notas, bookmarks), progreso de lectura sincronizado, y libro de errores académicos.

## Arquitectura

```
Biblioteca.tsx → API /api/v1/libros       → models.py (Libro, Anotacion)
Lector.tsx     → API /api/v1/libros/{id}/archivo  → sirve epub/pdf
               → API /api/v1/libros/{id}/progreso → guarda progreso
               → API /api/v1/libros/{id}/anotaciones → CRUD anotaciones
LibroErrores.tsx → API /api/v1/srs/errores/{mid}  → errores de simulacros
```

## Tabla de Contenidos

1. [Modelos de Datos](#1-modelos-de-datos)
2. [API Endpoints](#2-api-endpoints)
3. [Frontend: Biblioteca.tsx](#3-frontend-bibliotecatsx)
4. [Frontend: Lector.tsx](#4-frontend-lectortsx)
5. [Frontend: LibroErrores.tsx](#5-frontend-libroerrorestsx)
6. [Seed de Libros de Filosofía](#6-seed-de-libros-de-filosofía)
7. [Rutas en App.tsx](#7-rutas-en-apptsx)

---

## 1. Modelos de Datos

### Libro (`models.py:407`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID str | PK |
| `titulo` | Text | Título del libro |
| `autor` | Text? | Autor |
| `formato` | Text | `epub` \| `pdf` |
| `ruta_archivo` | Text | Ruta absoluta en disco |
| `coleccion_rag` | Text? | Colección TurboVec indexada (ej: `nietzsche`, `karl-marx`) |
| `materia_id` | UUID? | FK → materias.id (para flashcards y contexto IA) |
| `color_portada` | Text | Color hex para portada auto-generada (default: `#6A45DE`) |
| `descripcion` | Text? | Descripción del libro |
| `cfi_actual` | Text? | Última posición CFI (EPUB) o página (PDF) |
| `porcentaje_leido` | Numeric(5,2) | 0.0 — 100.0 |
| `ultima_lectura` | DateTime? | Timestamp de última lectura |
| `created_at` | DateTime | Fecha de registro |

**Relationships:** `anotaciones: list[Anotacion]` (cascade delete)

### Anotacion (`models.py:448`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID str | PK |
| `libro_id` | UUID str | FK → libros.id (CASCADE) |
| `tipo` | Text | `highlight` \| `note` \| `bookmark` |
| `texto_seleccionado` | Text? | Texto seleccionado por el usuario |
| `nota` | Text? | Nota escrita por el usuario |
| `color` | Text | `yellow` \| `green` \| `blue` \| `red` \| `purple` |
| `cfi` | Text? | CFI de la posición anotada |
| `capitulo` | Text? | Título del capítulo |
| `creado_at` | DateTime | Timestamp de creación |

**Índice:** `ix_anotacion_libro` sobre `libro_id`

### Tablas SQL

```sql
CREATE TABLE libros (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    autor TEXT,
    formato TEXT NOT NULL DEFAULT 'epub',
    ruta_archivo TEXT NOT NULL,
    coleccion_rag TEXT,
    materia_id TEXT REFERENCES materias(id) ON DELETE SET NULL,
    color_portada TEXT NOT NULL DEFAULT '#6A45DE',
    descripcion TEXT,
    cfi_actual TEXT,
    porcentaje_leido NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    ultima_lectura TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE anotaciones_lector (
    id TEXT PRIMARY KEY,
    libro_id TEXT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'highlight',
    texto_seleccionado TEXT,
    nota TEXT,
    color TEXT NOT NULL DEFAULT 'yellow',
    cfi TEXT,
    capitulo TEXT,
    creado_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_anotacion_libro ON anotaciones_lector(libro_id);
```

---

## 2. API Endpoints

Todas las rutas bajo `/api/v1/libros`, registradas en `routes/libros.py`.
Usan SQLAlchemy async con inyección de `AsyncSession`.

### 2.1 Listar libros

```
GET /api/v1/libros
```

**Response:** `{ libros: LibroOut[], total: number }`

Cada `LibroOut` incluye: id, titulo, autor, formato, coleccion_rag, materia_id, color_portada, descripcion, cfi_actual, porcentaje_leido, ultima_lectura, created_at, total_anotaciones.

### 2.2 Registrar libro

```
POST /api/v1/libros/registrar
```

**Request:**
```json
{
  "titulo": "string",
  "autor": "string | null",
  "ruta_archivo": "/ruta/absoluta/al/archivo.epub",
  "coleccion_rag": "string | null",
  "materia_id": "string | null",
  "color_portada": "#6A45DE",
  "descripcion": "string | null"
}
```

**Errores:**
- `404` — Archivo no encontrado en disco
- `409` — El archivo ya está registrado (por ruta)

### 2.3 Seed de filosofía

```
POST /api/v1/libros/seed
```

Registra automáticamente los 32 libros de filosofía pre-indexados en RAG. Idempotente: omite los que ya existen.

**Response:** `{ registrados: string[], ya_existian: string[], no_encontrados: string[] }`

### 2.4 Detalle de libro

```
GET /api/v1/libros/{libro_id}
```

### 2.5 Servir archivo

```
GET /api/v1/libros/{libro_id}/archivo
```

Sirve el archivo directamente:
- **EPUB:** `Content-Type: application/epub+zip`, Content-Disposition: attachment
- **PDF:** `Content-Type: application/pdf`, Content-Disposition: inline (se muestra en iframe)

**Headers:** `Accept-Ranges: bytes` (soporta carga parcial)

### 2.6 Guardar progreso

```
PATCH /api/v1/libros/{libro_id}/progreso
```

**Request:**
```json
{
  "cfi_actual": "string | null",
  "porcentaje_leido": 0.0
}
```

### 2.7 Listar anotaciones

```
GET /api/v1/libros/{libro_id}/anotaciones
```

**Response:** `AnotacionOut[]` ordenado por fecha de creación.

### 2.8 Crear anotación

```
POST /api/v1/libros/{libro_id}/anotaciones
```

**Request:**
```json
{
  "tipo": "highlight | note | bookmark",
  "texto_seleccionado": "string | null",
  "nota": "string | null",
  "color": "yellow | green | blue | red | purple",
  "cfi": "string | null",
  "capitulo": "string | null"
}
```

### 2.9 Eliminar anotación

```
DELETE /api/v1/libros/anotaciones/{ann_id}
```

---

## 3. Frontend: Biblioteca.tsx

**Ruta:** `/biblioteca`
**Archivo:** `frontend/src/pages/Biblioteca.tsx` (345 líneas)

### Funcionalidad

- Grid de portadas de libros con gradiente de color
- Cada portada muestra iniciales del título
- Barra de progreso de lectura debajo de cada portada
- Indicador de "última lectura" con fecha relativa (Hoy, Ayer, Hace N días, fecha)
- Contador de anotaciones
- Clic en portada → navega a `/lector/{libroId}`

### Mapa de colores por colección

| Colección RAG | Color |
|---------------|-------|
| `nietzsche` | Púrpura (#7C3AED) |
| `karl-marx` | Rojo (#B91C1C) |

### Etiquetas de colección

- `nietzsche` → "Nietzsche"
- `karl-marx` → "Marx"
- `lenguajes-programacion` → "UNED"
- `geometria-euclidiana` → "UNED"
- `general` → "General"

---

## 4. Frontend: Lector.tsx

**Ruta:** `/lector/{libroId}`
**Archivo:** `frontend/src/pages/Lector.tsx` (1339 líneas)

Componente de lectura completo, el más grande del frontend.

### Funcionalidad

- **EPUB:** Renderizado con **epub.js** (librería cargada vía CDN en `index.html`). Carga el libro desde el endpoint de archivo, lo renderiza en un iframe, y permite navegación por páginas.
- **PDF:** Renderizado con **PDF.js** (librería cargada vía script tag en `index.html`). Convierte cada página a canvas y permite scroll.
- **Panel de Ajustes:**
  - **4 temas de lectura:** Claro, Sepia, Oscuro, OLED
  - **3 fuentes:** EB Garamond, Georgia, Inter
  - **Tamaño de letra:** slider 12px — 28px
  - **Interlineado:** slider 1.2 — 2.4
  - Persistencia en `localStorage`
- **Anotaciones:**
  - **Highlight:** Selecciona texto → aparece barra de herramientas flotante → elige color (5 colores) → se aplica resaltado
  - **Nota:** Añade texto a un highlight
  - **Bookmark:** Marca página como favorita
  - Lista lateral de anotaciones con filtro por tipo
  - Clic en anotación → navega a la posición
  - Eliminar anotación
- **Progreso:**
  - Barra de progreso superior
  - Se guarda automáticamente al cambiar de página
  - Al recargar, restaura la última posición
- **Tabla de contenidos:**
  - Extraída del EPUB, navegable
  - Resalta el capítulo actual
- **Atajos de teclado:**
  - Flecha izquierda / `a` / `j`: página anterior
  - Flecha derecha / `d` / `k`: página siguiente
- **Pantalla completa:** Botón para maximizar el lector (oculta TopBar automáticamente)
- **Estadísticas:** Palabras leídas (estimado), tiempo de lectura, páginas restantes

### Estados

| Estado | Comportamiento |
|--------|----------------|
| **Loading** | Loading spinner mientras carga el libro |
| **Error** | Mensaje de error con botón de reintento |
| **Empty** | N/A (siempre hay un libro por la URL) |
| **Success** | Lector completo con todas las funciones |

### Dependencias externas

- **epub.js** (`https://cdn.jsdelivr.net/npm/epubjs@0.3/dist/epub.min.js`)
- **PDF.js** (`https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs` + worker)
- **@monaco-editor/react** (ya existente para sandbox C++)

### Constantes de diseño del lector

| Tema | Fondo | Texto | Panel | Borde |
|------|-------|-------|-------|-------|
| **Claro** ☀️ | #FFFFFF | #1A1A1A | #F8F8F8 | #E5E5E5 |
| **Sepia** 📜 | #F9F3E8 | #3D2B1F | #F2EBD9 | #DDD0BE |
| **Oscuro** 🌙 | #1C1B29 | #E8E2D0 | #252438 | #353350 |
| **OLED** ⚫ | #000000 | #E8E2D0 | #0D0D0D | #1A1A1A |

### Animaciones

- Transición de páginas: fade con `framer-motion`
- Panel lateral: slide desde la derecha con `framer-motion`
- Barra de herramientas flotante: fade in/out

---

## 5. Frontend: LibroErrores.tsx

**Ruta:** `/errores/{materiaId}`
**Archivo:** `frontend/src/pages/LibroErrores.tsx` (399 líneas)

### Funcionalidad

- Muestra errores registrados de simulacros MCQ, talleres y SRS
- Ordenable por frecuencia o recencia
- Filtrable por fuente (`simulacro_mcq`, `taller`, `srs`)
- **Heat map visual:** color de fondo según gravedad:
  - ⚪ 1-2 fallos: amarillo suave
  - 🟠 3-4 fallos: naranja
  - 🔴 5+ fallos: rojo intenso
- Cada entrada muestra: pregunta, respuesta correcta, veces fallada, fuente, última vez
- Botón "Simulacro dirigido" (navega a `/simulacro/{materiaId}` con filtro de errores)
- Animaciones con `framer-motion` y `AnimatePresence`
- Estadísticas: total errores, moda de frecuencia, fuentes activas

### API que consume

```
GET /api/v1/srs/errores/{materiaId}
```

---

## 6. Seed de Libros de Filosofía

El endpoint `POST /api/v1/libros/seed` registra 32 libros desde `filosofia_textos/` con sus metadatos:

### Nietzsche (19 libros)

| Título | Archivo |
|--------|---------|
| El Anticristo | `01_Nietzsche_El_Anticristo.pdf` |
| Así habló Zaratustra | `02_Nietzsche_Asi_hablo_Zaratustra.pdf` |
| La genealogía de la moral | `Nietzsche_Genealogia_Moral.epub` |
| Más allá del bien y del mal | `Nietzsche_Mas_alla_bien_mal.epub` |
| El nacimiento de la tragedia | `Nietzsche_El_nacimiento_tragedia.epub` |
| La gaya ciencia | `Nietzsche_Gaya_Ciencia.epub` |
| Crepúsculo de los ídolos | `Nietzsche_Crepusculo_idolos.epub` |
| Humano, demasiado humano | `Nietzsche_Humano_demasiado_humano.epub` |
| Aurora | `Nietzsche_Aurora.epub` |
| Fragmentos póstumos | `Nietzsche_Fragmentos_Postumos.epub` |
| Schopenhauer como educador | `Nietzsche_Schopenhauer_educador.epub` |
| Sócrates y la tragedia | `Nietzsche_Socrates_tragedia.epub` |
| El drama musical griego | `Nietzsche_Drama_musical_griego.epub` |
| Ditirambos de Dioniso | `Nietzsche_Ditirambos_Dionisos.epub` |
| La filosofía en la época trágica | `Nietzsche_Filosofia_epoca_tragica.epub` |
| El porvenir educativo | `Nietzsche_Porvenir_educacion.epub` |
| Consideraciones intempestivas | `05_Nietzsche_Consideraciones_Intempestivas.pdf` |
| Nietzsche y la filosofía (Deleuze) | `03_Deleuze_Nietzsche_filosofia.pdf` |
| Nietzsche (Heidegger) | `04_Heidegger_Nietzsche.pdf` |

### Marx (13 libros)

| Título | Archivo |
|--------|---------|
| El Capital, Vol. I | `06_Marx_El_Capital_Vol1.pdf` |
| La ideología alemana | `07_Marx_Engels_Ideologia_Alemana.pdf` |
| Tesis sobre Feuerbach | `08_Marx_Tesis_Feuerbach.epub` |
| El 18 Brumario | `09_Marx_Dieciocho_Brumario.epub` |
| La guerra civil en Francia | `10_Marx_Guerra_Civil_Francia.epub` |
| Crítica del derecho de Hegel | `11_Marx_Critica_Derecho_Hegel.pdf` |
| Trabajo enajenado | `Marx_Trabajo_enajenado.epub` |
| Manifiesto Comunista | `Marx_Manifiesto_Comunista.epub` |
| Selección de textos | `Marx_Seleccion_textos.epub` |
| Fenomenología del espíritu (Hegel) | `12_Hegel_Fenomenologia_Espiritu.pdf` |
| El Estado y la revolución (Lenin) | `13_Lenin_Estado_Revolucion.pdf` |
| Cuadernos de la cárcel (Gramsci) | `14_Gramsci_Cuadernos_Carcel.pdf` |
| Para leer El Capital (Althusser) | `15_Althusser_Para_leer_Capital.pdf` |

### Directorios base

- **Filosofía:** `filosofia_textos/`
- **Colección general:** `libros/`

---

## 7. Rutas en App.tsx

```tsx
<Route path="/biblioteca" element={<Biblioteca />} />
<Route path="/lector/:libroId" element={<Lector />} />
<Route path="/errores/:materiaId" element={<LibroErrores />} />
```

- **NavLink:** El ícono de Biblioteca en la barra de navegación se resalta cuando la ruta empieza con `/biblioteca` o `/lector`
- **Lector a pantalla completa:** El componente `Lector` toma `100vh` completo (oculta TopBar)
- **LibroErrores:** Se accede desde la página de MateriaDetail o desde el dashboard de errores
