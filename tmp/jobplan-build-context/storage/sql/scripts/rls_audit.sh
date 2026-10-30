#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
cargo run -p arkhe-sql-migrate -- rls-audit
