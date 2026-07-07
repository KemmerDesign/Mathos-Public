#!/bin/bash
# Mathós — Inicio rápido
# Uso: bash mathos.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT_DIR/backend/api"
FRONTEND_DIR="$ROOT_DIR/frontend"
KERNEL_DIR="$ROOT_DIR/backend/kernel"

# Python del backend — venv permanente con turbovec + sentence_transformers
MATHOS_PYTHON="${MATHOS_PYTHON:-python3}"
if [ ! -f "$MATHOS_PYTHON" ]; then
  echo "⚠️  Venv del backend no encontrado en $MATHOS_PYTHON"
  echo "   Recrea con: uv venv .venv-mathos-api && uv pip install --python .venv-mathos-api/bin/python -r backend/api/requirements.txt turbovec sentence-transformers beautifulsoup4"
  MATHOS_PYTHON=python3
fi

echo "╔══════════════════════════════════════════╗"
echo "║        Mathós — Plataforma de estudio    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Flags ────────────────────────────────────
DO_BUILD=false
DO_SEED=false
DO_KERNEL=false
DO_STATUS=false
DO_DOCKER=false
for arg in "$@"; do
  case $arg in
    --build) DO_BUILD=true ;;
    --seed) DO_SEED=true ;;
    --kernel) DO_KERNEL=true ;;
    --status) DO_STATUS=true ;;
    --docker) DO_DOCKER=true ;;
  esac
done

# ─── Docker mode ──────────────────────────────
if [ "$DO_DOCKER" = true ]; then
  echo "🐳 Mathós — Modo Docker"
  echo ""
  echo "Iniciando todos los servicios con docker compose..."
  cd "$ROOT_DIR"
  docker compose up -d --build
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  Mathós (Docker) está listo              ║"
  echo "║                                          ║"
  echo "║  API:       http://localhost:8001/docs   ║"
  echo "║  Kernel:    http://localhost:8100/health ║"
  echo "║  Frontend:  Corre con 'npm run dev'     ║"
  echo "║             en /tmp/mathos-frontend      ║"
  echo "║                                          ║"
  echo "║  Para detener: docker compose down       ║"
  echo "╚══════════════════════════════════════════╝"
  exit 0
fi

# ─── Status check ─────────────────────────────
if [ "$DO_STATUS" = true ]; then
  echo "🔍 Mathós — Estado de servicios"
  echo ""

  # Kernel
  KPID=$(pgrep -x mathos-kernel 2>/dev/null)
  if [ -n "$KPID" ]; then
    KHEALTH=$(curl -s --max-time 2 http://localhost:8100/api/v1/health 2>/dev/null)
    echo "✅ Kernel C++       — PID $KPID, puerto 8100 — $KHEALTH"
  else
    echo "❌ Kernel C++       — NO está corriendo (puerto 8100)"
  fi

  # API
  APID=$(pgrep -f "uvicorn main:app" 2>/dev/null | head -1)
  if [ -n "$APID" ]; then
    AHEALTH=$(curl -s --max-time 2 http://localhost:8001/api/v1/materias 2>/dev/null | head -c 80)
    echo "✅ API FastAPI      — PID $APID, puerto 8001 — $AHEALTH"
  else
    echo "❌ API FastAPI      — NO está corriendo (puerto 8001)"
  fi

  # Frontend
  FPID=$(pgrep -f "vite" 2>/dev/null | head -1)
  if [ -n "$FPID" ]; then
    FHEALTH=$(curl -s --max-time 2 http://localhost:5173/ 2>/dev/null | head -c 60)
    echo "✅ Frontend Vite    — PID $FPID, puerto 5173 — $FHEALTH"
  else
    echo "❌ Frontend Vite    — NO está corriendo (puerto 5173)"
  fi

  exit 0
fi

# ─── Verificar .env ────────────────────────────
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "⚠️  No hay .env. Creando con defaults de desarrollo..."
  cat > "$ROOT_DIR/.env" << 'ENVEOF'
DEEPSEEK_API_KEY=
QWEN_API_KEY=
GEMINI_API_KEY=
DATABASE_URL=postgresql+asyncpg://mathos:${DB_PASSWORD:-mathos_dev}@localhost:5432/mathos
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=${JWT_SECRET:-}
ENVEOF
  echo "   ✅ .env creado. Edita las API keys para usar el asistente."
fi

# ─── Infraestructura ──────────────────────────
echo "1️⃣  Verificando base de datos..."
DB_OK=false

# Verificar si PostgreSQL está corriendo nativamente en el puerto 5432
if (exec 3<>/dev/tcp/127.0.0.1/5432) &>/dev/null; then
  echo "   ✅ PostgreSQL detectado corriendo localmente (nativo)"
  DB_OK=true
elif command -v docker &> /dev/null; then
  # Try root-level docker-compose first (preferred), fall back to infra/ one
  if [ -f "$ROOT_DIR/docker-compose.yml" ]; then
    docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres redis 2>/dev/null && DB_OK=true
  else
    docker compose -f "$ROOT_DIR/infra/docker-compose.yml" up -d 2>/dev/null && DB_OK=true
  fi
fi

if [ "$DB_OK" = false ]; then
  if grep -q "DATABASE_URL=postgresql" "$ROOT_DIR/.env" 2>/dev/null; then
    echo "   ✅ Usando PostgreSQL según configuracion en .env"
  else
    echo "   ⚠️  PostgreSQL no disponible. Usando SQLite para desarrollo..."
    pip install -q aiosqlite 2>/dev/null || true
    export DATABASE_URL="sqlite+aiosqlite:///$ROOT_DIR/mathos_dev.db"
    echo "   ✅ Usando SQLite: mathos_dev.db"
  fi
else
  echo "   ✅ PostgreSQL listo"
fi

# ─── Seed ──────────────────────────────────────
if [ "$DO_SEED" = true ]; then
  echo "2️⃣  Sembrando datos UNED..."
  cd "$API_DIR"
  "$MATHOS_PYTHON" seed.py && echo "   ✅ Seed completado" || echo "   ❌ Seed falló"
fi

# ─── Kernel C++ ──────────────────────────────
echo "3️⃣  Verificando kernel C++..."
KERNEL_BIN="$KERNEL_DIR/build/mathos-kernel"
if [ -f "$KERNEL_BIN" ]; then
  # Copiar a /tmp (noexec workaround)
  cp "$KERNEL_BIN" /tmp/mathos-kernel 2>/dev/null
  chmod +x /tmp/mathos-kernel 2>/dev/null
  # Verificar health con timeout de 2s
  HEALTH=$(curl -s --max-time 2 http://localhost:8100/api/v1/health 2>/dev/null || echo "fail")
  if echo "$HEALTH" | grep -q '"ok"'; then
    echo "   ✅ Kernel ya corriendo"
  else
    /tmp/mathos-kernel > /dev/null 2>&1 &
    KERNEL_PID=$!
    sleep 2
    HEALTH2=$(curl -s --max-time 2 http://localhost:8100/api/v1/health 2>/dev/null || echo "fail")
    if echo "$HEALTH2" | grep -q '"ok"'; then
      echo "   ✅ Kernel C++ corriendo en puerto 8100 (PID: $KERNEL_PID)"
    else
      echo "   ⚠️  Kernel no disponible (compile manual: cd backend/kernel && bash build.sh)"
    fi
  fi
else
  echo "   ⚠️  Kernel no compilado. Ejecuta: cd backend/kernel && bash build.sh"
fi

# ─── Backend API ──────────────────────────────
echo "4️⃣  Iniciando backend API en puerto 8001..."
cd "$API_DIR"
"$MATHOS_PYTHON" -m uvicorn main:app --reload --host 0.0.0.0 --port 8001 --app-dir "$API_DIR" &
API_PID=$!
echo "   ✅ API corriendo (PID: $API_PID)"

# Esperar a que la API esté lista
sleep 2

# Seed automático si no hay datos
echo "   Verificando si hay datos en la BD..."
curl -s http://localhost:8001/api/v1/materias | grep -q "\[\]" && {
  echo "   📦 BD vacía, sembrando datos UNED..."
  cd "$API_DIR" && "$MATHOS_PYTHON" seed.py 2>/dev/null && echo "   ✅ Seed completado"
} || echo "   ✅ BD ya tiene datos"

# ─── Frontend ─────────────────────────────────
echo "5️⃣  Iniciando frontend en puerto 5173..."
# Estrategia: bind mount de src/ (edits en caliente) + rsync de archivos estáticos
# node_modules vive en /tmp para evitar problemas de permisos en fuseblk/NTFS
mkdir -p /tmp/mathos-frontend

# Desmontar bind mount previo si existe (por si mathos.sh se corrió antes sin limpiar)
mountpoint -q /tmp/mathos-frontend/src 2>/dev/null && sudo umount /tmp/mathos-frontend/src 2>/dev/null || true

# Copiar archivos estáticos (config, public, index.html) — solo si no existen
if [ ! -f "/tmp/mathos-frontend/package.json" ]; then
  echo "   📋 Copiando archivos estáticos a /tmp..."
  rsync -a --exclude=src --exclude=node_modules "$FRONTEND_DIR/" /tmp/mathos-frontend/
fi

# Bind mount del directorio src — los cambios en el fuente son instantáneos
if ! mountpoint -q /tmp/mathos-frontend/src 2>/dev/null; then
  echo "   🔗 Montando src/ con bind mount (edición en caliente)..."
  mkdir -p /tmp/mathos-frontend/src
  sudo mount --bind "$FRONTEND_DIR/src" /tmp/mathos-frontend/src
fi

cd /tmp/mathos-frontend
# Instalar dependencias si no existe node_modules o si package.json cambió
if [ ! -d "node_modules" ] || [ "$FRONTEND_DIR/package.json" -nt "node_modules/.package-lock.json" ]; then
  echo "   📦 Instalando/Actualizando dependencias en /tmp..."
  npm install && touch node_modules/.package-lock.json
  cp package-lock.json "$FRONTEND_DIR/package-lock.json" 2>/dev/null || true
fi

# Fix: fuseblk no soporta permisos Unix → los binarios nativos pierden +x
chmod +x node_modules/.bin/* 2>/dev/null || true
find node_modules -name "esbuild" -type f -exec chmod +x {} \; 2>/dev/null || true
find node_modules -name "rollup" -type f -exec chmod +x {} \; 2>/dev/null || true
find node_modules -path "*/bin/*" -type f -exec chmod +x {} \; 2>/dev/null || true

npx vite --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!
echo "   ✅ Frontend corriendo (PID: $FRONTEND_PID)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Mathós está listo                       ║"
echo "║                                          ║"
echo "║  Frontend:  http://localhost:5173        ║"
echo "║  API:       http://localhost:8001/docs   ║"
echo "║  Kernel:    http://localhost:8100/health ║"
echo "║                                          ║"
echo "║  Para detener: Ctrl+C                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "💡 Consejo: Prueba el asistente con:"
echo "   curl -X POST http://localhost:8001/api/v1/asistente/preguntar \\"
echo '     -H "Content-Type: application/json" \'
echo '     -d "{\"pregunta\":\"Qué es un puntero en C++?\",\"nivel\":\"dummy\"}"'
echo ""

# Capturar Ctrl+C para detener todo limpio
trap "echo ''; echo 'Deteniendo Mathós...'; kill \$API_PID \$FRONTEND_PID \$KERNEL_PID 2>/dev/null; pkill -x mathos-kernel 2>/dev/null; sudo umount /tmp/mathos-frontend/src 2>/dev/null; echo '✅ Detenido'" EXIT

# Mantener el script vivo
wait
