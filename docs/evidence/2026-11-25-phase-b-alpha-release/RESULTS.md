# Arkhe Verify — Fase B Release Evidence (2026-11-25)

Data: 2026-11-25.  
Commit alvo do código/workflow: `cebf25e00ac253fb63615bc8073fb97ac382f1a7` (`feat/native-control-lab-l1-l2-l3`).  
Escopo: fechamento de **R-02 (`--expect-invariant-version`)**, inclusão das licenças **Apache-2.0** e **MIT**, endurecimento de **P-04** (`scripts/verify_release.py`, `deploy/Dockerfile`, `.dockerignore`) e execução remota de **`.github/workflows/arkhe-verify-release.yml`** com matriz multiplataforma, imagem Docker + `compose.yaml` e atestação Sigstore OIDC.

---

## 1. Execução Local (`packaging/core`, Windows x86_64)

| Comando | Resultado | Detalhe medido |
|---|---|---|
| `cargo test --locked --workspace` | **PASS** | **42 passed, 0 failed, 0 ignored** (`arkhe-flow` 28, `arkhe-provenance-mcp` 7 unit + 1 `p06_invariant_loop`, `arkhe-platform` 5, `arkhe-anonymize` 2, `arkhe-storage` 1 — inclui os novos testes R-02) |
| `cargo test --locked -p arkhe-flow --features external-signer` | **PASS** | **29 passed, 0 failed, 0 ignored** |
| `cargo clippy --all-targets --locked -- -D warnings` | **PASS** | Exit 0, 0 avisos |
| `cargo clippy -p arkhe-flow --features external-signer --all-targets --locked -- -D warnings` | **PASS** | Exit 0, 0 avisos |
| `cargo build --locked --release -p arkhe-provenance-mcp -p arkhe-flow -p arkhe-platform -p arkhe-anonymize` | **PASS** | Binários release compilados (`1m 12s`) |
| `python -B audit_receipt.py fixtures/gate0` | **PASS** | 28 condições recomputadas (`arkhe-hash-recompute/v2`, `signatures_verified: false`) |
| `python -B demo/tamper.py` | **PASS** | Contraste de 1 byte validado (`1.71s`) |
| `python -B sdk/test_sdk.py` | **PASS** | `sdk mcp admission PASS` |
| `python -B scripts/package_buyer_kit.py --profile release --out dist/arkhe-verify-gate0-kit` | **PASS** | 20 arquivos (`LICENSE-APACHE` e `LICENSE-MIT` incluídos), `contains_private_secrets: false`, `zip_sha256: dd547681bcf6b9c346b347955c471e8fd02274eb0d9897fefbbb3913cc56feed` |
| `python -B scripts/verify_release.py --kit dist/arkhe-verify-gate0-kit --run-gate0` | **PASS** | 19 arquivos conferidos contra `SHA256SUMS`, 0 segredos privados, 9 casos executados (7 Gate 0 + 2 R-02 match/mismatch) |

---

## 2. Execução Remota no GitHub Actions (`arkhe-verify-release.yml`)

- **Run ID**: `45625806852` (`https://github.com/rafael-arkhe/arkhe-chain/actions/runs/45625806852`)
- **Commit (`headSha`)**: `cebf25e00ac253fb63615bc8073fb97ac382f1a7`
- **Conclusão global**: **`success`** (5/5 jobs aprovados)

| Job | Database ID | Conclusão | Escopo executado |
|---|---|---|---|
| `build-x86_64-unknown-linux-gnu` | `139245555451` | `success` | Testes (`workspace` + `external-signer`), Clippy `-D warnings`, `audit_receipt.py`, build release determinístico, `tamper.py`, `test_sdk.py`, kit Gate 0 + `verify_release.py --run-gate0` |
| `build-x86_64-pc-windows-msvc` | `139245555389` | `success` | Idem em `windows-latest` |
| `build-aarch64-apple-darwin` | `139245555058` | `success` | Idem em `macos-latest` |
| `build-docker-image` | `139245555544` | `success` | Build de `arkhe-provenance-mcp:local` (`rust:1.96.0-bookworm` -> `debian:bookworm-slim`), testes CLI + R-02 no container (`exit 0` / `exit 1`), smoke test `docker compose -p arkhe-verify-ci` com PostgreSQL + `CallerToken` + seats + rosters na rede `internal: true` |
| `sign-and-attest-release` | `139248399889` | `success` | Sem checkout e sem scripts do repo: consolidou `RELEASE-SHA256SUMS`, validou `sha256sum --check --strict` e gerou bundle Sigstore OIDC via `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6` |

### Artefatos e Digests Publicados no Run `45625806852`

- **Docker image ID (`arkhe-verify-docker-digest` / `docker-image-digest.txt`)**:  
  `sha256:fc55e21615680ad014734b09b77f7f8acf242dbf6c4e896c76de005aae7fcb48`
- **`RELEASE-SHA256SUMS` (`arkhe-verify-release-attestation`)**:
  - `314da92617d0f3d5d85a0f8081a2de929eccd64918079714c973cf7231e6d551  arkhe-verify-gate0-aarch64-apple-darwin.zip`
  - `9e27efdbce823259035b2e2892c3b5c6c27569f4163c19ca43cf13bfcc99f53f  arkhe-verify-gate0-x86_64-pc-windows-msvc.zip`
  - `75b5f3bf13bce601aacc851d4966eef6739d48c03ddffbed68babd62776ae812  arkhe-verify-gate0-x86_64-unknown-linux-gnu.zip`
  - `3512a82b713d57e8248e367054890d3256c9614536fbcf3226d8a18cf3de898c  docker-image-digest.txt`
- **Bundle Sigstore OIDC**: `attestation.json` (12.310 bytes) no artifact `arkhe-verify-release-attestation`.

---

## 3. O que permanece aberto (honestidade operacional)

- **M1 / Gate 0**: os binários multiplataforma, kits e atestações estão gerados e verificados em CI, mas **continuam aguardando execução independente por um terceiro fora da máquina e conta do autor**.
- **M4 / Gate 1**: 0 clientes pagantes externos; `collects_payment` permanece `false`.
- **QA-003 (triagem individual de advisories da raiz)** e limpeza/fmt da branch fora de `packaging/core` pertencem à trilha separada do monorepo (Fase A).
