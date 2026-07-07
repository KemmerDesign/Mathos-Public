#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build.sh – Build mathos-kernel
# Usage: ./build.sh [clean]
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

BUILD_DIR="build"

if [[ "${1:-}" == "clean" ]]; then
    echo "==> Cleaning build directory…"
    rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "==> Configuring CMake (Release)…"
cmake .. -DCMAKE_BUILD_TYPE=Release

echo "==> Building…"
cmake --build . -j "$(nproc)"

echo "==> Binary: $(pwd)/mathos-kernel"
echo "==> Build complete."
