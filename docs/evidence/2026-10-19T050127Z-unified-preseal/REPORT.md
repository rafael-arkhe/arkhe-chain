# Pré-selamento do contrato unificado

Estado: SEAL_BLOCKED. Snapshot congelado; sealed=false.
Execução não iniciada; runtime_verified=false.

SHA-256 do contrato: `c89d727afab679350f4a7127d2c1ad46357a64cb30c020ee0d3c3f03c5c40f43`

## Bloqueios

- CONTRACT_NOT_READY: DRAFT_NOT_SEALED_NOT_EXECUTED
- UNBOUND_ARTIFACT: mount_contract.final_manifest_sha256
- UNBOUND_ARTIFACT: seccomp_contract.profile_file_sha256
- UNBOUND_ARTIFACT: seccomp_contract.abi_table_sha256
- UNBOUND_ARTIFACT: seccomp_contract.expanded_rule_manifest_sha256
- UNBOUND_ARTIFACT: seccomp_contract.compiled_filter_evidence_sha256
- MISSING_SEAL_BINDING: contract
- MISSING_SEAL_BINDING: image
- MISSING_SEAL_BINDING: probe_binary
- MISSING_SEAL_BINDING: probe_source
- MISSING_SEAL_BINDING: shared_builder
- MISSING_SEAL_BINDING: mount_manifest
- MISSING_SEAL_BINDING: seccomp_profile
- MISSING_SEAL_BINDING: abi_table
- MISSING_SEAL_BINDING: expanded_rule_manifest
- MISSING_SEAL_BINDING: oracle
- MISSING_SEAL_BINDING: runner
- MISSING_SEAL_BINDING: source_snapshot
- PENDING_IMPLEMENTATION: seal exact mount/device manifest; implement safe umount2 and pivot_root subchecks; create and review explicit seccomp candidate and ABI/rule coverage manifest; implement required per-rule probes and independent effective-policy evidence; adapt all 22 vector expectations to one candidate profile; implement unified runner and fail-closed collector; run clean target startup and resource smoke checks before full run; execute 22 vectors and all mandatory subchecks with cleanup receipts

O manifesto SHA256SUMS verifica bytes dos artefatos, sem assinatura ou atestação.
Para selar execução, implementar e vincular os artefatos faltantes, revisar a
cobertura semântica, observar a identidade real do runtime e validar o runner.
Não reutilizar PASS de ensaios parciais como aprovação da corrida unificada.
