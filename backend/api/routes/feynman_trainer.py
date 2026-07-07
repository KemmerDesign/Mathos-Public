"""
Mathós — Router de entrenamiento Feynman.

Endpoints:
  POST /api/v1/feynman/evaluar     — Evalúa una explicación estilo Feynman
  GET  /api/v1/feynman/ejemplos    — Obtiene ejemplos de analogías para un tema
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.feynman_trainer import evaluar_feynman, obtener_ejemplos

router = APIRouter()


class FeynmanEvaluarRequest(BaseModel):
    tema_nombre: str = Field(..., min_length=1, max_length=200, description="Nombre del tema académico")
    explicacion: str = Field(..., min_length=20, max_length=3000, description="Explicación del estudiante")
    nivel: str = Field("normal", pattern="^(dummy|normal)$", description="Nivel de evaluación")


class FeynmanEvaluarResponse(BaseModel):
    puntuacion: int
    claridad: int
    analogia: int
    precision: int
    simplicidad: int
    feedback: str
    huecos: list[str]
    aprobado: bool


@router.post(
    "/evaluar",
    response_model=FeynmanEvaluarResponse,
    summary="Evaluar una explicación estilo Feynman",
    description="Evalúa la capacidad del estudiante para explicar un concepto con analogías simples.",
)
async def evaluar_feynman_endpoint(body: FeynmanEvaluarRequest) -> FeynmanEvaluarResponse:
    try:
        result = await evaluar_feynman(
            tema_nombre=body.tema_nombre,
            explicacion_estudiante=body.explicacion,
            nivel=body.nivel,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error evaluando explicación: {e}")

    return FeynmanEvaluarResponse(
        puntuacion=result.get("puntuacion", 0),
        claridad=result.get("claridad", 0),
        analogia=result.get("analogia", 0),
        precision=result.get("precision", 0),
        simplicidad=result.get("simplicidad", 0),
        feedback=result.get("feedback", ""),
        huecos=result.get("huecos", []),
        aprobado=result.get("aprobado", False),
    )


@router.get(
    "/ejemplos",
    summary="Obtener ejemplos de analogías para un tema",
    description="Devuelve ejemplos de analogías Feynman para inspirar al estudiante.",
)
async def ejemplos_feynman_endpoint(
    tema: str = Query(..., min_length=1, description="Nombre del tema"),
):
    ejemplos = obtener_ejemplos(tema)
    return {
        "tema": tema,
        "ejemplos": ejemplos,
        "total": len(ejemplos),
    }
