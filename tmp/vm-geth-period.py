from pathlib import Path

script = r"""#!/bin/bash
set -eu
docker rm -f arkhe-geth >/dev/null 2>&1 || true
docker run -d --name arkhe-geth -p 8545:8545 ethereum/client-go:stable \
  --dev --dev.period 1 --http --http.addr 0.0.0.0 --http.port 8545 \
  --http.api eth,net --http.vhosts '*' >/dev/null
hash=""
for _ in $(seq 1 40); do
  hash=$(curl -sf -m 2 -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x1",false]}' \
    http://127.0.0.1:8545 | python3 -c 'import json,sys
try:
    value=json.load(sys.stdin).get("result") or {}
    print(value.get("hash") or "")
except Exception:
    print("")' || true)
  case "$hash" in
    0x0000000000000000000000000000000000000000000000000000000000000000|"") ;;
    0x*) break ;;
  esac
  sleep 1
done
echo "BLOCK1=$hash"
echo "STATUS=$(docker inspect -f '{{.State.Status}}' arkhe-geth)"
if [ -z "$hash" ] || [ "$hash" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
  docker logs arkhe-geth 2>&1 | tail -n 40
  exit 1
fi
"""
Path(r"D:\arkhe\tmp\vm-geth-period.sh").write_bytes(script.replace("\r\n", "\n").encode("utf-8"))
