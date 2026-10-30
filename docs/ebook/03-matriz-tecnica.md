# Matriz entre capítulos e implementação

Inspeção do checkout em 22/10/2026. Só os comandos indicados em
[validação](06-validacao.md) foram executados nesta revisão. Implementação
existente e testes anteriores não equivalem a qualificação de produção.

| Capítulos | Fontes do repositório, relativas à raiz | Fronteira editorial |
|---|---|---|
| 1–3 | `docs/SECURITY-MODEL.md`, `docs/MATURITY-CRITERIA.md`; S06/S07 | Cenário fictício; não inventar incidente ou certificação |
| 4 | `README.md`, `docs/ARCHITECTURE.md`, `Cargo.toml`, `agi-coder/Cargo.toml` | Workspaces separados; diagrama não prova integração operacional de todas as superfícies |
| 5 | `kernel/arkhe-core/src/work.rs`, `worker.rs`, `canonical.rs`; `kernel/arkhe-core/tests/golden_vectors.rs` | Digest não autentica emissor; determinismo do encoder não demonstra replay da inferência |
| 6 | `docs/MMR-PROFILE.md`, `specs/mmr/spec/mmr-profile-v1.md`, `verification/crates/arkhe-verify-core/src/mmr` | Checkpoint independente; inclusão ≠ consistência/cronologia; builder de referência O(n) |
| 7 | `kernel/arkhe-kernel/examples/budget_pco.rs`, `kernel/arkhe-core/src/output_proof.rs`, `cognition/arkhe-agent/src/budget_pco.rs`, `verification/crates/arkhe-verify-core/src/output_proof.rs`, `kernel/arkhe-kernel/tests/budget_pco.rs` | Aritmética finita; reader em memória; sem transporte Pg de prova nem pagamento |
| 8 | `kernel/arkhe-kernel/src/lib.rs`, `governance/arkhe-governance/src`, `kernel/arkhe-kernel/tests/rejection_gates.rs` | Política e admissão pertencem ao host; resolver da amostra é sintético |
| 9 | `kernel/arkhe-core/src/work.rs`, `kernel/arkhe-kernel/src/broker_sqlite.rs`, `kernel/arkhe-kernel/tests/broker_durable.rs`, `integration/arkhe-bugbounty/src/journal.rs`, `docs/ACTION-BROKER.md` | Efeito único depende do executor/destino; estado incerto exige reconciliação |
| 10 | `kernel/arkhe-core/src/evidence.rs`, `evidence/arkhe-wormgraph`, `storage/sql`, `docs/STATUS.md` | Persistência existente não implica transporte PCO já implementado; resultados antigos mantêm suas datas |
| 11 | `verification/README.md`, `verification/crates/arkhe-verify-wasm/src/lib.rs`, `integrations/verify-mcp` | WASM não concede autoridade; relógio/raízes/revogação exigem contexto externo |
| 12 | `governance/arkhe-governance`, `docs/SECURITY-MODEL.md`, `docs/security/PRODUCTION-BOUNDARY-2026-10-18.md` | Política local de desenvolvimento não é política de produção qualificada |
| 13 | `docs/backlog/BACKLOG.md` itens 6.1–6.4, `integration/arkhe-depin/README.md` | Slashing sancionável não entregue; conflito de caller não prova má-fé |
| 14 | `agi-coder/crates/agi-coder-cost/src/lib.rs`, `docs/backlog/BACKLOG.md` item 15.1 | Workspace AGI; ledger em micro-USD fornecidos, sem meter automático |
| 15 | `docs/JULES-COMPLETION.md`, `agi-coder/crates/agi-coder-jules`, `docs/PREVIEW-EXECUTION.md` | WER sem assinatura exige host/admissão; testes locais não demonstram merge/deploy real |
| 16 | `integration/arkhe-depin/README.md`, `src/adapters/gensyn.rs`, `tests/portable_proof_composite.rs` nesse crate | DTO proposto, assinatura fake na fixture, hardware opaco; redes externas de armazenamento e conectividade ausentes |
| 17 | `verification/crates/arkhe-verify-core/src/c2pa`, `verification/crates/arkhe-verify-wasm/src/lib.rs` | Perfil Arkhe não realiza validação padrões de proveniência e assinatura de conteúdo padrão completa |

Os capítulos 1–17 possuem redação em en-US; o capítulo 7 também possui amostra
separada. A matriz preserva fontes e limites para a revisão final. Caminhos abreviados na coluna
de fontes mantêm o contexto da pasta explicitada na mesma célula.
