# Pré-selamento do contrato unificado

Estado: SEAL_BLOCKED. Snapshot congelado; sealed=false.
Execução não iniciada; runtime_verified=false.

SHA-256 do contrato: `5e86c7c64f4de819042251c250056a25fb17f4c27e0768bd016dbbc93f9ca32f`

## Bloqueios

- CONTRACT_NOT_READY: DRAFT_NOT_SEALED_NOT_EXECUTED
- UNBOUND_ARTIFACT: mount_contract.final_manifest_sha256
- UNBOUND_ARTIFACT: seccomp_contract.compiled_filter_evidence_sha256
- MISSING_SEAL_BINDING: image
- MISSING_SEAL_BINDING: probe_binary
- MISSING_SEAL_BINDING: mount_manifest
- MISSING_SEAL_BINDING: runner
- MISSING_SEAL_BINDING: source_snapshot
- MISSING_SEAL_BINDING: compiled_filter_evidence
- PENDING_IMPLEMENTATION: seal exact mount/device manifest; review candidate seccomp, ABI/rule manifests and complete dynamic coverage; implement required per-rule probes and independent effective-policy evidence; adapt all 22 vector expectations to one candidate profile; implement unified runner and fail-closed collector; run clean target startup and resource smoke checks before full run; execute 22 vectors and all mandatory subchecks with cleanup receipts

O manifesto SHA256SUMS verifica bytes dos artefatos, sem assinatura ou atestação.
Para selar execução, implementar e vincular os artefatos faltantes, revisar a
cobertura semântica, observar a identidade real do runtime e validar o runner.
Não reutilizar PASS de ensaios parciais como aprovação da corrida unificada.
