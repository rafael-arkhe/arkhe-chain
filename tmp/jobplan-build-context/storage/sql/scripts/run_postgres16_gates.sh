#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL to a PostgreSQL 16 superuser/admin URL}"

server_version="$(psql "$DATABASE_URL" -Atqc 'SHOW server_version_num')"
if [[ "$server_version" -lt 160000 || "$server_version" -ge 170000 ]]; then
  echo "FAIL: expected PostgreSQL 16.x, got server_version_num=$server_version" >&2
  exit 2
fi

echo "PostgreSQL: $(psql "$DATABASE_URL" -Atqc 'SELECT version()')"

# Apply immutable SQLx migrations using the real migration binary when available.
if command -v cargo >/dev/null 2>&1; then
  (cd "$ROOT" && cargo run -p arkhe-sql-migrate -- migrate)
else
  echo "cargo unavailable; applying migration SQL in lexical order with psql" >&2
  for f in "$ROOT"/migrations/*.sql; do
    echo "Applying $(basename "$f")"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/tests/postgres16/phase1_security_gates.sql"

echo "PASS: PostgreSQL 16 Phase-1 RLS + append-only gates"
