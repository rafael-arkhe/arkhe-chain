#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GENESIS_FILE="${REPO_ROOT}/testnet/genesis.txt"
PEERS_FILE="${REPO_ROOT}/testnet/peers.txt"
DATA_BASE_DIR="${REPO_ROOT}/testnet/data"
PID_FILE="${DATA_BASE_DIR}/testnet.pids"

mkdir -p "${DATA_BASE_DIR}"
echo "" > "${PID_FILE}"

echo "=== Starting Arkhe Local Testnet (4 Validators) ==="

start_node() {
    local NODE_ID="$1"
    local PORT="$2"
    local KEY_FILE="${REPO_ROOT}/testnet/keys/${NODE_ID}.key"
    local DATA_FILE="${DATA_BASE_DIR}/${NODE_ID}/${NODE_ID}.data"
    local LOG_FILE="${DATA_BASE_DIR}/${NODE_ID}.log"

    mkdir -p "${DATA_BASE_DIR}/${NODE_ID}"

    echo "Starting ${NODE_ID} on port ${PORT}..."
    cargo run --quiet --bin arkhe-chain -- \
        --id "${NODE_ID}" \
        --key "${KEY_FILE}" \
        --genesis "${GENESIS_FILE}" \
        --data "${DATA_FILE}" \
        --listen "/ip4/127.0.0.1/tcp/${PORT}" \
        --peer-file "${PEERS_FILE}" > "${LOG_FILE}" 2>&1 &

    local PID=$!
    echo "${PID}" >> "${PID_FILE}"
    echo "  ${NODE_ID} running with PID ${PID} (logs: ${LOG_FILE})"
}

start_node val1 30333
start_node val2 30334
start_node val3 30335
start_node val4 30336

echo "All 4 validators started in background."
echo "Use 'scripts/check_status.sh' to inspect state."
echo "Use 'scripts/stop_testnet.sh' to terminate."
