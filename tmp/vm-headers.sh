set +e
docker ps --format '{{.Names}} {{.Status}}'
echo CURL
curl -sv -m 8 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' http://127.0.0.1:8545
echo
echo EXIT:$?
