# Maturidade executada versus gates abertos

2026-10-23. Testes executados são evidência local, não prova formal, auditoria
externa, aceitação comercial ou interoperabilidade com serviços não exercitados.

| Componente | Implementação / evidência | Limite |
|---|---|---|
| Status independente | 5 testes em `crates/arkhe-kya-status/tests/revocation.rs` | Snapshot local assinado, não VC interoperável |
| Recibo criptográfico | 9 testes em `tests/passport.rs` | Não observa runtime nem identidade legal |
| Recibo + status | 9 testes em `tests/status.rs` | Policy/tempo/piso externos |
| Policy | 5 testes em `tests/policy.rs` | Exigir TEE/ICP/anchor rejeita; não há `VERIFIED` de produção |
| CLI e persistência | 3 testes em `tests/cli.rs`, processos separados | Storage local confiável; não anti-rollback de administrador |
| Apresentação | 1 teste em `tests/presentation.rs` | Contêiner não confiável, contexto/policy fora dele |
| WASM | 9 casos de paridade nativo/Node, incluindo piso de sequência | Sem browser E2E ou storage browser |
| Sigstore/witness adapter | 13 testes Node em `anchor/anchor.test.mjs` | Log e witnesses locais; publicação pública pendente |
| ICP-Brasil/KYA Brasil | ADR-010 e pacote/repositório identificados | Sem credential/certificado real; utilizador escolheu fixtures sintéticas |
| SafeTensors/ONNX/GGUF real KYA | Não implementado neste PoC | Hash declarado não prova validade do formato/proveniência |
| Quote TEE | Não implementada | `Observed` ou root pin não bastam |
| `VERIFIED` de produção | ADR-006 define caminho e tabela normativa | Integrações/evidências reais pendentes; não há teste positivo fictício |
| Consumidor | Operador da CLI no PoC | Provider externo, piloto pago e aceitação de formato não demonstrados |
| Publicação | Release v0.1.1 no Hashtree, clone público conferido | v0.1.0 incompleta preservada; dependências de registry no primeiro build; sem aprovação de produção |

Total Rust atual: 32 testes distintos, sem a antiga repetição de cinco gates.

## Nome e alcance do quinto teste de status

`subject_and_purpose_are_external_policy_not_learned_from_evidence` verifica
digest de sujeito e propósito requeridos pelo consumidor. Não testa `checked_at`.
O vínculo assinado do índice está em
`binding_list_issuer_index_purpose_and_signatures_cannot_be_swapped`.
Idade/limiar estão em `independent_freshness_policy_can_reject_still_valid_snapshot`.
`valid_from`/`valid_until` são assinados; `max_snapshot_age_seconds` e relógio
vêm do consumidor. `evaluated_at` não é uma consulta cadastral externa.

## E02 e fronteira de produto

Não há integração KYA↔E02 implementada. Um `declared_model_blake3` KYA não é
automaticamente um `dataset_digest` E02. Referências históricas ao manifest E02
servem apenas ao controlo de regressão de outro artefacto no mesmo workspace;
não são eixo de produto ou evidência de identidade/runtime KYA.
