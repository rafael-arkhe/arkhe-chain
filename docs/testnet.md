# arkhe-chain local testnet

Scaffolding in `testnet/`. **Not homologated.** There is no automatic peer discovery. Two processes with `--seal` in parallel may fork: only one node seals.

Private keys live only in `testnet/local/` (gitignored). Do not copy those keys into the repository. Public reference tip `rafael-arkhe/arkhe-chain` at `1182b4ff` publishes keys in `testnet/keys/`; this monorepo keeps the opposite hygiene.

## Layout

```text
testnet/
  node1.env.example … observer.env.example
  peers.txt.example
  peers.docker.txt.example
  docker-compose.yml
  docker/Dockerfile
  scripts/          # gen-keys, init-local, start-node, collect-peers, write-peers-docker,
                    # status, faucet-tx, send-attest, check-status, run-local,
                    # run-background, stop-background, smoke-local, clean-local
  systemd/          # example unit; not run here
  local/            # generated: genesis.txt, peers.txt, keys/, data/, inbox/, *.env, *.log
```

Genesis (`local/genesis.txt`) follows operator format:

- `validator <id> <ed25519 hex>`
- `account <id> <ed25519 hex> [mldsa65 hex]`
- blank lines and `#` are ignored

`genesis-alloc` receives genesis supply in code (`GENESIS_SUPPLY`). Faucet accounts use Ed25519 + ML-DSA-65.

## 1. Generate keys and genesis

At the Arkhe monorepo root:

```powershell
.\kernel\arkhe-chain\testnet\scripts\gen-keys.ps1
```

```bash
kernel/arkhe-chain/testnet/scripts/gen-keys.sh
```

Or:

```text
cargo run -p arkhe-chain --example testnet_gen_keys
```

This creates `local/genesis.txt`, `local/keys/*.key`, `local/inbox/`, `local/node1.env` … `local/observer.env`, and a `local/peers.txt` still without multiaddresses. The sealer (`node1`) gets `ARKHE_INBOX`.

Check BLAKE3:

```text
cargo run -p arkhe-chain -- --show-genesis --genesis kernel/arkhe-chain/testnet/local/genesis.txt
cargo run -p arkhe-chain -- --show-peers --genesis kernel/arkhe-chain/testnet/local/genesis.txt
```

## 2. Native startup (recommended on Windows)

1. Start each node once with `-Once` / `--once` to write the announce. In that mode scripts **do not** pass `--seal` (empty mempool would return `MempoolEmpty`):

```powershell
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node1 -Once
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node2 -Once
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node3 -Once
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node observer -Once
```

Shortcut: `.\kernel\arkhe-chain\testnet\scripts\init-local.ps1` (gen-keys if missing, show-genesis, announce `--once`, collect-peers). `run-local.ps1` does only announce+collect.

2. Collect multiaddresses (if not done yet):

```powershell
.\kernel\arkhe-chain\testnet\scripts\collect-peers.ps1
```

3. Start nodes persistently (only `node1` has `ARKHE_SEAL=1` and `--inbox`). `ARKHE_TIME=now` resolves to unix time at startup (block 1 timestamp; then parent+1):

```powershell
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node1
# other terminals:
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node2
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node3
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node observer
```

Or in background (followers first, then sealer):

```powershell
.\kernel\arkhe-chain\testnet\scripts\run-background.ps1
.\kernel\arkhe-chain\testnet\scripts\check-status.ps1
.\kernel\arkhe-chain\testnet\scripts\stop-background.ps1
```

Each process prints `listen …` and `--status` lines when state changes. The sealer reads `local/inbox/*.txs` and `*.ops` once per second and seals what waits if all named peers answered.

## 3. Status

```powershell
.\kernel\arkhe-chain\testnet\scripts\status.ps1 -Node node1
```

Equivalent:

```text
cargo run -p arkhe-chain -- --status --data <ARKHE_DATA> --genesis <ARKHE_GENESIS>
```

Output: `height`, `committed`, `tip`, `mempool`, `forks`, `genesis`.

## 4. Faucet / transfer transaction

Writes a file in the sealer inbox (atomic rename to `*.txs`):

```powershell
.\kernel\arkhe-chain\testnet\scripts\faucet-tx.ps1 -Nonce 0 -Recipient alice -Value 100
```

`node1` log shows `inbox <name>.txs ingested <n>` (or `rejected`). Sender is `genesis-alloc`. Payload is CBOR `DecisionVerdict` Allow in the domain tests use. Nonce must be sender’s next.

`--inbox` is accepted only with `--seal` and without `--once`. Whoever can write the directory can submit; there is no other authentication.

## 4.1. Attest flow in the inbox

`testnet_gen_keys` creates accounts `testnet-{root,requester,author,evaluator,approver}` and matching `grant` lines. Without Executor role: in the local crate execution is sealer `AttestOp::Execute` (`submit_execution`), not a fifth attestation in the inbox.

```powershell
.\kernel\arkhe-chain\testnet\scripts\send-attest.ps1 -Run 1
```

This writes `local/inbox/flow-1.ops` (four attestations; atomic rename). The sealer admits them in the next block if peers answered. Evaluation comes with `passed: true` because the tool writes it; nothing is actually evaluated.

## 5. Docker Compose

```text
cargo build -p arkhe-chain
kernel/arkhe-chain/testnet/scripts/gen-keys.sh
docker compose -f kernel/arkhe-chain/testnet/docker-compose.yml up
```

Compose mounts the monorepo and runs the binary from `target/debug` or `target/release`. Ports: 19001–19004. Stop and remove:

```text
docker compose -f kernel/arkhe-chain/testnet/docker-compose.yml down
```

In Docker, `peers.txt` lines must use service hostname (`node1`, `node2`, …) or bridge IP, not only host `127.0.0.1`. In compose-mounted `.env`, use `ARKHE_LISTEN=/ip4/0.0.0.0/tcp/…` (native `gen-keys` writes `127.0.0.1`). After native collect-peers:

```powershell
.\kernel\arkhe-chain\testnet\scripts\write-peers-docker.ps1
```

## 6. Local smoke (does not homologate)

```powershell
.\kernel\arkhe-chain\testnet\scripts\smoke-local.ps1
```

Starts background, sends one faucet transfer and a 4-attest flow via inbox, waits for agreement at heights 1 and 2, then stops. Exits with `PASS: local smoke (transfer + attest admit). Not homologation.` — does not close A3 or mark the testnet homologated. Without Executor: execution remains sealer `submit_execution`, outside this smoke.

## Honest limits

- No Kademlia/mDNS: only `--peer` / `--peer-file`.
- No proposer election: `--seal` on more than one process may fork.
- `bft_commit` does not move the tip; there is no `CanonicalVote`.
- Settlement (Groth16 / Bitcoin broadcast / Ethereum settled) remains refused in the crate.
- This folder does not close A3 or mark the chain homologated.
- Public tip aligned for documentation: `1182b4ff` (`rafael-arkhe/arkhe-chain`). Local ports: `--inbox`, seal with `attest_pool`, `testnet/` layout, `Admission("policy")`, commit certificate preserved on reopen, A/P/R rules in [regras.md](regras.md), smoke with replay/halt/catch-up/restart. No key commit and no `executor` role.
- Gate evidence outside checkout: `python kernel/arkhe-chain/scripts/audit_gate.py --output ../arkhe-gate-result` (requires clean `kernel/arkhe-chain`).