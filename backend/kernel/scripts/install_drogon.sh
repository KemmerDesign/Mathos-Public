#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# install_drogon.sh – Install Drogon C++ web framework from source
#
# Installs to /usr/local by default.
# Requires: g++ ≥ 11, cmake ≥ 3.20, make, libjsoncpp-dev, libssl-dev,
#           libboost-all-dev, uuid-dev, zlib1g-dev
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── 1. System dependencies ──────────────────────────────────────────────────
echo "==> Installing system dependencies…"
sudo apt-get update -qq
sudo apt-get install -y -qq \
    g++ cmake make \
    libjsoncpp-dev \
    libssl-dev \
    libboost-all-dev \
    uuid-dev \
    zlib1g-dev \
    git

# ── 2. Clone & build Drogon ────────────────────────────────────────────────
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "==> Cloning drogon (master)…"
git clone --depth 1 https://github.com/drogonframework/drogon "$TMPDIR/drogon"

cd "$TMPDIR/drogon"
mkdir -p build && cd build

echo "==> Configuring Drogon…"
cmake .. -DCMAKE_BUILD_TYPE=Release \
         -DCMAKE_INSTALL_PREFIX=/usr/local \
         -DBUILD_SHARED_LIBS=ON \
         -DBUILD_EXAMPLES=OFF \
         -DBUILD_TESTING=OFF \
         -DBUILD_CTL=OFF

echo "==> Building Drogon ($(nproc) cores)…"
cmake --build . -j "$(nproc)"

echo "==> Installing Drogon…"
sudo cmake --install .

echo "==> Drogon installed successfully."
echo "    pkg-config: pkg-config --cflags --libs drogon"
