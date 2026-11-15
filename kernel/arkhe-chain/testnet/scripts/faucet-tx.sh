#!/usr/bin/env bash
set -euo pipefail
NONCE="${1:?nonce}"
RECIPIENT="${2:?recipient}"
VALUE="${3:?value}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
exec cargo run -p arkhe-chain --example testnet_faucet_tx -- "$NONCE" "$RECIPIENT" "$VALUE"
