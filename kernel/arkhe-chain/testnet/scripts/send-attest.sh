#!/usr/bin/env bash
set -euo pipefail
RUN="${1:?run number}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
exec cargo run -p arkhe-chain --example testnet_attest -- "$RUN"
