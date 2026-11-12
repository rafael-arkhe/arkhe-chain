set -eu
docker rm -f arkhe-geth >/dev/null 2>&1 || true
docker run -d --name arkhe-geth -p 8545:8545 ethereum/client-go:stable \
  --dev --http --http.addr 0.0.0.0 --http.port 8545 \
  --http.api eth,net --http.vhosts '*'
sleep 2
curl -s -m 10 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"0x71562b71999873db5b286df957af199ec94617f7","to":"0x71562b71999873db5b286df957af199ec94617f7","value":"0x1"}]}' \
  http://127.0.0.1:8545
echo
sleep 2
curl -sD - -m 10 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x1",false]}' \
  http://127.0.0.1:8545 | head -n 18
echo
