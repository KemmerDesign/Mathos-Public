"""Tests for /api/v1/temas endpoints."""

from uuid import uuid4

import pytest
from httpx import AsyncClient


class TestObtenerTema:
    """GET /api/v1/temas/{id}"""

    async def test_returns_200(self, async_client: AsyncClient, seed_data: dict):
        tema_id = seed_data["tema_id"]
        response = await async_client.get(f"/api/v1/temas/{tema_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == tema_id
        assert body["nombre"] == "Espacios Vectoriales"
        assert body["orden"] == 1
        assert "nivel_dominio" in body

    async def test_returns_404_for_unknown_id(self, async_client: AsyncClient):
        unknown = "00000000-0000-0000-0000-000000000000"
        response = await async_client.get(f"/api/v1/temas/{unknown}")
        assert response.status_code == 404

    async def test_returns_404_for_invalid_uuid(self, async_client: AsyncClient):
        response = await async_client.get("/api/v1/temas/not-a-uuid")
        assert response.status_code == 404


class TestEstudiarTema:
    """POST /api/v1/temas/{id}/estudiar"""

    async def test_returns_201(self, async_client: AsyncClient, seed_data: dict):
        tema_id = seed_data["tema_id"]
        payload = {
            "materia_id": seed_data["materia_id"],
            "tipo": "lectura",
            "duracion_minutos": 45,
        }
        response = await async_client.post(
            f"/api/v1/temas/{tema_id}/estudiar", json=payload
        )
        assert response.status_code == 201
        body = response.json()
        assert body["tema_id"] == tema_id
        assert body["tipo"] == "lectura"
        assert body["duracion_minutos"] == 45

    async def test_returns_404_for_unknown_tema(self, async_client: AsyncClient, seed_data: dict):
        unknown = "00000000-0000-0000-0000-000000000000"
        payload = {
            "materia_id": seed_data["materia_id"],
            "tipo": "lectura",
        }
        response = await async_client.post(
            f"/api/v1/temas/{unknown}/estudiar", json=payload
        )
        assert response.status_code == 404

    async def test_rejects_invalid_tipo(self, async_client: AsyncClient, seed_data: dict):
        tema_id = seed_data["tema_id"]
        payload = {
            "materia_id": seed_data["materia_id"],
            "tipo": "invalido",
        }
        response = await async_client.post(
            f"/api/v1/temas/{tema_id}/estudiar", json=payload
        )
        # FastAPI should reject with 422 for invalid enum pattern
        assert response.status_code == 422


class TestGenerarTest:
    """POST /api/v1/temas/{id}/test"""

    async def test_returns_201(self, async_client: AsyncClient, seed_data: dict):
        tema_id = seed_data["tema_id"]
        payload = {"tipo": "practica", "num_preguntas": 3}
        response = await async_client.post(
            f"/api/v1/temas/{tema_id}/test", json=payload
        )
        assert response.status_code == 201
        body = response.json()
        assert body["tema_id"] == tema_id
        assert body["tipo"] == "practica"

    async def test_returns_404_for_unknown_tema(self, async_client: AsyncClient):
        unknown = "00000000-0000-0000-0000-000000000000"
        payload = {"tipo": "practica", "num_preguntas": 3}
        response = await async_client.post(
            f"/api/v1/temas/{unknown}/test", json=payload
        )
        assert response.status_code == 404


class TestResponderTest:
    """POST /api/v1/temas/{id}/test/{test_id}/responder"""

    async def test_returns_200(self, async_client: AsyncClient, seed_data: dict):
        tema_id = seed_data["tema_id"]
        # First create a test
        create_payload = {"tipo": "practica", "num_preguntas": 2}
        create_resp = await async_client.post(
            f"/api/v1/temas/{tema_id}/test", json=create_payload
        )
        assert create_resp.status_code == 201
        test_id = create_resp.json()["id"]

        # Now submit answers
        answer_payload = {"respuestas": {"1": "respuesta 1", "2": "respuesta 2"}}
        response = await async_client.post(
            f"/api/v1/temas/{tema_id}/test/{test_id}/responder",
            json=answer_payload,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == test_id
        assert body["respuestas_usuario"] == {"1": "respuesta 1", "2": "respuesta 2"}
        assert body["puntuacion"] is not None

    async def test_returns_409_if_already_answered(
        self, async_client: AsyncClient, seed_data: dict
    ):
        tema_id = seed_data["tema_id"]
        create_payload = {"tipo": "practica", "num_preguntas": 1}
        create_resp = await async_client.post(
            f"/api/v1/temas/{tema_id}/test", json=create_payload
        )
        test_id = create_resp.json()["id"]

        # Answer once
        await async_client.post(
            f"/api/v1/temas/{tema_id}/test/{test_id}/responder",
            json={"respuestas": {"1": "ok"}},
        )
        # Answer again — should be 409
        response = await async_client.post(
            f"/api/v1/temas/{tema_id}/test/{test_id}/responder",
            json={"respuestas": {"1": "again"}},
        )
        assert response.status_code == 409


class TestObtenerDominio:
    """GET /api/v1/temas/{id}/dominio"""

    async def test_returns_200_with_nivel(self, async_client: AsyncClient, seed_data: dict):
        tema_id = seed_data["tema_id"]
        response = await async_client.get(f"/api/v1/temas/{tema_id}/dominio")
        assert response.status_code == 200
        body = response.json()
        assert body["tema_id"] == tema_id
        assert body["nivel"] == "no_iniciado"  # default before any study session
        assert body["tests_superados"] == 0

    async def test_nivel_updates_after_studying(
        self, async_client: AsyncClient, seed_data: dict
    ):
        tema_id = seed_data["tema_id"]
        # Study once
        await async_client.post(
            f"/api/v1/temas/{tema_id}/estudiar",
            json={"materia_id": seed_data["materia_id"], "tipo": "lectura"},
        )
        # Check dominio updated to 'en_curso'
        response = await async_client.get(f"/api/v1/temas/{tema_id}/dominio")
        assert response.status_code == 200
        assert response.json()["nivel"] == "en_curso"

    async def test_returns_404_for_unknown_tema(self, async_client: AsyncClient):
        unknown = "00000000-0000-0000-0000-000000000000"
        response = await async_client.get(f"/api/v1/temas/{unknown}/dominio")
        assert response.status_code == 404
