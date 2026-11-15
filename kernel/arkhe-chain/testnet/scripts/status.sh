#!/usr/bin/env bash
set -euo pipefail
NODE="${1:?node1|node2|node3|observer}"
NET="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$NET/local/${NODE}.env"
test -f "$ENV_FILE" || { echo "missing $ENV_FILE — run gen-keys first" >&2; exit 1; }
set -a
source <(sed 's/\r$//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')
set +a
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
resolve() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$ROOT/$1" ;;
  esac
}
cd "$ROOT"
exec cargo run -p arkhe-chain -- --status --data "$(resolve "$ARKHE_DATA")" --genesis "$(resolve "$ARKHE_GENESIS")"
