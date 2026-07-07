"""
Mathós — Rutas de autenticación (register + login).

Endpoints:
- POST /api/v1/auth/register  — crear nuevo usuario
- POST /api/v1/auth/login     — obtener JWT Bearer token
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Usuario
from shared.database import get_session
from shared.settings import settings

router = APIRouter()

# ─── Password hashing ───────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Pydantic schemas ───────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── Password hashing (bcrypt directo, sin passlib) ───
import bcrypt as _bcrypt

def _hash_password(password: str) -> str:
    """Return bcrypt hash of the given password."""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against its bcrypt hash."""
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _create_access_token(usuario_id: str) -> str:
    """Create a JWT access token (HS256) with 24h expiration."""
    secret = settings.JWT_SECRET_REQUIRED
    algorithm = settings.JWT_ALGORITHM
    # Use JWT_EXPIRE_MINUTES from settings (default 120min = 2h),
    # but we want 24h for this auth system.
    expire_minutes = getattr(settings, "JWT_EXPIRE_MINUTES", 120)
    # Override to 24h as specified
    expire_minutes = 24 * 60

    now = datetime.now(timezone.utc)
    payload = {
        "sub": usuario_id,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
        "type": "access",
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


# ─── Endpoints ──────────────────────────────────────
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    req: RegisterRequest,
    db: AsyncSession = Depends(get_session),
) -> UserResponse:
    """Register a new user."""
    # Normalize
    username = req.username.strip()
    email = req.email.strip().lower()

    if not username or len(username) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario debe tener al menos 2 caracteres.",
        )

    # ── Whitelist de emails ────────────────────────────────────────────
    # Si ALLOWED_EMAILS está configurado en el .env, solo esos emails
    # pueden registrarse. El mensaje es intencionalmente genérico para
    # no revelar si un email concreto está en la lista.
    if not settings.REGISTRATION_OPEN and email not in settings.ALLOWED_EMAILS_SET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El registro está restringido. Contacta al administrador para obtener acceso.",
        )

    # Check existing username
    result = await db.execute(select(Usuario).where(Usuario.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El nombre de usuario ya está registrado.",
        )

    # Check existing email
    result = await db.execute(select(Usuario).where(Usuario.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El correo electrónico ya está registrado.",
        )

    if len(req.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener al menos 8 caracteres.",
        )

    usuario = Usuario(
        username=username,
        email=email,
        password_hash=_hash_password(req.password),
    )
    db.add(usuario)
    await db.flush()  # commit already handled by get_session

    return UserResponse(
        id=usuario.id,
        username=usuario.username,
        email=usuario.email,
    )



@router.post("/login", response_model=LoginResponse)
async def login(
    req: LoginRequest,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    """Authenticate user and return a JWT Bearer token."""
    email = req.email.strip().lower()

    result = await db.execute(select(Usuario).where(Usuario.email == email))
    usuario: Optional[Usuario] = result.scalar_one_or_none()

    if not usuario or not _verify_password(req.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas.",
        )

    if not usuario.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta desactivada. Contacta al administrador.",
        )

    access_token = _create_access_token(usuario.id)

    return LoginResponse(
        access_token=access_token,
        user=UserResponse(
            id=usuario.id,
            username=usuario.username,
            email=usuario.email,
        ),
    )
