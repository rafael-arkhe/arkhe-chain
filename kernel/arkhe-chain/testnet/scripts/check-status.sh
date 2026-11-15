#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for NODE in node1 node2 node3 observer; do
  echo "=== ${NODE} ==="
  "${HERE}/status.sh" "${NODE}"
done
