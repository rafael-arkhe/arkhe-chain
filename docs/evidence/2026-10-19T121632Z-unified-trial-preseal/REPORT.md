# Pré-selamento do contrato unificado

Estado: SEAL_BLOCKED. Snapshot congelado; sealed=false.
Execução não iniciada; runtime_verified=false.

SHA-256 do contrato: `a51fc24c8ea13ec5afaa15af6979cb66fc3f3d5347cc2f854ee1776cb4184c16`

## Bloqueios

- CONTRACT_NOT_READY: DRAFT_NOT_SEALED_NOT_EXECUTED
- PENDING_IMPLEMENTATION: review candidate seccomp, ABI/rule manifests and complete dynamic coverage; complete dynamic per-rule probes and review inherited-filter limitations; empirically validate all candidate-specific expectations, including unresolved seccomp subchecks; empirically validate native unified adapter and candidate assessors with external oracles; run clean target startup and resource smoke checks before full run; execute 22 vectors and all mandatory subchecks with cleanup receipts

O manifesto SHA256SUMS verifica bytes dos artefatos, sem assinatura ou atestação.
Para selar execução, implementar e vincular os artefatos faltantes, revisar a
cobertura semântica, observar a identidade real do runtime e validar o runner.
Não reutilizar PASS de ensaios parciais como aprovação da corrida unificada.
