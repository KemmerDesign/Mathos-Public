"""Mathós — Cerebro sync integration tests.

Tests the Cerebro note sync flow:
  - GET empty state
  - POST create notes
  - GET verify they exist
  - POST update notes
  - GET verify updates
  - Filter by materia_id
"""

import pytest
from uuid import uuid4
from httpx import AsyncClient


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"}


async def _register_and_login(client: AsyncClient, suffix: str = "") -> str:
    """Helper: register a user and return a JWT token."""
    await client.post("/api/v1/auth/register", json={
        "username": f"cerebrotest{suffix}",
        "email": f"cerebrotest{suffix}@example.com",
        "password": "securepass123",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": f"cerebrotest{suffix}@example.com",
        "password": "securepass123",
    })
    return resp.json()["access_token"]


@pytest.mark.anyio
async def test_cerebro_sync_empty_state(async_client: AsyncClient):
    """GET /cerebro/sync returns empty lists for new user."""
    token = await _register_and_login(async_client, "empty")

    resp = await async_client.get(
        "/api/v1/cerebro/sync",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["notas"] == []
    assert data["enlaces"] == []


@pytest.mark.anyio
async def test_cerebro_sync_create_and_verify(async_client: AsyncClient):
    """POST notes, then GET verifies they exist."""
    token = await _register_and_login(async_client, "create")
    nid1, nid2 = str(uuid4()), str(uuid4())

    notes = [
        {"id": nid1, "title": "Teorema de Rolle", "content": "# Rolle\n\nSi f es continua...",
         "category": "calculo", "parent_folder": "/calculo", "x": 100.0, "y": 200.0},
        {"id": nid2, "title": "Teorema del Valor Medio", "content": "# TVM\n\nGeneralizacion.",
         "category": "calculo", "parent_folder": "/calculo", "x": 250.0, "y": 180.0},
    ]

    resp = await async_client.post("/api/v1/cerebro/sync",
        json={"notas": notes, "enlaces": []}, headers=_auth_headers(token))
    assert resp.status_code == 200

    resp2 = await async_client.get("/api/v1/cerebro/sync", headers=_auth_headers(token))
    assert resp2.status_code == 200
    data = resp2.json()
    assert len(data["notas"]) == 2
    titles = {n["title"] for n in data["notas"]}
    assert "Teorema de Rolle" in titles
    assert "Teorema del Valor Medio" in titles
    for n in data["notas"]:
        assert n["parent_folder"] == "/calculo"


@pytest.mark.anyio
async def test_cerebro_sync_update_note(async_client: AsyncClient):
    """POST update to an existing note changes its content."""
    token = await _register_and_login(async_client, "update")
    nid = str(uuid4())

    await async_client.post("/api/v1/cerebro/sync",
        json={"notas": [{"id": nid, "title": "Original", "content": "Contenido original",
              "category": "test", "parent_folder": "/", "x": 100.0, "y": 100.0}], "enlaces": []},
        headers=_auth_headers(token))

    resp = await async_client.post("/api/v1/cerebro/sync",
        json={"notas": [{"id": nid, "title": "Actualizado", "content": "Contenido nuevo",
              "category": "test", "parent_folder": "/actualizado", "x": 200.0, "y": 200.0}], "enlaces": []},
        headers=_auth_headers(token))
    assert resp.status_code == 200

    resp2 = await async_client.get("/api/v1/cerebro/sync", headers=_auth_headers(token))
    data = resp2.json()
    note = next((n for n in data["notas"] if n["id"] == nid), None)
    assert note is not None
    assert note["title"] == "Actualizado"
    assert note["content"] == "Contenido nuevo"
    assert note["parent_folder"] == "/actualizado"


@pytest.mark.anyio
async def test_cerebro_sync_delete_note(async_client: AsyncClient):
    """Omitting a note from POST deletes it (sync semantics)."""
    token = await _register_and_login(async_client, "delete")
    nids = [str(uuid4()) for _ in range(3)]

    notes = [{"id": nid, "title": f"Nota {i}", "content": "...",
              "category": "test", "parent_folder": "/", "x": 100.0, "y": 100.0}
             for i, nid in enumerate(nids)]
    await async_client.post("/api/v1/cerebro/sync",
        json={"notas": notes, "enlaces": []}, headers=_auth_headers(token))

    # Delete note 1 by omitting it
    await async_client.post("/api/v1/cerebro/sync",
        json={"notas": [notes[0], notes[2]], "enlaces": []}, headers=_auth_headers(token))

    resp = await async_client.get("/api/v1/cerebro/sync", headers=_auth_headers(token))
    data = resp.json()
    ids = {n["id"] for n in data["notas"]}
    assert nids[0] in ids
    assert nids[2] in ids
    assert nids[1] not in ids


@pytest.mark.anyio
async def test_cerebro_sync_filter_by_materia(async_client: AsyncClient, seed_data: dict):
    """GET /cerebro/sync?materia_id=X filters notes correctly."""
    token = await _register_and_login(async_client, "filter")
    materia_id = seed_data["materia_id"]
    nid1, nid2, nid3 = str(uuid4()), str(uuid4()), str(uuid4())

    await async_client.post("/api/v1/cerebro/sync",
        json={"notas": [
            {"id": nid1, "title": "Matematicas", "content": "...",
             "category": "math", "parent_folder": "/", "x": 100.0, "y": 100.0, "materia_id": materia_id},
            {"id": nid2, "title": "Otro", "content": "...",
             "category": "other", "parent_folder": "/", "x": 200.0, "y": 200.0, "materia_id": None},
            {"id": nid3, "title": "Sin materia", "content": "...",
             "category": "none", "parent_folder": "/", "x": 300.0, "y": 300.0},
        ], "enlaces": []}, headers=_auth_headers(token))

    resp = await async_client.get(
        f"/api/v1/cerebro/sync?materia_id={materia_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["notas"]) == 1
    assert data["notas"][0]["title"] == "Matematicas"


@pytest.mark.anyio
async def test_cerebro_requires_auth(async_client: AsyncClient):
    """Cerebro endpoints require authentication."""
    resp = await async_client.get("/api/v1/cerebro/sync")
    assert resp.status_code == 401
    resp2 = await async_client.post("/api/v1/cerebro/sync", json={"notas": [], "enlaces": []})
    assert resp2.status_code == 401
