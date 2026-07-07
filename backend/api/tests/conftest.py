"""Mathós — Pytest fixtures for API tests.

Uses SQLite+aiosqlite in-memory to avoid PostgreSQL dependency.
Dependency overrides replace the real get_session with a test session.
Sets ALLOWED_EMAILS="" so registration is open in tests.
"""

from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from main import app
from models import Base, Materia, Tema
from shared.database import get_session
from shared.settings import settings

# ── Override settings for test environment ──────
settings.ALLOWED_EMAILS = ""       # Open registration in tests
settings.JWT_SECRET = "test-secret-for-pytest"
settings.MATHOS_API_KEY = "test-api-key"


# ──────────────────────────────────────────────
# Test database engine (SQLite in-memory, async)
# ──────────────────────────────────────────────
TEST_ENGINE = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    echo=False,
)


# Enable WAL mode + foreign keys for SQLite (mimics PG constraints)
@event.listens_for(TEST_ENGINE.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestSessionFactory = async_sessionmaker(
    TEST_ENGINE,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_test_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency override that yields a test session."""
    async with TestSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ──────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────
@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables once per test session."""
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a clean test session for each test."""
    async with TestSessionFactory() as session:
        yield session


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """FastAPI test client with dependency overrides."""

    async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seed_data(db_session: AsyncSession) -> dict:
    """Insert sample materias and temas for tests.

    Returns a dict with IDs for easy reference in test assertions:
        materia_id, tema_id
    """
    materia_id = str(uuid4())
    tema_id = str(uuid4())
    tema2_id = str(uuid4())

    materia = Materia(
        id=materia_id,
        nombre="Álgebra Lineal",
        codigo_uned="61021024",
        curso=1,
        semestre=1,
        descripcion="Fundamentos de álgebra lineal para matemáticas.",
        activo=True,
    )
    tema = Tema(
        id=tema_id,
        materia_id=materia_id,
        nombre="Espacios Vectoriales",
        orden=1,
        descripcion="Definición y propiedades de espacios vectoriales.",
    )
    tema2 = Tema(
        id=tema2_id,
        materia_id=materia_id,
        nombre="Aplicaciones Lineales",
        orden=2,
        descripcion="Transformaciones lineales y matrices asociadas.",
    )
    db_session.add_all([materia, tema, tema2])
    await db_session.flush()

    return {
        "materia_id": materia_id,
        "tema_id": tema_id,
        "tema2_id": tema2_id,
    }
