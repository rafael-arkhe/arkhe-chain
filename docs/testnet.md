# Devnet local do Arkhe

Este guia descreve a devnet local de `arkhe-chain`: quatro processos validadores numa só máquina, com chaves que estão neste repositório. Não é uma testnet pública. O crate não está homologado; as pendências estão em [homologacao.md](homologacao.md).

## 1. O que a devnet faz e o que não faz

Um único processo sela. Os outros três seguem.

- `val1` sobe com `--seal`. Ele lê listas de transações e de atestados de um diretório, uma vez por segundo, e sela um bloco com o que espera.
- `val2`, `val3` e `val4` sincronizam os blocos de `val1` e assinam um precommit para cada altura.
- Uma altura é registrada como confirmada quando `votos × 3 > validadores × 2`. Com quatro validadores, são três votos. `--status` mostra essa altura na linha `committed`.

O que isso não é:

- Não é um protocolo BFT completo. Não há escolha de proposer, não há rodada posterior à 0, não há travamento de voto e não há reorg. O limiar de precommit registra a confirmação e não move a ponta. Ver [consenso.md](consenso.md), pendências C1 e C2.
- A rede não progride com um validador fora do ar. `val1` só sela depois de ouvir todos os pares nomeados na passagem. Com um par parado, as transações ficam na mempool até ele voltar.
- Dois processos com `--seal` podem bifurcar, e um irmão fica como `Fork` sem trocar a ponta. Por isso a devnet nomeia exatamente um selador.
- Não há descoberta de pares. Cada nó disca os endereços do arquivo de pares.
- Não há RPC, faucet em execução nem explorador. A entrada de transações e de atestados é o diretório descrito nas seções 4.3 e 4.4.

As regras de acordo, progresso e recuperação, com o teste de cada uma, estão em [regras.md](regras.md).

## 2. As chaves são públicas

`testnet/keys/` guarda as chaves privadas dos quatro validadores, a chave e a semente ML-DSA-65 da conta `genesis-alloc`, e as chaves das seis contas `devnet-*` do fluxo de atestados. Elas estão num repositório público. Qualquer pessoa pode assinar como qualquer validador e gastar a conta de gênese. Essas chaves servem para uma devnet local e para nada exposto à rede. Uma rede pública precisa de chaves geradas fora do repositório e de outro gênese.

`observer.key` e `observer.env` não são usados. `observer` não está no gênese, e um processo com um identificador fora do conjunto de validadores encerra com `NOT_PROPOSER`.

## 3. Arquivos

```text
testnet/
├── docker/Dockerfile          # imagem do nó
├── docker-compose.yml         # quatro validadores numa rede bridge
├── environments/val{1..4}.env # variáveis para a unidade systemd
├── keys/                      # chaves da devnet (públicas, ver seção 2)
├── systemd/arkhe-node@.service
├── genesis.txt                # validadores, contas e concessões de papel
├── peers.txt                  # pares em 127.0.0.1, para os scripts locais
└── peers.docker.txt           # pares em 172.28.0.x, para o compose
scripts/
├── init_testnet.sh            # confere o gênese e os pares
├── run_local_testnet.sh       # sobe os quatro processos; val1 sela
├── send_tx.sh                 # põe transferências do faucet na caixa de val1
├── send_attest.sh             # põe um fluxo de atestados na caixa de val1
├── check_status.sh            # --status de cada nó
├── stop_testnet.sh
├── devnet_smoke.sh            # sobe do zero e confere a devnet de ponta a ponta
└── compose_smoke.sh           # o mesmo fluxo básico dentro do Docker Compose
examples/devnet_tx.rs          # escreve uma lista de transações assinadas
examples/devnet_attest.rs      # escreve um fluxo de atestados assinados
```

Uma conta assina cada transação com Ed25519 (64 bytes) e ML-DSA-65 (3309 bytes). Os validadores usam só Ed25519.

## 4. Operação local

### 4.1. Conferir o gênese

```bash
cargo run --bin arkhe-chain -- --show-genesis --genesis testnet/genesis.txt
```

```text
validators 4
accounts 7
blake3 2018b454a46466ef86535a353bb2eb5d8881f8687f709196d2e23f0a685cdc2f
```

### 4.2. Subir e parar

```bash
bash scripts/run_local_testnet.sh
```

```bash
bash scripts/check_status.sh
```

```bash
bash scripts/stop_testnet.sh
```

O script compila o binário, sobe `val2`, `val3` e `val4`, espera dois segundos e sobe `val1` com `--seal --time <agora> --inbox testnet/data/inbox`. `--time` é o timestamp do bloco 1. Cada bloco seguinte usa o timestamp do pai mais um; não é o relógio.

Os dados ficam em `testnet/data/`, que o `.gitignore` cobre. Parar e subir de novo retoma a cadeia. Apagar `testnet/data/` recomeça do gênese.

Um nó encerrado no meio de uma gravação deixa `<id>.arkhe-tmp` ao lado do arquivo da cadeia. O nó recusa subir enquanto esse temporário existir e devolve `SNAPSHOT`. O arquivo da cadeia é trocado inteiro ou não é trocado, então o temporário órfão pode ser removido. `run_local_testnet.sh` faz isso antes de subir cada nó e avisa na saída. Ao subir um nó à mão, remova o temporário antes.

No Git Bash do Windows, um argumento que começa com barra é reescrito como caminho. Os scripts definem `MSYS2_ARG_CONV_EXCL` para os multiaddrs. Ao chamar o binário à mão nesse shell, defina a mesma variável.

### 4.3. Enviar transações

```bash
bash scripts/send_tx.sh bob 25 0
```

Os argumentos são destinatário, valor, nonce e, opcionalmente, quantas transferências consecutivas. O nonce é o próximo da conta `genesis-alloc`: 0 numa devnet nova e mais um a cada transferência selada.

O script chama `examples/devnet_tx.rs`, que assina as transferências com as chaves do faucet e escreve uma lista em `testnet/data/inbox/<nome>.txs`. O payload de cada transação é um veredito `Allow` que a própria ferramenta emite, a partir de uma política de uma regra, pelo resolvedor de desenvolvimento. Nenhum serviço de política é consultado.

`val1` lê a caixa a cada segundo. Uma lista que entra inteira vira `<nome>.txs.done` e o log de `val1` mostra `inbox <nome> ingested <n>`. Uma lista recusada vira `<nome>.txs.rejected` e o log mostra o erro, por exemplo `BAD_NONCE`; os itens anteriores ao recusado ficam na mempool. O bloco é selado na mesma passagem, se todos os pares responderam.

A caixa é um diretório local. Quem pode escrever nele pode enviar; não há outra autenticação. Quem escreve precisa renomear o arquivo pronto para `*.txs`, porque um arquivo pela metade é lido como está. `--inbox` só é aceito junto com `--seal` e sem `--once`.

### 4.4. Enviar um fluxo de atestados

```bash
bash scripts/send_attest.sh 1
```

O argumento é o número da rodada; cada número é um fluxo diferente. O script chama `examples/devnet_attest.rs`, que escreve em `testnet/data/inbox/<nome>.ops` cinco atestados: pedido, proposta, avaliação, aprovação e execução. Cada um é assinado pela conta `devnet-*` que tem aquele papel no gênese. A avaliação diz `passed` porque a ferramenta a escreve; nada é avaliado. Os detalhes estão em [atestados.md](atestados.md).

O log de `val1` mostra `inbox <nome>.ops ingested 5` e o bloco seguinte carrega os cinco. Um seguidor só adota um bloco cujos atestados reexecutam até a raiz do cabeçalho, então a mesma ponta nos quatro nós significa que os quatro aplicaram o fluxo. A mesma rodada de novo é recusada com `ATTEST: replay`.

`--status` não mostra o registro de atestados.

### 4.5. Conferir de ponta a ponta

```bash
bash scripts/devnet_smoke.sh
```

O script apaga `testnet/data/`, sobe os quatro processos e confere, nesta ordem: uma transferência selada com os quatro na mesma ponta; um fluxo de atestados selado; o mesmo fluxo recusado como replay; com `val4` parado, uma transferência esperando e nenhum bloco; com `val4` de volta, essa transferência selada; depois de parar e subir tudo, a mesma cadeia nos quatro e mais um bloco. Ele termina com código diferente de zero na primeira verificação que não vale.

Em 12 de novembro de 2026, no Windows, o script terminou com `PASS: devnet smoke`. Essa execução não deixou log neste repositório. O job `devnet` do GitHub Actions roda o mesmo script no Linux.

## 5. Docker Compose

```bash
bash scripts/compose_smoke.sh
```

O script cria `testnet/data/inbox`, sobe o compose, envia uma transferência e um fluxo de atestados pela caixa e confere que os quatro contêineres chegam à mesma ponta. À mão:

```bash
mkdir -p testnet/data/inbox
```

```bash
docker compose -f testnet/docker-compose.yml up -d --build
```

O compose usa `peers.docker.txt`, com os endereços da rede bridge, sobe `val1` com `--seal` e monta `testnet/data/inbox` como caixa de `val1`. `send_tx.sh` e `send_attest.sh` escrevem nesse mesmo diretório. A imagem de build usa a mesma versão do Rust que o CI.

O compose não foi executado na máquina onde essas mudanças foram feitas, que não tem Docker. O job `compose` do GitHub Actions roda `scripts/compose_smoke.sh`; o resultado dele é o que vale.

## 6. systemd

1. Copie o binário para `/usr/local/bin/arkhe-chain`.
2. Instale `testnet/systemd/arkhe-node@.service` em `/etc/systemd/system/`.
3. Instale cada `.env` como `/etc/arkhe/testnet-<id>.env`. O de `val1` traz `EXTRA_ARGS` com `--seal`, `--time` e `--inbox`; crie o diretório da caixa antes.
4. Ajuste o arquivo de pares para os endereços reais das máquinas.

```bash
sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now arkhe-node@val1 arkhe-node@val2 arkhe-node@val3 arkhe-node@val4
```

A unidade systemd não foi executada depois dessas mudanças.
