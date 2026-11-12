#!/usr/bin/env bash
# Put one signed attestation flow into val1's inbox: request, proposal,
# evaluation, approval and execution, signed by the devnet role accounts.
#
#   scripts/send_attest.sh <run> [budget] [cost]
#
# Each run number is a different flow. The same run number again is refused
# as a replay and the file is renamed to <name>.rejected.
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <run> [budget] [cost]" >&2
    exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INBOX_DIR="${REPO_ROOT}/testnet/data/inbox"
mkdir -p "${INBOX_DIR}"

cd "${REPO_ROOT}"
cargo run --quiet --example devnet_attest -- flow \
    --genesis testnet/genesis.txt \
    --keys testnet/keys \
    --run "$1" \
    --budget "${2:-10}" \
    --cost "${3:-1}" \
    --out "${INBOX_DIR}/flow-$(printf '%010d' "$1")-$(date +%s).ops"
