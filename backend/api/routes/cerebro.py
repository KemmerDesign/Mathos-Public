"""Mathós — Rutas de Cerebro (Obsidian-like)."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional

from shared.database import get_session
from models import CerebroNota, CerebroEnlace, Usuario
from schemas import CerebroSyncRequest, CerebroNotaResponse, CerebroEnlaceResponse, CerebroNotaCreate
from shared.auth import get_current_user

router = APIRouter()

@router.get("/sync")
async def get_cerebro_state(
    materia_id: Optional[str] = Query(None, description="Filtrar notas por materia"),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user)
):
    """Obtiene todo el estado (notas y enlaces) del usuario actual, opcionalmente filtrado por materia."""
    stmt = select(CerebroNota).where(CerebroNota.usuario_id == user["sub"])
    if materia_id:
        stmt = stmt.where(CerebroNota.materia_id == materia_id)
    result_notas = await db.execute(stmt)
    notas = result_notas.scalars().all()

    result_enlaces = await db.execute(
        select(CerebroEnlace).where(CerebroEnlace.usuario_id == user["sub"])
    )
    enlaces = result_enlaces.scalars().all()

    return {
        "notas": notas,
        "enlaces": enlaces
    }

@router.post("/sync")
async def sync_cerebro_state(
    data: CerebroSyncRequest,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user)
):
    """Sincroniza el estado completo de Cerebro para el usuario con Upsert granular."""
    
    # 1. Obtener IDs de notas existentes
    result = await db.execute(select(CerebroNota.id).where(CerebroNota.usuario_id == user["sub"]))
    existing_ids = {row for row in result.scalars()}
    
    incoming_ids = {nota.id for nota in data.notas}
    
    # 3. Eliminar notas que ya no están
    ids_to_delete = existing_ids - incoming_ids
    if ids_to_delete:
        await db.execute(delete(CerebroNota).where(CerebroNota.id.in_(ids_to_delete)))
        
    # 4. Upsert de notas
    for nota_data in data.notas:
        if nota_data.id in existing_ids:
            # Update
            result = await db.execute(select(CerebroNota).where(CerebroNota.id == nota_data.id))
            nota = result.scalars().first()
            if nota:
                nota.title = nota_data.title
                nota.content = nota_data.content
                nota.category = nota_data.category
                nota.parent_folder = nota_data.parent_folder
                nota.materia_id = nota_data.materia_id
                nota.tema_id = nota_data.tema_id
                nota.x = nota_data.x
                nota.y = nota_data.y
        else:
            # Insert
            nueva_nota = CerebroNota(
                id=nota_data.id,
                title=nota_data.title,
                content=nota_data.content,
                category=nota_data.category,
                parent_folder=nota_data.parent_folder,
                materia_id=nota_data.materia_id,
                tema_id=nota_data.tema_id,
                x=nota_data.x,
                y=nota_data.y,
                usuario_id=user["sub"]
            )
            db.add(nueva_nota)

    # 4. Upsert granular de enlaces
    result_enlaces = await db.execute(select(CerebroEnlace).where(CerebroEnlace.usuario_id == user["sub"]))
    existing_enlaces = result_enlaces.scalars().all()
    
    existing_link_pairs = {(e.source_id, e.target_id) for e in existing_enlaces}
    incoming_link_pairs = {(e.source_id, e.target_id) for e in data.enlaces}
    
    links_to_delete = existing_link_pairs - incoming_link_pairs
    links_to_insert = incoming_link_pairs - existing_link_pairs
    
    for (src, tgt) in links_to_delete:
        await db.execute(
            delete(CerebroEnlace).where(
                CerebroEnlace.usuario_id == user["sub"],
                CerebroEnlace.source_id == src,
                CerebroEnlace.target_id == tgt
            )
        )
        
    for (src, tgt) in links_to_insert:
        nuevo_enlace = CerebroEnlace(
            source_id=src,
            target_id=tgt,
            usuario_id=user["sub"]
        )
        db.add(nuevo_enlace)

    await db.commit()
    return {"message": "Sincronización completada"}

@router.post("/nota")
async def add_cerebro_nota(
    nota_data: CerebroNotaCreate,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user)
):
    """Añade una única nota a Cerebro sin afectar al resto (Útil para web clippers o el Lector)."""
    # Si la nota ya existe, se podría hacer un upsert, pero en SQLite/Postgres lo ideal es
    # checkear si existe o usar on_conflict_do_update. Para simplificar, hacemos un merge o un select previo.
    result = await db.execute(select(CerebroNota).where(CerebroNota.id == nota_data.id, CerebroNota.usuario_id == user["sub"]))
    existente = result.scalar_one_or_none()
    
    if existente:
        existente.title = nota_data.title
        existente.content = nota_data.content
        existente.category = nota_data.category
        existente.parent_folder = nota_data.parent_folder
        existente.materia_id = nota_data.materia_id
        existente.tema_id = nota_data.tema_id
    else:
        nueva_nota = CerebroNota(
            id=nota_data.id,
            title=nota_data.title,
            content=nota_data.content,
            category=nota_data.category,
            parent_folder=nota_data.parent_folder,
            materia_id=nota_data.materia_id,
            tema_id=nota_data.tema_id,
            x=nota_data.x or 200.0,
            y=nota_data.y or 200.0,
            usuario_id=user["sub"]
        )
        db.add(nueva_nota)
        
    await db.commit()
    return {"message": "Nota añadida o actualizada exitosamente", "id": nota_data.id}
