"""Mathós — SRS integration tests.

Tests the Spaced Repetition System flow:
  - Create a flashcard
  - Get review queue (cola)
  - Review with different ratings (SM-2)
  - Verify interval changes after review
  - Error registration
  - Stats endpoint
"""

import pytest
from httpx import AsyncClient


async def _register_and_login(client: AsyncClient, suffix: str = "") -> str:
    """Helper: register a user and return a JWT token."""
    await client.post("/api/v1/auth/register", json={
        "username": f"srstest{suffix}",
        "email": f"srstest{suffix}@example.com",
        "password": "securepass123",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": f"srstest{suffix}@example.com",
        "password": "securepass123",
    })
    return resp.json()["access_token"]


@pytest.mark.anyio
async def test_create_flashcard(async_client: AsyncClient, seed_data: dict):
    """Create a flashcard and verify it appears in the queue."""
    token = await _register_and_login(async_client, "createfc")
    materia_id = seed_data["materia_id"]
    tema_id = seed_data["tema_id"]

    resp = await async_client.post(
        "/api/v1/srs/flashcards",
        json={
            "materia_id": materia_id,
            "tema_id": tema_id,
            "pregunta": "¿Qué es un espacio vectorial?",
            "respuesta": "Un conjunto V con dos operaciones: suma y producto escalar, que satisfacen 8 axiomas.",
            "fuente": "manual",
        },
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["pregunta"] == "¿Qué es un espacio vectorial?"

    # Verify it appears in the queue
    resp2 = await async_client.get(
        f"/api/v1/srs/cola/{materia_id}",
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp2.status_code == 200
    cola = resp2.json()
    assert cola["pendientes"] >= 1
    assert any(fc["pregunta"] == "¿Qué es un espacio vectorial?" for fc in cola["flashcards"])


@pytest.mark.anyio
async def test_review_flashcard_sm2(async_client: AsyncClient, seed_data: dict):
    """Review a flashcard with rating 5 (Perfect) and verify SM-2 progression."""
    token = await _register_and_login(async_client, "review")
    materia_id = seed_data["materia_id"]
    tema_id = seed_data["tema_id"]

    # Create flashcard
    create_resp = await async_client.post(
        "/api/v1/srs/flashcards",
        json={
            "materia_id": materia_id,
            "tema_id": tema_id,
            "pregunta": "SM-2 test question",
            "respuesta": "SM-2 test answer",
            "fuente": "manual",
        },
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    fc_id = create_resp.json()["id"]

    # Review with rating 5 (Perfect)
    review_resp = await async_client.post(
        "/api/v1/srs/revisar",
        json={"flashcard_id": fc_id, "calificacion": 5},
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert review_resp.status_code == 200
    result = review_resp.json()
    assert result["flashcard_id"] == fc_id
    # After first perfect review: repeticiones=1, intervalo=1
    assert result["repeticiones"] == 1
    assert result["intervalo"] == 1

    # Review again with rating 5
    review_resp2 = await async_client.post(
        "/api/v1/srs/revisar",
        json={"flashcard_id": fc_id, "calificacion": 5},
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert review_resp2.status_code == 200
    result2 = review_resp2.json()
    # After second perfect review: repeticiones=2, intervalo=6
    assert result2["repeticiones"] == 2
    assert result2["intervalo"] == 6


@pytest.mark.anyio
async def test_review_flashcard_blackout(async_client: AsyncClient, seed_data: dict):
    """Review with rating 0 (Blackout) resets the card."""
    token = await _register_and_login(async_client, "blackout")
    materia_id = seed_data["materia_id"]

    # Create and review once to advance
    create_resp = await async_client.post(
        "/api/v1/srs/flashcards",
        json={
            "materia_id": materia_id,
            "tema_id": seed_data["tema_id"],
            "pregunta": "Blackout test",
            "respuesta": "Blackout answer",
            "fuente": "manual",
        },
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    fc_id = create_resp.json()["id"]

    # First review: perfect
    await async_client.post(
        "/api/v1/srs/revisar",
        json={"flashcard_id": fc_id, "calificacion": 5},
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )

    # Second review: perfect again (should be at interval=6)
    await async_client.post(
        "/api/v1/srs/revisar",
        json={"flashcard_id": fc_id, "calificacion": 5},
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )

    # Third review: blackout (rating 0)
    review_resp = await async_client.post(
        "/api/v1/srs/revisar",
        json={"flashcard_id": fc_id, "calificacion": 0},
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert review_resp.status_code == 200
    result = review_resp.json()
    # SM-2: blackout resets repeticiones to 0, intervalo to 1
    assert result["repeticiones"] == 0
    assert result["intervalo"] == 1


@pytest.mark.anyio
async def test_srs_stats(async_client: AsyncClient, seed_data: dict):
    """Stats endpoint returns correct counts."""
    token = await _register_and_login(async_client, "stats")
    materia_id = seed_data["materia_id"]

    # Create 3 flashcards
    for i in range(3):
        await async_client.post(
            "/api/v1/srs/flashcards",
            json={
                "materia_id": materia_id,
                "tema_id": seed_data["tema_id"],
                "pregunta": f"Stats question {i}",
                "respuesta": f"Stats answer {i}",
                "fuente": "manual",
            },
            headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
        )

    resp = await async_client.get(
        f"/api/v1/srs/stats/{materia_id}",
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total"] == 3
    assert stats["pendientes_hoy"] >= 0
    assert isinstance(stats["aprendidas"], int)


@pytest.mark.anyio
async def test_register_error(async_client: AsyncClient, seed_data: dict):
    """Register an error and verify it appears in the error log."""
    token = await _register_and_login(async_client, "error")
    materia_id = seed_data["materia_id"]

    # Register error
    resp = await async_client.post(
        "/api/v1/srs/error",
        json={
            "materia_id": materia_id,
            "tema_id": seed_data["tema_id"],
            "pregunta_texto": "¿Cuál es la dimensión de R^n?",
            "respuesta_correcta": "n",
            "respuesta_estudiante": "1",
            "fuente": "simulacro_mcq",
        },
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp.status_code == 201

    # Verify in error log
    resp2 = await async_client.get(
        f"/api/v1/srs/errores/{materia_id}",
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp2.status_code == 200
    errores = resp2.json()["errores"]
    assert len(errores) >= 1
    assert any("dimensión" in e.get("pregunta_texto", e.get("pregunta", "")) for e in errores)

    # Register same error again -> dedup (veces_fallada increments)
    resp3 = await async_client.post(
        "/api/v1/srs/error",
        json={
            "materia_id": materia_id,
            "pregunta_texto": "¿Cuál es la dimensión de R^n?",
            "respuesta_correcta": "n",
            "respuesta_estudiante": "2",
            "fuente": "simulacro_mcq",
        },
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp3.status_code == 201
    assert resp3.json()["veces_fallada"] == 2


@pytest.mark.anyio
async def test_srs_requires_auth(async_client: AsyncClient, seed_data: dict):
    """SRS endpoints require authentication."""
    materia_id = seed_data["materia_id"]

    # All SRS endpoints should return 401 without auth
    endpoints = [
        ("GET", f"/api/v1/srs/cola/{materia_id}"),
        ("GET", f"/api/v1/srs/stats/{materia_id}"),
        ("GET", f"/api/v1/srs/errores/{materia_id}"),
        ("POST", "/api/v1/srs/revisar"),
        ("POST", "/api/v1/srs/error"),
        ("POST", "/api/v1/srs/flashcards"),
    ]

    for method, url in endpoints:
        if method == "GET":
            resp = await async_client.get(url)
        else:
            resp = await async_client.post(url, json={})
        assert resp.status_code == 401, f"{method} {url} should require auth, got {resp.status_code}"
