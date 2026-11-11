#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GENESIS_FILE="${REPO_ROOT}/testnet/genesis.txt"
DATA_BASE_DIR="${REPO_ROOT}/testnet/data"

echo "=== Arkhe Testnet Status Check ==="

for NODE_ID in val1 val2 val3 val4; do
    DATA_PATH="${DATA_BASE_DIR}/${NODE_ID}/${NODE_ID}.data"
    echo "--- Node: ${NODE_ID} ---"
    if [[ -f "${DATA_PATH}" ]]; then
        cargo run --quiet --bin arkhe-chain -- \
            --status \
            --data "${DATA_PATH}" \
            --genesis "${GENESIS_FILE}"
    else
        echo "Data file not found at ${DATA_PATH} (node not initialized yet)"
    fi
done
