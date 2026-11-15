#!/usr/bin/env bash
# Confere o gênese, anuncia cada nó uma vez e recolhe peers.txt.
set -euo pipefail
export MSYS2_ARG_CONV_EXCL='/ip4;/ip6;/dns'
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCAL="$(cd "${HERE}/../local" 2>/dev/null && pwd || true)"
ROOT="$(cd "${HERE}/../../../.." && pwd)"

if [[ ! -f "${HERE}/../local/genesis.txt" ]]; then
  echo "=== gen-keys ==="
  "${HERE}/gen-keys.sh"
fi
LOCAL="$(cd "${HERE}/../local" && pwd)"
GENESIS="${LOCAL}/genesis.txt"
cd "${ROOT}"
echo "=== show-genesis ==="
cargo run -q -p arkhe-chain -- --show-genesis --genesis "${GENESIS}"
echo "=== show-peers ==="
cargo run -q -p arkhe-chain -- --show-peers --genesis "${GENESIS}"
echo "=== announce once ==="
# Stale chain files from an older genesis refuse open with Genesis.
for NAME in node1 node2 node3 observer; do
  rm -rf "${LOCAL}/data/${NAME}"
done
for NODE in node2 node3 observer node1; do
  "${HERE}/start-node.sh" "${NODE}" --once
done
"${HERE}/collect-peers.sh"
echo "init-local ok. Seguinte: run-background.sh"
