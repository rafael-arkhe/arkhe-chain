#!/usr/bin/env bash
# Put transfers from the devnet faucet account into val1's inbox.
#
#   scripts/send_tx.sh <recipient> <value> <nonce> [count]
#
# The nonce is the faucet's next nonce: 0 on a fresh devnet, then one more
# for each transfer already sealed. A wrong nonce is rejected by val1 and the
# file is renamed to <name>.rejected.
set -euo pipefail

if [[ $# -lt 3 ]]; then
    echo "usage: $0 <recipient> <value> <nonce> [count]" >&2
    exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INBOX_DIR="${REPO_ROOT}/testnet/data/inbox"
mkdir -p "${INBOX_DIR}"

OUT="${INBOX_DIR}/$(printf '%020d' "$3")-$(date +%s).txs"
cd "${REPO_ROOT}"
cargo run --quiet --example devnet_tx -- \
    --key testnet/keys/faucet.key \
    --mldsa-seed testnet/keys/faucet_mldsa.seed \
    --sender genesis-alloc \
    --recipient "$1" \
    --value "$2" \
    --nonce "$3" \
    --count "${4:-1}" \
    --out "${OUT}"
