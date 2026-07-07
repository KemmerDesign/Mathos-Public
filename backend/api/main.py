from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from shared.cors import configure_cors
from shared.database import init_db
from shared.rate_limit import RateLimiterMiddleware
from shared.settings import settings
from middleware.auth import JWTAuthMiddleware


# ─── Security Headers Middleware ────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Rutas /archivo sirven PDFs/EPUBs en iframe — no aplicar DENY
        if not request.url.path.endswith("/archivo"):
            response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


# ──────────────────────────────────────────────
# Lifespan — runs on startup / shutdown
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    await init_db()
    yield
    # Shutdown (cleanup if needed in the future)


# ──────────────────────────────────────────────
# App creation
# ──────────────────────────────────────────────
app = FastAPI(
    title="Mathós API",
    description="Backend API for Mathós — AI-assisted study platform for UNED Mathematics Degree",
    version="0.1.0",
    lifespan=lifespan,
)

# ──────────────────────────────────────────────
# Middleware (order matters)
# ──────────────────────────────────────────────
configure_cors(app)

# API Key middleware para endpoints sensibles (POST/PUT/DELETE)
class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Solo proteger métodos que modifican datos
        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            path = request.url.path
            public = ["/openapi.json", "/docs", "/redoc", "/health"]
            auth_paths = ["/api/v1/auth/"]
            if any(path.startswith(p) for p in public + auth_paths) or "/archivo" in path:
                return await call_next(request)
            api_key = request.headers.get("X-API-Key")
            expected = getattr(settings, "MATHOS_API_KEY", "")
            if expected and api_key != expected:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "X-API-Key requerido. Configúralo en el frontend."},
                )
        return await call_next(request)

app.add_middleware(ApiKeyMiddleware)
app.add_middleware(RateLimiterMiddleware, max_requests=100, window_seconds=60, ai_max_requests=10, ai_window_seconds=60)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(JWTAuthMiddleware)


# ──────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    return JSONResponse(
        content={
            "status": "ok",
            "service": "mathos-api",
        },
        status_code=200,
    )


# ──────────────────────────────────────────────
# Routers (imported and mounted here)
# ──────────────────────────────────────────────
from routes.auth import router as auth_router
from routes.materias import router as materias_router
from routes.temas import router as temas_router
from routes.asistente import router as asistente_router
from routes.vision import router as vision_router
from routes.infografias import router as infografias_router
from routes.feynman_trainer import router as feynman_router
from routes.audio import router as audio_router
from routes.taller import router as taller_router
from routes.simulacro import router as simulacro_router
from routes.sandbox_sql import router as sandbox_sql_router
from routes.srs import router as srs_router
from routes.libros import router as libros_router
from routes.glosario import router as glosario_router
from routes.agenda import router as agenda_router
from routes.geo import router as geo_router
from routes.cerebro import router as cerebro_router
# from .routes.progreso import router as progreso_router    # TODO: implement progreso

app.include_router(materias_router, prefix="/api/v1/materias", tags=["materias"])
app.include_router(temas_router, prefix="/api/v1/temas", tags=["temas"])
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(asistente_router, prefix="/api/v1/asistente", tags=["asistente"])
app.include_router(vision_router, prefix="/api/v1/vision", tags=["vision"])
app.include_router(infografias_router, prefix="/api/v1/infografias", tags=["infografias"])
app.include_router(feynman_router, prefix="/api/v1/feynman", tags=["feynman"])
app.include_router(audio_router, prefix="/api/v1/audio", tags=["audio"])
app.include_router(taller_router, prefix="/api/v1/taller", tags=["taller"])
app.include_router(simulacro_router, prefix="/api/v1/simulacro", tags=["simulacro"])
app.include_router(sandbox_sql_router, prefix="/api/v1/sandbox/sql", tags=["sandbox-sql"])
app.include_router(srs_router, prefix="/api/v1/srs", tags=["srs"])
app.include_router(libros_router, prefix="/api/v1/libros", tags=["libros"])
app.include_router(glosario_router, prefix="/api/v1/glosario", tags=["glosario"])
app.include_router(agenda_router, prefix="/api/v1/agenda", tags=["agenda"])
app.include_router(geo_router, prefix="/api/v1/geo", tags=["geo"])
app.include_router(cerebro_router, prefix="/api/v1/cerebro", tags=["cerebro"])
# app.include_router(progreso_router, prefix="/api/v1/progreso", tags=["progreso"])

# Servir archivos de audio generados
AUDIO_DATA_DIR = "data/audio"
import os as _os
_audio_dir = _os.path.join(_os.path.dirname(__file__), AUDIO_DATA_DIR)
_os.makedirs(_audio_dir, exist_ok=True)
app.mount("/resources/audio", StaticFiles(directory=_audio_dir), name="audio_resources")
