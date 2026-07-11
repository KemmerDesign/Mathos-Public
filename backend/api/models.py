"""Mathós — SQLAlchemy ORM models.

Materia, Tema, SesionEstudio, Test, Dominio, Consulta.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

# ─── JSONB fallback para SQLite ─────────────────
import os
if "sqlite" in (os.getenv("DATABASE_URL", "") or "sqlite"):
    JSONB = Text
else:
    from sqlalchemy.dialects.postgresql import JSONB as _JSONB
    JSONB = _JSONB

from shared.database import Base


# ──────────────────────────────────────────────
# Usuario
# ──────────────────────────────────────────────
class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_usuario_username", "username"),
        Index("ix_usuario_email", "email"),
    )

    def __repr__(self) -> str:
        return f"<Usuario {self.username}>"


# ──────────────────────────────────────────────
# Materia
# ──────────────────────────────────────────────
class Materia(Base):
    __tablename__ = "materias"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    codigo_uned: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    curso: Mapped[int] = mapped_column(Integer, nullable=False)
    semestre: Mapped[int] = mapped_column(Integer, nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # carrera = asignatura universitaria | certificacion = certificación técnica profesional
    categoria: Mapped[str] = mapped_column(Text, default="carrera", nullable=False)
    # cpp = sandbox C++ | sql = sandbox SQL | none = sin sandbox (solo teoría)
    sandbox_tipo: Mapped[str] = mapped_column(Text, default="cpp", nullable=False)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── relationships ──
    temas: Mapped[list["Tema"]] = relationship(
        "Tema", back_populates="materia", cascade="all, delete-orphan"
    )
    sesiones: Mapped[list["SesionEstudio"]] = relationship(
        "SesionEstudio", back_populates="materia", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("semestre IN (1, 2)", name="ck_materia_semestre"),
        CheckConstraint("categoria IN ('carrera', 'certificacion', 'filosofia')", name="ck_materia_categoria"),
        CheckConstraint("sandbox_tipo IN ('cpp', 'sql', 'none')", name="ck_materia_sandbox_tipo"),
        Index("ix_materia_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Materia {self.nombre}>"


# ──────────────────────────────────────────────
# Tema
# ──────────────────────────────────────────────
class Tema(Base):
    __tablename__ = "temas"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    materia_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("materias.id", ondelete="CASCADE"),
        nullable=False,
    )
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── relationships ──
    materia: Mapped["Materia"] = relationship("Materia", back_populates="temas")
    sesiones: Mapped[list["SesionEstudio"]] = relationship(
        "SesionEstudio", back_populates="tema", cascade="all, delete-orphan"
    )
    tests: Mapped[list["Test"]] = relationship(
        "Test", back_populates="tema", cascade="all, delete-orphan"
    )
    dominio: Mapped[Optional["Dominio"]] = relationship(
        "Dominio", back_populates="tema", uselist=False, cascade="all, delete-orphan"
    )
    consultas: Mapped[list["Consulta"]] = relationship(
        "Consulta", back_populates="tema", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("materia_id", "orden", name="uq_tema_materia_orden"),
        Index("ix_tema_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Tema {self.orden}. {self.nombre}>"


# ──────────────────────────────────────────────
# SesionEstudio
# ──────────────────────────────────────────────
class SesionEstudio(Base):
    __tablename__ = "sesiones_estudio"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    materia_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("materias.id", ondelete="CASCADE"),
        nullable=False,
    )
    tema_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("temas.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    duracion_minutos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    nota: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── relationships ──
    materia: Mapped["Materia"] = relationship("Materia", back_populates="sesiones")
    tema: Mapped[Optional["Tema"]] = relationship("Tema", back_populates="sesiones")

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('lectura', 'test', 'ejercicio', 'chat', 'sandbox')",
            name="ck_sesion_tipo",
        ),
        Index("ix_sesion_materia_created", "materia_id", "created_at"),
        Index("ix_sesion_tema_created", "tema_id", "created_at"),
        Index("ix_sesion_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<SesionEstudio {self.tipo} @ {self.created_at.isoformat()}>"


# ──────────────────────────────────────────────
# Test
# ──────────────────────────────────────────────
class Test(Base):
    __tablename__ = "tests"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    tema_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("temas.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    preguntas: Mapped[dict] = mapped_column(JSONB, nullable=False)
    respuestas_usuario: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    puntuacion: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── relationships ──
    tema: Mapped["Tema"] = relationship("Tema", back_populates="tests")

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('evaluacion', 'practica', 'repaso')",
            name="ck_test_tipo",
        ),
        Index("ix_test_tema_created", "tema_id", "created_at"),
        Index("ix_test_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Test {self.tipo} @ {self.created_at.isoformat()}>"


# ──────────────────────────────────────────────
# Dominio
# ──────────────────────────────────────────────
class Dominio(Base):
    __tablename__ = "dominio"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    tema_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("temas.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    nivel: Mapped[str] = mapped_column(
        Text, default="no_iniciado", nullable=False
    )
    puntuacion_maxima: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0.0, nullable=False
    )
    tests_superados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tests_fallados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ejercicios_resueltos: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    ultimo_estudio: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── relationships ──
    tema: Mapped["Tema"] = relationship("Tema", back_populates="dominio")

    __table_args__ = (
        CheckConstraint(
            "nivel IN ('no_iniciado', 'en_curso', 'practicando', 'dominado')",
            name="ck_dominio_nivel",
        ),
        Index("ix_dominio_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Dominio {self.nivel} para tema {self.tema_id}>"


# ──────────────────────────────────────────────
# Consulta
# ──────────────────────────────────────────────
class Consulta(Base):
    __tablename__ = "consultas"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    tema_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("temas.id", ondelete="SET NULL"),
        nullable=True,
    )
    pregunta: Mapped[str] = mapped_column(Text, nullable=False)
    respuesta: Mapped[str] = mapped_column(Text, nullable=False)
    fuentes: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── relationships ──
    tema: Mapped[Optional["Tema"]] = relationship("Tema", back_populates="consultas")

    __table_args__ = (
        Index("ix_consulta_tema_created", "tema_id", "created_at"),
        Index("ix_consulta_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Consulta @ {self.created_at.isoformat()}>"


# ──────────────────────────────────────────────
# Flashcard (SRS — SM-2)
# ──────────────────────────────────────────────
class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    materia_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("materias.id", ondelete="CASCADE"),
        nullable=False,
    )
    tema_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("temas.id", ondelete="SET NULL"),
        nullable=True,
    )
    pregunta: Mapped[str] = mapped_column(Text, nullable=False)
    respuesta: Mapped[str] = mapped_column(Text, nullable=False)
    # 'teoria' | 'taller' | 'simulacro' | 'manual'
    fuente: Mapped[str] = mapped_column(Text, default="teoria", nullable=False)

    # SM-2 fields
    intervalo: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    repeticiones: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Easiness Factor — starts at 2.5, min 1.3
    facilidad: Mapped[float] = mapped_column(Numeric(4, 2), default=2.5, nullable=False)
    fecha_proxima: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )

    __table_args__ = (
        Index("ix_flashcard_materia_proxima", "materia_id", "fecha_proxima"),
        CheckConstraint(
            "fuente IN ('teoria', 'taller', 'simulacro', 'manual')",
            name="ck_flashcard_fuente",
        ),
        Index("ix_flashcard_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Flashcard {self.id[:8]} proxima={self.fecha_proxima.date()}>"


# ──────────────────────────────────────────────
# ErrorLog (registro de fallos para análisis)
# ──────────────────────────────────────────────
class ErrorLog(Base):
    __tablename__ = "error_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    materia_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("materias.id", ondelete="CASCADE"),
        nullable=False,
    )
    tema_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("temas.id", ondelete="SET NULL"),
        nullable=True,
    )
    pregunta_texto: Mapped[str] = mapped_column(Text, nullable=False)
    respuesta_correcta: Mapped[str] = mapped_column(Text, nullable=False)
    respuesta_estudiante: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # 'simulacro_mcq' | 'taller' | 'srs'
    fuente: Mapped[str] = mapped_column(Text, default="simulacro_mcq", nullable=False)
    veces_fallada: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ultima_vez: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )

    __table_args__ = (
        Index("ix_errorlog_materia", "materia_id"),
        Index("ix_errorlog_tema", "tema_id"),
        Index("ix_errorlog_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<ErrorLog materia={self.materia_id[:8]} veces={self.veces_fallada}>"


# ──────────────────────────────────────────────
# Libro (Biblioteca personal del lector)
# ──────────────────────────────────────────────
class Libro(Base):
    __tablename__ = "libros"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    autor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # epub | pdf
    formato: Mapped[str] = mapped_column(Text, nullable=False, default="epub")
    # Ruta absoluta en disco
    ruta_archivo: Mapped[str] = mapped_column(Text, nullable=False)
    # Colección TurboVec ya indexada
    coleccion_rag: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Materia asociada (opcional — para flashcards y contexto IA)
    materia_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("materias.id", ondelete="SET NULL"), nullable=True
    )
    # Color hex para portada auto-generada
    color_portada: Mapped[str] = mapped_column(Text, default="#6A45DE", nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Progreso de lectura (CFI para EPUB, página para PDF)
    cfi_actual: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    porcentaje_leido: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0, nullable=False)
    ultima_lectura: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # ── relationships ──
    anotaciones: Mapped[list["Anotacion"]] = relationship(
        "Anotacion", back_populates="libro", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_libro_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Libro {self.titulo}>"


# ──────────────────────────────────────────────
# Anotacion (highlights, notas, bookmarks del lector)
# ──────────────────────────────────────────────
class Anotacion(Base):
    __tablename__ = "anotaciones_lector"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    libro_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("libros.id", ondelete="CASCADE"), nullable=False
    )
    # highlight | note | bookmark
    tipo: Mapped[str] = mapped_column(Text, nullable=False, default="highlight")
    texto_seleccionado: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # yellow | green | blue | red | purple
    color: Mapped[str] = mapped_column(Text, default="yellow", nullable=False)
    # EPUB CFI (Canonical Fragment Identifier) — posición exacta
    cfi: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Título del capítulo donde se anotó
    capitulo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    creado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # ── relationships ──
    libro: Mapped["Libro"] = relationship("Libro", back_populates="anotaciones")

    __table_args__ = (
        Index("ix_anotacion_libro", "libro_id"),
        Index("ix_anotacion_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Anotacion {self.tipo} libro={self.libro_id[:8]}>"


# ──────────────────────────────────────────────
# Glosario (términos formales ↔ lenguaje llano)
# ──────────────────────────────────────────────
class Glosario(Base):
    __tablename__ = "glosario"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    termino: Mapped[str] = mapped_column(Text, nullable=False)
    nombre_informal: Mapped[str] = mapped_column(Text, nullable=False)
    definicion_formal: Mapped[str] = mapped_column(Text, nullable=False)
    definicion_informal: Mapped[str] = mapped_column(Text, nullable=False)
    ejemplo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    materia_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("materias.id", ondelete="SET NULL"), nullable=True
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("termino", "materia_id", name="uq_glosario_termino_materia"),
        Index("ix_glosario_termino", "termino"),
        Index("ix_glosario_materia", "materia_id"),
        Index("ix_glosario_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<Glosario {self.termino}>"


# ──────────────────────────────────────────────
# DemostracionAtomo — pasos atómicos de una prueba
# ──────────────────────────────────────────────
class DemostracionAtomo(Base):
    __tablename__ = "demostracion_atomos"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    tema_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("temas.id", ondelete="CASCADE"), nullable=False
    )
    teorema: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False)
    premisa: Mapped[str] = mapped_column(Text, nullable=False)
    conclusion: Mapped[str] = mapped_column(Text, nullable=False)
    razon_llana: Mapped[str] = mapped_column(Text, nullable=False)
    razon_formal: Mapped[str] = mapped_column(Text, nullable=False)
    flashcard_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("flashcards.id", ondelete="SET NULL"), nullable=True
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        Index("ix_demo_atomo_tema", "tema_id"),
        Index("ix_demo_atomo_tema_orden", "tema_id", "orden"),
        Index("ix_demo_atomo_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<DemostracionAtomo {self.teorema[:30]} paso={self.orden}>"


# ──────────────────────────────────────────────
# GeoConstruccion — construcciones de GeoMathos
# ──────────────────────────────────────────────
class GeoConstruccion(Base):
    __tablename__ = "geo_construcciones"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    # GState JSON: { pts, segs, circles, angles, lines, rays, vectors, polys }
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_geo_construccion_created", "created_at"),
        Index("ix_geo_construccion_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<GeoConstruccion '{self.nombre}'>"


# ──────────────────────────────────────────────
# CerebroNota — Apuntes interactivos (Obsidian)
# ──────────────────────────────────────────────
class CerebroNota(Base):
    __tablename__ = "cerebro_notas"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, default="general")
    parent_folder: Mapped[str] = mapped_column(Text, nullable=False, default="/")
    x: Mapped[float] = mapped_column(Numeric, nullable=False, default=250.0)
    y: Mapped[float] = mapped_column(Numeric, nullable=False, default=200.0)
    
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    materia_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("materias.id", ondelete="SET NULL"), nullable=True
    )
    tema_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("temas.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_cerebro_nota_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<CerebroNota '{self.title}'>"


# ──────────────────────────────────────────────
# CerebroEnlace — Conexiones del grafo
# ──────────────────────────────────────────────
class CerebroEnlace(Base):
    __tablename__ = "cerebro_enlaces"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    source_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cerebro_notas.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cerebro_notas.id", ondelete="CASCADE"), nullable=False
    )
    
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )

    __table_args__ = (
        Index("ix_cerebro_enlace_usuario", "usuario_id"),
        UniqueConstraint("source_id", "target_id", name="uq_cerebro_enlace"),
    )

    def __repr__(self) -> str:
        return f"<CerebroEnlace {self.source_id} -> {self.target_id}>"

# ──────────────────────────────────────────────
# BibliosSession — Historial de auditorías (Biblios)
# ──────────────────────────────────────────────
class BibliosSession(Base):
    __tablename__ = "biblios_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    nota_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("cerebro_notas.id", ondelete="CASCADE"), nullable=False
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    coherence_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    orthography_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    feedback_ortografia: Mapped[str] = mapped_column(Text, nullable=False, default="[]") # JSON list
    feedback_coherencia: Mapped[str] = mapped_column(Text, nullable=False, default="")
    feedback_mejoras: Mapped[str] = mapped_column(Text, nullable=False, default="")
    comparacion_anterior: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        Index("ix_biblios_nota", "nota_id"),
        Index("ix_biblios_usuario", "usuario_id"),
    )

    def __repr__(self) -> str:
        return f"<BibliosSession {self.id}>"

# ──────────────────────────────────────────────
# BibliosMacroSession — Historial de auditorías Macro (Carpetas/Grafos)
# ──────────────────────────────────────────────
class BibliosMacroSession(Base):
    __tablename__ = "biblios_macro_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    usuario_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("usuarios.id"), nullable=True
    )
    target_type: Mapped[str] = mapped_column(Text, nullable=False) # 'carpeta' o 'grafo'
    target_id: Mapped[str] = mapped_column(Text, nullable=False) # ruta de la carpeta o 'all'
    
    coherence_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    feedback_global: Mapped[str] = mapped_column(Text, nullable=False, default="")
    feedback_nodos: Mapped[str] = mapped_column(Text, nullable=False, default="[]") # JSON con observaciones por nodo
    comparacion_anterior: Mapped[str] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        Index("ix_biblios_macro_target", "target_type", "target_id"),
        Index("ix_biblios_macro_usuario", "usuario_id"),
    )
