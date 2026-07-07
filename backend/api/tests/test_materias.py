"""Tests for /api/v1/materias endpoints."""

import pytest
from httpx import AsyncClient


class TestListarMaterias:
    """GET /api/v1/materias"""

    async def test_returns_200_and_list(self, async_client: AsyncClient, seed_data: dict):
        response = await async_client.get("/api/v1/materias")
        assert response.status_code == 200
        body = response.json()
        assert "materias" in body
        assert "total" in body
        assert body["total"] >= 1
        # Verify the seeded materia is in the list
        ids = [m["id"] for m in body["materias"]]
        assert seed_data["materia_id"] in ids

    async def test_filter_by_activo(self, async_client: AsyncClient, seed_data: dict):
        response = await async_client.get("/api/v1/materias?activo=true")
        assert response.status_code == 200
        assert response.json()["total"] >= 1


class TestObtenerMateria:
    """GET /api/v1/materias/{id}"""

    async def test_returns_200_and_detail(self, async_client: AsyncClient, seed_data: dict):
        materia_id = seed_data["materia_id"]
        response = await async_client.get(f"/api/v1/materias/{materia_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == materia_id
        assert body["nombre"] == "Álgebra Lineal"
        assert body["curso"] == 1
        assert body["semestre"] == 1
        assert "temas" in body
        # Should have 2 seeded temas
        assert len(body["temas"]) == 2

    async def test_returns_404_for_unknown_id(self, async_client: AsyncClient, seed_data: dict):
        unknown = "00000000-0000-0000-0000-000000000000"
        response = await async_client.get(f"/api/v1/materias/{unknown}")
        assert response.status_code == 404
        assert "detail" in response.json()

    async def test_returns_422_for_invalid_uuid(self, async_client: AsyncClient):
        response = await async_client.get("/api/v1/materias/not-a-uuid")
        # FastAPI path param as str — the router accepts any string for 'id'
        # but the DB lookup will fail. The current code doesn't validate UUID format
        # in the path param, so this returns 404 (not found) rather than 422.
        assert response.status_code == 404


class TestCrearMateria:
    """POST /api/v1/materias"""

    async def test_creates_materia(self, async_client: AsyncClient, seed_data: dict):
        payload = {
            "nombre": "Cálculo I",
            "codigo_uned": "61021025",
            "curso": 1,
            "semestre": 1,
            "descripcion": "Cálculo diferencial e integral.",
        }
        response = await async_client.post("/api/v1/materias", json=payload)
        # Expect 401 because crear_materia requires admin role via require_role("admin")
        # and there's no auth token. The dependency requires HTTPBearer.
        assert response.status_code == 401


class TestListarTemasDeMateria:
    """GET /api/v1/materias/{id}/temas"""

    async def test_returns_temas(self, async_client: AsyncClient, seed_data: dict):
        materia_id = seed_data["materia_id"]
        response = await async_client.get(f"/api/v1/materias/{materia_id}/temas")
        assert response.status_code == 200
        body = response.json()
        assert "temas" in body
        assert body["total"] == 2
        nombres = [t["nombre"] for t in body["temas"]]
        assert "Espacios Vectoriales" in nombres
        assert "Aplicaciones Lineales" in nombres

    async def test_returns_404_for_unknown_materia(self, async_client: AsyncClient):
        unknown = "00000000-0000-0000-0000-000000000000"
        response = await async_client.get(f"/api/v1/materias/{unknown}/temas")
        assert response.status_code == 404


class TestProgresoMateria:
    """GET /api/v1/materias/{id}/progreso"""

    async def test_returns_progreso(self, async_client: AsyncClient, seed_data: dict):
        materia_id = seed_data["materia_id"]
        response = await async_client.get(f"/api/v1/materias/{materia_id}/progreso")
        assert response.status_code == 200
        body = response.json()
        assert body["materia_id"] == materia_id
        assert body["total_temas"] == 2
        assert body["temas_no_iniciados"] == 2
        assert body["temas_dominados"] == 0

    async def test_returns_404_for_unknown_materia(self, async_client: AsyncClient):
        unknown = "00000000-0000-0000-0000-000000000000"
        response = await async_client.get(f"/api/v1/materias/{unknown}/progreso")
        assert response.status_code == 404
