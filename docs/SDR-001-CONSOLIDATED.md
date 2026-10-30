# SDR-001 — Relatório consolidado de conformidade e auditoria

> Documento derivado exclusivamente dos registros de rastreio do repositório.
> Não concede autoridade, não sela runtime e não declara freeze.
> Gerado em: 2026-10-21T12:26:42Z
> Comando: `python scripts/generate_sdr.py`

## Fontes

| Registro | Caminho | SHA-256 |
| --- | --- | --- |
| implementation-backlog | `config/implementation-backlog.json` | `3809aec9296dfeab…` |
| capability-status | `config/capability-status.json` | `d2029a520a221620…` |
| e01-onboarding-backlog | `config/e01-onboarding-backlog.json` | `a49d418d2874a1aa…` |
| architecture | `config/architecture.json` | `bca87d88e4349977…` |

## Resumo

| Métrica | Valor |
| --- | --- |
| Achados registrados | 15 |
| Achados em `OPEN` | 11 |
| Achados em `PARTIAL` | 2 |
| Achados em `ARKHE_SIGNATURE_PROFILE_TESTED` | 1 |
| Achados em `OBSERVATIONS_COMPLETE` | 1 |
| Crates Rust registrados | 24 |
| Pacotes Node registrados | 6 |
| Capacidades registradas | 11 |
| Itens da coorte E01 | 8 |
| Itens E01 pendentes | 7 |
| Diretórios de evidência | 100 |

Prioridades: `P1`=10, `P0`=3, `P2`=2.

## Achados de implementação

| ID | Prioridade | Estado | Falta gerar | Depende de |
| --- | --- | --- | --- | --- |
| A01 | P0 | `OBSERVATIONS_COMPLETE` | Revisão semântica independente e admissão explícita; sem selo automático. Depois, matriz independente por runtime/perfil/imagem (gVisor/runwasi/WASM/TEE). | — |
| A02 | P0 | `ARKHE_SIGNATURE_PROFILE_TESTED` | Definir provisionamento, rotação e revogação das trust roots; mapear o perfil Arkhe para C2PA/COSE padrão apenas com auditoria dedicada; manter o contrato v2 sem valid genérico. | — |
| A03 | P0 | `OPEN` | Definir uma jornada protegida do Intra e integrar WorkIntent/admissão/journal/commit, preservando a separação do perfil local. | A02, A09, A10 |
| A04 | P1 | `PARTIAL` | Vincular status e evidência de cada perfil antes de qualquer freeze; usar o inventário ativo para atualizar os diagramas restantes. | — |
| A05 | P1 | `PARTIAL` | Integrar ingestão histórica autenticada no host; avaliar coortes reais e generalização; implementar simulador causal e RSI medido como capacidades separadas. | A10 |
| A06 | P1 | `OPEN` | Validar digest/prova de cada fonte e chunk; separar existência de citação de grounding e implementar recuperação testável. | A02, A10 |
| A07 | P1 | `OPEN` | Escolher uma jornada que exija fila, definir leases/retries e enqueue transacional, implementar crash recovery e DLQ. | — |
| A08 | P1 | `OPEN` | Definir custódia/rotação/revogação por perfil e implementar apenas o mecanismo selecionado; não anunciar HSM/TEE/ML-DSA sem evidência. | — |
| A09 | P1 | `OPEN` | Acrescentar testes vivos das APIs escolhidas para tenant/ator, conflito de parâmetros e replay; preservar migrações publicadas. | — |
| A10 | P1 | `OPEN` | Testar autenticação, replay e duplicidade na fronteira do host; manter SDK, grafo e sandbox como camadas distintas. | — |
| A11 | P1 | `OPEN` | Uniformizar pins da cadeia CI e obter receipts remotos vinculados ao commit e à identidade de workflow. | — |
| A12 | P1 | `OPEN` | Definir infraestrutura e autoridades de imagem; preencher política candidata e provar rejeições no cluster de destino. | A01, A11 |
| A13 | P1 | `OPEN` | Validar instalação/backup/restauração/upgrade em máquina limpa; selecionar identidade de editor e atualizar distribuição com rollback. | — |
| A14 | P2 | `OPEN` | Selecionar infraestrutura a partir de carga medida e implementar um componente por vez com testes de falha. | — |
| A15 | P2 | `OPEN` | Definir política comercial e textos de licença com os responsáveis; medir custos antes de publicar preços. | — |

`execution_authority` permanece `false` em todos os achados. Estado registrado não equivale a capacidade demonstrada.

## Capacidades

| Capacidade | Status | Fonte |
| --- | --- | --- |
| artifact-digest | `IMPLEMENTED` | `integrations/verify-mcp/src/tools/verify-artifact.ts` |
| c2pa-claim | `CANONICALIZATION_ONLY` | `verification/crates/arkhe-verify-core/src/c2pa/claim.rs` |
| c2pa-claim-signature-arkhe-profile | `ED25519_PROFILE_TESTED` | `verification/crates/arkhe-verify-core/src/c2pa/signature.rs` |
| gguf-metadata | `CANONICALIZATION_ONLY` | `verification/crates/arkhe-verify-core/src/gguf/canonical.rs` |
| mmr-inclusion-mcp | `OFFLINE_VECTORS_AND_MCP_TESTED` | `integrations/verify-mcp/src/tools/verify-mmr.ts` |
| cognition-sdk | `INTERFACE_CONTRACT_TESTED` | `cognition/arkhe-cognition-sdk/src/lib.rs` |
| intra-documents | `LOCAL_APPLICATION_PROFILE` | `apps/arkhe-intra/lib/documents.mjs` |
| candidate-runtime | `OBSERVATIONS_COMPLETE` | `config/runtime-unified-contract.json` |
| rsi-general | `NOT_DEMONSTRATED` | `cognition/arkhe-learning/src/lib.rs` |
| historical-calibration | `SYNTHETIC_CONTRACT_TESTED` | `cognition/arkhe-metacognition/src/self_model.rs` |
| mmr-anchor-devnet | `DEVNET_MATRIX_AND_CONTROLLED_RECOVERY_TESTED` | `scripts/poc_e01_devnet.mjs` |

Estado global da arquitetura: `CANDIDATE_NOT_FROZEN`.

Distribuição por status: `CANONICALIZATION_ONLY`=2, `DEVNET_MATRIX_AND_CONTROLLED_RECOVERY_TESTED`=1, `ED25519_PROFILE_TESTED`=1, `IMPLEMENTED`=1, `INTERFACE_CONTRACT_TESTED`=1, `LOCAL_APPLICATION_PROFILE`=1, `NOT_DEMONSTRATED`=1, `OBSERVATIONS_COMPLETE`=1, `OFFLINE_VECTORS_AND_MCP_TESTED`=1, `SYNTHETIC_CONTRACT_TESTED`=1.

## Coorte E01

| Item | Título | Estado |
| --- | --- | --- |
| ONB01 | Fixar materiais C01 | `DONE` |
| ONB02 | Revisão humana por admin | `PENDING_HUMAN_REVIEW` |
| ONB03 | Selecionar ambiente Windows x64 limpo | `PENDING_ENVIRONMENT` |
| ONB04 | Preparar isolamento e snapshot S0 | `NOT_RUN` |
| ONB05 | Executar ensaio técnico dentro da VM | `NOT_RUN` |
| ONB06 | Preparar cinco sessões autorizadas | `NOT_RUN` |
| ONB07 | Executar sessões e limpeza entre pessoas | `NOT_RUN` |
| ONB08 | Consolidar resultados e decisão exploratória | `NOT_RUN` |

Estudo humano: `NOT_RUN`; independência de papéis: `NOT_ESTABLISHED_SAME_IDENTITY`.

## Evidências disponíveis

- `docs/evidence/remote-ci`
- `docs/evidence/local`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-trial5`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-trial4`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-trial3`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-trial2`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-trial`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-smoke2`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-smoke`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-preparation6`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-preparation5`
- `docs/evidence/2026-10-20T134143Z-unified-dynamic-preparation4`
- … e mais 88 diretórios

## Limites

- `authority=false` e `runtime_verified=false` em todos os registros de rastreio.
- A cobertura dinâmica de contenção não constitui admissão nem selo de runtime.
- Perfil de assinatura Arkhe não equivale a validação C2PA/COSE/X.509 padrão.
- Nenhuma capacidade AGI, RSI geral ou modelo causal é afirmada por este relatório.
- Contagens e estados refletem apenas os arquivos-fonte no momento da geração.

