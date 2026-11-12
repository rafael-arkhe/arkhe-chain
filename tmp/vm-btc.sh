set -eu
docker rm -f arkhe-bitcoind >/dev/null 2>&1 || true
docker run -d --name arkhe-bitcoind -p 18443:18443 bitcoin/bitcoin:28 \
  -regtest -server -rpcbind=0.0.0.0 -rpcallowip=0.0.0.0/0 \
  -rpcuser=arkhe -rpcpassword=arkhe-regtest -fallbackfee=0.0002
sleep 3
docker exec arkhe-bitcoind bitcoin-cli -regtest -rpcuser=arkhe -rpcpassword=arkhe-regtest createwallet arkhe
docker exec arkhe-bitcoind bitcoin-cli -regtest -rpcuser=arkhe -rpcpassword=arkhe-regtest -rpcwallet=arkhe -generate 101 >/dev/null
python3 << 'PY'
import json, subprocess

def cli(*args):
    return subprocess.check_output([
        "docker", "exec", "arkhe-bitcoind", "bitcoin-cli",
        "-regtest", "-rpcuser=arkhe", "-rpcpassword=arkhe-regtest",
        "-rpcwallet=arkhe", *args,
    ]).decode()

utxo = json.loads(cli("listunspent"))[0]
addr = cli("getnewaddress").strip()
data = "41524b4845" + "00" * 32
assert len(bytes.fromhex(data)) == 37
change = round(utxo["amount"] - 0.001, 8)
raw = cli(
    "createrawtransaction",
    json.dumps([{"txid": utxo["txid"], "vout": utxo["vout"]}]),
    json.dumps({"data": data, addr: change}),
).strip()
signed = json.loads(cli("signrawtransactionwithwallet", raw))
assert signed["complete"]
txid = cli("sendrawtransaction", signed["hex"]).strip()
print("TXID=" + txid)
cli("-generate", "1")
decoded = json.loads(cli("getrawtransaction", txid, "1"))
print("CONFIRMATIONS=" + str(decoded["confirmations"]))
for vout in decoded["vout"]:
    script = vout["scriptPubKey"]
    if script.get("type") == "nulldata":
        print("ASM=" + script["asm"])
        print("HEX=" + script["hex"])
PY
