# Testnet local da arkhe-chain

Scaffolding em `testnet/`. **Não está homologada.** Não há descoberta automática de peers. Dois processos com `--seal` em paralelo podem criar fork: só um nó sela.

Chaves privadas ficam só em `testnet/local/` (ignorado pelo git). Não copie essas chaves para o repositório. A ponta pública de referência `rafael-arkhe/arkhe-chain` em `1182b4ff` publica chaves em `testnet/keys/`; este monorepo mantém a higiene inversa.

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
  systemd/          # unidade exemplo; não executada aqui
  local/            # gerado: genesis.txt, peers.txt, keys/, data/, inbox/, *.env, *.log
```

O gênese (`local/genesis.txt`) segue o formato do operador:

- `validator <id> <ed25519 hex>`
- `account <id> <ed25519 hex> [mldsa65 hex]`
- linhas em branco e `#` são ignoradas

`genesis-alloc` recebe o supply do gênese no código (`GENESIS_SUPPLY`). Contas de faucet usam Ed25519 + ML-DSA-65.

## 1. Gerar chaves e gênese

No root do monorepo Arkhe:

```powershell
.\kernel\arkhe-chain\testnet\scripts\gen-keys.ps1
```

```bash
kernel/arkhe-chain/testnet/scripts/gen-keys.sh
```

Ou:

```text
cargo run -p arkhe-chain --example testnet_gen_keys
```

Isto cria `local/genesis.txt`, `local/keys/*.key`, `local/inbox/`, `local/node1.env` … `local/observer.env` e um `local/peers.txt` ainda sem multiaddresses. O sealer (`node1`) recebe `ARKHE_INBOX`.

Confira o BLAKE3:

```text
cargo run -p arkhe-chain -- --show-genesis --genesis kernel/arkhe-chain/testnet/local/genesis.txt
cargo run -p arkhe-chain -- --show-peers --genesis kernel/arkhe-chain/testnet/local/genesis.txt
```

## 2. Arranque nativo (recomendado no Windows)

1. Suba cada nó uma vez com `-Once` / `--once` para gravar o anúncio. Nesse modo os scripts **não** passam `--seal` (mempool vazia devolveria `MempoolEmpty`):

```powershell
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node1 -Once
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node2 -Once
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node3 -Once
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node observer -Once
```

Atalho: `.\kernel\arkhe-chain\testnet\scripts\init-local.ps1` (gen-keys se faltar, show-genesis, announce `--once`, collect-peers). `run-local.ps1` faz só o announce+collect.

2. Recolha as multiaddresses (se ainda não o fez):

```powershell
.\kernel\arkhe-chain\testnet\scripts\collect-peers.ps1
```

3. Suba os nós de forma persistente (só `node1` tem `ARKHE_SEAL=1` e `--inbox`). `ARKHE_TIME=now` resolve para o unix time no arranque (timestamp do bloco 1; depois pai+1):

```powershell
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node1
# outros terminais:
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node2
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node3
.\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node observer
```

Ou em background (seguidores primeiro, depois o sealer):

```powershell
.\kernel\arkhe-chain\testnet\scripts\run-background.ps1
.\kernel\arkhe-chain\testnet\scripts\check-status.ps1
.\kernel\arkhe-chain\testnet\scripts\stop-background.ps1
```

Cada processo imprime `listen …` e linhas de `--status` quando o estado muda. O sealer lê `local/inbox/*.txs` e `*.ops` uma vez por segundo e sela o que espera, se todos os pares nomeados responderam.

## 3. Status

```powershell
.\kernel\arkhe-chain\testnet\scripts\status.ps1 -Node node1
```

Equivalente:

```text
cargo run -p arkhe-chain -- --status --data <ARKHE_DATA> --genesis <ARKHE_GENESIS>
```

Saída: `height`, `committed`, `tip`, `mempool`, `forks`, `genesis`.

## 4. Transação de faucet / transferência

Gera um ficheiro na caixa do sealer (rename atómico para `*.txs`):

```powershell
.\kernel\arkhe-chain\testnet\scripts\faucet-tx.ps1 -Nonce 0 -Recipient alice -Value 100
```

O log de `node1` mostra `inbox <nome>.txs ingested <n>` (ou `rejected`). O remetente é `genesis-alloc`. O payload é o CBOR `DecisionVerdict` Allow no domínio usado pelos testes. Nonce tem de ser o seguinte do remetente.

`--inbox` só é aceite junto com `--seal` e sem `--once`. Quem pode escrever no diretório pode submeter; não há outra autenticação.

## 4.1. Fluxo de atestados na caixa

`testnet_gen_keys` cria contas `testnet-{root,requester,author,evaluator,approver}` e as linhas `grant` correspondentes. Sem papel Executor: no crate local a execução é `AttestOp::Execute` do selador (`submit_execution`), não um quinto atestado na caixa.

```powershell
.\kernel\arkhe-chain\testnet\scripts\send-attest.ps1 -Run 1
```

Isto escreve `local/inbox/flow-1.ops` (quatro atestados; rename atómico). O sealer admite-os no bloco seguinte se os pares responderam. A avaliação vem com `passed: true` porque a ferramenta a escreve; nada é avaliado de verdade.

## 5. Docker Compose

```text
cargo build -p arkhe-chain
kernel/arkhe-chain/testnet/scripts/gen-keys.sh
docker compose -f kernel/arkhe-chain/testnet/docker-compose.yml up
```

O compose monta o monorepo e corre o binário em `target/debug` ou `target/release`. Portas: 19001–19004. Pare e remova:

```text
docker compose -f kernel/arkhe-chain/testnet/docker-compose.yml down
```

Em Docker, as linhas de `peers.txt` devem usar o hostname do serviço (`node1`, `node2`, …) ou o IP da bridge, não só `127.0.0.1` do host. Nos `.env` montados no compose, use `ARKHE_LISTEN=/ip4/0.0.0.0/tcp/…` (o `gen-keys` nativo grava `127.0.0.1`). Depois do collect-peers nativo:

```powershell
.\kernel\arkhe-chain\testnet\scripts\write-peers-docker.ps1
```

## 6. Smoke local (não homologa)

```powershell
.\kernel\arkhe-chain\testnet\scripts\smoke-local.ps1
```

Sobe background, envia uma transferência faucet e um fluxo de 4 atestados pela inbox, espera acordo nas alturas 1 e 2, e para. Sai com `PASS: local smoke (transfer + attest admit). Not homologation.` — não fecha A3 nem marca a testnet como homologada. Sem Executor: a execução continua `submit_execution` no sealer, fora deste smoke.

## Limites honestos

- Sem Kademlia/mDNS: só `--peer` / `--peer-file`.
- Sem eleição de proposer: `--seal` em mais do que um processo pode bifurcar.
- `bft_commit` não move a ponta; não há `CanonicalVote`.
- Liquidação (Groth16 / Bitcoin broadcast / Ethereum settled) continua recusada no crate.
- Esta pasta não fecha A3 nem marca a cadeia como homologada.
- Tip pública alinhada para documentação: `1182b4ff` (`rafael-arkhe/arkhe-chain`). Melhorias locais portadas: `--inbox`, sela com `attest_pool`, layout `testnet/`, `Admission("policy")`, certificado de commit preservado no reopen, regras A/P/R em [regras.md](regras.md), smoke com replay/halt/catch-up/restart. Sem commit de chaves e sem papel `executor`.
- Evidência de gate fora do checkout: `python kernel/arkhe-chain/scripts/audit_gate.py --output ../arkhe-gate-result` (exige `kernel/arkhe-chain` limpo).
