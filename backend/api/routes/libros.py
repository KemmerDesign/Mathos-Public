"""
Mathós — Router de la Biblioteca y Lector de Libros.

Endpoints:
  GET  /api/v1/libros                        — lista todos los libros
  POST /api/v1/libros/upload                 — sube un archivo epub/pdf y lo registra
  POST /api/v1/libros/registrar              — registra un libro por ruta en disco
  POST /api/v1/libros/seed                   — pre-registra libros de filosofía indexados
  GET  /api/v1/libros/{id}                   — detalle del libro
  GET  /api/v1/libros/{id}/archivo           — sirve el archivo (epub/pdf)
  PATCH /api/v1/libros/{id}/progreso         — guarda progreso de lectura
  GET  /api/v1/libros/{id}/anotaciones       — lista anotaciones del libro
  POST /api/v1/libros/{id}/anotaciones       — crea anotación (highlight/nota/bookmark)
  DELETE /api/v1/libros/anotaciones/{ann_id} — elimina anotación
"""

from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Optional
import shutil

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Anotacion, Libro
from shared.database import get_session
from shared.settings import settings

router = APIRouter()

# Directorio donde se guardarán los libros subidos por el usuario.
# Configurable vía variable de entorno UPLOADS_DIR (ver backend/api/shared/settings.py).
UPLOADS_DIR = settings.UPLOADS_DIR_ABSOLUTE
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

FILOSOFIA_BASE = Path(__file__).resolve().parent.parent.parent / "filosofia_textos"
# LIBROS_BASE: configurable via LIBROS_PATH env var or default relative path
LIBROS_BASE = Path(os.getenv("LIBROS_PATH", str(Path(__file__).resolve().parent.parent.parent / "libros")))

# Catálogo completo — filosofia_textos/ (32 libros) + colección general
_CATALOGO_FILOSOFIA = [
    # ── NIETZSCHE: textos propios ──────────────────────────────────────────────
    {
        "titulo": "El Anticristo",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#7C3AED",
        "descripcion": "Crítica fulminante al cristianismo. Nietzsche destruye los valores de la moral judeo-cristiana y propone la transvaloración.",
        "ruta": str(FILOSOFIA_BASE / "01_Nietzsche_El_Anticristo.pdf"),
    },
    {
        "titulo": "Así habló Zaratustra",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#6D28D9",
        "descripcion": "La obra cumbre. Zaratustra anuncia el Übermensch, la muerte de Dios y el eterno retorno.",
        "ruta": str(FILOSOFIA_BASE / "02_Nietzsche_Asi_hablo_Zaratustra.pdf"),
    },
    {
        "titulo": "La genealogía de la moral",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#5B21B6",
        "descripcion": "Historia crítica de los valores morales: resentimiento, mala conciencia e ideal ascético.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Genealogia_Moral.epub"),
    },
    {
        "titulo": "Más allá del bien y del mal",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#7E22CE",
        "descripcion": "Crítica al dogmatismo filosófico. El perspectivismo y la voluntad de poder como fundamento.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Mas_alla_bien_mal.epub"),
    },
    {
        "titulo": "El nacimiento de la tragedia",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#4C1D95",
        "descripcion": "La oposición entre lo apolíneo y lo dionisíaco. Obra temprana con influencia de Schopenhauer y Wagner.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_El_nacimiento_tragedia.epub"),
    },
    {
        "titulo": "La gaya ciencia",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#8B5CF6",
        "descripcion": "La proclama de la muerte de Dios. Arte, conocimiento y la filosofía del eterno retorno.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Gaya_Ciencia.epub"),
    },
    {
        "titulo": "Crepúsculo de los ídolos",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#9333EA",
        "descripcion": "Crítica a la filosofía occidental. Nietzsche derriba a Sócrates, Platón, Kant y el positivismo.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Crepusculo_idolos.epub"),
    },
    {
        "titulo": "Humano, demasiado humano",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#A855F7",
        "descripcion": "Ruptura con Wagner y Schopenhauer. Filosofía positivista, aforística y psicológica.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Humano_demasiado_humano.epub"),
    },
    {
        "titulo": "Aurora",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#C026D3",
        "descripcion": "Pensamientos sobre los prejuicios morales. Preámbulo a la filosofía de la transvaloración.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Aurora.epub"),
    },
    {
        "titulo": "Fragmentos póstumos",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#7C3AED",
        "descripcion": "Apuntes del período 1885-1889. Contienen la elaboración más sistemática de la voluntad de poder.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Fragmentos_Postumos.epub"),
    },
    {
        "titulo": "Schopenhauer como educador",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#6D28D9",
        "descripcion": "Consideración intempestiva sobre el filósofo como modelo de vida auténtica.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Schopenhauer_educador.epub"),
    },
    {
        "titulo": "Sócrates y la tragedia",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#5B21B6",
        "descripcion": "Conferencia temprana donde Nietzsche opone la racionalidad socrática al instinto trágico griego.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Socrates_tragedia.epub"),
    },
    {
        "titulo": "El drama musical griego",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#4C1D95",
        "descripcion": "Análisis del drama musical como síntesis de artes. Reflexión sobre Wagner y el ideal dionisíaco.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Drama_musical_griego.epub"),
    },
    {
        "titulo": "Ditirambos de Dioniso",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#7E22CE",
        "descripcion": "Poemas de la época final de Nietzsche. La expresión más pura del pathos dionisíaco.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Ditirambos_Dionisos.epub"),
    },
    {
        "titulo": "La filosofía en la época trágica de los griegos",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#8B5CF6",
        "descripcion": "Sobre los presocráticos. Nietzsche interpreta a Tales, Heráclito, Parménides y Anaxágoras.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Filosofia_epoca_tragica.epub"),
    },
    {
        "titulo": "El porvenir de nuestras instituciones educativas",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#9333EA",
        "descripcion": "Crítica al sistema educativo alemán y propuesta de una educación para la cultura superior.",
        "ruta": str(FILOSOFIA_BASE / "Nietzsche_Porvenir_educacion.epub"),
    },
    {
        "titulo": "Consideraciones intempestivas",
        "autor": "Friedrich Nietzsche",
        "coleccion_rag": "nietzsche",
        "color_portada": "#A855F7",
        "descripcion": "Cuatro ensayos críticos sobre la cultura alemana contemporánea. Incluye 'Sobre la utilidad y el perjuicio de la historia'.",
        "ruta": str(FILOSOFIA_BASE / "05_Nietzsche_Consideraciones_Intempestivas.pdf"),
    },
    # ── NIETZSCHE: comentaristas ───────────────────────────────────────────────
    {
        "titulo": "Nietzsche y la filosofía",
        "autor": "Gilles Deleuze",
        "coleccion_rag": "nietzsche",
        "color_portada": "#C026D3",
        "descripcion": "La lectura de Deleuze: voluntad de poder como diferencia, eterno retorno como selección.",
        "ruta": str(FILOSOFIA_BASE / "03_Deleuze_Nietzsche_filosofia.pdf"),
    },
    {
        "titulo": "Nietzsche (dos volúmenes)",
        "autor": "Martin Heidegger",
        "coleccion_rag": "nietzsche",
        "color_portada": "#7C3AED",
        "descripcion": "La interpretación heideggeriana: Nietzsche como culminación de la metafísica occidental.",
        "ruta": str(FILOSOFIA_BASE / "04_Heidegger_Nietzsche.pdf"),
    },
    # ── MARX: textos propios ───────────────────────────────────────────────────
    {
        "titulo": "El Capital, Volumen I",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#B91C1C",
        "descripcion": "La crítica de la economía política. Mercancía, plusvalor, acumulación primitiva del capital.",
        "ruta": str(FILOSOFIA_BASE / "06_Marx_El_Capital_Vol1.pdf"),
    },
    {
        "titulo": "La ideología alemana",
        "autor": "Karl Marx y Friedrich Engels",
        "coleccion_rag": "karl-marx",
        "color_portada": "#991B1B",
        "descripcion": "Fundación del materialismo histórico. Crítica de Feuerbach, Bauer y Stirner.",
        "ruta": str(FILOSOFIA_BASE / "07_Marx_Engels_Ideologia_Alemana.pdf"),
    },
    {
        "titulo": "Tesis sobre Feuerbach",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#DC2626",
        "descripcion": "Once tesis programáticas. La undécima: 'los filósofos solo han interpretado el mundo; de lo que se trata es de transformarlo'.",
        "ruta": str(FILOSOFIA_BASE / "08_Marx_Tesis_Feuerbach.epub"),
    },
    {
        "titulo": "El 18 Brumario de Luis Bonaparte",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#EF4444",
        "descripcion": "Análisis del golpe de Estado de 1851. Marx aplica el materialismo histórico a un evento concreto.",
        "ruta": str(FILOSOFIA_BASE / "09_Marx_Dieciocho_Brumario.epub"),
    },
    {
        "titulo": "La guerra civil en Francia",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#F97316",
        "descripcion": "Análisis de la Comuna de París (1871). La primera dictadura del proletariado según Marx.",
        "ruta": str(FILOSOFIA_BASE / "10_Marx_Guerra_Civil_Francia.epub"),
    },
    {
        "titulo": "Crítica de la filosofía del derecho de Hegel",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#EA580C",
        "descripcion": "El joven Marx rompe con el idealismo hegeliano. Primera formulación del materialismo y la emancipación.",
        "ruta": str(FILOSOFIA_BASE / "11_Marx_Critica_Derecho_Hegel.pdf"),
    },
    {
        "titulo": "Trabajo enajenado",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#B91C1C",
        "descripcion": "Manuscritos económico-filosóficos de 1844. El concepto de alienación en el trabajo capitalista.",
        "ruta": str(FILOSOFIA_BASE / "Marx_Trabajo_enajenado.epub"),
    },
    {
        "titulo": "Manifiesto del Partido Comunista",
        "autor": "Karl Marx y Friedrich Engels",
        "coleccion_rag": "karl-marx",
        "color_portada": "#991B1B",
        "descripcion": "El texto político más influyente del siglo XIX. Historia de clases y llamada a la revolución proletaria.",
        "ruta": str(FILOSOFIA_BASE / "Marx_Manifiesto_Comunista.epub"),
    },
    {
        "titulo": "Selección de textos",
        "autor": "Karl Marx",
        "coleccion_rag": "karl-marx",
        "color_portada": "#DC2626",
        "descripcion": "Antología de escritos de Marx. Textos sobre alienación, Estado, economía y materialismo.",
        "ruta": str(FILOSOFIA_BASE / "Marx_Seleccion_textos.epub"),
    },
    # ── MARX: contexto filosófico ──────────────────────────────────────────────
    {
        "titulo": "Fenomenología del espíritu",
        "autor": "Georg Wilhelm Friedrich Hegel",
        "coleccion_rag": "karl-marx",
        "color_portada": "#EF4444",
        "descripcion": "La obra magna del idealismo alemán. Fundamento filosófico que Marx invirtió para crear el materialismo histórico.",
        "ruta": str(FILOSOFIA_BASE / "12_Hegel_Fenomenologia_Espiritu.pdf"),
    },
    {
        "titulo": "El Estado y la revolución",
        "autor": "Vladimir Ilich Lenin",
        "coleccion_rag": "karl-marx",
        "color_portada": "#F97316",
        "descripcion": "La teoría marxista del Estado. Lenin desarrolla a Marx y Engels sobre la dictadura del proletariado.",
        "ruta": str(FILOSOFIA_BASE / "13_Lenin_Estado_Revolucion.pdf"),
    },
    {
        "titulo": "Cuadernos de la cárcel",
        "autor": "Antonio Gramsci",
        "coleccion_rag": "karl-marx",
        "color_portada": "#EA580C",
        "descripcion": "Hegemonía cultural, intelectuales orgánicos y guerra de posiciones. Marxismo occidental.",
        "ruta": str(FILOSOFIA_BASE / "14_Gramsci_Cuadernos_Carcel.pdf"),
    },
    {
        "titulo": "Para leer El Capital",
        "autor": "Louis Althusser",
        "coleccion_rag": "karl-marx",
        "color_portada": "#B91C1C",
        "descripcion": "Lectura sintomática de El Capital. Althusser y la ruptura epistemológica entre el joven y el maduro Marx.",
        "ruta": str(FILOSOFIA_BASE / "15_Althusser_Para_leer_Capital.pdf"),
    },
]


# ──────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────

class LibroOut(BaseModel):
    id: str
    titulo: str
    autor: Optional[str]
    formato: str
    coleccion_rag: Optional[str]
    materia_id: Optional[str]
    color_portada: str
    descripcion: Optional[str]
    cfi_actual: Optional[str]
    porcentaje_leido: float
    ultima_lectura: Optional[datetime]
    created_at: datetime
    total_anotaciones: int = 0


class LibroListOut(BaseModel):
    libros: list[LibroOut]
    total: int


class RegistrarLibroRequest(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=400)
    autor: Optional[str] = None
    ruta_archivo: str = Field(..., description="Ruta absoluta al archivo epub/pdf en disco")
    coleccion_rag: Optional[str] = None
    materia_id: Optional[str] = None
    color_portada: str = Field(default="#6A45DE")
    descripcion: Optional[str] = None


class ProgresoRequest(BaseModel):
    cfi_actual: Optional[str] = None
    porcentaje_leido: float = Field(ge=0, le=100)


class AnotacionRequest(BaseModel):
    tipo: str = Field(default="highlight", pattern="^(highlight|note|bookmark)$")
    texto_seleccionado: Optional[str] = None
    nota: Optional[str] = None
    color: str = Field(default="yellow", pattern="^(yellow|green|blue|red|purple)$")
    cfi: Optional[str] = None
    capitulo: Optional[str] = None


class AnotacionOut(BaseModel):
    id: str
    libro_id: str
    tipo: str
    texto_seleccionado: Optional[str]
    nota: Optional[str]
    color: str
    cfi: Optional[str]
    capitulo: Optional[str]
    creado_at: datetime


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _detect_format(path: str) -> str:
    ext = Path(path).suffix.lower().lstrip(".")
    return ext if ext in ("epub", "pdf") else "epub"


async def _libro_to_out(libro: Libro, session: AsyncSession) -> LibroOut:
    count_res = await session.execute(
        select(Anotacion).where(Anotacion.libro_id == libro.id)
    )
    total = len(count_res.scalars().all())
    return LibroOut(
        id=libro.id,
        titulo=libro.titulo,
        autor=libro.autor,
        formato=libro.formato,
        coleccion_rag=libro.coleccion_rag,
        materia_id=libro.materia_id,
        color_portada=libro.color_portada,
        descripcion=libro.descripcion,
        cfi_actual=libro.cfi_actual,
        porcentaje_leido=float(libro.porcentaje_leido or 0),
        ultima_lectura=libro.ultima_lectura,
        created_at=libro.created_at,
        total_anotaciones=total,
    )


# ──────────────────────────────────────────────
# Endpoints — Libros
# ──────────────────────────────────────────────

@router.get("", response_model=LibroListOut, summary="Listar todos los libros")
async def listar_libros(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Libro).order_by(Libro.created_at))
    libros = result.scalars().all()
    out = []
    for libro in libros:
        out.append(await _libro_to_out(libro, session))
    return LibroListOut(libros=out, total=len(out))



@router.post("/upload", response_model=LibroOut, summary="Subir archivo epub/pdf y registrarlo")
async def upload_libro(
    archivo: UploadFile = File(..., description="Archivo .epub o .pdf"),
    titulo: str = Form(..., min_length=1, max_length=400),
    autor: Optional[str] = Form(None),
    coleccion_rag: Optional[str] = Form(None),
    color_portada: str = Form("#6A45DE"),
    descripcion: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_session),
):
    """Acepta un archivo epub/pdf via multipart, lo guarda en uploads/ y lo registra en la BD."""
    # Validar extensión
    extension = Path(archivo.filename or "").suffix.lower()
    if extension not in (".epub", ".pdf"):
        raise HTTPException(
            status_code=422,
            detail=f"Formato no soportado '{extension}'. Solo se aceptan .epub y .pdf"
        )

    # Construir nombre seguro y ruta destino
    nombre_seguro = "".join(
        c if c.isalnum() or c in "._-" else "_"
        for c in (archivo.filename or f"libro{extension}")
    )
    destino = UPLOADS_DIR / nombre_seguro

    # Si ya existe el archivo con ese nombre, añadir sufijo numérico
    if destino.exists():
        stem = destino.stem
        suffix = destino.suffix
        i = 1
        while destino.exists():
            destino = UPLOADS_DIR / f"{stem}_{i}{suffix}"
            i += 1

    # Guardar el archivo en disco
    try:
        with destino.open("wb") as f:
            shutil.copyfileobj(archivo.file, f)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al guardar el archivo: {exc}")
    finally:
        await archivo.close()

    # Registrar en la base de datos
    libro = Libro(
        titulo=titulo,
        autor=autor or None,
        formato=_detect_format(str(destino)),
        ruta_archivo=str(destino),
        coleccion_rag=coleccion_rag or None,
        color_portada=color_portada,
        descripcion=descripcion or None,
    )
    session.add(libro)
    await session.flush()
    return await _libro_to_out(libro, session)


@router.post("/registrar", response_model=LibroOut, summary="Registrar libro por ruta en disco")
async def registrar_libro(
    body: RegistrarLibroRequest,
    session: AsyncSession = Depends(get_session),
):
    ruta = Path(body.ruta_archivo)
    if not ruta.exists():
        raise HTTPException(status_code=404, detail=f"Archivo no encontrado: {body.ruta_archivo}")

    # Verificar que no esté ya registrado por la misma ruta
    existing = await session.execute(
        select(Libro).where(Libro.ruta_archivo == str(ruta))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Este archivo ya está registrado en la biblioteca")

    libro = Libro(
        titulo=body.titulo,
        autor=body.autor,
        formato=_detect_format(body.ruta_archivo),
        ruta_archivo=str(ruta),
        coleccion_rag=body.coleccion_rag,
        materia_id=body.materia_id,
        color_portada=body.color_portada,
        descripcion=body.descripcion,
    )
    session.add(libro)
    await session.flush()
    return await _libro_to_out(libro, session)


@router.post("/seed", summary="Pre-registrar libros de filosofía indexados en RAG")
async def seed_libros(session: AsyncSession = Depends(get_session)):
    """Registra automáticamente los libros de filosofía ya indexados. Idempotente."""
    registrados, omitidos, no_encontrados = [], [], []

    for item in _CATALOGO_FILOSOFIA:
        ruta = Path(item["ruta"])
        if not ruta.exists():
            no_encontrados.append(item["titulo"])
            continue

        existing = await session.execute(
            select(Libro).where(Libro.ruta_archivo == str(ruta))
        )
        if existing.scalar_one_or_none():
            omitidos.append(item["titulo"])
            continue

        libro = Libro(
            titulo=item["titulo"],
            autor=item.get("autor"),
            formato=_detect_format(item["ruta"]),
            ruta_archivo=str(ruta),
            coleccion_rag=item.get("coleccion_rag"),
            color_portada=item.get("color_portada", "#6A45DE"),
            descripcion=item.get("descripcion"),
        )
        session.add(libro)
        registrados.append(item["titulo"])

    await session.flush()
    return {
        "registrados": registrados,
        "ya_existian": omitidos,
        "no_encontrados": no_encontrados,
    }


@router.get("/{libro_id}", response_model=LibroOut, summary="Detalle de un libro")
async def detalle_libro(libro_id: str, session: AsyncSession = Depends(get_session)):
    libro = await session.get(Libro, libro_id)
    if not libro:
        raise HTTPException(status_code=404, detail="Libro no encontrado")
    return await _libro_to_out(libro, session)


@router.get("/{libro_id}/archivo", summary="Servir el archivo epub/pdf")
async def servir_archivo(libro_id: str, session: AsyncSession = Depends(get_session)):
    """Sirve el archivo directamente. GET — no requiere X-API-Key."""
    libro = await session.get(Libro, libro_id)
    if not libro:
        raise HTTPException(status_code=404, detail="Libro no encontrado")

    ruta = Path(libro.ruta_archivo)
    if not ruta.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    if libro.formato == "epub":
        # epub.js lo descarga como binario — attachment está bien
        return FileResponse(
            path=str(ruta),
            media_type="application/epub+zip",
            filename=ruta.name,
            headers={"Accept-Ranges": "bytes"},
        )
    else:
        # PDF: inline para que el iframe del navegador lo muestre sin descargar
        return FileResponse(
            path=str(ruta),
            media_type="application/pdf",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Disposition": f'inline; filename="{ruta.name}"',
            },
        )


@router.patch("/{libro_id}/progreso", summary="Guardar progreso de lectura")
async def guardar_progreso(
    libro_id: str,
    body: ProgresoRequest,
    session: AsyncSession = Depends(get_session),
):
    libro = await session.get(Libro, libro_id)
    if not libro:
        raise HTTPException(status_code=404, detail="Libro no encontrado")

    libro.cfi_actual = body.cfi_actual
    libro.porcentaje_leido = body.porcentaje_leido
    libro.ultima_lectura = datetime.now(timezone.utc)
    await session.flush()
    return {"ok": True, "porcentaje_leido": body.porcentaje_leido}


# ──────────────────────────────────────────────
# Endpoints — Anotaciones
# ──────────────────────────────────────────────

@router.get("/{libro_id}/anotaciones", response_model=list[AnotacionOut])
async def listar_anotaciones(libro_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Anotacion)
        .where(Anotacion.libro_id == libro_id)
        .order_by(Anotacion.creado_at)
    )
    ann = result.scalars().all()
    return [
        AnotacionOut(
            id=a.id, libro_id=a.libro_id, tipo=a.tipo,
            texto_seleccionado=a.texto_seleccionado, nota=a.nota,
            color=a.color, cfi=a.cfi, capitulo=a.capitulo, creado_at=a.creado_at,
        )
        for a in ann
    ]


@router.post("/{libro_id}/anotaciones", response_model=AnotacionOut, summary="Crear anotación")
async def crear_anotacion(
    libro_id: str,
    body: AnotacionRequest,
    session: AsyncSession = Depends(get_session),
):
    libro = await session.get(Libro, libro_id)
    if not libro:
        raise HTTPException(status_code=404, detail="Libro no encontrado")

    ann = Anotacion(
        libro_id=libro_id,
        tipo=body.tipo,
        texto_seleccionado=body.texto_seleccionado,
        nota=body.nota,
        color=body.color,
        cfi=body.cfi,
        capitulo=body.capitulo,
    )
    session.add(ann)
    await session.flush()
    return AnotacionOut(
        id=ann.id, libro_id=ann.libro_id, tipo=ann.tipo,
        texto_seleccionado=ann.texto_seleccionado, nota=ann.nota,
        color=ann.color, cfi=ann.cfi, capitulo=ann.capitulo, creado_at=ann.creado_at,
    )


@router.delete("/anotaciones/{ann_id}", summary="Eliminar anotación")
async def eliminar_anotacion(ann_id: str, session: AsyncSession = Depends(get_session)):
    ann = await session.get(Anotacion, ann_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Anotación no encontrada")
    await session.delete(ann)
    await session.flush()
    return {"ok": True}
