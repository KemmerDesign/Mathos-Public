"""
Mathós — Indexación de NUEVA literatura de filosofía en TurboVec RAG.

Procesa los archivos descargados de la web y convertidos desde .lit
que están en filosofia_textos/. Sigue el mismo patrón que indexar_filosofia.py.

Uso:
    python ia/scripts/indexar_filosofia_nuevos.py

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
LIBROS_NUEVOS = REPO / "filosofia_textos"

sys.path.insert(0, str(API_DIR))


# ── Extracción de texto ────────────────────────────────────────────────────────

def texto_epub(ruta: Path) -> str:
    """Extrae texto plano de un EPUB (zip con HTML/XHTML)."""
    from bs4 import BeautifulSoup
    textos = []
    try:
        with zipfile.ZipFile(ruta) as z:
            archivos = sorted(
                [n for n in z.namelist() if n.lower().endswith((".html", ".xhtml", ".htm"))],
                key=lambda x: x
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
        print(f"  ⚠️  Error leyendo EPUB {ruta.name}: {e}")
    return "\n\n".join(textos)


def texto_pdf(ruta: Path) -> str:
    """Extrae texto de un PDF con pdftotext."""
    try:
        result = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(ruta), "-"],
            capture_output=True, text=True, timeout=120
        )
        return result.stdout
    except Exception as e:
        print(f"  ⚠️  Error leyendo PDF {ruta.name}: {e}")
        return ""


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunkar(texto: str, tam: int = 800, solapamiento: int = 100) -> list[str]:
    """Divide texto en chunks de ~tam chars con solapamiento (mismo que indexar_filosofia.py)."""
    texto = re.sub(r"\s{3,}", "\n\n", texto).strip()
    chunks = []
    inicio = 0
    while inicio < len(texto):
        fin = inicio + tam
        if fin < len(texto):
            corte = texto.rfind("\n", inicio, fin)
            if corte == -1 or corte < inicio + tam // 2:
                corte = texto.rfind(" ", inicio, fin)
            if corte > inicio:
                fin = corte
        chunk = texto[inicio:fin].strip()
        if len(chunk) > 80:
            chunks.append(chunk)
        inicio = fin - solapamiento
    return chunks


# ── Catálogo de libros NUEVOS a indexar ───────────────────────────────────────

def _fmt(path: Path) -> str:
    return path.suffix.lower().lstrip(".")

LIBROS_NUEVOS_CATALOGO = [
    # ── NIETZSCHE — Descargados de web ───────────────
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "El Anticristo",
        "ruta": LIBROS_NUEVOS / "01_Nietzsche_El_Anticristo.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Así habló Zaratustra — edición comentada (Sánchez Pascual)",
        "ruta": LIBROS_NUEVOS / "02_Nietzsche_Asi_hablo_Zaratustra.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Gilles Deleuze",
        "tema": "Nietzsche y la filosofía — recepción francesa",
        "ruta": LIBROS_NUEVOS / "03_Deleuze_Nietzsche_filosofia.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Martin Heidegger",
        "tema": "Nietzsche — recepción alemana, voluntad de poder como metafísica",
        "ruta": LIBROS_NUEVOS / "04_Heidegger_Nietzsche.pdf",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Consideraciones Intempestivas completas — 4 textos",
        "ruta": LIBROS_NUEVOS / "05_Nietzsche_Consideraciones_Intempestivas.pdf",
    },
    # ── NIETZSCHE — Convertidos desde .lit ───────────
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "La genealogía de la moral",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Genealogia_Moral.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "El nacimiento de la tragedia (visión dionisiaca + Sócrates + drama musical)",
        "ruta": LIBROS_NUEVOS / "Nietzsche_El_nacimiento_tragedia.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "La gaya ciencia",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Gaya_Ciencia.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Crepúsculo de los ídolos",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Crepusculo_idolos.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Humano, demasiado humano",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Humano_demasiado_humano.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Aurora (fragmentos)",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Aurora.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Fragmentos póstumos (selección) — voluntad de poder",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Fragmentos_Postumos.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Más allá del bien y del mal",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Mas_alla_bien_mal.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Schopenhauer como educador (Consideración Intempestiva III)",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Schopenhauer_educador.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Sócrates y la tragedia — escritos tempranos",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Socrates_tragedia.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "El drama musical griego — escritos tempranos",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Drama_musical_griego.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Ditirambos de Dionisos",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Ditirambos_Dionisos.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "La filosofía en la época trágica de los griegos",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Filosofia_epoca_tragica.epub",
    },
    {
        "coleccion": "nietzsche",
        "autor": "Friedrich Nietzsche",
        "tema": "Sobre el porvenir de la educación",
        "ruta": LIBROS_NUEVOS / "Nietzsche_Porvenir_educacion.epub",
    },
    # ── MARX — Descargados de web ────────────────────
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "El Capital, vol. I — teoría del valor, plusvalía, acumulación",
        "ruta": LIBROS_NUEVOS / "06_Marx_El_Capital_Vol1.pdf",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx / Friedrich Engels",
        "tema": "La ideología alemana — materialismo histórico",
        "ruta": LIBROS_NUEVOS / "07_Marx_Engels_Ideologia_Alemana.pdf",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "Tesis sobre Feuerbach",
        "ruta": LIBROS_NUEVOS / "08_Marx_Tesis_Feuerbach.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "El dieciocho brumario de Luis Bonaparte — teoría del Estado",
        "ruta": LIBROS_NUEVOS / "09_Marx_Dieciocho_Brumario.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "La guerra civil en Francia — Estado, Comuna de París",
        "ruta": LIBROS_NUEVOS / "10_Marx_Guerra_Civil_Francia.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "Crítica de la filosofía del derecho de Hegel — ruptura con Hegel",
        "ruta": LIBROS_NUEVOS / "11_Marx_Critica_Derecho_Hegel.pdf",
    },
    # ── MARX — Convertidos desde .lit ────────────────
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "Manuscritos de 1844 — El trabajo enajenado (alienación)",
        "ruta": LIBROS_NUEVOS / "Marx_Trabajo_enajenado.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "Manifiesto del Partido Comunista",
        "ruta": LIBROS_NUEVOS / "Marx_Manifiesto_Comunista.epub",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Karl Marx",
        "tema": "Selección de textos",
        "ruta": LIBROS_NUEVOS / "Marx_Seleccion_textos.epub",
    },
    # ── HEGEL ────────────────────────────────────────
    {
        "coleccion": "karl-marx",
        "autor": "G.W.F. Hegel",
        "tema": "Fenomenología del Espíritu — Prólogo + cap. IV (autoconciencia, dialéctica amo/esclavo)",
        "ruta": LIBROS_NUEVOS / "12_Hegel_Fenomenologia_Espiritu.pdf",
    },
    # ── MARXISMOS POSTERIORES ────────────────────────
    {
        "coleccion": "karl-marx",
        "autor": "V.I. Lenin",
        "tema": "El Estado y la revolución — marxismo leninista",
        "ruta": LIBROS_NUEVOS / "13_Lenin_Estado_Revolucion.pdf",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Antonio Gramsci",
        "tema": "Cuadernos de la cárcel (Antología ed. Sacristán) — hegemonía cultural",
        "ruta": LIBROS_NUEVOS / "14_Gramsci_Cuadernos_Carcel.pdf",
    },
    {
        "coleccion": "karl-marx",
        "autor": "Louis Althusser / Étienne Balibar",
        "tema": "Para leer El Capital — marxismo estructuralista",
        "ruta": LIBROS_NUEVOS / "15_Althusser_Para_leer_Capital.pdf",
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
    print("🚀 Mathós — Indexación de NUEVA literatura de Filosofía en TurboVec")
    print("=" * 60)

    try:
        from services.embeddings import agregar_texto
    except ImportError as e:
        print(f"❌ No se puede importar embeddings service: {e}")
        print("   Ejecuta desde la raíz de Mathos o activa la venv del backend.")
        sys.exit(1)

    stats: dict[str, int] = {}

    for libro in LIBROS_NUEVOS_CATALOGO:
        col = libro["coleccion"]
        print(f"\n[{col}] {libro['tema']} — {libro['autor']}")
        n = indexar_libro(libro, agregar_texto)
        stats[col] = stats.get(col, 0) + n

    print("\n" + "=" * 60)
    print("📊 Resumen:")
    for col, total in stats.items():
        print(f"   {col}: {total} chunks indexados")
    print("\n✅ Indexación de nuevos textos completada.")


if __name__ == "__main__":
    main()
