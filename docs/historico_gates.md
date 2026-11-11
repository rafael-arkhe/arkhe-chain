# Histórico de Execuções e Gates (arkhe-chain)

Este documento centraliza os registros históricos de execuções de testes e marcos de validação (gates) do nó `arkhe-chain`, preservando o histórico detalhado sem sobrecarregar a documentação principal do projeto.

## Comandos de Validação

O `Cargo.toml` herda versão, edição e licença de um workspace Arkhe. O comando de teste abaixo roda nesse workspace, não em um checkout isolado:

```bash
cargo test -p arkhe-chain
```

---

## Registro Cronológico de Gates

### 10 de Novembro de 2026

- **151 aprovados (gate-2026-11-10-tip-body):**
  - Código de saída 0, 151 testes aprovados, 0 falhas e 0 ignorados no Windows.
  - Log: [`gate-2026-11-10-tip-body.log`](gate-2026-11-10-tip-body.log).
  - Regra: Anunciar a ponta local sem entregar o corpo não libera o bloco seguinte. A ponta zero não tem corpo. Quando o par entrega esse bloco, a passagem seguinte sela o bloco de cima.
- **151 aprovados (gate-2026-11-10-behind-seal):**
  - Log: [`gate-2026-11-10-behind-seal.log`](gate-2026-11-10-behind-seal.log).
- **150 aprovados:** Log em [`gate-2026-11-10-missed-seal.log`](gate-2026-11-10-missed-seal.log).
- **149 aprovados:** Log em [`gate-2026-11-10-reply-next.log`](gate-2026-11-10-reply-next.log).
- **148 aprovados:** Log em [`gate-2026-11-10-wait-seal.log`](gate-2026-11-10-wait-seal.log).
- **147 aprovados:** Log em [`gate-2026-11-10-retry-next.log`](gate-2026-11-10-retry-next.log).
- **146 aprovados:** Log em [`gate-2026-11-10-io-next.log`](gate-2026-11-10-io-next.log).
- **145 aprovados:** Log em [`gate-2026-11-10-rr-timeout-next.log`](gate-2026-11-10-rr-timeout-next.log).
- **144 aprovados:** Log em [`gate-2026-11-10-malformed-next.log`](gate-2026-11-10-malformed-next.log).
- **143 aprovados:** Log em [`gate-2026-11-10-closed-next.log`](gate-2026-11-10-closed-next.log).
- **142 aprovados:** Log em [`gate-2026-11-10-dial-next.log`](gate-2026-11-10-dial-next.log).
- **141 aprovados:** Log em [`gate-2026-11-10-outsider-next.log`](gate-2026-11-10-outsider-next.log).
- **140 aprovados:** Log em [`gate-2026-11-10-tip-next.log`](gate-2026-11-10-tip-next.log).
- **139 aprovados:** Log em [`gate-2026-11-10-hash-next.log`](gate-2026-11-10-hash-next.log).
- **138 aprovados:** Log em [`gate-2026-11-10-protocol-next.log`](gate-2026-11-10-protocol-next.log).
- **137 aprovados:** Log em [`gate-2026-11-10-limit-next.log`](gate-2026-11-10-limit-next.log).
- **136 aprovados:** Log em [`gate-2026-11-10-sync-resume.log`](gate-2026-11-10-sync-resume.log).
- **135 aprovados:** Log em [`gate-2026-11-10-genesis-next.log`](gate-2026-11-10-genesis-next.log).
- **134 aprovados:** Log em [`gate-2026-11-10-timeout-next.log`](gate-2026-11-10-timeout-next.log).
- **133 aprovados:** Log em [`gate-2026-11-10-vote-relay.log`](gate-2026-11-10-vote-relay.log).
- **132 aprovados:** Log em [`gate-2026-11-10-missing-body.log`](gate-2026-11-10-missing-body.log).
- **131 aprovados:** Log em [`gate-2026-11-10-longer-extension.log`](gate-2026-11-10-longer-extension.log).
- **130 aprovados:** Log em [`gate-2026-11-10-sibling-next.log`](gate-2026-11-10-sibling-next.log).
- **129 aprovados:** Log em [`gate-2026-11-10-sibling-tip.log`](gate-2026-11-10-sibling-tip.log).
- **Logs anteriores sobre tratamento de bifurcação e blocos irmãos:**
  - [`gate-2026-11-10-vote-fork.log`](gate-2026-11-10-vote-fork.log) (tratava ponta irmã como erro que interrompia a lista).
  - [`gate-2026-11-10-vote-block.log`](gate-2026-11-10-vote-block.log) (corpo que não estendia ponta não gravava irmão).
  - [`gate-2026-11-10-vote-again.log`](gate-2026-11-10-vote-again.log) (discagem não entregava o bloco).
- **128 aprovados:** Log em [`gate-2026-11-10-longer-peer.log`](gate-2026-11-10-longer-peer.log).
- **127 aprovados:** Log em [`gate-2026-11-10-shorter-peer.log`](gate-2026-11-10-shorter-peer.log).
- **126 aprovados:** Log em [`gate-2026-11-10-vote-behind.log`](gate-2026-11-10-vote-behind.log).
- **Logs anteriores:**
  - [`gate-2026-11-10-seal-after-sync.log`](gate-2026-11-10-seal-after-sync.log) (saída `UnknownBlock`).
  - [`gate-2026-11-10-fresh-dial.log`](gate-2026-11-10-fresh-dial.log) (125 testes).
  - [`gate-2026-11-10-announce-genesis.log`](gate-2026-11-10-announce-genesis.log) (124 testes).
  - [`gate-2026-11-10-busy.log`](gate-2026-11-10-busy.log) (123 testes).
  - [`gate-2026-11-10-adopt.log`](gate-2026-11-10-adopt.log) (122 testes).
  - [`gate-2026-11-10-status-check.log`](gate-2026-11-10-status-check.log) (121 testes).
  - [`gate-2026-11-10-status-genesis.log`](gate-2026-11-10-status-genesis.log) (120 testes).
  - [`gate-2026-11-10-file-genesis.log`](gate-2026-11-10-file-genesis.log) (119 testes).
  - [`gate-2026-11-10-admit.log`](gate-2026-11-10-admit.log) (118 testes).
  - [`gate-2026-11-10-genesis-check.log`](gate-2026-11-10-genesis-check.log) (117 testes).
  - [`gate-2026-11-10-fork.log`](gate-2026-11-10-fork.log) (116 testes).
  - [`gate-2026-11-10-genesis.log`](gate-2026-11-10-genesis.log) (115 testes).
  - [`gate-2026-11-10-live.log`](gate-2026-11-10-live.log) (114 testes).
  - [`gate-2026-11-10-error.log`](gate-2026-11-10-error.log) (112 testes).
  - [`gate-2026-11-10-mempool.log`](gate-2026-11-10-mempool.log) (111 testes).
  - [`gate-2026-11-10-peer-file.log`](gate-2026-11-10-peer-file.log) (110 testes).
  - [`gate-2026-11-10-announce.log`](gate-2026-11-10-announce.log) (108 testes).
  - [`gate-2026-11-10-status.log`](gate-2026-11-10-status.log) (107 testes).
  - [`gate-2026-11-10-peers.log`](gate-2026-11-10-peers.log) (106 testes).
  - [`gate-2026-11-10-catch.log`](gate-2026-11-10-catch.log) (105 testes).
  - [`gate-2026-11-10-second.log`](gate-2026-11-10-second.log) (104 testes).
  - [`gate-2026-11-10-tx.log`](gate-2026-11-10-tx.log) (103 testes).
  - [`gate-2026-11-10-seal.log`](gate-2026-11-10-seal.log) (102 testes).
  - [`gate-2026-11-10-attest.log`](gate-2026-11-10-attest.log) (99 testes).
  - [`gate-2026-11-10-echo.log`](gate-2026-11-10-echo.log) (98 testes).
  - [`gate-2026-11-10-precommit.log`](gate-2026-11-10-precommit.log) (97 testes).
  - [`gate-2026-11-10-commit.log`](gate-2026-11-10-commit.log) (96 testes).
  - [`gate-2026-11-10-listen.log`](gate-2026-11-10-listen.log) (95 testes).
  - [`gate-2026-11-10-resume.log`](gate-2026-11-10-resume.log) (89 testes, com cursor gravado).
  - [`gate-2026-11-10-tip-hash.log`](gate-2026-11-10-tip-hash.log) (89 testes).
  - [`gate-2026-11-10-zero-ignored.log`](gate-2026-11-10-zero-ignored.log) (87 testes).
  - [`gate-2026-11-10-protocol.log`](gate-2026-11-10-protocol.log) (86 aprovados, 1 ignorado).
  - [`gate-2026-11-10-https.log`](gate-2026-11-10-https.log) (85 testes, com cliente HTTPS).
  - [`gate-2026-11-10-restantes.log`](gate-2026-11-10-restantes.log) (85 testes anterior).
  - [`gate-2026-11-10-cursor.log`](gate-2026-11-10-cursor.log) (81 aprovados, 2 testes de cursor).
  - [`gate-2026-11-10.log`](gate-2026-11-10.log) (79 aprovados).

### Execuções em WSL2 / Ubuntu

- **10 de Novembro de 2026:**
  - Conta `arkhen` repetiu a suíte com corpos retidos: 79 aprovados, 0 falhas e 1 ignorado.
  - Log: [`gate-wsl-arkhen-2026-11-10.log`](gate-wsl-arkhen-2026-11-10.log).
- **09 de Novembro de 2026:**
  - Execução no Windows: 79 aprovados, 0 falhas, sem teste ignorado. Log: [`gate-2026-11-09.log`](gate-2026-11-09.log).
  - Conta `arkhen` em WSL2: 78 aprovados, 1 falha em sincronização de 1.025 blocos por `P2p("timeout")` e 1 ignorado. Log: [`gate-wsl-arkhen-2026-11-09.log`](gate-wsl-arkhen-2026-11-09.log).
