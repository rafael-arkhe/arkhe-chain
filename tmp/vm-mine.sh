set -eu
curl -s -m 10 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"0x71562b71999873db5b286df957af199ec94617f7","to":"0x71562b71999873db5b286df957af199ec94617f7","value":"0x1"}]}' \
  http://127.0.0.1:8545
echo
sleep 3
curl -s -m 10 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  http://127.0.0.1:8545
echo
