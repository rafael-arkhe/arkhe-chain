set -eu
export PATH="$HOME/.cargo/bin:$PATH"
cp /mnt/d/arkhe/kernel/arkhe-chain/tests/ethereum_link.rs "$HOME/arkhe-chain-rerun/tests/ethereum_link.rs"
docker rm -f arkhe-geth >/dev/null 2>&1 || true
docker run -d --name arkhe-geth -p 8545:8545 ethereum/client-go:stable \
  --dev --http --http.addr 0.0.0.0 --http.port 8545 \
  --http.api eth,net --http.vhosts '*' >/dev/null
ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 2 -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
    http://127.0.0.1:8545 >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1
curl -sf -m 10 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"0x71562b71999873db5b286df957af199ec94617f7","to":"0x71562b71999873db5b286df957af199ec94617f7","value":"0x1"}]}' \
  http://127.0.0.1:8545 >/dev/null
sleep 2
echo "BLOCK=$(curl -sf -m 10 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' http://127.0.0.1:8545)"
cd "$HOME/arkhe-chain-rerun"
ARKHE_EXECUTION_RPC=http://127.0.0.1:8545 cargo test -p arkhe-chain --test ethereum_link a_live_execution_client -- --ignored --nocapture
echo "GETH=$(docker inspect -f '{{.State.Status}}' arkhe-geth)"
