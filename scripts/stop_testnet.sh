#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PID_FILE="${REPO_ROOT}/testnet/data/testnet.pids"

echo "=== Stopping Arkhe Local Testnet ==="

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

# Fallback check
pkill -f "arkhe-chain.*--genesis" 2>/dev/null || true

echo "Arkhe Testnet nodes stopped."
