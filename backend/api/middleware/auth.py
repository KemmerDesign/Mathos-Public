"""
Mathós — JWT Bearer Auth Middleware.

Reads Authorization: Bearer *** JWT (HS256) using settings.JWT_SECRET,
and injects usuario_id into request.state.
Excludes /api/v1/auth/* and /health paths.
Excludes paths ending in /archivo (epub/pdf binary — browsers can't add auth headers).
"""

from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware

from shared.settings import settings


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates JWT Bearer tokens on all protected routes."""

    def __init__(self, app):
        super().__init__(app)
        self._excluded_prefixes = ("/api/v1/auth/", "/health")
        self._excluded_paths = (
            "/openapi.json",
            "/docs",
            "/redoc",
            "/docs/oauth2-redirect",
        )

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip auth for public paths
        if any(path.startswith(p) for p in self._excluded_prefixes):
            return await call_next(request)
        if any(path == p for p in self._excluded_paths):
            return await call_next(request)
        # Skip auth for file-serving endpoints (browsers can't inject auth headers)
        if path.endswith("/archivo"):
            return await call_next(request)

        # Extract and validate Bearer token
        auth_header: Optional[str] = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Falta token de autenticacion. Usa: Authorization: Bearer ***"
                },
            )

        token = auth_header.removeprefix("Bearer ").strip()
        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token vacio en el header Authorization."},
            )

        secret = settings.JWT_SECRET_REQUIRED
        if not secret:
            return JSONResponse(
                status_code=500,
                content={"detail": "JWT_SECRET no configurado en el servidor."},
            )

        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=[settings.JWT_ALGORITHM],
            )
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token invalido o expirado."},
            )

        usuario_id: Optional[str] = payload.get("sub")
        if not usuario_id:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token no contiene un usuario valido."},
            )

        # Inject user info into request state
        request.state.usuario_id = usuario_id
        request.state.is_authenticated = True

        response = await call_next(request)
        return response
