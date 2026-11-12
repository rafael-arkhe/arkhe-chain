#!/usr/bin/env bash
# Run the devnet inside Docker Compose and check that the four containers
# seal a transfer and a signed attestation flow and agree on the tip.
# The script exits nonzero on the first check that does not hold, and it
# leaves the containers up when it fails so their logs can be read.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE=(docker compose -f "${REPO_ROOT}/testnet/docker-compose.yml")
NODES=(val1 val2 val3 val4)
cd "${REPO_ROOT}"

field() { # field <node> <height|committed|tip>
    "${COMPOSE[@]}" exec -T "$1" /usr/local/bin/arkhe-chain --status --data "/var/lib/arkhe/$1.data" 2>/dev/null \
        | awk -v key="$2" '$1 == key { print $2 }'
}

fail() {
    echo "FAIL: $*" >&2
    "${COMPOSE[@]}" ps >&2 || true
    "${COMPOSE[@]}" logs --tail 20 >&2 || true
    exit 1
}

agree_at() {
    local want="$1" node tip first
    for _ in $(seq 1 120); do
        local ok=1
        first=""
        for node in "${NODES[@]}"; do
            [[ "$(field "${node}" height)" == "${want}" ]] || ok=0
            [[ "$(field "${node}" committed)" == "${want}" ]] || ok=0
            tip="$(field "${node}" tip)"
            [[ -z "${first}" ]] && first="${tip}"
            [[ "${tip}" == "${first}" ]] || ok=0
        done
        if [[ "${ok}" == 1 ]]; then
            echo "ok: four containers at height ${want}, committed ${want}, tip ${first}"
            return 0
        fi
        sleep 1
    done
    fail "the four containers did not agree at height ${want}"
}

"${COMPOSE[@]}" down -v > /dev/null 2>&1 || true
rm -rf testnet/data/inbox
mkdir -p testnet/data/inbox
cargo build --quiet --example devnet_tx --example devnet_attest

echo "== build and start"
"${COMPOSE[@]}" up -d --build
sleep 5
for node in "${NODES[@]}"; do
    [[ "$("${COMPOSE[@]}" ps --status running --services | grep -c "^${node}$")" == 1 ]] || fail "${node} is not running"
done

echo "== 1. transfer"
bash scripts/send_tx.sh bob 25 0 > /dev/null
agree_at 1

echo "== 2. attestation flow"
bash scripts/send_attest.sh 1 > /dev/null
agree_at 2
"${COMPOSE[@]}" logs val1 | grep -q 'ops ingested 5' || fail "val1 did not ingest the five attestations"

echo "== 3. restart every container"
"${COMPOSE[@]}" restart > /dev/null
sleep 5
agree_at 2
bash scripts/send_tx.sh carol 3 1 > /dev/null
agree_at 3

"${COMPOSE[@]}" down -v > /dev/null
echo "PASS: compose smoke"
