from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings


def configure_cors(app: FastAPI) -> None:
    """Apply CORS middleware to the FastAPI application.

    Origins allowed:
    - Local development servers (React default ports)
    - Any origin when running in development mode (for convenience)
    """
    origins = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
