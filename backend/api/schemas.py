"""Mathós — Pydantic schemas for API requests / responses."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# Materia
# ──────────────────────────────────────────────
class MateriaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=255)
    codigo_uned: Optional[str] = None
    curso: int = Field(..., ge=1, le=6)
    semestre: int = Field(..., ge=1, le=2)
    descripcion: Optional[str] = None
    activo: bool = True
    categoria: str = "carrera"
    sandbox_tipo: str = "cpp"


class MateriaResponse(BaseModel):
    id: str
    nombre: str
    codigo_uned: Optional[str]
    curso: int
    semestre: int
    descripcion: Optional[str]
    activo: bool
    categoria: str = "carrera"
    sandbox_tipo: str = "cpp"
    created_at: datetime

    model_config = {"from_attributes": True}


class MateriaItem(BaseModel):
    """Compact materia info for list endpoints."""
    id: str
    nombre: str
    codigo_uned: Optional[str]
    curso: int
    semestre: int
    activo: bool
    categoria: str = "carrera"
    sandbox_tipo: str = "cpp"

    model_config = {"from_attributes": True}


class MateriaList(BaseModel):
    materias: list[MateriaItem]
    total: int


class TemaEnMateria(BaseModel):
    id: str
    nombre: str
    orden: int
    descripcion: Optional[str]
    nivel_dominio: str = "no_iniciado"
    puntuacion: float = 0.0

    model_config = {"from_attributes": True}


class MateriaDetalle(BaseModel):
    """Materia detail with temas and their dominio level."""
    id: str
    nombre: str
    codigo_uned: Optional[str]
    curso: int
    semestre: int
    descripcion: Optional[str]
    activo: bool
    categoria: str = "carrera"
    sandbox_tipo: str = "cpp"
    created_at: datetime
    temas: list[TemaEnMateria]

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Tema
# ──────────────────────────────────────────────
class TemaCreate(BaseModel):
    materia_id: str
    nombre: str = Field(..., min_length=1, max_length=255)
    orden: int = Field(..., ge=1)
    descripcion: Optional[str] = None


class TemaResponse(BaseModel):
    id: str
    materia_id: str
    nombre: str
    orden: int
    descripcion: Optional[str]
    nivel_dominio: str = "no_iniciado"
    created_at: datetime

    model_config = {"from_attributes": True}


class TemaList(BaseModel):
    temas: list[TemaResponse]
    total: int


# ──────────────────────────────────────────────
# Sesion de Estudio
# ──────────────────────────────────────────────
class SesionCreate(BaseModel):
    materia_id: Optional[str] = None  # Opcional — se deriva del tema si se omite
    tema_id: Optional[str] = None
    tipo: str = Field(
        ..., pattern=r"^(lectura|test|ejercicio|chat|sandbox)$"
    )
    duracion_minutos: Optional[int] = None
    nota: Optional[dict] = None
    puntuacion: Optional[float] = None  # 0-100, para actualizar dominio


class SesionResponse(BaseModel):
    id: str
    materia_id: str
    tema_id: Optional[str]
    tipo: str
    duracion_minutos: Optional[int]
    nota: Optional[dict]
    nivel_dominio: Optional[str] = None  # Nivel actualizado tras esta sesión
    puntuacion: Optional[float] = None   # Puntuación máxima histórica del tema
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Test
# ──────────────────────────────────────────────
class TestCreateRequest(BaseModel):
    """Request to generate a test for a topic."""
    tipo: str = Field(
        default="practica",
        pattern=r"^(evaluacion|practica|repaso)$",
    )
    num_preguntas: int = Field(default=5, ge=1, le=20)


class TestResponderRequest(BaseModel):
    """Submit answers for a test."""
    respuestas: dict


class TestResponse(BaseModel):
    id: str
    tema_id: str
    tipo: str
    preguntas: dict
    respuestas_usuario: Optional[dict]
    puntuacion: Optional[Decimal]
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Consulta al asistente
# ──────────────────────────────────────────────
class ConsultaRequest(BaseModel):
    pregunta: str = Field(..., min_length=1)
    tema_id: Optional[str] = None


class ConsultaResponse(BaseModel):
    id: str
    pregunta: str
    respuesta: str
    fuentes: Optional[list]
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────────────────────────────────────
# Progreso y dominio
# ──────────────────────────────────────────────
class DominioResponse(BaseModel):
    tema_id: str
    tema_nombre: str
    nivel: str
    tests_superados: int
    tests_fallados: int
    ejercicios_resueltos: int
    ultimo_estudio: Optional[datetime]
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProgresoMateria(BaseModel):
    materia_id: str
    materia_nombre: str
    total_temas: int
    temas_dominados: int
    temas_en_curso: int
    temas_no_iniciados: int
    porcentaje: float = 0.0  # 0-100, calculado como (temas_dominados + temas_en_curso*0.5) / total_temas * 100
    tests_superados: int
    tests_fallados: int
    tiempo_total_minutos: int
    temas: list[DominioResponse]


class ProgresoResponse(BaseModel):
    materias: list[ProgresoMateria]
    total_tests_superados: int
    total_tiempo_minutos: int


# ──────────────────────────────────────────────
# Cerebro (Obsidian)
# ──────────────────────────────────────────────
class CerebroNotaCreate(BaseModel):
    id: str
    title: str
    content: str
    category: str = "general"
    parent_folder: str = "/"
    x: float = 250.0
    y: float = 200.0
    materia_id: Optional[str] = None
    tema_id: Optional[str] = None


class CerebroNotaUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    parent_folder: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    materia_id: Optional[str] = None
    tema_id: Optional[str] = None


class CerebroNotaResponse(BaseModel):
    id: str
    title: str
    content: str
    category: str
    parent_folder: str
    x: float
    y: float
    materia_id: Optional[str] = None
    tema_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CerebroEnlaceCreate(BaseModel):
    source_id: str
    target_id: str


class CerebroEnlaceResponse(BaseModel):
    id: str
    source_id: str
    target_id: str

    model_config = {"from_attributes": True}


class CerebroSyncRequest(BaseModel):
    notas: list[CerebroNotaCreate]
    enlaces: list[CerebroEnlaceCreate]
