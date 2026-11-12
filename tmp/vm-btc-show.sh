set -eu
TXID=925b5f276408c0b8442e1a247e48228843dd144416d4561edab3a29950578a0f
docker exec arkhe-bitcoind bitcoin-cli -regtest -rpcuser=arkhe -rpcpassword=arkhe-regtest -rpcwallet=arkhe gettransaction "$TXID"
