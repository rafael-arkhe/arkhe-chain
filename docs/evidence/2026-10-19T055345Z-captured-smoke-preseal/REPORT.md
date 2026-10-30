# Pré-selamento do contrato unificado

Estado: SEAL_BLOCKED. Snapshot congelado; sealed=false.
Execução não iniciada; runtime_verified=false.

SHA-256 do contrato: `15380b85ac58bb56f7fc5f5dac7fddc6ae69676a154d1c3933d652c09a257772`

## Bloqueios

- CONTRACT_NOT_READY: DRAFT_NOT_SEALED_NOT_EXECUTED
- MISSING_SEAL_BINDING: runner
- MISSING_SEAL_BINDING: source_snapshot
- PENDING_IMPLEMENTATION: review candidate seccomp, ABI/rule manifests and complete dynamic coverage; complete dynamic per-rule probes and review inherited-filter limitations; adapt all 22 vector expectations to one candidate profile; implement unified runner and fail-closed collector; run clean target startup and resource smoke checks before full run; execute 22 vectors and all mandatory subchecks with cleanup receipts

O manifesto SHA256SUMS verifica bytes dos artefatos, sem assinatura ou atestação.
Para selar execução, implementar e vincular os artefatos faltantes, revisar a
cobertura semântica, observar a identidade real do runtime e validar o runner.
Não reutilizar PASS de ensaios parciais como aprovação da corrida unificada.
