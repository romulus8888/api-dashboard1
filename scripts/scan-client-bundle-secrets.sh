#!/usr/bin/env bash
# Scan Next.js client bundles for service_role canaries after `npm run build`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC_DIR="$ROOT/.next/static"

if [[ ! -d "$STATIC_DIR" ]]; then
  echo ".next/static not found. Run npm run build first." >&2
  exit 1
fi

if grep -R -E -i -l 'SUPABASE_SERVICE_ROLE_KEY|service_role|supabase_service_role' "$STATIC_DIR" \
  --include='*.js' --include='*.json' --include='*.txt' >/dev/null 2>&1; then
  echo "service_role canary found in client bundles:" >&2
  grep -R -E -i -n 'SUPABASE_SERVICE_ROLE_KEY|service_role|supabase_service_role' "$STATIC_DIR" \
    --include='*.js' --include='*.json' --include='*.txt' >&2 || true
  exit 1
fi

echo "OK: no service_role canaries in client bundles."
