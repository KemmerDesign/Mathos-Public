from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from .settings import settings

# ──────────────────────────────────────────────
# Password hashing
# ──────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

security_scheme = HTTPBearer(auto_error=False)


# ──────────────────────────────────────────────
# Token creation
# ──────────────────────────────────────────────
def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_REQUIRED,
        algorithm=settings.JWT_ALGORITHM,
    )


# ──────────────────────────────────────────────
# Password helpers
# ──────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Return a bcrypt hash of the password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plain-text password against its bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ──────────────────────────────────────────────
# Dependency: get current user (required)
# ──────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> dict:
    """Decode and validate the bearer token. Returns the user payload.

    Raises 401 if the token is missing, expired, or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_REQUIRED,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


# ──────────────────────────────────────────────
# Dependency: get current user (optional)
# ──────────────────────────────────────────────
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Optional[dict]:
    """Like get_current_user but returns None instead of raising 401."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_REQUIRED,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None


# ──────────────────────────────────────────────
# Role-based access
# ──────────────────────────────────────────────
def require_role(role: str):
    """Return a dependency that checks the user has the required role.

    Usage::

        @router.get("/admin-only")
        async def admin_endpoint(user: dict = Depends(require_role("admin"))):
            ...
    """

    async def _role_checker(user: dict = Depends(get_current_user)) -> dict:
        user_role = user.get("role", "user")
        if user_role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is required",
            )
        return user

    return _role_checker


# ──────────────────────────────────────────────
# API Key auth (simple, para frontend)
# ──────────────────────────────────────────────
from fastapi import Request

async def require_api_key(request: Request) -> str:
    """Valida el header X-API-Key contra MATHOS_API_KEY en .env.

    Usar como dependencia en rutas que requieran autenticación::

        @router.post("/endpoint")
        async def mi_endpoint(api_key: str = Depends(require_api_key)):
            ...

    Returns:
        La API key validada.

    Raises:
        401 si el header falta o no coincide.
    """
    api_key = request.headers.get("X-API-Key")
    expected = settings.MATHOS_API_KEY

    if not expected:
        # Si no hay key configurada, permitir todo (dev mode)
        return "dev-no-key"

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header requerido. Configúralo en el frontend.",
        )

    if api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key inválida",
        )

    return api_key
