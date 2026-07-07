"""Mathós — Auth integration tests.

Tests the full auth flow:
  - Register a new user
  - Login and get JWT token
  - Access protected endpoint with valid token
  - Reject invalid/expired tokens with 401
"""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_register_user(async_client: AsyncClient):
    """Register a new user and verify 201 response."""
    resp = await async_client.post("/api/v1/auth/register", json={
        "username": "testuser",
        "email": "testuser@example.com",
        "password": "securepass123",
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    data = resp.json()
    assert "id" in data
    assert data["username"] == "testuser"
    assert "password" not in data  # Never return password


@pytest.mark.anyio
async def test_login_and_get_token(async_client: AsyncClient):
    """Login with valid credentials and receive a JWT token."""
    # Register first
    await async_client.post("/api/v1/auth/register", json={
        "username": "logintest",
        "email": "logintest@example.com",
        "password": "securepass123",
    })

    # Login
    resp = await async_client.post("/api/v1/auth/login", json={
        "email": "logintest@example.com",
        "password": "securepass123",
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    assert "access_token" in data
    assert len(data["access_token"]) > 20
    assert data.get("token_type") == "bearer"


@pytest.mark.anyio
async def test_protected_endpoint_with_valid_token(async_client: AsyncClient):
    """Access a protected endpoint with a valid JWT token."""
    # Register and login
    await async_client.post("/api/v1/auth/register", json={
        "username": "protectedtest",
        "email": "protected@example.com",
        "password": "securepass123",
    })
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "email": "protected@example.com",
        "password": "securepass123",
    })
    token = login_resp.json()["access_token"]

    # Access protected endpoint
    resp = await async_client.get(
        "/api/v1/materias",
        headers={"Authorization": f"Bearer {token}", "X-API-Key": "test-api-key"},
    )
    assert resp.status_code == 200, f"Protected endpoint failed: {resp.text}"


@pytest.mark.anyio
async def test_protected_endpoint_rejects_no_token(async_client: AsyncClient):
    """Protected endpoint returns 401 without token."""
    resp = await async_client.get("/api/v1/materias")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_protected_endpoint_rejects_invalid_token(async_client: AsyncClient):
    """Protected endpoint returns 401 with invalid token."""
    resp = await async_client.get(
        "/api/v1/materias",
        headers={"Authorization": "Bearer invalid-token-here"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_login_rejects_wrong_password(async_client: AsyncClient):
    """Login with wrong password returns 401."""
    await async_client.post("/api/v1/auth/register", json={
        "username": "wrongpw",
        "email": "wrongpw@example.com",
        "password": "securepass123",
    })

    resp = await async_client.post("/api/v1/auth/login", json={
        "email": "wrongpw@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_register_rejects_duplicate_email(async_client: AsyncClient):
    """Registering with same email twice returns 409 or 400."""
    payload = {
        "username": "dupuser",
        "email": "duplicate@example.com",
        "password": "securepass123",
    }
    resp1 = await async_client.post("/api/v1/auth/register", json=payload)
    assert resp1.status_code == 201

    resp2 = await async_client.post("/api/v1/auth/register", json=payload)
    assert resp2.status_code in (400, 409)
