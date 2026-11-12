#!/usr/bin/env bash
set -euo pipefail

# Git Bash on Windows rewrites an argument that starts with a slash into a
# Windows path. A multiaddr is not a path. This has no effect elsewhere.
export MSYS2_ARG_CONV_EXCL='/ip4;/ip6;/dns'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GENESIS_FILE="${REPO_ROOT}/testnet/genesis.txt"
PEERS_FILE="${REPO_ROOT}/testnet/peers.txt"
DATA_BASE_DIR="${REPO_ROOT}/testnet/data"

echo "=== Initializing Arkhe Testnet ==="
echo "Genesis: ${GENESIS_FILE}"
echo "Peers:   ${PEERS_FILE}"

if [[ ! -f "${GENESIS_FILE}" ]]; then
    echo "Error: Genesis file not found at ${GENESIS_FILE}" >&2
    exit 1
fi

if [[ ! -f "${PEERS_FILE}" ]]; then
    echo "Error: Peers file not found at ${PEERS_FILE}" >&2
    exit 1
fi

echo "Verifying Genesis Fingerprint..."
cargo run --quiet --bin arkhe-chain -- --show-genesis --genesis "${GENESIS_FILE}"

echo "Configured Validators and Peer IDs:"
cargo run --quiet --bin arkhe-chain -- --show-peers --genesis "${GENESIS_FILE}"

mkdir -p "${DATA_BASE_DIR}"/{val1,val2,val3,val4,observer}

echo "Initializing data stores for each node..."
for NODE_INFO in "val1:30333" "val2:30334" "val3:30335" "val4:30336"; do
    NODE_ID="${NODE_INFO%%:*}"
    PORT="${NODE_INFO##*:}"
    echo "  -> Initializing ${NODE_ID} on port ${PORT} (once)"
    cargo run --quiet --bin arkhe-chain -- \
        --once \
        --id "${NODE_ID}" \
        --key "${REPO_ROOT}/testnet/keys/${NODE_ID}.key" \
        --genesis "${GENESIS_FILE}" \
        --data "${DATA_BASE_DIR}/${NODE_ID}/${NODE_ID}.data" \
        --listen "/ip4/127.0.0.1/tcp/${PORT}" \
        --peer-file "${PEERS_FILE}"
done

echo "Testnet initialization complete. Data directories created under ${DATA_BASE_DIR}."
