# arkhe-chain

`arkhe-chain` é a implementação do nó local em Rust que estende e gerencia a ponta da cadeia canônica Arkhe. O modelo de transação adota assinaturas Ed25519 + ML-DSA-65, árvore MMR e precommits com quórum estritamente superior a dois terços. A convergência BFT permanece pendente. O nó prepara âncoras Bitcoin e interfaces de liquidação ZK, cujo caminho padrão recusa a operação enquanto o verificador está ausente.

As correções da auditoria, os limites de compatibilidade e o procedimento para vincular testes ao commit estão em [audit-remediation.md](docs/audit-remediation.md).

A admissão de transações é feita exclusivamente via `ArkheNode::ingest`. O payload transacional transporta a codificação CBOR canônica de `DecisionVerdict` no domínio `AKG:VERDICT:v1`. O nó opera sob invariantes rígidos: não existem os tipos `ArkheChain` nem a função `ingest_transaction`. O projeto não possui marca de homologação de produção.

---

## Índice

1. [Arquitetura e Componentes Centrais](#arquitetura-e-componentes-centrais)
2. [Criptografia Híbrida e Formato de Transações](#criptografia-híbrida-e-formato-de-transações)
3. [Consenso BFT e Finalidade](#consenso-bft-e-finalidade)
4. [Árvores de Estado, MMR e Persistência](#árvores-de-estado-mmr-e-persistência)
5. [Camada P2P e Protocolo de Sincronização](#camada-p2p-e-protocolo-de-sincronização)
6. [Liquidação ZK, Ponte EVM e Âncora Bitcoin](#liquidação-zk-ponte-evm-e-âncora-bitcoin)
7. [Limites e Invariantes Fail-Closed](#limites-e-invariantes-fail-closed)
8. [Testnet e Operação de Infraestrutura](#testnet-e-operação-de-infraestrutura)
9. [Compilação, Testes e Verificação](#compilação-testes-e-verificação)
10. [Histórico de Validação e Gates](#histórico-de-validação-e-gates)

---

## Arquitetura e Componentes Centrais

O nó é estruturado em torno da estrutura `ArkheNode`, que encapsula:
- **Motor de Transição de Estado:** Débito/crédito atômico de saldos nativos, nonces sequenciais e acumulação sequencial de registros transacionais em Merkle Mountain Range (MMR).
- **Mempool Determinística:** Capacidade máxima de 1.000 transações pendentes; blocos selam no máximo 250 transações por altura.
- **Operador CLI e Daemon:** Binário `arkhe-chain` com suporte a modos de escuta daemon (`listen`), operador de selagem (`--seal` com `--time`), submissão única (`--once`), consulta de status sem alteração de disco (`--status`), exibição de validadores (`--show-peers`) e hash canônico de gênese (`--show-genesis`).
- **Mecanismo de Parada de Emergência (`Halt`):** Controlado via propriedade `emergency.halt=true` em `arkhe-chain.properties`, bloqueando preventivamente admissão, selagem e importação sem alterar o estado.

```text
              [ Transação Externa ]
                        │
                        ▼
             ArkheNode::ingest(&tx)
                        │
      ┌─────────────────┴─────────────────┐
      │ Validação Híbrida Fail-Closed     │
      │  ├─ Ed25519 (64B) [Sender]        │
      │  ├─ ML-DSA-65 (3309B) [FIPS 204]  │
      │  └─ DecisionVerdict (CBOR)        │
      └─────────────────┬─────────────────┘
                        ▼
                  [ Mempool ] (Máx: 1000 txs)
                        │
             propose_and_seal_block
                        │
                        ▼
      ┌─────────────────┴─────────────────┐
      │ Bloco Selado (Máx 250 txs)        │
      │  ├─ Hash Pai + Altura + Proposer  │
      │  ├─ Raiz de Estado (AKG:STATE:v1) │
      │  ├─ MMR Root (AKG:CHAIN:TXREC:v1) │
      │  └─ Assinatura Ed25519 Proposer   │
      └─────────────────┬─────────────────┘
                        ▼
             Consenso P2P & Finalidade
       (/arkhe/block-sync/1 & /arkhe/precommit/1)
```

---

## Criptografia Híbrida e Formato de Transações

Todo envio de transação no Arkhe requer dualidade de chaves e assinaturas obrigatórias, sem fallback clássico ou quântico isolado:

| Campo | Primitiva Criptográfica | Tamanho | Domínio Canônico | Escopo da Mensagem |
| :--- | :--- | :--- | :--- | :--- |
| `signature_mldsa` | ML-DSA-65 (`fips204`) | 3.309 bytes | `AKG:CHAIN:MLDSA65:v1` | `nonce \|\| sender \|\| recipient \|\| value` |
| `sender_signature` | Ed25519 (`ed25519-dalek`) | 64 bytes | `AKG:CHAIN:SENDER:v1` | `subject` da transação |
| Chave Pública ML-DSA | Pós-quântica lattice-based | 1.952 bytes | — | Registrada na gênese ou estado |
| Chave Pública Ed25519 | Curva elíptica Edwards25519 | 32 bytes | — | Identificador canônico da conta |

### Regras de Validação de Admissão:
1. **Forma e Tamanho:** Campo `signature_mldsa` vazio retorna `UnverifiedSignature`. Tamanho diferente de 3.309 bytes retorna `BadSignatureLength`.
2. **Ordem de Avaliação em `apply_tx`:** (1) Verificação formal do envelope; (2) Verificação da chave e assinatura Ed25519; (3) Verificação da chave e assinatura ML-DSA-65; (4) Veredito de política `DecisionVerdict` (apenas `RULE_ALLOWED` gera `Allow`); (5) Validação estrita do nonce (`BadNonce` se não for sequencial); (6) Débito e crédito mútuo com conservação de oferta (`InsufficientBalance` se fundos insuficientes); (7) Inserção do registro `tx.record()` no MMR.

---

## Consenso BFT e Finalidade

O protocolo de consenso opera sobre uma topologia BFT sem reordenação de blocos (sem reorg):

- **Extensão da Ponta:** Um bloco só é adotado quando o `parent_hash` coincide exatamente com a ponta canônica atual do nó e a nova altura é `tip.height + 1`.
- **Assinatura do Proposer:** Bloco assinado via Ed25519 sob o domínio `AKG:CHAIN:PROPOSER:v1` cobrindo o cabeçalho e transações. Proposer deve pertencer ao conjunto estático de validadores (`EmptyValidators` ou `NotProposer` em violação).
- **Tratamento de Bifurcações e Equivocação:**
  - *Irmão de Proposer Distinto:* Um bloco na mesma altura e com o mesmo pai gerado por outro validador é classificado como `Fork`. É arquivado na tabela de irmãos e não substitui a ponta canônica local.
  - *Equivocação do Mesmo Proposer:* Dois blocos diferentes gerados pelo mesmo proposer na mesma altura resultam no erro fatal de equivocação (`Equivocation`), mantendo a ponta intacta.
- **Precommits e Quórum BFT:**
  - O precommit v4 é assinado em Ed25519 sob o domínio canônico `AKG:CHAIN:PRECOMMIT:v4`.
  - A mensagem assinada amarra: `height || round || block_hash || parts (exatamente 1) || part_hash (igual ao block_hash) || chain_id ("arkhe-chain")`.
  - O quórum para commit `bft_commit(height)` exige estritamente mais de dois terços dos votos dos validadores ($v > \frac{2}{3} N$, ou seja, $3v > 2N$). Sob modelo $3f + 1$, com 4 validadores são necessários no mínimo 3 votos válidos.
  - Votos com totais de parts diferentes de 1 ou part_hash divergente retornam `BadPartSet`. Voto em cadeia externa retorna `ChainId`.

---

## Árvores de Estado, MMR e Persistência

### Compromissos Criptográficos
- **Folha do MMR:** Cada transação aceita gera uma folha canônica calculada por `tx.record()`, correspondente ao hash BLAKE3 no domínio `AKG:CHAIN:TXREC:v1`. O MMR utiliza `arkhe_verify_core::rbb::mmr::Frontier`.
- **Raiz de Estado (`state_root`):** Compromisso BLAKE3 no domínio `AKG:CHAIN:STATE:v1` cobrindo:
  `mmr_root || mmr_count || saldos canônicos || nonces das contas`.

### Snapshots Canônicos e Formato de Disco
O estado é persistido em arquivos de snapshot com marcadores de versão binária:
- `AKGCHNS7`: Formato canônico padrão contendo altura, ponta, picos do MMR, saldos, nonces, blocos selados, fila de mempool, chaves Ed25519, chaves ML-DSA, blocos irmãos (forks), precommits por rodada e citações de blocos de execução Ethereum, finalizado com o hash BLAKE3 de 32 bytes da gênese.
- `AKGCHNS8`: Formato estendido que preserva a caminhada de sincronização interrompida (ponta remota anunciada, cursor e corpos de blocos validados retidos).
- `AKGCHNS9` / `AKGCHN10`: Formatos que incorporam a altura canônica confirmada por quórum BFT e cursor de sincronização.
- Snapshots corrompidos, violados ou divergentes falham fechado (`Snapshot`). Arquivos de gênese incompatíveis são rejeitados com `Genesis`.

---

## Camada P2P e Protocolo de Sincronização

A comunicação inter-nós baseia-se na stack `libp2p` com streams orientados a CBOR sobre multiplexação Yamux e criptografia de transporte Noise:

- **Protocolos de Rede Registrados:**
  - `/arkhe/block-sync/1`: Troca de pontas (`Tip`), consulta de blocos por hash (`Block`) e nós filhos (`Child`).
  - `/arkhe/precommit/1`: Propagação e coleta de votos BFT v4 entre validadores nomeados.
  - `/arkhe/tx/1`: Ingestão remota de transações para operadores em modo `--seal`.
- **Descoberta Estática:** Não há descobrimento aleatório via DHT (Kademlia) ou mDNS descontrolado em produção. O nó aceita e disca apenas os validadores declarados explicitamente no arquivo de gênese (`accepted_peers`).
- **Limites de Janela de Sincronização:** Uma rodada de sincronização caminha no máximo 128 blocos em direção à ponta local (`MAX_SYNC_BLOCKS`). Ultrapassado o limite, o nó salva o progresso e o cursor em `AKGCHNS8` retornando `P2p("sync-limit")`, permitindo que passagens subsequentes retomem do ponto de interrupção.
- **Tratamento de Falhas P2P:** Falhas de conexão, fechamento prematuro (`connection-closed`), respostas não legíveis (`io`) e timeouts de requisição (`rr-timeout`) são tratados isoladamente por peer e não impedem que um par íntegro forneça a cadeia válida.

---

## Liquidação ZK, Ponte EVM e Âncora Bitcoin

### 1. Provas ZK Groth16 e Contratos EVM
- O nó integra o perfil de circuito `arkhe-validity-slash-v1` (fase 0, `risc0-groth16`), registrado em `circuits/validity_slash.json` com seletor `73c457ba` e selo de 260 bytes.
- O journal associa o número do bloco, a raiz de estado reivindicada (`claimed_root`) e o hash do pai.
- Os contratos Solidity em `contracts/`:
  - `contracts/ArkheValidityBridge.sol`: Ponte de validade que aceita submissão de estado e provas.
  - `contracts/Groth16Verifier.sol`: Verificador Groth16. Enquanto não houver chaves de verificação implantadas, a ponte retorna `VerifierAbsent` de forma fail-closed.
- Compilação dos contratos:
  ```bash
  npx solc@0.8.20 --bin contracts/ArkheValidityBridge.sol contracts/Groth16Verifier.sol
  ```

### 2. Âncora Bitcoin (OP_RETURN)
- A âncora Bitcoin é composta estritamente por 37 bytes: prefixo ASCII `ARKHE` (5 bytes) concatenado com os 32 bytes do `state_root`.
- Qualquer buffer divergente retorna `InvalidAnchorPrefix`. Por política fail-closed padrão, o campo `AnchorPlan.broadcast` permanece desligado (`false`).

### 3. Citação e Confirmação de Execução Ethereum
- `cite_ethereum_execution` vincula um bloco selado do Arkhe ao número e hash de um bloco de execução externo via hash BLAKE3 no domínio `AKG:ETH:LINK:v1\0`.
- Conflitos de cabeçalhos ou reversões numéricas disparam `EthereumConflict`.
- `confirm_ethereum_execution` consulta nós JSON-RPC locais ou HTTPS (utilizando a raiz de certificados TLS do sistema). Sem cliente configurado, retorna `RpcAbsent` e o status `settled` permanece inalterado.

---

## Limites e Invariantes Fail-Closed

O código impõe as seguintes validações e limites:
- **Tamanho Máximo de Payload Transacional:** 4.096 bytes.
- **Tamanho Máximo de Transações por Bloco:** 250 transações.
- **Capacidade Máxima da Mempool:** 1.000 transações pendentes.
- **Oferta de Gênese Inicial:** `100_000_000` tokens canônicos alocados para a conta inicial (`genesis-alloc`).
- **Tamanho de Bloco Propagado em Votos:** No máximo 1 MiB (`VOTE_BLOCK_LIMIT`).
- **Resolução de Forks:** Cadeias mais longas de validadores discordantes não causam reorg da ponta canônica local. O consenso exige o limiar de precommit do comitê estático.

---

## Testnet e Operação de Infraestrutura

O diretório [`testnet/`](testnet/) traz uma devnet local: quatro processos validadores numa só máquina. Não é uma testnet pública.

- **Um selador, três seguidores:** `val1` sela; `val2`, `val3` e `val4` sincronizam e assinam um precommit por altura. Uma altura fica registrada como confirmada com três dos quatro votos.
- **Não é BFT completo:** não há escolha de proposer, rodada posterior à 0, travamento de voto nem reorg, e a rede não progride com um validador fora do ar.
- **Chaves públicas:** as chaves privadas em `testnet/keys/` estão neste repositório. Servem para a devnet local e para nada exposto à rede.
- **Entrada de transações e atestados:** `scripts/send_tx.sh` e `scripts/send_attest.sh` escrevem listas assinadas no diretório que `val1` lê com `--inbox`. Não há RPC, faucet em execução nem explorador.
- **Conferência:** `scripts/devnet_smoke.sh` sobe a devnet do zero e confere acordo, parada, retomada e o fluxo de atestados.
- **Orquestração:** scripts em [`scripts/`](scripts/), `testnet/docker-compose.yml` e `testnet/systemd/arkhe-node@.service`. Os scripts locais e o compose rodam no GitHub Actions; a unidade systemd não foi executada.

O passo a passo e os limites estão no [Guia da Devnet](docs/testnet.md).

---

## Compilação, Testes e Verificação

### Compilação do Workspace
O repositório é configurado como um workspace Cargo contendo a raiz e os crates de apoio em `vendor/`. A compilação e verificação de tipos devem ser executadas a partir da raiz:

```bash
# Compilar todos os pacotes do workspace
cargo build --workspace

# Checar testes do nó arkhe-chain
cargo check --tests -p arkhe-chain
```

### Execução da Suíte de Testes
Para rodar a suíte completa de testes unitários e de integração de `arkhe-chain`:

```bash
cargo test -p arkhe-chain
```

Para rodar suítes de testes específicas:
```bash
# Testes de criptografia e regras de saldo nativo
cargo test -p arkhe-chain --test native_token

# Testes de persistência e integridade de snapshots
cargo test -p arkhe-chain --test persist

# Testes de limites e fail-closed
cargo test -p arkhe-chain --test limits

# Testes do operador CLI
cargo test -p arkhe-chain --test operator
```

---

## Documentação Técnica Complementar

O detalhamento aprofundado dos subsistemas do nó encontra-se nos guias de documentação em [`docs/`](docs/):

- [Admissão de Transações](docs/admissao.md) — Regras de payload, veredito CBOR e assinaturas híbridas.
- [Regras de acordo, progresso e recuperação](docs/regras.md) — O que o código impõe, o que não impõe e o teste de cada regra.
- [Atestados](docs/atestados.md) — Declarações assinadas, aprovação de uso único e recibo, carregados nos blocos.
- [Consenso, Bifurcações e Finalidade](docs/consenso.md) — Precommits v4, quórum BFT e regras de proposer.
- [Estado e Snapshot](docs/estado.md) — Acumulador MMR, compromisso de estado e snapshots `AKGCHNS7..10`.
- [Sincronização P2P](docs/sincronizacao.md) — Troca de blocos, cursor de retomada e tolerância a falhas.
- [Liquidação e Pontes](docs/liquidacao.md) — Integração Groth16, âncora Bitcoin e citação de execução EVM.
- [Blindagem de Chaves e Contingência](docs/seguranca_chaves.md) — Requisitos de custódia e isolamento de chaves.
- [Catálogo de Erros](docs/erros.md) — Tabela exaustiva de variantes `ChainError`.
- [Dossiê de Homologação](docs/homologacao.md) — Pendências para certificação e critérios de aceitação.
- [Histórico Completo de Gates](docs/historico_gates.md) — Registros cronológicos de gates e logs de execução.

---

## Publicação e Referências

- Repositório GitHub: <https://github.com/rafael-arkhe/arkhe-chain>
- Árvore Hashtree: `htree://npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain`
- Leitura Iris Git: <https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain>
