#!/usr/bin/env bash
# Run the local devnet from an empty data directory and check it end to end.
# The script exits nonzero on the first check that does not hold.
#
#   1. a transfer is sealed and the four nodes agree on the tip
#   2. a signed attestation flow is sealed and the four nodes agree
#   3. the same flow again is refused as a replay and seals nothing
#   4. with val4 stopped, a transfer waits and no block is sealed
#   5. with val4 back, that transfer is sealed and the four nodes agree
#   6. after a full stop and start, the four nodes hold the same chain
#
# A follower adopts a block only when every op in it replays to the header
# root, so agreement on the tip in step 2 means each node applied the flow.
set -euo pipefail

export MSYS2_ARG_CONV_EXCL='/ip4;/ip6;/dns'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA="${REPO_ROOT}/testnet/data"
BIN="${REPO_ROOT}/target/debug/arkhe-chain"
NODES=(val1 val2 val3 val4)
cd "${REPO_ROOT}"

field() { # field <node> <height|committed|tip|mempool>
    "${BIN}" --status --data "${DATA}/$1/$1.data" --genesis testnet/genesis.txt 2>/dev/null \
        | awk -v key="$2" '$1 == key { print $2 }'
}

fail() {
    echo "FAIL: $*" >&2
    for node in "${NODES[@]}"; do
        echo "--- ${node}: height=$(field "${node}" height) committed=$(field "${node}" committed) tip=$(field "${node}" tip)" >&2
        tail -n 5 "${DATA}/${node}.log" >&2 || true
    done
    bash scripts/stop_testnet.sh > /dev/null 2>&1 || true
    exit 1
}

# Wait until every node reports this height, as tip and as committed.
agree_at() {
    local want="$1" node tip first
    for _ in $(seq 1 90); do
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
            echo "ok: four nodes at height ${want}, committed ${want}, tip ${first}"
            return 0
        fi
        sleep 1
    done
    fail "the four nodes did not agree at height ${want}"
}

inbox_line() { # wait for a line in val1's log
    for _ in $(seq 1 60); do
        grep -q "$1" "${DATA}/val1.log" && return 0
        sleep 1
    done
    fail "val1 never logged: $1"
}

no_errors() {
    for node in "${NODES[@]}"; do
        if grep -v '^inbox ' "${DATA}/${node}.log" | grep -q FAIL_CLOSED; then
            fail "${node} logged an error"
        fi
    done
}

bash scripts/stop_testnet.sh > /dev/null 2>&1 || true
rm -rf "${DATA}"
cargo build --quiet --bin arkhe-chain --example devnet_tx --example devnet_attest
bash scripts/run_local_testnet.sh > /dev/null
sleep 3

echo "== 1. transfer"
bash scripts/send_tx.sh bob 25 0 > /dev/null
agree_at 1

echo "== 2. attestation flow"
bash scripts/send_attest.sh 1 > /dev/null
inbox_line 'flow-0000000001-.*ops ingested 5'
agree_at 2

echo "== 3. the same flow again is a replay"
bash scripts/send_attest.sh 1 > /dev/null
inbox_line 'ops rejected FAIL_CLOSED: ATTEST: replay'
sleep 3
[[ "$(field val1 height)" == 2 ]] || fail "a replayed flow sealed a block"
echo "ok: replay refused, height still 2"

echo "== 4. val4 stopped: no progress"
kill "$(sed -n 3p "${DATA}/testnet.pids")"
sleep 2
bash scripts/send_tx.sh carol 3 1 > /dev/null
inbox_line '00000000000000000001-.*txs ingested 1'
sleep 6
[[ "$(field val1 height)" == 2 ]] || fail "val1 sealed while val4 was down"
[[ "$(field val1 mempool)" == 1 ]] || fail "the transfer is not waiting in val1's mempool"
echo "ok: height still 2, one transfer waiting"

echo "== 5. val4 back: the waiting transfer is sealed"
rm -f "${DATA}/val4/val4.arkhe-tmp"
"${BIN}" --id val4 --key testnet/keys/val4.key --genesis testnet/genesis.txt \
    --data "${DATA}/val4/val4.data" --listen /ip4/127.0.0.1/tcp/30336 \
    --peer-file testnet/peers.txt >> "${DATA}/val4.log" 2>&1 &
echo $! >> "${DATA}/testnet.pids"
agree_at 3

echo "== 6. full stop and start"
bash scripts/stop_testnet.sh > /dev/null
sleep 1
bash scripts/run_local_testnet.sh > /dev/null
sleep 5
agree_at 3
bash scripts/send_tx.sh dave 1 2 > /dev/null
agree_at 4
no_errors

bash scripts/stop_testnet.sh > /dev/null
echo "PASS: devnet smoke"
