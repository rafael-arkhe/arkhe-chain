# Inventário ativo do Arkhe

Sincronizado com `config/architecture.json`, `Cargo.toml` e `pnpm-workspace.yaml` em 17/11/2026. Inventário estrutural, sem autoridade de admissão ou garantia automática de implementação.

## Rust (38 crates no workspace unificado)

| Pacote | Caminho ativo | Camada / Limite |
| --- | --- | --- |
| arkhe-twin | `work/arkhe-twin` | work (active) |
| arkhe-crm-bridge-cli | `integration/arkhe-crm-bridge` | integration (active) |
| arkhe-depin | `integration/arkhe-depin` | integration (active) |
| arkhe-p2p | `integration/arkhe-p2p` | integration (active) |
| arkhe-network | `integration/arkhe-network` | integration (active) |
| arkhe-auth-md | `integration/auth-md` | integration (local-candidate) |
| arkhe-orkut | `integration/orkut` | integration (local-candidate) |
| arkhe-ollama | `integration/arkhe-ollama` | integration (active) |
| arkhe-bugbounty | `integration/arkhe-bugbounty` | integration (active) |
| arkhe-core | `kernel/arkhe-core` | kernel (work identity authority) |
| arkhe-gate | `kernel/arkhe-gate` | kernel (skeleton — specimen, unwired) |
| arkhe-kernel | `kernel/arkhe-kernel` | kernel (authorization authority) |
| arkhe-chain | `kernel/arkhe-chain` | kernel (consensus, non-gate) |
| arkhe-barrier | `barrier/arkhe-barrier` | barrier (skeleton — Held/Unmediated) |
| arkhe-state | `state/arkhe-state` | state (skeleton — Unavailable/NotImplemented) |
| arkhe-probes | `probes/arkhe-probes` | probes (skeleton boundary checks) |
| arkhe-wormgraph | `evidence/arkhe-wormgraph` | evidence (active) |
| arkhe-memory | `evidence/arkhe-memory` | evidence (active) |
| arkhe-governance | `governance/arkhe-governance` | governance (policy authority) |
| arkhe-sdd-parser | `governance/arkhe-sdd-parser` | governance (active) |
| arkhe-work | `work/arkhe-work` | work (active) |
| arkhe-work-channels | `work/arkhe-work-channels` | work (active) |
| arkhe-cognition-sdk | `cognition/arkhe-cognition-sdk` | cognition (reference SDK) |
| arkhe-perception | `cognition/arkhe-perception` | cognition (reference) |
| arkhe-rag | `cognition/arkhe-rag` | cognition (reference) |
| arkhe-metacognition | `cognition/arkhe-metacognition` | cognition (reference) |
| arkhe-world-model | `cognition/arkhe-world-model` | cognition (reference) |
| arkhe-learning | `cognition/arkhe-learning` | cognition (reference) |
| arkhe-agent | `cognition/arkhe-agent` | cognition (reference) |
| arkhe-runtime | `orchestration/arkhe-runtime` | orchestration (active) |
| arkhe-sql | `storage/sql/crates/arkhe-sql` | storage (active) |
| arkhe-sql-migrate | `storage/sql/crates/arkhe-sql-migrate` | storage (active) |
| arkhe-verify-core | `verification/crates/arkhe-verify-core` | verification (pure verifier authority) |
| arkhe-verify-cli | `verification/crates/arkhe-verify-cli` | verification (CLI adapter) |
| arkhe-verify-wasm | `verification/crates/arkhe-verify-wasm` | verification (WASM adapter) |
| arkhe-license-issuer | `verification/crates/arkhe-license-issuer` | verification (adapter) |
| arkhe-python-bridge | `integrations/arkhe-python-runtime/bridge` | integration (active-adapter) |
| arkhe-ask | `apps/arkhe-ask` | application (local-service) |

## Node (9 pacotes editáveis no workspace)

| Pacote | Caminho ativo |
| --- | --- |
| @arkhe/preflight-ui | `apps/preflight` |
| @arkhe/melodic-lab | `apps/melodic-lab` |
| @arkhe/agi-mcp | `integrations/mcp-server` |
| @arkhe/mcp-server | `integrations/verify-mcp` |
| @arkhe/near-agent-market | `integrations/near-agent-market` |
| @arkhe/chladni-dashboard | `apps/chladni-dashboard` |
| @arkhe/intra | `apps/arkhe-intra` |
| @arkhe/sigstore-verifier | `integrations/cosign` |
| @arkhe/solana-proof-prototype | `integrations/solana-proof` |

## Persistência, esqueleto e status

As 19 migrações ativas estão em `storage/sql/migrations`; os digests imutáveis publicados estão em `config/migrations.lock.json`.
Os limites sem efeito (`barrier/`, `state/`, `probes/`, `models/`, `formal/`, `eval/` e `kernel/arkhe-gate`) permanecem desligados de `arkhe-kernel` e auditados por `scripts/check_architecture.py`.
Workspaces independentes (como `packaging/core`, `work/a1-pr` e `work/arkhe-chain-devnet`) possuem `Cargo.toml` e `Cargo.lock` próprios fora do build unificado.

`config/capability-status.json` descreve o escopo atual; `config/implementation-backlog.json` acompanha os 15 achados.
Esses registros são descritivos e não são políticas, selos, aprovação constitucional ou substitutos dos testes.
A existência de EXE/CLI/MSI/ZIP não implica prontidão completa de produção.
