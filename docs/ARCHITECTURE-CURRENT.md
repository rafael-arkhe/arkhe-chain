# Inventário ativo do Arkhe

Gerado dos manifestos locais em 19/10/2026. Inventário estrutural, sem autoridade de admissão ou garantia automática de implementação.

## Rust

| Pacote | Caminho ativo |
| --- | --- |
| arkhe-auth-md | `integration/auth-md` |
| arkhe-orkut | `integration/orkut` |
| arkhe-ollama | `integration/arkhe-ollama` |
| arkhe-bugbounty | `integration/arkhe-bugbounty` |
| arkhe-core | `kernel/arkhe-core` |
| arkhe-kernel | `kernel/arkhe-kernel` |
| arkhe-wormgraph | `evidence/arkhe-wormgraph` |
| arkhe-memory | `evidence/arkhe-memory` |
| arkhe-governance | `governance/arkhe-governance` |
| arkhe-work | `work/arkhe-work` |
| arkhe-work-channels | `work/arkhe-work-channels` |
| arkhe-cognition-sdk | `cognition/arkhe-cognition-sdk` |
| arkhe-perception | `cognition/arkhe-perception` |
| arkhe-rag | `cognition/arkhe-rag` |
| arkhe-metacognition | `cognition/arkhe-metacognition` |
| arkhe-world-model | `cognition/arkhe-world-model` |
| arkhe-learning | `cognition/arkhe-learning` |
| arkhe-agent | `cognition/arkhe-agent` |
| arkhe-runtime | `orchestration/arkhe-runtime` |
| arkhe-sql | `storage/sql/crates/arkhe-sql` |
| arkhe-sql-migrate | `storage/sql/crates/arkhe-sql-migrate` |
| arkhe-verify-core | `verification/crates/arkhe-verify-core` |
| arkhe-verify-cli | `verification/crates/arkhe-verify-cli` |
| arkhe-verify-wasm | `verification/crates/arkhe-verify-wasm` |

## Node

| Pacote | Caminho ativo |
| --- | --- |
| @arkhe/preflight-ui | `apps/preflight` |
| @arkhe/melodic-lab | `apps/melodic-lab` |
| @arkhe/agi-mcp | `integrations/mcp-server` |
| @arkhe/mcp-server | `integrations/verify-mcp` |
| @arkhe/chladni-dashboard | `apps/chladni-dashboard` |
| @arkhe/intra | `apps/arkhe-intra` |

## Persistência e status

As 13 migrações ativas estão em `storage/sql/migrations`; os digests publicados estão em `config/migrations.lock.json`.
Verificação portátil fica em `verification/crates`, e a aplicação Intra em `apps/arkhe-intra`.

`config/capability-status.json` descreve o escopo atual; `config/implementation-backlog.json` acompanha os 15 achados.
Esses registros são descritivos e não são políticas, selos, aprovação constitucional ou substitutos dos testes.
A existência de EXE/CLI/MSI/ZIP não implica prontidão completa de produção.
