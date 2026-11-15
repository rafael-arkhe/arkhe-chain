#!/usr/bin/env bash
set -euo pipefail
NODE="${1:?node1|node2|node3|observer}"
ONCE="${2:-}"
NET="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$NET/local/${NODE}.env"
test -f "$ENV_FILE" || { echo "missing $ENV_FILE — run gen-keys first" >&2; exit 1; }
# shellcheck disable=SC1090
set -a
# strip CR for Windows-edited env files
source <(sed 's/\r$//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')
set +a
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
resolve() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$ROOT/$1" ;;
  esac
}
ARKHE_DATA="$(resolve "$ARKHE_DATA")"
ARKHE_KEY="$(resolve "$ARKHE_KEY")"
ARKHE_GENESIS="$(resolve "$ARKHE_GENESIS")"
ARKHE_PEER_FILE="$(resolve "$ARKHE_PEER_FILE")"
ARKHE_ANNOUNCE="$(resolve "$ARKHE_ANNOUNCE")"
ARGS=(
  --data "$ARKHE_DATA"
  --id "$ARKHE_ID"
  --key "$ARKHE_KEY"
  --genesis "$ARKHE_GENESIS"
  --listen "$ARKHE_LISTEN"
  --peer-file "$ARKHE_PEER_FILE"
  --announce "$ARKHE_ANNOUNCE"
)
# --once is for announce only: sealing an empty mempool fails with MempoolEmpty.
if [ "$ONCE" != "--once" ] && [ "${ARKHE_SEAL:-0}" = "1" ]; then
  test -n "${ARKHE_TIME:-}" || { echo "ARKHE_SEAL=1 requires ARKHE_TIME" >&2; exit 1; }
  SEAL_TIME="$ARKHE_TIME"
  if [ "$SEAL_TIME" = "now" ]; then
    SEAL_TIME="$(date +%s)"
  fi
  ARGS+=(--seal --time "$SEAL_TIME")
  if [ -n "${ARKHE_INBOX:-}" ]; then
    ARKHE_INBOX="$(resolve "$ARKHE_INBOX")"
    mkdir -p "$ARKHE_INBOX"
    ARGS+=(--inbox "$ARKHE_INBOX")
  fi
fi
if [ "$ONCE" != "--once" ] && [ -n "${ARKHE_TX:-}" ]; then
  ARGS+=(--tx "$(resolve "$ARKHE_TX")")
fi
if [ "$ONCE" = "--once" ]; then
  ARGS+=(--once)
fi
mkdir -p "$(dirname "$ARKHE_DATA")" "$(dirname "$ARKHE_ANNOUNCE")"
# A node killed mid-write leaves <id>.arkhe-tmp; refuse to start until removed.
STALE_TMP="$(dirname "$ARKHE_DATA")/$(basename "$ARKHE_DATA").arkhe-tmp"
if [ -e "$STALE_TMP" ]; then
  echo "removing stale $STALE_TMP"
  rm -f "$STALE_TMP"
fi
cd "$ROOT"
exec cargo run -p arkhe-chain -- "${ARGS[@]}"
