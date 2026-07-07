"""Mathós — API router for materias (subjects)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Dominio, Materia, SesionEstudio, Tema
from schemas import (
    DominioResponse,
    MateriaCreate,
    MateriaDetalle,
    MateriaItem,
    MateriaList,
    MateriaResponse,
    ProgresoMateria,
    TemaEnMateria,
    TemaList,
    TemaResponse,
)
from shared.auth import require_role
from shared.database import get_session

router = APIRouter()


# ──────────────────────────────────────────────
# GET /api/v1/materias — listar materias
# ──────────────────────────────────────────────
@router.get("", response_model=MateriaList)
async def listar_materias(
    activo: bool = Query(None, description="Filter by active status"),
    session: AsyncSession = Depends(get_session),
):
    """List all subjects, with optional active filter."""
    query = select(Materia).order_by(Materia.curso, Materia.semestre, Materia.nombre)
    if activo is not None:
        query = query.where(Materia.activo == activo)

    result = await session.execute(query)
    materias = result.scalars().all()

    items = [MateriaItem.model_validate(m) for m in materias]
    return MateriaList(materias=items, total=len(items))


# ──────────────────────────────────────────────
# GET /api/v1/materias/{id} — detalle de materia
# ──────────────────────────────────────────────
@router.get("/{id}", response_model=MateriaDetalle)
async def obtener_materia(
    id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get subject detail with its topics and dominio levels."""
    query = (
        select(Materia)
        .options(selectinload(Materia.temas).selectinload(Tema.dominio))
        .where(Materia.id == id)
    )
    result = await session.execute(query)
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    temas_out = []
    for t in sorted(materia.temas, key=lambda x: x.orden):
        nivel = "no_iniciado"
        puntuacion = 0.0
        if t.dominio:
            nivel = t.dominio.nivel
            puntuacion = float(t.dominio.puntuacion_maxima or 0)
        temas_out.append(
            TemaEnMateria(
                id=t.id,
                nombre=t.nombre,
                orden=t.orden,
                descripcion=t.descripcion,
                nivel_dominio=nivel,
                puntuacion=puntuacion,
            )
        )

    return MateriaDetalle(
        id=materia.id,
        nombre=materia.nombre,
        codigo_uned=materia.codigo_uned,
        curso=materia.curso,
        semestre=materia.semestre,
        descripcion=materia.descripcion,
        activo=materia.activo,
        created_at=materia.created_at,
        temas=temas_out,
    )


# ──────────────────────────────────────────────
# POST /api/v1/materias — crear materia (admin)
# ──────────────────────────────────────────────
@router.post("", response_model=MateriaResponse, status_code=status.HTTP_201_CREATED)
async def crear_materia(
    data: MateriaCreate,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(require_role("admin")),
):
    """Create a new subject. Admin only."""
    materia = Materia(**data.model_dump())
    session.add(materia)
    await session.flush()
    return MateriaResponse.model_validate(materia)


# ──────────────────────────────────────────────
# GET /api/v1/materias/{id}/temas — temas de una materia
# ──────────────────────────────────────────────
@router.get("/{id}/temas", response_model=TemaList)
async def listar_temas_de_materia(
    id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get all topics of a subject with their dominio level."""
    # Verify materia exists
    materia_result = await session.execute(
        select(Materia).where(Materia.id == id)
    )
    materia = materia_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    query = (
        select(Tema)
        .options(selectinload(Tema.dominio))
        .where(Tema.materia_id == id)
        .order_by(Tema.orden)
    )
    result = await session.execute(query)
    temas = result.scalars().all()

    temas_out = []
    temas_sin_dominio = []
    for t in temas:
        nivel = "no_iniciado"
        if t.dominio:
            nivel = t.dominio.nivel
        else:
            temas_sin_dominio.append(t)
        temas_out.append(
            TemaResponse(
                id=t.id,
                materia_id=t.materia_id,
                nombre=t.nombre,
                orden=t.orden,
                descripcion=t.descripcion,
                nivel_dominio=nivel,
                created_at=t.created_at,
            )
        )

    # Inicializar Dominio para temas que aún no tienen registro (idempotente)
    if temas_sin_dominio:
        for t in temas_sin_dominio:
            session.add(Dominio(tema_id=t.id))
        await session.flush()

    return TemaList(temas=temas_out, total=len(temas_out))


# ──────────────────────────────────────────────
# GET /api/v1/materias/{id}/progreso — progreso general
# ──────────────────────────────────────────────
@router.get("/{id}/progreso", response_model=ProgresoMateria)
async def progreso_materia(
    id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get aggregated progress for a subject."""
    materia_result = await session.execute(
        select(Materia).where(Materia.id == id)
    )
    materia = materia_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    # Get all temas with dominio
    query = (
        select(Tema)
        .options(selectinload(Tema.dominio))
        .where(Tema.materia_id == id)
        .order_by(Tema.orden)
    )
    result = await session.execute(query)
    temas = result.scalars().all()

    # Aggregate stats
    total_temas = len(temas)
    temas_dominados = 0
    temas_en_curso = 0
    temas_no_iniciados = 0
    tests_superados = 0
    tests_fallados = 0
    temas_out = []

    for t in temas:
        if t.dominio:
            nivel = t.dominio.nivel
            tests_superados += t.dominio.tests_superados
            tests_fallados += t.dominio.tests_fallados
            if nivel == "dominado":
                temas_dominados += 1
            elif nivel in ("en_curso", "practicando"):
                temas_en_curso += 1
            else:
                temas_no_iniciados += 1
            temas_out.append(
                DominioResponse(
                    tema_id=t.id,
                    tema_nombre=t.nombre,
                    nivel=t.dominio.nivel,
                    tests_superados=t.dominio.tests_superados,
                    tests_fallados=t.dominio.tests_fallados,
                    ejercicios_resueltos=t.dominio.ejercicios_resueltos,
                    ultimo_estudio=t.dominio.ultimo_estudio,
                    updated_at=t.dominio.updated_at,
                )
            )
        else:
            temas_no_iniciados += 1
            temas_out.append(
                DominioResponse(
                    tema_id=t.id,
                    tema_nombre=t.nombre,
                    nivel="no_iniciado",
                    tests_superados=0,
                    tests_fallados=0,
                    ejercicios_resueltos=0,
                    ultimo_estudio=None,
                    updated_at=t.created_at,
                )
            )

    # Total study time
    tiempo_result = await session.execute(
        select(func.coalesce(func.sum(SesionEstudio.duracion_minutos), 0)).where(
            SesionEstudio.materia_id == id
        )
    )
    tiempo_total = tiempo_result.scalar() or 0

    # Calcular porcentaje: dominados pesan 1.0, en_curso/practicando pesan 0.5
    porcentaje = round(
        ((temas_dominados * 1.0 + temas_en_curso * 0.5) / max(total_temas, 1)) * 100, 1
    )

    return ProgresoMateria(
        materia_id=materia.id,
        materia_nombre=materia.nombre,
        total_temas=total_temas,
        temas_dominados=temas_dominados,
        temas_en_curso=temas_en_curso,
        temas_no_iniciados=temas_no_iniciados,
        porcentaje=porcentaje,
        tests_superados=tests_superados,
        tests_fallados=tests_fallados,
        tiempo_total_minutos=tiempo_total,
        temas=temas_out,
    )
