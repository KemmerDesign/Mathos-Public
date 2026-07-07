#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# mathos-install-wsl.sh — Instalación completa de Mathós en WSL Ubuntu 24.04
# ═══════════════════════════════════════════════════════════════════════════════
# USO:
#   1. Clonar el repo dentro de WSL:  git clone <url> ~/Mathos
#   2. Ejecutar:  bash mathos-install-wsl.sh
#   3. Copiar data desde rclone (ver MATHOS_RCLONE_RESTORE.md)
#   4. Crear .env con tus API keys
#   5. Ejecutar:  bash mathos-wsl.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_VERSION="1.0.0"
ROOT_DIR="$HOME/Mathos"
API_DIR="$ROOT_DIR/backend/api"
KERNEL_DIR="$ROOT_DIR/backend/kernel"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$HOME/.venv-mathos-api"
MATHOS_PYTHON="$VENV_DIR/bin/python3"
LOG_FILE="/tmp/mathos-install-$(date +%Y%m%d-%H%M%S).log"

# ─── Colores ───────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Logging ───────────────────────────────────
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }
header() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ─── Pre-check ─────────────────────────────────
check_prereqs() {
    if [ "$(id -u)" -eq 0 ]; then
        err "No ejecutes este script como root. Usa sudo solo cuando el script lo pida."
        exit 1
    fi

    if [ ! -d "$ROOT_DIR" ]; then
        err "No se encuentra el directorio Mathos en $ROOT_DIR"
        echo "   Clona primero:  git clone <url-del-repo> $ROOT_DIR"
        echo "   O mueve la carpeta Mathos a $ROOT_DIR"
        exit 1
    fi

    if [ ! -f "$API_DIR/requirements.txt" ]; then
        err "No se encuentra backend/api/requirements.txt en $ROOT_DIR"
        echo "   Verifica que clonaste el repositorio correcto."
        exit 1
    fi

    # Detectar si estamos en WSL
    if grep -qi microsoft /proc/version 2>/dev/null; then
        log "WSL detectado"
        IS_WSL=true
    else
        warn "No parece ser WSL, pero continuando de todas formas..."
        IS_WSL=false
    fi
}

# ─── FASE 1: Paquetes del sistema ──────────────
install_system_packages() {
    header "FASE 1/6 — Paquetes del sistema"

    info "Actualizando repositorios..."
    sudo apt update -qq 2>&1 | tail -1

    info "Instalando paquetes esenciales..."
    sudo apt install -y -qq \
        python3 python3-pip python3-venv \
        g++ cmake make \
        postgresql-16 postgresql-client-16 \
        redis-server \
        git curl wget zip unzip \
        libjsoncpp-dev libssl-dev libuuid1 uuid-dev libz-dev \
        libc-ares-dev libbrotli-dev libzstd-dev \
        2>&1 | tail -2

    log "Paquetes del sistema instalados"
}

# ─── FASE 2: uv + venv Python ──────────────────
setup_python() {
    header "FASE 2/6 — Entorno Python"

    if [ -d "$VENV_DIR" ] && [ -f "$MATHOS_PYTHON" ]; then
        info "Venv ya existe en $VENV_DIR"
    else
        info "Instalando uv (pip más rápido)..."
        pip3 install --user -q uv 2>&1 | tail -1

        info "Creando virtualenv en $VENV_DIR..."
        uv venv "$VENV_DIR" 2>&1 | tail -1
    fi

    info "Instalando dependencias del backend..."
    uv pip install --python "$MATHOS_PYTHON" \
        -r "$API_DIR/requirements.txt" \
        turbovec sentence-transformers beautifulsoup4 aiosqlite \
        -q 2>&1 | tail -2

    log "Backend Python listo — $VENV_DIR"
}

# ─── FASE 3: Drogon (kernel C++) ───────────────
install_drogon() {
    header "FASE 3/6 — Kernel C++ (Drogon)"

    # Verificar si Drogon ya está instalado
    if [ -f "/usr/local/lib/libdrogon.so" ]; then
        info "Drogon ya está instalado — saltando compilación"
    else
        info "Clonando Drogon desde fuente..."
        cd "$HOME"
        if [ -d "drogon" ]; then
            info "Directorio drogon ya existe, actualizando..."
            cd drogon && git pull --depth 1 2>&1 | tail -1
        else
            git clone --depth 1 https://github.com/drogonframework/drogon 2>&1 | tail -1
            cd drogon
        fi

        info "Compilando Drogon (Release)..."
        mkdir -p build && cd build
        cmake .. -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -1
        cmake --build . -j"$(nproc)" 2>&1 | tail -2

        info "Instalando Drogon..."
        sudo cmake --install . 2>&1 | tail -1

        log "Drogon compilado e instalado"
    fi
}

# ─── FASE 4: Compilar kernel Mathós ───────────
compile_kernel() {
    header "FASE 4/6 — Compilar Mathós Kernel"

    cd "$KERNEL_DIR"

    if [ -f "build/mathos-kernel" ]; then
        info "Kernel ya compilado, re-compilando para asegurar..."
    fi

    bash build.sh 2>&1 | tail -3

    if [ -f "build/mathos-kernel" ]; then
        log "Kernel compilado: $KERNEL_DIR/build/mathos-kernel"
    else
        err "Falló la compilación del kernel"
        exit 1
    fi
}

# ─── FASE 5: PostgreSQL y Redis ────────────────
setup_databases() {
    header "FASE 5/6 — PostgreSQL + Redis"

    # PostgreSQL
    info "Iniciando PostgreSQL..."
    sudo service postgresql start 2>/dev/null || warn "¿PostgreSQL ya estaba corriendo?"

    # Verificar si el usuario mathos existe
    if sudo -u postgres psql -t -c "SELECT 1 FROM pg_roles WHERE rolname='mathos'" 2>/dev/null | grep -q 1; then
        info "Usuario 'mathos' ya existe en PostgreSQL"
    else
        info "Creando usuario y base de datos 'mathos'..."
        sudo -u postgres psql -c "CREATE USER mathos WITH PASSWORD '${DB_PASSWORD:-mathos_dev}';" 2>&1
        sudo -u postgres psql -c "CREATE DATABASE mathos OWNER mathos;" 2>&1
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mathos TO mathos;" 2>&1

        # Trust para desarrollo
        PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file" 2>/dev/null | tr -d ' ')
        if [ -n "$PG_HBA" ]; then
            sudo sed -i 's/peer/trust/g; s/scram-sha-256/trust/g' "$PG_HBA"
            sudo service postgresql restart 2>/dev/null
        fi
        log "PostgreSQL configurado"
    fi

    # Redis
    info "Iniciando Redis..."
    sudo service redis-server start 2>/dev/null || warn "¿Redis ya estaba corriendo?"
    log "Redis listo"
}

# ─── FASE 6: Crear .env y script de inicio ────
setup_env_and_start() {
    header "FASE 6/6 — Configuración final"

    # .env
    if [ -f "$ROOT_DIR/.env" ]; then
        info ".env ya existe — no se sobreescribe"
    else
        warn "⚠️  NO HAY ARCHIVO .env"
        echo ""
        echo "   Crea $ROOT_DIR/.env con este contenido mínimo:"
        echo ""
        echo "   JWT_SECRET=genera-una-clave-segura-aqui"
        echo "   DEEPSEEK_API_KEY=tu_key"
        echo "   GEMINI_API_KEY=tu_key_opcional"
        echo ""
        echo "   Copia desde .env.example si prefieres:"
        echo "   cp $ROOT_DIR/.env.example $ROOT_DIR/.env"
        echo "   nano $ROOT_DIR/.env"
        echo ""
    fi

    # Script de inicio WSL
    if [ -f "$ROOT_DIR/mathos-wsl.sh" ]; then
        info "mathos-wsl.sh ya existe"
    else
        info "Creando mathos-wsl.sh desde README-MIGRACION.md..."
        warn "Copia manualmente el contenido de mathos-wsl.sh desde README-MIGRACION.md"
        warn "o desde el archivo original en el repo."
    fi

    chmod +x "$ROOT_DIR/mathos-wsl.sh" 2>/dev/null || true

    log "Configuración final completada"
}

# ─── Resumen final ─────────────────────────────
show_summary() {
    header "🎯 INSTALACIÓN COMPLETA"

    echo ""
    echo -e "  ${BOLD}Mathós está instalado en:${NC}  $ROOT_DIR"
    echo ""
    echo -e "  ${YELLOW}⚠️  ANTES DE ARRANCAR, NECESITAS:${NC}"
    echo ""
    echo "  1. Crear $ROOT_DIR/.env con tus API keys"
    echo "     (deepseek, gemini, qwen, jwt_secret)"
    echo ""
    echo "  2. Restaurar data desde rclone:"
    echo -e "     ${CYAN}bash $ROOT_DIR/mathos-rclone-restore.sh${NC}"
    echo "     (solo si tienes rclone configurado con la cuenta de Google Drive)"
    echo ""
    echo ""
    echo -e "  ${BOLD}PARA ARRANCAR:${NC}"
    echo ""
    echo -e "  ${CYAN}bash $ROOT_DIR/mathos-wsl.sh${NC}"
    echo "  (Arranca PostgreSQL → Redis → Kernel C++ → Backend API)"
    echo ""
    echo "  Luego en Windows (PowerShell):"
    echo "  cd .\\Mathos\\frontend"
    echo "  npm install"
    echo "  npm run dev"
    echo ""
    echo "  O si prefieres build estático:"
    echo "  cd Mathos/frontend && npm run build"
    echo ""
    echo -e "  ${BOLD}ACCESOS:${NC}"
    echo "  API:       http://localhost:8001/docs"
    echo "  Kernel:    http://localhost:8100/health"
    echo "  Frontend:  http://localhost:5173"
    echo ""
}

# ═══════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║${NC}  🧠 Mathós — Instalador para WSL Ubuntu 24.04        ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  v$SCRIPT_VERSION                                          ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

check_prereqs
install_system_packages
setup_python
install_drogon
compile_kernel
setup_databases
setup_env_and_start
show_summary

log "Script completado. Revisa las notas de la FASE 6."
