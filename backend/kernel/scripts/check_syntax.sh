#!/usr/bin/env bash
set -euo pipefail

DIR="$(dirname "$0")/.."

echo "=== Brace balance check ==="
for f in "$DIR/src/sandbox.cpp" "$DIR/src/main.cpp" "$DIR/include/sandbox.h"; do
  open=$(grep -o '{' "$f" | wc -l)
  close=$(grep -o '}' "$f" | wc -l)
  status="OK"
  [ "$open" -ne "$close" ] && status="MISMATCH"
  echo "$(basename "$f"): { = $open  } = $close  $status"
done
