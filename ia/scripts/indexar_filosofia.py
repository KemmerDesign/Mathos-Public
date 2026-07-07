"""
Mathós — Indexación de libros de filosofía en TurboVec RAG.

Procesa:
  - EPUB: extrae HTML con zipfile + BeautifulSoup
  - PDF:  extrae texto con pdftotext (CLI, paquete poppler)
  - LIT:  OMITIDO (cifrado DRM, requiere calibre)

Uso:
    python ia/scripts/indexar_filosofia.py

Ejecutar desde la raíz del proyecto Mathos o con la venv del backend activada.
"""

import re
import subprocess
import sys
import zipfile
from pathlib import Path

# ── Rutas ──────────────────────────────────────────────────────────────────────
REPO = Path(__file__).resolve().parent.parent.parent          # .../Mathos/
API_DIR = REPO / "backend" / "api"
LIBROS = Path(os.getenv("LIBROS_PATH", str(Path(__file__).resolve().parent.parent.parent / "filosofia_textos")))

sys.path.insert(0, str(API_DIR))


# ── Extracción de texto ────────────────────────────────────────────────────────

def texto_epub(ruta: Path) -> str:
    """Extrae texto plano de un EPUB (zip con HTML/XHTML)."""
    from bs4 import BeautifulSoup
    textos = []
    try:
        with zipfile.ZipFile(ruta) as z:
            # Ordenar los archivos HTML para preservar el orden del libro
            archivos = sorted(
                [n for n in z.namelist() if n.lower().endswith((".html", ".xhtml", ".htm"))],
                key=lambda x: x
            )
            for nombre in archivos:
                try:
                    html = z.read(nombre).decode("utf-8", errors="ignore")
                    soup = BeautifulSoup(html, "html.parser")
                    # Eliminar scripts y estilos
                    for tag in soup(["script", "style", "head"]):
                        tag.decompose()
                    textos.append(soup.get_text(" ", strip=True))
                except Exception:
                    continue
    except Exception as e:
        print(f"  ⚠️  Error leyendo EPUB {ruta.name}: {e}")
    return "\n\n".join(textos)


def texto_pdf(ruta: Path) -> str:
    """Extrae texto de un PDF con pdftotext."""
    try:
        result = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(ruta), "-"],
            capture_output=True, text=True, timeout=60
        )
        return result.stdout
    except Exception as e:
        print(f"  ⚠️  Error leyendo PDF {ruta.name}: {e}")
        return ""


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunkar(texto: str, tam: int = 800, solapamiento: int = 100) -> list[str]:
    """Divide texto en chunks de ~tam chars con solapamiento."""
    # Limpiar espacios excesivos
    texto = re.sub(r"\s{3,}", "\n\n", texto).strip()
    chunks = []
    inicio = 0
    while inicio < len(texto):
        fin = inicio + tam
        # Intentar cortar en salto de párrafo o espacio
        if fin < len(texto):
            corte = texto.rfind("\n", inicio, fin)
            if corte == -1 or corte < inicio + tam // 2:
                corte = texto.rfind(" ", inicio, fin)
            if corte > inicio:
                fin = corte
        chunk = texto[inicio:fin].strip()
        if len(chunk) > 80:  # descartar fragmentos muy cortos
            chunks.append(chunk)
        inicio = fin - solapamiento
    return chunks


# ── Catálogo de libros a indexar ───────────────────────────────────────────────

LIBROS_FILOSOFIA = [
    # ── NIETZSCHE ──────────────────────────────────────────────────────────────
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Así habló Zaratustra",
        "ruta": LIBROS / "Friedrich Nietzsche/Asi hablo Zaratustra (591)/Asi hablo Zaratustra - Friedrich Nietzsche.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Más allá del bien y del mal",
        "ruta": LIBROS / "Nietzsche Friedrich/Mas alla del bien y del mal - Nietzsche Friedrich.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Más allá del bien y del mal",
        "ruta": LIBROS / "Friedrich Nietzsche/Mas alla del bien y del mal.lit",
        "formato": "lit",  # se omitirá
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Ecce homo",
        "ruta": LIBROS / "A -Libros-Ru1nA/pdf/257 PDF/ecce_homo - Friedrich Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Aforismos",
        "ruta": LIBROS / "A -Libros-Ru1nA/pdf/257 PDF/Aforismos - Friedrich Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Escritos tempranos — Homero",
        "ruta": LIBROS / "A -Libros-Ru1nA/pdf/257 PDF/Homero y la filologia clasica - Friedrich Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Autobiografía",
        "ruta": LIBROS / "A -Libros-Ru1nA/pdf/257 PDF/De mi vida - Friedrich Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Miguel Morey",
        "tema": "Biografía y contexto histórico",
        "ruta": LIBROS / "Morey Miguel/Nietzsche, una biografia - Morey Miguel.epub",
    },
    # Contexto filosófico de Nietzsche
    {
        "coleccion": "nietzsche",
        "autor": "Arthur Schopenhauer",
        "tema": "Schopenhauer — contexto previo a Nietzsche",
        "ruta": LIBROS / "A -Libros-Ru1nA/pdf/257 PDF/El amor, las mujeres y la muerte - Arthur Schopenhauer.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Michel Foucault",
        "tema": "Recepción — Foucault y la genealogía",
        "ruta": LIBROS / "Michel Foucault/Las palabras y las cosas (1594)/Las palabras y las cosas - Michel Foucault.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Michael Foucault",
        "tema": "Recepción — Vigilar y castigar",
        "ruta": LIBROS / "Michael Foucault/Vigilar y Castigar (1587)/Vigilar y Castigar - Michael Foucault.epub",
    },

    # ── MARX ───────────────────────────────────────────────────────────────────
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "El Manifiesto Comunista",
        "ruta": LIBROS / "Karl Marx/Manifiesto del Partido Comunista (1391)/Manifiesto del Partido Comunista - Karl Marx.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Federico Engels",
        "tema": "Del socialismo utópico al científico",
        "ruta": LIBROS / "A -Libros-Ru1nA/pdf/257 PDF/Del socialismo utopico al socialismo cie - Federico Engels.pdf",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Atilio Boron",
        "tema": "Contexto — Filosofía política de Hobbes a Marx",
        "ruta": LIBROS / "Boron Atilio/La filosofia politica moderna. De Hobbes a Marx - Boron Atilio.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Immanuel Kant",
        "tema": "Contexto previo — Filosofía de la historia",
        "ruta": LIBROS / "Immanuel Kant/Textos sobre historia (1254)/Textos sobre historia - Immanuel Kant.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Max Horkheimer / Theodor Adorno",
        "tema": "Marxismo tardío — Dialéctica del Iluminismo",
        "ruta": LIBROS / "Horkheimer/Dialectica del Iluminismo.lit",
        "formato": "lit",  # se omitirá
    },
]


# ── Indexación ─────────────────────────────────────────────────────────────────

def indexar_libro(libro: dict, agregar_texto_fn) -> int:
    ruta: Path = libro["ruta"]
    coleccion = libro["coleccion"]
    tema = libro["tema"]
    autor = libro["autor"]
    fmt = libro.get("formato", ruta.suffix.lower().lstrip("."))

    if not ruta.exists():
        print(f"  ⚠️  No encontrado: {ruta.name}")
        return 0

    if fmt == "lit":
        print(f"  ⏭️  Omitido (DRM .lit): {ruta.name}")
        return 0

    print(f"  📖 Leyendo [{fmt.upper()}]: {ruta.name}")

    if fmt == "epub":
        texto = texto_epub(ruta)
    elif fmt == "pdf":
        texto = texto_pdf(ruta)
    else:
        print(f"  ⚠️  Formato desconocido: {fmt}")
        return 0

    if not texto.strip():
        print(f"  ⚠️  Texto vacío en {ruta.name}")
        return 0

    chunks = chunkar(texto)
    print(f"     → {len(chunks)} chunks generados")

    indexados = 0
    for i, chunk in enumerate(chunks):
        try:
            agregar_texto_fn(
                texto=chunk,
                materia=coleccion,
                tema=tema,
                fuente=ruta.name,
                metadata={"autor": autor, "chunk_idx": i, "total_chunks": len(chunks)},
            )
            indexados += 1
        except Exception as e:
            print(f"     ⚠️  Error en chunk {i}: {e}")

    print(f"     ✅ {indexados}/{len(chunks)} chunks indexados")
    return indexados


def main():
    print("🚀 Mathós — Indexación de Filosofía en TurboVec")
    print("=" * 55)

    try:
        from services.embeddings import agregar_texto
    except ImportError as e:
        print(f"❌ No se puede importar embeddings service: {e}")
        print("   Ejecuta desde la raíz de Mathos o activa la venv del backend.")
        sys.exit(1)

    stats: dict[str, int] = {}

    for libro in LIBROS_FILOSOFIA:
        col = libro["coleccion"]
        print(f"\n[{col}] {libro['tema']} — {libro['autor']}")
        n = indexar_libro(libro, agregar_texto)
        stats[col] = stats.get(col, 0) + n

    print("\n" + "=" * 55)
    print("📊 Resumen:")
    for col, total in stats.items():
        print(f"   {col}: {total} chunks indexados")
    print("\n✅ Indexación completada.")


if __name__ == "__main__":
    main()
