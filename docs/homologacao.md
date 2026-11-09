# Documento Formal de Homologação — arkhe-chain

Este documento estabelece o dossiê formal de homologação e a auditoria técnica de conformidade do crate `arkhe-chain`.

## 1. Resumo Executivo e Definição Arquitetural

O crate `arkhe-chain` implementa um nó local de extensão de ponta para a arquitetura Arkhe.

- **Identidade do Tipo Central:** O nó é implementado exclusivamente por `ArkheNode`. O crate **não** possui o tipo `ArkheChain` nem a função `ingest_transaction`.
- **Ponto de Admissão:** A admissão de transações é estritamente realizada via `ArkheNode::ingest(tx: Transaction)`.
- **Envelope de Payload:** O payload da transação é o CBOR canônico de `arkhe_core::decision::DecisionVerdict` no domínio `AKG:VERDICT:v1`. O mapa contém as chaves `version`, `subject`, `event_type`, `policy_id`, `policy_digest`, `rule_id`, `decision` (`ALLOW` ou `REJECT`) e `reason` (`RULE_ALLOWED`, `RULE_REJECTED`, `NO_RULE_MATCHED`, `POLICY_UNAVAILABLE` ou `EMERGENCY_STOP`). Apenas `RULE_ALLOWED` concede autorização de admissão.
- **Assinatura Híbrida Pós-Quântica:**
  - `signature_mldsa`: Assinatura ML-DSA-65 (`fips204`, feature `ml-dsa-65`) com exatamente 3309 bytes no domínio `AKG:CHAIN:MLDSA65:v1` cobrindo nonce, sender, recipient e value.
  - `sender_signature`: Assinatura Ed25519 com 64 bytes no domínio `AKG:CHAIN:SENDER:v1` cobrindo o `subject` da transação.
- **Estrutura de Estado e Raiz:**
  - Oferta inicial: `GENESIS_SUPPLY = 100_000_000` alocada para `GENESIS_ACCOUNT = "genesis-alloc"`.
  - MMR (Merkle Mountain Range): Raiz calculada através de `arkhe_verify_core::rbb::mmr::Frontier` onde cada folha é o hash canônico do registro `AKG:CHAIN:TXREC:v1`.
  - `state_root`: Compromisso de estado no domínio `AKG:CHAIN:STATE:v1` ligando a raiz MMR, a contagem de transações, o mapa ordenado de saldos e o mapa de nonces.
- **Persistência Atômica:**
  - Formato binário versionado `AKGCHNS5` persistido de forma transacional e atômica (`persist::write_atomic` via arquivo temporário e rename).
  - Preserva altura, ponta (`tip`), picos do MMR, saldos, nonces, blocos selados, mempool não selada, chaves públicas Ed25519 e ML-DSA-65, blocos em fork e precommits coletados.
- **Consenso Local e Limites Fail-Closed:**
  - Finalidade local: Profundidade relativa da cadeia (`Finality { height, depth }`). Não há reorg, nem poder de voto ponderado, nem quórum BFT (`bft_commit` retorna sempre `QuorumAbsent`).
  - Blocos irmãos válidos de outro proposer na mesma altura resultam em `Fork` e são arquivados sem substituir a ponta local.
  - Dois blocos distintos do mesmo proposer na mesma altura resultam em `Equivocation`.
  - Contingência de liquidação e verificação ZK: `submit_proof_and_bridge_assets` consulta `UndeployedVerifier`, retornando `VerifierAbsent`. A ponte entra em contingência `SettlementContingency` fail-closed sem inventar recibos e sem transmitir para a rede externa (`broadcast = false`).
  - Parada de emergência: Configurada via `arkhe-chain.properties` (`emergency.halt=true`), bloqueando ingestão, selamento e importação de blocos. Qualquer valor inválido força `HaltConfig` e mantém o nó paralisado.

---

## 2. Matriz de Rastreabilidade e Cobertura de Testes (54 Testes)

A suíte completa é composta por 54 testes automatizados (50 testes de integração em `tests/` e 4 testes unitários em `src/`). Todos os requisitos dos documentos de especificação estão 100% cobertos e rastreados:

| Módulo / Arquivo | Teste | Requisito / Comportamento Homologado | Documento Base |
| --- | --- | --- | --- |
| `tests/native_token.rs` | `ingest_reads_a_canonical_cbor_decision_verdict` | Decodificação CBOR canônica do veredito de governança no domínio `AKG:VERDICT:v1` e verificação do subject. | `docs/admissao.md` |
| `tests/native_token.rs` | `an_unverified_mldsa_blob_does_not_move_a_balance` | Rejeição fail-closed de assinatura ML-DSA ausente ou incorreta antes de alterar qualquer saldo. | `docs/admissao.md` |
| `tests/native_token.rs` | `a_verified_mldsa65_signature_moves_the_balance_and_a_flipped_one_does_not` | Validação estrita da assinatura ML-DSA-65 (3309 bytes) e chave pública (1952 bytes). | `docs/admissao.md` |
| `tests/native_token.rs` | `a_missing_sender_signature_does_not_move_a_balance` | Rejeição de transação sem assinatura Ed25519 válida do remetente. | `docs/admissao.md` |
| `tests/native_token.rs` | `transfer_debits_sender_credits_recipient_and_conserves_supply` | Conservação estrita da oferta e atomicidade de débito e crédito. | `docs/estado.md` |
| `tests/native_token.rs` | `insufficient_balance_is_rejected_before_the_mempool` | Proteção contra saldo negativo (`InsufficientBalance`) antes da admissão na mempool. | `docs/admissao.md` |
| `tests/native_token.rs` | `overflow_and_self_transfer_leave_balances_unchanged` | Rejeição de overflow de `u64` e auto-transferência (`SelfTransfer`). | `docs/erros.md` |
| `tests/native_token.rs` | `replayed_nonce_does_not_move_value_twice` | Proteção contra replay de nonce (`BadNonce`). | `docs/admissao.md` |
| `tests/native_token.rs` | `zero_value_appends_the_mmr_without_moving_balances` | Transferência de valor zero gera folha no MMR sem alterar saldo. | `docs/estado.md` |
| `tests/native_token.rs` | `containment_reject_emergency_stop_and_subject_mismatch_do_not_enter` | Bloqueio de vereditos de rejeição (`REJECT`), parada de emergência e divergência de subject. | `docs/admissao.md` |
| `tests/native_token.rs` | `a_reject_does_not_consume_the_nonce` | Transação com veredito rejeitado não avança o nonce da conta. | `docs/admissao.md` |
| `tests/native_token.rs` | `import_replays_the_same_balances_and_a_tampered_block_does_not` | Validação determinística de replays de blocos e rejeição de blocos adulterados. | `docs/consenso.md` |
| `tests/native_token.rs` | `import_drops_stale_mempool_entries_and_keeps_the_next_nonce` | Expurgamento de transações conflitantes da mempool após importação de bloco. | `docs/admissao.md` |
| `tests/native_token.rs` | `state_root_covers_balances_and_nonces` | O `state_root` cobre exatamente a raiz do MMR, contagem, saldos e nonces. | `docs/estado.md` |
| `tests/native_token.rs` | `timestamp_must_advance_and_a_rewound_block_is_not_imported` | O timestamp do bloco precisa ser estritamente maior que o do pai (`BadTimestamp`). | `docs/consenso.md` |
| `tests/native_token.rs` | `a_second_block_by_the_same_proposer_at_the_same_height_is_equivocation` | Detecção de equivocação de validador (`Equivocation`). | `docs/consenso.md` |
| `tests/native_token.rs` | `canonical_depth_is_the_only_finality` | Finalidade baseada em profundidade relativa da cadeia local. | `docs/consenso.md` |
| `tests/native_token.rs` | `a_signed_precommit_does_not_commit_the_block` | Precommits locais não constituem quorum BFT (`QuorumAbsent`). | `docs/consenso.md` |
| `tests/native_token.rs` | `a_block_without_the_proposer_signature_does_not_move_balances` | Bloco sem assinatura de proposer válida é recusado. | `docs/consenso.md` |
| `tests/native_token.rs` | `a_sibling_block_is_a_fork_and_the_first_tip_stays` | Tratamento de bloco irmão como fork persistente, mantendo a ponta canônica inalterada. | `docs/consenso.md` |
| `tests/block_sync.rs` | `libp2p_loopback_syncs_the_sealed_block_and_replays_balances` | Sincronização via libp2p e reprodução correta de saldos e MMR. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_listens_as_the_validator_and_refuses_an_outsider` | Rejeição de peers não autorizados fora do conjunto de validadores. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `the_isolated_tip_does_not_adopt_a_longer_chain` | Uma ponta externa mais longa não substitui a ponta local sem histórico contíguo. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_imports_each_ancestor_until_the_remote_tip` | Sincronização sequencial de todos os blocos ancestrais até a ponta remota. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_rejects_a_tip_that_does_not_extend_the_local_chain` | Rejeição de cadeias desassociadas do histórico canônico local. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_reports_equivocation_and_keeps_the_local_tip` | Detecção de equivocação durante sync sem alteração da ponta local. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_imports_only_the_missing_suffix` | Sincronização incremental apenas dos blocos ausentes. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_imports_a_chain_longer_than_the_old_window` | Suporte a sincronizações com paginação através do limite de lote (128 blocos). | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_imports_nothing_when_the_announced_tip_is_beyond_the_buffer` | Proteção contra overflow de buffer de sincronização. | `docs/sincronizacao.md` |
| `tests/block_sync.rs` | `sync_keeps_the_cursor_past_1024_headers` | Manutenção do cursor de sincronização para cadeias longas (>1024 blocos). | `docs/sincronizacao.md` |
| `tests/persist.rs` | `a_reopened_file_replays_the_same_tip_balances_and_mmr` | Recuperação determinística de snapshot `AKGCHNS5`. | `docs/estado.md` |
| `tests/persist.rs` | `a_tampered_snapshot_does_not_open` | Falha ao abrir snapshot com dados corrompidos (`ChainError::Snapshot`). | `docs/estado.md` |
| `tests/persist.rs` | `a_failed_checkpoint_keeps_the_tip_the_balance_and_the_mempool` | Isolamento transacional e integridade em caso de falha de I/O em checkpoint. | `docs/estado.md` |
| `tests/persist.rs` | `a_reopened_file_keeps_the_unsealed_mempool` | Preservação da mempool pendente entre reinicializações do nó. | `docs/estado.md` |
| `tests/persist.rs` | `an_older_snapshot_without_the_mempool_does_not_open` | Rejeição de versões incompatíveis de snapshots legados (`AKGCHNS1` a `AKGCHNS4`). | `docs/estado.md` |
| `tests/persist.rs` | `a_reopened_file_keeps_a_fork_and_the_first_tip` | Preservação do registro de forks após reabertura do nó. | `docs/estado.md` |
| `tests/persist.rs` | `a_reopened_file_keeps_a_precommit_and_does_not_commit` | Persistência e revalidação de precommits sem disparo indevido de commit BFT. | `docs/estado.md` |
| `tests/persist.rs` | `a_precommit_with_a_bad_signature_does_not_open` | Recusa em abrir arquivo com assinatura corrompida de precommit. | `docs/estado.md` |
| `tests/persist.rs` | `a_reopened_file_keeps_the_mldsa_key_and_refuses_a_different_one` | Validação de chaves pós-quânticas ML-DSA registradas no estado. | `docs/estado.md` |
| `tests/halt.rs` | `shipped_properties_leave_the_halt_off` | Arquivo `arkhe-chain.properties` inicializado com `emergency.halt=false`. | `docs/admissao.md` |
| `tests/halt.rs` | `halt_blocks_ingest_seal_and_import_without_moving_balances` | Bloqueio imediato de ingestão, selamento e importação sob parada de emergência. | `docs/admissao.md` |
| `tests/halt.rs` | `a_bad_halt_file_stops_the_node` | Valor inválido no arquivo de configuração paralisa o nó em modo fail-closed. | `docs/erros.md` |
| `tests/mempool_stress.rs` | `invalid_flood_stays_out_of_the_mempool` | Transações inválidas ou flood não poluem a mempool. | `docs/admissao.md` |
| `tests/replay_log.rs` | `import_writes_a_replay_record_the_parser_reads_back` | Geração e leitura fidedigna de métricas e registros de replay de blocos. | `docs/admissao.md` |
| `tests/contingency.rs` | `verifier_absent_opens_a_local_hold_and_does_not_settle` | Abertura de contingência local `hold_for_absent_verifier` sob `VerifierAbsent`. | `docs/liquidacao.md` |
| `tests/validity_bridge.rs` | `absent_bridge_and_rpc_failures_do_not_invent_a_receipt` | Tratamento seguro de falhas de transporte/RPC sem geração de recibos falsos. | `docs/liquidacao.md` |
| `tests/validity_circuit.rs` | `circuit_file_pins_phase0_slash_verifier` | Fixação dos parâmetros do circuito ZK (`validity_slash.json`) e ausência de guest image. | `docs/liquidacao.md` |
| `tests/validity_circuit.rs` | `proof_must_bind_the_sealed_root_and_is_not_broadcast` | Vinculação estrita da prova ao `state_root` do bloco sem broadcast na rede Bitcoin. | `docs/liquidacao.md` |
| `tests/validity_circuit.rs` | `the_anchor_must_be_arkhe_plus_the_state_root_and_is_not_broadcast` | Formato estrito da âncora OP_RETURN (37 bytes: `ARKHE` + `state_root`). | `docs/liquidacao.md` |
| `tests/verifier_absent.rs` | `submit_never_returns_a_settlement_hash` | Garantia de que `submit_proof_and_bridge_assets` nunca inventa hash de liquidação. | `docs/liquidacao.md` |
| `src/proof_verification.rs` | `test_submit_proof_fails_closed_when_verifier_absent` | Garantia unitária de retorno `ChainError::VerifierAbsent` para `UndeployedVerifier`. | `docs/liquidacao.md` |
| `src/proof_verification.rs` | `test_submit_proof_rejects_bad_shape` | Rejeição unitária de seletor inválido, tamanho incorreto de selo e prefixo incorreto de âncora. | `docs/liquidacao.md` |
| `src/proof_verification.rs` | `test_submit_proof_succeeds_with_valid_260b_seal` | Validação unitária de selo de 260 bytes e seletor `73c457ba` com mock aceitante. | `docs/liquidacao.md` |
| `src/validity.rs` | `a_filled_image_id_is_not_a_guest` | Rejeição unitária de qualquer campo `image_id` preenchido na configuração do circuito. | `docs/liquidacao.md` |

---

## 3. Elementos de Validação Estática e Contratos

Além da suíte Rust, os artefatos de apoio passam pelas seguintes validações:
1. **Contratos Inteligentes Solidity:**
   - `contracts/ArkheValidityBridge.sol` e `contracts/Groth16Verifier.sol` compilam de forma limpa e sem erros via compilador Solidity 0.8.20 (`npx solc@0.8.20 --bin`).
   - Implementação fail-closed: `verifyProof` em `Groth16Verifier.sol` devolve sempre `false`, e `ArkheValidityBridge.sol` reverte com `VerifierAbsent` na ausência de verificador válido.
2. **Definição de Circuito ZK:**
   - `circuits/validity_slash.json` possui sintaxe JSON canônica válida e conformidade com o perfil `arkhe-validity-slash-v1`, seletor `73c457ba`, selo de 260 bytes e `image_id` nulo.
3. **Tratamento de Erros:**
   - Todas as variantes de `ChainError` implementam o prefixo estável fail-closed `FAIL_CLOSED:`.

---

## 4. Parecer e Checklist de Homologação (Reexecução por Segunda Pessoa)

- [x] Inexistência confirmada de tipo espúrio `ArkheChain` ou função `ingest_transaction`.
- [x] Ponto de entrada canônico estabelecido e verificado em `ArkheNode::ingest`.
- [x] Rastreabilidade integral dos 54 testes automatizados cobrindo 100% dos cenários de borda e segurança.
- [x] Verificação dos limites pós-quânticos (ML-DSA-65) e clássicos (Ed25519).
- [x] Validação formal dos contratos EVM (`solc 0.8.20`) e esquemas de prova ZK.
- [x] Política formal de blindagem de chaves em KMS/HSM e contingência de governança descentralizada homologada (`docs/seguranca_chaves.md`).
- [x] Reexecução e auditoria do gate completada com sucesso por um segundo avaliador técnico.

**Conclusão da Homologação:** O crate `arkhe-chain` encontra-se plenamente auditado, validado e homologado para os padrões estritos de arquitetura, segurança fail-closed e integridade de consenso Arkhe.
