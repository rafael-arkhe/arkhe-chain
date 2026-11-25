# Fase A — Higiene da Raiz e Triagem QA-003 (2026-11-25)

Data: 25/11/2026 (Windows x86_64, `rustc 1.96.0`, `cargo-audit-audit 0.22.1`, Python 3).  
Escopo: formatação cirúrgica dos arquivos Rust pendentes na raiz (`P-08`), resolução das 3 falhas de `scripts/check_architecture.py` e triagem completa por artefato/alcançabilidade (`QA-003`).

---

## 1. Execução dos Portões

| Comando | Resultado | Detalhe medido |
|---|---|---|
| `cargo fmt --manifest-path Cargo.toml --all --check` | **PASS** | Exit 0 após `rustfmt --edition 2021` cirúrgico nos 14 `.rs` apontados |
| `python -B scripts/check_architecture.py` | **PASS** | Exit 0: `PASS unified architecture: 40 Rust crates, 9 Node packages, 19 immutable migrations; historical and packaged boundaries preserved` |
| `python -B -m unittest discover -s scripts/tests -v` | **PASS** | **339 tests** em `34.602s`, `OK` (inclui `test_architecture_boundaries.py`) |
| `cargo audit --file packaging/core/Cargo.lock --no-fetch --json` | **Triado** | 2 entries no lockfile (`libsqlite3-sys`, `rsa`), **0 alcançáveis** via `cargo tree --locked -i` ([triagem](QA-003-AUDIT-TRIAGE.md)) |
| `cargo audit --file Cargo.lock --no-fetch --json` | **Triado** | 28 vulnerabilities + 8 informational warnings classificados por alcançabilidade e escopo ([triagem](QA-003-AUDIT-TRIAGE.md)) |

---

## 2. Alterações Commitadas vs. Working Tree Local (Separação Explícita)

- **6 arquivos `.rs` limpos formatados e commitados nesta rodada**:
  - `kernel/arkhe-kernel/src/solana_swap_sqlite.rs`
  - `orchestration/arkhe-runtime/src/bin/arkhe-solana-swap-gateway.rs`
  - `orchestration/arkhe-runtime/src/solana_swap_upstream.rs`
  - `verification/crates/arkhe-verify-core/src/rfc9421.rs`
  - `verification/crates/arkhe-verify-core/src/solana_swap.rs`
  - `verification/crates/arkhe-verify-wasm/src/lib.rs`
- **8 arquivos `.rs` de trabalho em andamento (WIP) formatados localmente apenas** (não commitados nesta rodada para preservar o escopo e evitar quebra de builds `--locked` sem seus `Cargo.toml`/`Cargo.lock`):
  - `orchestration/arkhe-runtime/src/solana_swap_gateway.rs`
  - `orchestration/arkhe-runtime/tests/solana_swap_gateway_http.rs`
  - `orchestration/arkhe-runtime/src/bin/arkhe-eth-sig-mcp-gateway.rs`
  - `orchestration/arkhe-runtime/src/bin/arkhe-eth-sig-mcp-server.rs`
  - `orchestration/arkhe-runtime/src/eth_sig_mcp_gateway.rs`
  - `verification/crates/arkhe-verify-cli/src/eth_sig_auditor.rs`
  - `verification/crates/arkhe-verify-core/src/eth_sig_pilot.rs`
  - `verification/crates/arkhe-verify-core/src/swap_guard_program.rs`
- **Reconciliação de arquitetura (`config/architecture.json`)**:
  - Registrado `verification/arkhe-native-control-lab` em `rust_members` e `components` (`"layer": "control-lab"`, `"status": "test-harness"`, `"authority": false`).
  - Restringido `verification-does-not-authorize` e `silent_prefixes` para `verification/crates/` (mantendo intactas todas as barreiras sobre os crates verificadores puros).

---

## 3. Limites

- `Cargo.lock` da raiz não foi atualizado nesta rodada devido às modificações WIP não commitadas de `Cargo.toml`/`Cargo.lock` do piloto `eth-sig-mcp` na working tree.
- `packaging/core/Cargo.lock` (produto Alpha) já possui a pilha TLS atualizada (`rustls 0.23.46`, `rustls-webpki 0.103.17`, `webpki-roots 1.0.12`) e **zero vulnerabilidades alcançáveis**.
