import time
from collections import defaultdict
from typing import Dict, List, Tuple

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Rate limiter con límites diferenciados por tipo de endpoint.

    - Endpoints IA (asistente, evaluar, vision): 10 req/min (consumen créditos)
    - Endpoints generales: 100 req/min
    """

    # Rutas que consumen créditos de API externa
    AI_PATH_PREFIXES = (
        "/api/v1/asistente",
        "/api/v1/vision",
        "/api/v1/feynman",
        "/api/v1/infografias",
        "/api/v1/audio",
        "/api/v1/taller",
    )

    def __init__(
        self,
        app: ASGIApp,
        max_requests: int = 100,
        window_seconds: int = 60,
        ai_max_requests: int = 10,
        ai_window_seconds: int = 60,
    ) -> None:
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.ai_max_requests = ai_max_requests
        self.ai_window_seconds = ai_window_seconds
        self._records: Dict[str, List[float]] = defaultdict(list)

    def _is_ai_endpoint(self, path: str) -> bool:
        return any(path.startswith(prefix) for prefix in self.AI_PATH_PREFIXES)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ):
        # Skip rate limiting for health checks and static resources
        path = request.url.path
        if path in ("/health", "/api/v1/health") or path.startswith("/static/"):
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        path = request.url.path
        is_ai = self._is_ai_endpoint(path)

        max_req = self.ai_max_requests if is_ai else self.max_requests
        window = self.ai_window_seconds if is_ai else self.window_seconds

        now = time.time()
        window_start = now - window

        # Prune old entries
        self._records[client_ip] = [
            t for t in self._records[client_ip] if t > window_start
        ]

        if len(self._records[client_ip]) >= max_req:
            retry = int(self._records[client_ip][0] + window - now)
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        f"Demasiadas peticiones ({max_req}/{window}s). "
                        f"{'Endpoint IA: espera para no agotar créditos.' if is_ai else 'Espera unos segundos.'}"
                    ),
                    "retry_after_seconds": retry,
                },
            )

        self._records[client_ip].append(now)
        return await call_next(request)

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract the client IP from headers or direct connection."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        client = request.client
        return client.host if client else "unknown"
