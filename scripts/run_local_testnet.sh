#!/usr/bin/env bash
# Start the local devnet: four validator processes on 127.0.0.1.
#
# val1 is the only process that seals. It reads transaction lists from
# testnet/data/inbox once per second and seals what waits. val2, val3 and
# val4 follow: they sync the blocks and sign a precommit for each height.
# Two sealing processes can fork, and the node has no reorg, so the devnet
# names exactly one.
set -euo pipefail

# Git Bash on Windows rewrites an argument that starts with a slash into a
# Windows path. A multiaddr is not a path. This has no effect elsewhere.
export MSYS2_ARG_CONV_EXCL='/ip4;/ip6;/dns'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GENESIS_FILE="${REPO_ROOT}/testnet/genesis.txt"
PEERS_FILE="${REPO_ROOT}/testnet/peers.txt"
DATA_BASE_DIR="${REPO_ROOT}/testnet/data"
INBOX_DIR="${DATA_BASE_DIR}/inbox"
PID_FILE="${DATA_BASE_DIR}/testnet.pids"

mkdir -p "${INBOX_DIR}"
: > "${PID_FILE}"

echo "=== Building arkhe-chain ==="
(cd "${REPO_ROOT}" && cargo build --quiet --bin arkhe-chain)
BIN="${REPO_ROOT}/target/debug/arkhe-chain"

echo "=== Starting Arkhe local devnet (4 validators, val1 seals) ==="

start_node() {
    local NODE_ID="$1"
    local PORT="$2"
    shift 2
    local KEY_FILE="${REPO_ROOT}/testnet/keys/${NODE_ID}.key"
    local DATA_FILE="${DATA_BASE_DIR}/${NODE_ID}/${NODE_ID}.data"
    local LOG_FILE="${DATA_BASE_DIR}/${NODE_ID}.log"

    mkdir -p "${DATA_BASE_DIR}/${NODE_ID}"

    # A node killed in the middle of a write leaves <id>.arkhe-tmp behind, and
    # the node refuses to start over an existing temporary file. The chain
    # file itself is replaced whole or not at all, so the leftover is safe to
    # remove here, before this node starts.
    local STALE_TMP="${DATA_BASE_DIR}/${NODE_ID}/${NODE_ID}.arkhe-tmp"
    if [[ -e "${STALE_TMP}" ]]; then
        echo "  removing stale ${STALE_TMP}"
        rm -f "${STALE_TMP}"
    fi

    echo "Starting ${NODE_ID} on port ${PORT}..."
    "${BIN}" \
        --id "${NODE_ID}" \
        --key "${KEY_FILE}" \
        --genesis "${GENESIS_FILE}" \
        --data "${DATA_FILE}" \
        --listen "/ip4/127.0.0.1/tcp/${PORT}" \
        --peer-file "${PEERS_FILE}" "$@" > "${LOG_FILE}" 2>&1 &

    local PID=$!
    echo "${PID}" >> "${PID_FILE}"
    echo "  ${NODE_ID} running with PID ${PID} (logs: ${LOG_FILE})"
}

# The followers listen first, so the sealer's first pass can hear them.
start_node val2 30334
start_node val3 30335
start_node val4 30336
sleep 2
# --time is the timestamp of block 1. Later blocks use the parent plus one.
start_node val1 30333 --seal --time "$(date +%s)" --inbox "${INBOX_DIR}"

echo "All 4 validators started in background."
echo "Use 'scripts/send_tx.sh <recipient> <value> <nonce>' to submit a transfer."
echo "Use 'scripts/check_status.sh' to inspect state."
echo "Use 'scripts/stop_testnet.sh' to terminate."
