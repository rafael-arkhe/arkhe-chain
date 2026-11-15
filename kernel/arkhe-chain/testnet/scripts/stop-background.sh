#!/usr/bin/env bash
set -euo pipefail
PID_FILE="$(cd "$(dirname "$0")/../local" && pwd)/testnet.pids"
echo "=== Stopping background testnet ==="
if [[ -f "${PID_FILE}" ]]; then
  while IFS= read -r PID || [[ -n "${PID}" ]]; do
    if [[ -n "${PID}" && "${PID}" =~ ^[0-9]+$ ]]; then
      if kill -0 "${PID}" 2>/dev/null; then
        echo "Stopping process ${PID}..."
        kill "${PID}" 2>/dev/null || true
      fi
    fi
  done < "${PID_FILE}"
  rm -f "${PID_FILE}"
fi
echo "stopped"
