#!/usr/bin/env bash
# Sobe os quatro nós em background. Só node1 sela, com --inbox e --time now.
set -euo pipefail
export MSYS2_ARG_CONV_EXCL='/ip4;/ip6;/dns'
HERE="$(cd "$(dirname "$0")" && pwd)"
NET="$(cd "${HERE}/.." && pwd)"
LOCAL="${NET}/local"
ROOT="$(cd "${HERE}/../../../.." && pwd)"
PEERS="${LOCAL}/peers.txt"
INBOX="${LOCAL}/inbox"
PID_FILE="${LOCAL}/testnet.pids"

test -f "${LOCAL}/node1.env" || { echo "missing local env — run gen-keys first" >&2; exit 1; }
grep -q '^/ip4/' "${PEERS}" 2>/dev/null || {
  echo "peers.txt sem multiaddrs — announce + collect-peers" >&2
  exit 1
}

mkdir -p "${INBOX}"
rm -f "${PID_FILE}"
: > "${PID_FILE}"
echo "=== Building arkhe-chain ==="
(cd "${ROOT}" && cargo build --quiet -p arkhe-chain)
BIN="${ROOT}/target/debug/arkhe-chain"

start_node() {
  local NODE="$1"
  local ENV_FILE="${LOCAL}/${NODE}.env"
  set -a
  # shellcheck disable=SC1090
  source <(sed 's/\r$//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')
  set +a
  resolve() {
    case "$1" in
      /*) printf '%s\n' "$1" ;;
      *) printf '%s\n' "$ROOT/$1" ;;
    esac
  }
  local DATA KEY GENESIS PEER_FILE ANNOUNCE
  DATA="$(resolve "$ARKHE_DATA")"
  KEY="$(resolve "$ARKHE_KEY")"
  GENESIS="$(resolve "$ARKHE_GENESIS")"
  PEER_FILE="$(resolve "$ARKHE_PEER_FILE")"
  ANNOUNCE="$(resolve "$ARKHE_ANNOUNCE")"
  mkdir -p "$(dirname "$DATA")"
  local STALE_TMP
  STALE_TMP="$(dirname "$DATA")/$(basename "$DATA").arkhe-tmp"
  if [ -e "$STALE_TMP" ]; then
    echo "  removing stale $STALE_TMP"
    rm -f "$STALE_TMP"
  fi
  local ARGS=(
    --data "$DATA"
    --id "$ARKHE_ID"
    --key "$KEY"
    --genesis "$GENESIS"
    --listen "$ARKHE_LISTEN"
    --peer-file "$PEER_FILE"
    --announce "$ANNOUNCE"
  )
  if [ "${ARKHE_SEAL:-0}" = "1" ]; then
    local SEAL_TIME="${ARKHE_TIME:-now}"
    if [ "$SEAL_TIME" = "now" ]; then
      SEAL_TIME="$(date +%s)"
    fi
    ARGS+=(--seal --time "$SEAL_TIME")
    local INBOX_PATH="${INBOX}"
    if [ -n "${ARKHE_INBOX:-}" ]; then
      INBOX_PATH="$(resolve "$ARKHE_INBOX")"
    fi
    mkdir -p "$INBOX_PATH"
    ARGS+=(--inbox "$INBOX_PATH")
  fi
  local LOG="${LOCAL}/${NODE}.log"
  "${BIN}" "${ARGS[@]}" >"${LOG}" 2>&1 &
  local PID=$!
  echo "${PID}" >> "${PID_FILE}"
  echo "  ${NODE} PID ${PID} (log: ${LOG})"
}

echo "=== Starting followers ==="
start_node node2
start_node node3
start_node observer
sleep 2
echo "=== Starting sealer node1 ==="
start_node node1
echo "Background testnet up. faucet-tx / send-attest → inbox; check-status; stop-background."
