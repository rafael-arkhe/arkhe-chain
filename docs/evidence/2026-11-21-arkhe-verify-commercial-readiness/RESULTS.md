# Arkhe Verify — Commercial Readiness Engineering Results (2026-11-21)

Data: 2026-11-21 (local Windows x86_64, `rustc 1.96.0`, `cargo 1.96.0`, Python 3.14.2).
Escopo: fechamento de engenharia dos itens **P-01, P-02, P-03, P-04 (scripts/workflow), P-05, P-06, P-07, P-08 e P-10** de `docs/PRODUTO-ARKHE-VERIFY.md`, preservando integralmente os nove invariantes (I1–I9) e o contrato congelado de schemas `/v1`.

## 1. Resultados medidos — Produto (`packaging/core`)

| Comando | Resultado | Detalhe |
|---|---|---|
| `cd packaging\core; cargo test --locked --workspace` | **PASS** | 41 passed, 0 failed, 0 ignored (`arkhe-flow` 26, `arkhe-platform` 5, `arkhe-provenance-mcp` 6 unit + 1 `p06_invariant_loop`, `arkhe-anonymize` 2, `arkhe-storage` 1) |
| `cd packaging\core; cargo test --locked -p arkhe-flow --features external-signer` | **PASS** | 27 passed, 0 failed, 0 ignored (inclui `p01_command_signer_signs_via_external_helper_process`) |
| `cd packaging\core; cargo clippy --all-targets --locked -- -D warnings` | **PASS** | 0 avisos |
| `cd packaging\core; cargo clippy -p arkhe-flow --features external-signer --all-targets --locked -- -D warnings` | **PASS** | 0 avisos |
| `cd packaging\core; python -B audit_receipt.py fixtures/gate0` | **PASS** | 18 condições independentes recomputadas e verdadeiras |
| `cd packaging\core; python -B demo/tamper.py` | **PASS** | Contraste de 1 byte validado (17 condições) |
| `cd packaging\core; python -B sdk/test_sdk.py` | **PASS** | `sdk mcp admission PASS` |
| `cd packaging\core; cargo build --locked --release -p arkhe-provenance-mcp -p arkhe-flow -p arkhe-platform -p arkhe-anonymize` | **PASS** | Binários `--release` compilados |
| `cd packaging\core; python -B scripts/package_buyer_kit.py --profile release --out dist/arkhe-verify-gate0-kit` | **PASS** | `arkhe-verify-gate0-kit.zip` SHA-256 `12b6a156c5494c68a3aca6789659fa9eacb3991a95d81eac461ba6cb94e7fd2c` (18 arquivos, `contains_private_secrets: false`) |
| `cd packaging\core; python -B scripts/verify_release.py --kit dist/arkhe-verify-gate0-kit --run-gate0` | **PASS** | 17 arquivos verificados contra `SHA256SUMS`, 0 segredos privados, 7/7 comandos Gate 0 com `overall`, componentes e exit codes (`0`/`2`) idênticos à tabela |

## 2. Resultados medidos — Portões da raiz (P-08)

| Comando | Resultado | Detalhe |
|---|---|---|
| `python -B scripts/check_architecture.py` | **PASS** | `39 Rust crates, 9 Node packages, 19 immutable migrations; historical and packaged boundaries preserved` |
| `cargo fmt --all --check` | **PASS** | Exit 0 (formatação cirúrgica apenas nos `.rs` apontados, sem normalização global de CRLF/fixtures) |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | **PASS** | Exit 0, 0 avisos nos 39 crates (todos os alvos) |

## 3. O que ficou fora / permanece aberto (honestidade operacional)

- **Gate 0 (M1):** o kit autocontido (`arkhe-verify-gate0-kit.zip`) e o guia de 1 página (`AUDIT-1-PAGE.md`) existem e foram verificados localmente, mas **uma execução na máquina do autor não fecha o Gate 0**. O Gate 0 fecha apenas quando um terceiro externo reexecutar o kit numa máquina limpa.
- **P-04 remoto (CI multiplataforma + imagem Docker):** o workflow `.github/workflows/arkhe-verify-release.yml` e o hardening de `packaging/core/deploy/compose.yaml` estão prontos, mas o build real da imagem Docker `arkhe-provenance-mcp:local` e a matriz Linux/macOS/Windows ainda aguardam execução em CI remoto / host com Docker.
- **P-08 QA-003:** triagem individual de advisories (`cargo audit`) por artefato distribuído não foi executada offline nesta sessão.
- **P-09 & Gate 1 (M4):** por decisão explícita de `docs/PRODUTO-ARKHE-VERIFY.md`, nenhum preço foi adotado e `collects_payment` permanece `false` (`status: "draft"`) até que exista um cliente externo pagante fora desta máquina.
