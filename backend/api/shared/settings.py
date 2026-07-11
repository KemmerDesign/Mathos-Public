from pydantic_settings import BaseSettings, SettingsConfigDict, PydanticBaseSettingsSource
from pathlib import Path
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_priority=True,  # .env tiene prioridad sobre variables del shell
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Prioridad: .env > init > env (shell) > file_secrets
        return (dotenv_settings, init_settings, env_settings, file_secret_settings)

    # ──────────────────────────────────────────────
    # Database
    # ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://mathos:${DB_PASSWORD:-mathos_dev}@localhost:5432/mathos"
    # PostgreSQL es la unica base de datos soportada. No usar SQLite.
    # Si no hay .env, este default apunta a la instalacion local de PostgreSQL.

    # ──────────────────────────────────────────────
    # Redis
    # ──────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ──────────────────────────────────────────────
    # JWT Authentication
    # ──────────────────────────────────────────────
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 120

    # ──────────────────────────────────────────────
    # API Keys
    # ──────────────────────────────────────────────
    DEEPSEEK_API_KEY: str = ""
    QWEN_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    @property
    def DEEPSEEK_API_KEY_RESOLVED(self) -> str:
        """Retorna DEEPSEEK_API_KEY. Fallback a variable de entorno directamente."""
        if self.DEEPSEEK_API_KEY:
            return self.DEEPSEEK_API_KEY
        # Fallback directo a os.environ como ultimo recurso
        return os.environ.get("DEEPSEEK_API_KEY", "")

    @property
    def QWEN_API_KEY_RESOLVED(self) -> str:
        if self.QWEN_API_KEY:
            return self.QWEN_API_KEY
        return os.environ.get("QWEN_API_KEY", "")

    # ──────────────────────────────────────────────
    # Project API Key (frontend → backend auth)
    # ──────────────────────────────────────────────
    MATHOS_API_KEY: str = ""

    # ──────────────────────────────────────────────
    # Whitelist de emails autorizados a registrarse
    # ──────────────────────────────────────────────
    ALLOWED_EMAILS: str = ""
    # Lista de emails autorizados separados por coma.
    # Si está vacío, el registro está ABIERTO (modo desarrollo).
    # Ejemplo: ALLOWED_EMAILS=tu@email.com,otro@email.com

    @property
    def ALLOWED_EMAILS_SET(self) -> set[str]:
        """Devuelve el conjunto de emails autorizados (en minúsculas). Vacío = registro abierto."""
        if not self.ALLOWED_EMAILS.strip():
            return set()
        return {e.strip().lower() for e in self.ALLOWED_EMAILS.split(",") if e.strip()}

    @property
    def REGISTRATION_OPEN(self) -> bool:
        """True si el registro está abierto a cualquier email (ALLOWED_EMAILS no definido)."""
        return len(self.ALLOWED_EMAILS_SET) == 0

    # ──────────────────────────────────────────────
    # ChromaDB (RAG vector store)
    # ──────────────────────────────────────────────
    CHROMA_DB_PATH: str = "ia/chroma_db"

    # ──────────────────────────────────────────────
    # C++ Kernel (sandbox for code execution)
    # ──────────────────────────────────────────────
    KERNEL_URL: str = "http://localhost:8100"
    COMPILE_TIMEOUT_SECONDS: int = 10

    @property
    def CHROMA_DB_ABSOLUTE_PATH(self) -> Path:
        """Resolve the ChromaDB path relative to the project root."""
        project_root = Path(__file__).resolve().parent.parent.parent.parent  # backend/api/shared -> Mathos
        return project_root / self.CHROMA_DB_PATH

    # ──────────────────────────────────────────────
    # Uploads (libros subidos por el usuario)
    # ──────────────────────────────────────────────
    UPLOADS_DIR: str = "uploads"
    # Puede ser absoluta o relativa al proyecto. En Docker se sobreescribe con
    # la ruta del volumen montado, ej: UPLOADS_DIR=/data/uploads

    @property
    def UPLOADS_DIR_ABSOLUTE(self) -> Path:
        """Devuelve UPLOADS_DIR como Path absoluta. Si es relativa, se resuelve desde la raíz del proyecto."""
        p = Path(self.UPLOADS_DIR)
        if p.is_absolute():
            return p
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        return project_root / p

    @property
    def JWT_SECRET_REQUIRED(self) -> str:
        """Return JWT_SECRET or raise if empty in production."""
        secret = self.JWT_SECRET
        if secret:
            return secret
        if os.getenv("ENV", "development") == "production":
            raise RuntimeError("JWT_SECRET is required in production")
        raise RuntimeError("JWT_SECRET must be set in .env or environment")


settings = Settings()
