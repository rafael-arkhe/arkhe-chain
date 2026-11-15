#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${ARKHE_ENV:?ARKHE_ENV}"
set -a
# shellcheck disable=SC1090
source <(sed 's/\r$//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')
set +a
resolve() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "/workspace/$1" ;;
  esac
}
BIN=/workspace/target/debug/arkhe-chain
if [ ! -x "$BIN" ]; then
  BIN=/workspace/target/release/arkhe-chain
fi
test -x "$BIN"
ARKHE_DATA="$(resolve "$ARKHE_DATA")"
ARKHE_KEY="$(resolve "$ARKHE_KEY")"
ARKHE_GENESIS="$(resolve "$ARKHE_GENESIS")"
ARKHE_PEER_FILE="$(resolve "$ARKHE_PEER_FILE")"
ARKHE_ANNOUNCE="$(resolve "$ARKHE_ANNOUNCE")"
mkdir -p "$(dirname "$ARKHE_DATA")" "$(dirname "$ARKHE_ANNOUNCE")"
ARGS=(
  --data "$ARKHE_DATA"
  --id "$ARKHE_ID"
  --key "$ARKHE_KEY"
  --genesis "$ARKHE_GENESIS"
  --listen "$ARKHE_LISTEN"
  --peer-file "$ARKHE_PEER_FILE"
  --announce "$ARKHE_ANNOUNCE"
)
if [ "${ARKHE_SEAL:-0}" = "1" ]; then
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
if [ -n "${ARKHE_TX:-}" ]; then
  ARGS+=(--tx "$(resolve "$ARKHE_TX")")
fi
exec "$BIN" "${ARGS[@]}"
