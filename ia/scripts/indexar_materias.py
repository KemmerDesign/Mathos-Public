#!/usr/bin/env python3
"""
Mathós — Indexador universal de materias independientes.

Indexa en TurboVec todo el material de estudio de Mathos que no sea UNED:
  - Filosofía: Nietzsche, Marx, Schopenhauer, Hegel, Gramsci, etc.
  - Oracle DB: material que se agregue en ia/docs/oracle-db/

Uso:
  python3 ia/scripts/indexar_materias.py              # todo
  python3 ia/scripts/indexar_materias.py --materia nietzsche
  python3 ia/scripts/indexar_materias.py --materia karl-marx
  python3 ia/scripts/indexar_materias.py --materia oracle-db

Para agregar Oracle u otra materia:
  1. Pon los PDFs/EPUBs en ia/docs/<coleccion>/
  2. El script los detecta automáticamente.
"""

import argparse
import re
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
API_DIR = REPO / "backend" / "api"
DOCS_DIR = REPO / "ia" / "docs"
FILOSOFIA_TEXTOS = REPO / "filosofia_textos"
LIBROS_KEMS = Path(os.getenv("LIBROS_PATH", str(Path(__file__).resolve().parent.parent.parent / "filosofia_textos")))

sys.path.insert(0, str(API_DIR))


# ── Extracción de texto ────────────────────────────────────────────────────────

def texto_epub(ruta: Path) -> str:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("  ⚠️  Instala beautifulsoup4: pip install beautifulsoup4")
        return ""
    textos = []
    try:
        with zipfile.ZipFile(ruta) as z:
            archivos = sorted(
                [n for n in z.namelist() if n.lower().endswith((".html", ".xhtml", ".htm"))]
            )
            for nombre in archivos:
                try:
                    html = z.read(nombre).decode("utf-8", errors="ignore")
                    soup = BeautifulSoup(html, "html.parser")
                    for tag in soup(["script", "style", "head"]):
                        tag.decompose()
                    textos.append(soup.get_text(" ", strip=True))
                except Exception:
                    continue
    except Exception as e:
        print(f"  ⚠️  Error EPUB {ruta.name}: {e}")
    return "\n\n".join(textos)


def texto_pdf(ruta: Path) -> str:
    try:
        result = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(ruta), "-"],
            capture_output=True, text=True, timeout=120
        )
        return result.stdout
    except FileNotFoundError:
        print("  ⚠️  pdftotext no instalado: sudo apt install poppler-utils")
        return ""
    except Exception as e:
        print(f"  ⚠️  Error PDF {ruta.name}: {e}")
        return ""


def extraer_texto(ruta: Path) -> str:
    sufijo = ruta.suffix.lower()
    if sufijo == ".epub":
        return texto_epub(ruta)
    elif sufijo == ".pdf":
        return texto_pdf(ruta)
    elif sufijo == ".md":
        return ruta.read_text(encoding="utf-8", errors="ignore")
    elif sufijo == ".txt":
        return ruta.read_text(encoding="utf-8", errors="ignore")
    return ""


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunkar(texto: str, tam: int = 800, solapamiento: int = 100) -> list[str]:
    texto = re.sub(r"\s{3,}", "\n\n", texto).strip()
    chunks, inicio = [], 0
    while inicio < len(texto):
        fin = inicio + tam
        if fin < len(texto):
            corte = texto.rfind("\n", inicio, fin)
            if corte < inicio + tam // 2:
                corte = texto.rfind(" ", inicio, fin)
            if corte > inicio:
                fin = corte
        chunk = texto[inicio:fin].strip()
        if len(chunk) > 80:
            chunks.append(chunk)
        inicio = fin - solapamiento
    return chunks


# ── Catálogo de libros de la colección principal ───────────────────────────────
# Solo los que NO están en filosofia_textos/ (esos se detectan automáticamente)

CATALOGO_KEMS = [
    # ── NIETZSCHE ──────────────────────────────────────────────────────────────
    {
        "coleccion": "nietzsche",
        "tema": "Así habló Zaratustra",
        "autor": "Friedrich Nietzsche",
        "ruta": LIBROS_KEMS / "Friedrich Nietzsche/Asi hablo Zaratustra (591)/Asi hablo Zaratustra - Friedrich Nietzsche.epub",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Más allá del bien y del mal",
        "autor": "Friedrich Nietzsche",
        "ruta": LIBROS_KEMS / "Nietzsche Friedrich/Mas alla del bien y del mal - Nietzsche Friedrich.epub",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Ecce homo",
        "autor": "Friedrich Nietzsche",
        "ruta": LIBROS_KEMS / "A -Libros-Ru1nA/pdf/257 PDF/ecce_homo - Friedrich Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Aforismos",
        "autor": "Friedrich Nietzsche",
        "ruta": LIBROS_KEMS / "A -Libros-Ru1nA/pdf/257 PDF/Aforismos - Friedrich Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Nietzsche — Biografía",
        "autor": "Miguel Morey",
        "ruta": LIBROS_KEMS / "Morey Miguel/Nietzsche, una biografia - Morey Miguel.epub",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Schopenhauer — El amor, las mujeres y la muerte",
        "autor": "Arthur Schopenhauer",
        "ruta": LIBROS_KEMS / "A -Libros-Ru1nA/pdf/257 PDF/El amor, las mujeres y la muerte - Arthur Schopenhauer.pdf",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Foucault — Las palabras y las cosas",
        "autor": "Michel Foucault",
        "ruta": LIBROS_KEMS / "Michel Foucault/Las palabras y las cosas (1594)/Las palabras y las cosas - Michel Foucault.epub",
    },
    {
        "coleccion": "nietzsche",
        "tema": "Foucault — Vigilar y castigar",
        "autor": "Michel Foucault",
        "ruta": LIBROS_KEMS / "Michael Foucault/Vigilar y Castigar (1587)/Vigilar y Castigar - Michael Foucault.epub",
    },
    # ── MARX ───────────────────────────────────────────────────────────────────
    {
        "coleccion": "karl-marx",
        "tema": "El Manifiesto Comunista",
        "autor": "Karl Marx",
        "ruta": LIBROS_KEMS / "Karl Marx/Manifiesto del Partido Comunista (1391)/Manifiesto del Partido Comunista - Karl Marx.epub",
    },
    {
        "coleccion": "karl-marx",
        "tema": "Del socialismo utópico al científico",
        "autor": "Federico Engels",
        "ruta": LIBROS_KEMS / "A -Libros-Ru1nA/pdf/257 PDF/Del socialismo utopico al socialismo cie - Federico Engels.pdf",
    },
    {
        "coleccion": "karl-marx",
        "tema": "Filosofía política de Hobbes a Marx",
        "autor": "Atilio Boron",
        "ruta": LIBROS_KEMS / "Boron Atilio/La filosofia politica moderna. De Hobbes a Marx - Boron Atilio.epub",
    },
    {
        "coleccion": "karl-marx",
        "tema": "Kant — Textos sobre historia",
        "autor": "Immanuel Kant",
        "ruta": LIBROS_KEMS / "Immanuel Kant/Textos sobre historia (1254)/Textos sobre historia - Immanuel Kant.epub",
    },
]

# Mapeo nombre de archivo → metadata para filosofia_textos/
FILOSOFIA_TEXTOS_META = {
    "nietzsche": {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
    },
    "marx": {
        "coleccion": "karl-marx",
        "autor": "Karl Marx / Friedrich Engels",
    },
    "deleuze": {
        "coleccion": "nietzsche",
        "autor": "Gilles Deleuze",
    },
    "heidegger": {
        "coleccion": "nietzsche",
        "autor": "Martin Heidegger",
    },
    "hegel": {
        "coleccion": "karl-marx",
        "autor": "G.W.F. Hegel",
    },
    "gramsci": {
        "coleccion": "karl-marx",
        "autor": "Antonio Gramsci",
    },
    "althusser": {
        "coleccion": "karl-marx",
        "autor": "Louis Althusser",
    },
    "lenin": {
        "coleccion": "karl-marx",
        "autor": "Vladimir Lenin",
    },
    "schopenhauer": {
        "coleccion": "nietzsche",
        "autor": "Arthur Schopenhauer",
    },
}


def meta_para_archivo(ruta: Path) -> dict:
    nombre = ruta.stem.lower()
    for clave, meta in FILOSOFIA_TEXTOS_META.items():
        if clave in nombre:
            return {**meta, "tema": ruta.stem.replace("_", " ").replace("-", " ")}
    return {"coleccion": "filosofia", "autor": "Desconocido", "tema": ruta.stem}


# ── Indexación ─────────────────────────────────────────────────────────────────

def indexar_archivo(ruta: Path, coleccion: str, tema: str, autor: str, agregar_fn) -> int:
    print(f"  📖 [{ruta.suffix.upper()[1:]}] {ruta.name}")
    texto = extraer_texto(ruta)
    if not texto.strip():
        print(f"     ⚠️  Sin texto extraíble")
        return 0
    chunks = chunkar(texto)
    indexados = 0
    for i, chunk in enumerate(chunks):
        try:
            agregar_fn(
                texto=chunk,
                materia=coleccion,
                tema=tema,
                fuente=ruta.name,
                metadata={"autor": autor, "chunk_idx": i, "total_chunks": len(chunks)},
            )
            indexados += 1
        except Exception as e:
            print(f"     ⚠️  Error chunk {i}: {e}")
    print(f"     ✅ {indexados} chunks")
    return indexados


def colecciones_disponibles() -> list[str]:
    cols = set()
    for item in CATALOGO_KEMS:
        cols.add(item["coleccion"])
    if FILOSOFIA_TEXTOS.exists():
        cols.update(["nietzsche", "karl-marx"])
    # Colecciones auto-detectadas desde ia/docs/
    if DOCS_DIR.exists():
        for d in DOCS_DIR.iterdir():
            if d.is_dir() and d.name not in ("lenguajes-programacion", "geometria-euclidiana"):
                cols.add(d.name)
    return sorted(cols)


def main():
    parser = argparse.ArgumentParser(description="Mathós — Indexador de materias independientes")
    parser.add_argument("--materia", help="Indexar solo esta colección (ej: nietzsche, karl-marx, oracle-db)")
    parser.add_argument("--listar", action="store_true", help="Listar colecciones disponibles")
    args = parser.parse_args()

    if args.listar:
        print("Colecciones disponibles:")
        for c in colecciones_disponibles():
            print(f"  - {c}")
        return

    try:
        from services.embeddings import agregar_texto
    except ImportError as e:
        print(f"❌ Error importando embeddings: {e}")
        print("   Ejecuta desde la raíz del proyecto Mathos con la venv del backend activada.")
        sys.exit(1)

    filtro = args.materia
    stats: dict[str, int] = {}

    # ── 1. Catálogo de Libros-Kems ─────────────────────────────────────────────
    for item in CATALOGO_KEMS:
        if filtro and item["coleccion"] != filtro:
            continue
        ruta = item["ruta"]
        if not ruta.exists():
            print(f"  ⚠️  No encontrado: {ruta.name}")
            continue
        n = indexar_archivo(ruta, item["coleccion"], item["tema"], item["autor"], agregar_texto)
        stats[item["coleccion"]] = stats.get(item["coleccion"], 0) + n

    # ── 2. filosofia_textos/ (auto-detectado) ──────────────────────────────────
    if FILOSOFIA_TEXTOS.exists():
        archivos = sorted([
            f for f in FILOSOFIA_TEXTOS.iterdir()
            if f.suffix.lower() in (".pdf", ".epub", ".md", ".txt") and not f.name.startswith("download")
        ])
        for ruta in archivos:
            meta = meta_para_archivo(ruta)
            if filtro and meta["coleccion"] != filtro:
                continue
            n = indexar_archivo(ruta, meta["coleccion"], meta["tema"], meta["autor"], agregar_texto)
            stats[meta["coleccion"]] = stats.get(meta["coleccion"], 0) + n

    # ── 3. ia/docs/<coleccion>/ (Oracle DB y otras futuras) ───────────────────
    if DOCS_DIR.exists():
        for coleccion_dir in sorted(DOCS_DIR.iterdir()):
            if not coleccion_dir.is_dir():
                continue
            coleccion = coleccion_dir.name
            if coleccion in ("lenguajes-programacion", "geometria-euclidiana"):
                continue  # ya indexadas por el indexador UNED
            if filtro and coleccion != filtro:
                continue
            archivos = sorted([
                f for f in coleccion_dir.iterdir()
                if f.suffix.lower() in (".pdf", ".epub", ".md", ".txt")
            ])
            if not archivos:
                print(f"\n[{coleccion}] Sin archivos en {coleccion_dir}")
                continue
            print(f"\n[{coleccion}] {len(archivos)} archivo(s)")
            for ruta in archivos:
                n = indexar_archivo(ruta, coleccion, ruta.stem, "—", agregar_texto)
                stats[coleccion] = stats.get(coleccion, 0) + n

    # ── Resumen ────────────────────────────────────────────────────────────────
    if not stats:
        print("\nNada indexado. Verifica rutas o usa --listar para ver colecciones.")
        return

    print("\n" + "=" * 55)
    print("Resumen:")
    total = 0
    for col, n in sorted(stats.items()):
        print(f"  {col}: {n} chunks")
        total += n
    print(f"  TOTAL: {total} chunks")
    print("\nPróximo paso:")
    print("  python3 ia/scripts/build_graph.py")
    print("  (Agrega las colecciones nuevas a MATHOS_COLLECTIONS primero)")


if __name__ == "__main__":
    main()
