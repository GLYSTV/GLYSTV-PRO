#!/usr/bin/env bash
# Comprueba el proyecto igual que la integración continua (lint, tipos, build, arranque + salud).
# Uso: npm run check   (requiere DATABASE_URL en .env o en el entorno)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${DATABASE_URL:?Define DATABASE_URL en .env}"
PORT="${CHECK_PORT:-3999}"

echo "▶ lint";  npm run lint
echo "▶ tipos"; npx next typegen >/dev/null && npm run typecheck
echo "▶ build"; npm run build

echo "▶ arranque en el puerto ${PORT}"
# Lanzamos next directamente (no a través de npm) para poder detenerlo de forma fiable.
node node_modules/next/dist/bin/next start -p "${PORT}" >/tmp/glystv-check.log 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "✓ todo correcto (esquema listo, salud OK)"
    exit 0
  fi
  sleep 2
done
echo "✗ la aplicación no respondió con ok:true"
tail -20 /tmp/glystv-check.log
exit 1
