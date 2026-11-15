#!/usr/bin/env bash
# Copia local/peers.txt para local/peers.docker.txt com hostnames compose.
set -euo pipefail
LOCAL="$(cd "$(dirname "$0")/../local" && pwd)"
SRC="${LOCAL}/peers.txt"
DST="${LOCAL}/peers.docker.txt"
test -f "${SRC}" || { echo "missing ${SRC} — collect-peers first" >&2; exit 1; }
sed \
  -e 's#/ip4/127\.0\.0\.1/tcp/19001/#/ip4/node1/tcp/19001/#' \
  -e 's#/ip4/127\.0\.0\.1/tcp/19002/#/ip4/node2/tcp/19002/#' \
  -e 's#/ip4/127\.0\.0\.1/tcp/19003/#/ip4/node3/tcp/19003/#' \
  -e 's#/ip4/127\.0\.0\.1/tcp/19004/#/ip4/observer/tcp/19004/#' \
  "${SRC}" > "${DST}"
echo "peers.docker=${DST}"
cat "${DST}"
