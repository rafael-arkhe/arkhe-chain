#!/usr/bin/env bash
# Smoke nativo alinhado à tip `devnet_smoke` (sem Executor / sem 5º atestado):
#   1. transferência selada; quatro nós na mesma ponta
#   2. fluxo de atestados (4 ops) selado; quatro nós na mesma ponta
#   3. o mesmo fluxo de novo é recusado (replay) e não sela
#   4. com node3 parado, uma transferência espera e nenhum bloco nasce
#   5. com node3 de volta, essa transferência é selada
#   6. stop/start completo; a cadeia retoma e uma transferência nova sela
# Não homologa. Sai != 0 na primeira falha.
set -euo pipefail
export MSYS2_ARG_CONV_EXCL='/ip4;/ip6;/dns'
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCAL="$(cd "${HERE}/../local" && pwd)"
ROOT="$(cd "${HERE}/../../../.." && pwd)"
PID_FILE="${LOCAL}/testnet.pids"
NODES=(node1 node2 node3 observer)
cd "${ROOT}"

field() {
  local NODE="$1" KEY="$2"
  # shellcheck disable=SC1090
  set -a
  source <(sed 's/\r$//' "${LOCAL}/${NODE}.env" | grep -v '^#' | grep -v '^[[:space:]]*$')
  set +a
  resolve() {
    case "$1" in
      /*) printf '%s\n' "$1" ;;
      *) printf '%s\n' "$ROOT/$1" ;;
    esac
  }
  # Binary status (not cargo run): avoids cargo lock contention during Agree-At.
  local BIN="${ROOT}/target/debug/arkhe-chain"
  "${BIN}" --status --data "$(resolve "$ARKHE_DATA")" --genesis "$(resolve "$ARKHE_GENESIS")" 2>/dev/null \
    | awk -v key="$KEY" '$1 == key { print $2 }'
}

fail() {
  echo "FAIL: $*" >&2
  for node in "${NODES[@]}"; do
    echo "--- ${node}: height=$(field "${node}" height) committed=$(field "${node}" committed) tip=$(field "${node}" tip) mempool=$(field "${node}" mempool)" >&2
    tail -n 8 "${LOCAL}/${node}.log" >&2 || true
  done
  "${HERE}/stop-background.sh" >/dev/null 2>&1 || true
  exit 1
}

agree_at() {
  local want="$1" tip first
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
  fail "nodes did not agree at height ${want}"
}

inbox_line() {
  for _ in $(seq 1 60); do
    grep -qE "$1" "${LOCAL}/node1.log" && return 0
    sleep 1
  done
  fail "node1 never logged: $1"
}

# PID order in run-background: node2, node3, observer, node1.
pid_at() { sed -n "${1}p" "${PID_FILE}"; }

start_named() {
  local NODE="$1"
  # shellcheck disable=SC1090
  set -a
  source <(sed 's/\r$//' "${LOCAL}/${NODE}.env" | grep -v '^#' | grep -v '^[[:space:]]*$')
  set +a
  resolve() {
    case "$1" in
      /*) printf '%s\n' "$1" ;;
      *) printf '%s\n' "$ROOT/$1" ;;
    esac
  }
  local DATA KEY GENESIS PEER_FILE ANNOUNCE BIN
  DATA="$(resolve "$ARKHE_DATA")"
  KEY="$(resolve "$ARKHE_KEY")"
  GENESIS="$(resolve "$ARKHE_GENESIS")"
  PEER_FILE="$(resolve "$ARKHE_PEER_FILE")"
  ANNOUNCE="$(resolve "$ARKHE_ANNOUNCE")"
  BIN="${ROOT}/target/debug/arkhe-chain"
  local STALE_TMP
  STALE_TMP="$(dirname "$DATA")/$(basename "$DATA").arkhe-tmp"
  rm -f "$STALE_TMP"
  local ARGS=(
    --data "$DATA" --id "$ARKHE_ID" --key "$KEY" --genesis "$GENESIS"
    --listen "$ARKHE_LISTEN" --peer-file "$PEER_FILE" --announce "$ANNOUNCE"
  )
  "${BIN}" "${ARGS[@]}" >>"${LOCAL}/${NODE}.log" 2>&1 &
  echo $! >> "${PID_FILE}"
}

echo "=== stop any prior background ==="
"${HERE}/stop-background.sh" >/dev/null 2>&1 || true

if ! grep -q '^/ip4/' "${LOCAL}/peers.txt" 2>/dev/null; then
  echo "=== init-local ==="
  "${HERE}/init-local.sh"
fi

for name in "${NODES[@]}"; do
  rm -rf "${LOCAL}/data/${name}"
done
rm -f "${LOCAL}/inbox"/*.txs "${LOCAL}/inbox"/*.ops \
  "${LOCAL}/inbox"/*.txs.done "${LOCAL}/inbox"/*.ops.done \
  "${LOCAL}/inbox"/*.txs.rejected "${LOCAL}/inbox"/*.ops.rejected 2>/dev/null || true
rm -f "${LOCAL}/node1.log" "${LOCAL}/node2.log" "${LOCAL}/node3.log" "${LOCAL}/observer.log"

echo "=== run-background ==="
"${HERE}/run-background.sh"
sleep 3

echo "== 1. transfer"
"${HERE}/faucet-tx.sh" 0 alice 25
agree_at 1

echo "== 2. attestation flow (4 ops, sem Executor)"
"${HERE}/send-attest.sh" 1
inbox_line 'flow-1\.ops ingested 4'
agree_at 2

echo "== 3. the same flow again is a replay"
"${HERE}/send-attest.sh" 1
inbox_line 'flow-1\.ops rejected FAIL_CLOSED: ATTEST: replay'
sleep 3
[[ "$(field node1 height)" == 2 ]] || fail "a replayed flow sealed a block"
echo "ok: replay refused, height still 2"

echo "== 4. node3 stopped: no progress"
# PID order in run-background: node2, node3, observer, node1.
NODE3_PID="$(pid_at 2)"
kill "${NODE3_PID}"
sleep 1
if kill -0 "${NODE3_PID}" 2>/dev/null; then
  fail "node3 pid ${NODE3_PID} still running after kill"
fi
{
  pid_at 1
  pid_at 3
  pid_at 4
} > "${PID_FILE}.next"
mv "${PID_FILE}.next" "${PID_FILE}"
sleep 2
"${HERE}/faucet-tx.sh" 1 bob 3
inbox_line '.*\.txs ingested 1'
sleep 6
[[ "$(field node1 height)" == 2 ]] || fail "node1 sealed while node3 was down"
[[ "$(field node1 mempool)" == 1 ]] || fail "the transfer is not waiting in node1's mempool"
echo "ok: height still 2, one transfer waiting"

echo "== 5. node3 back: the waiting transfer is sealed"
started=0
for _ in $(seq 1 40); do
  : > "${LOCAL}/node3.err.log"
  # Truncate prior log so '^listen ' is from this start.
  : > "${LOCAL}/node3.log"
  start_named node3
  for _w in $(seq 1 40); do
    sleep 0.25
    if ! kill -0 "$(tail -n 1 "${PID_FILE}")" 2>/dev/null; then
      break
    fi
    if grep -qE 'BUSY|MALFORMED|FAIL_CLOSED|Snapshot' "${LOCAL}/node3.err.log" 2>/dev/null; then
      kill "$(tail -n 1 "${PID_FILE}")" 2>/dev/null || true
      # drop the dead pid line
      sed -i '$d' "${PID_FILE}" 2>/dev/null || true
      break
    fi
    if grep -q '^listen ' "${LOCAL}/node3.log" 2>/dev/null; then
      started=1
      break 2
    fi
  done
  sleep 0.5
done
[[ "${started}" == 1 ]] || fail "node3 did not start after kill"
agree_at 3

echo "== 6. full stop and start"
"${HERE}/stop-background.sh" >/dev/null
sleep 1
"${HERE}/run-background.sh"
sleep 5
agree_at 3
"${HERE}/faucet-tx.sh" 2 carol 1
agree_at 4

"${HERE}/stop-background.sh" >/dev/null
echo "PASS: local smoke (transfer, attest, replay, halt, catch-up, restart). Not homologation."
