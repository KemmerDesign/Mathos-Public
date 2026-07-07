"""
Mathós — Rutas de Sandbox SQL (Oracle HR schema).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.sandbox_sql_service import (
    ejecutar_sql,
    analizar_sql_con_ia,
    get_schema_info,
)

router = APIRouter()


class EjecutarSQLRequest(BaseModel):
    sql: str
    tema_nombre: Optional[str] = ""
    analizar_con_ia: bool = False


@router.post("/ejecutar")
async def ejecutar_sql_endpoint(req: EjecutarSQLRequest):
    """Ejecuta SQL contra el sandbox HR y opcionalmente lo analiza con IA."""
    sql = req.sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="El SQL no puede estar vacío.")
    if len(sql) > 5000:
        raise HTTPException(status_code=400, detail="SQL demasiado largo (máx. 5000 caracteres).")

    resultado = ejecutar_sql(sql)

    analisis = None
    if req.analizar_con_ia:
        analisis = await analizar_sql_con_ia(sql, resultado, req.tema_nombre)

    return {
        "resultado": resultado,
        "analisis_ia": analisis,
    }


@router.post("/analizar")
async def analizar_sql_endpoint(req: EjecutarSQLRequest):
    """Solo análisis IA sin ejecutar (útil para PL/SQL)."""
    sql = req.sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="El SQL no puede estar vacío.")

    analisis = await analizar_sql_con_ia(sql, {}, req.tema_nombre)
    return {"analisis_ia": analisis}


@router.get("/schema")
async def get_schema():
    """Devuelve el esquema HR disponible en el sandbox."""
    return get_schema_info()
