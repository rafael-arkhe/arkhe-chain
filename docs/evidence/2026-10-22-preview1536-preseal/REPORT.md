# Pré-selamento do perfil 1536 MiB

Estado: SEAL_BLOCKED. sealed=false; runtime_verified=false.

Nenhum probe, container ou efeito foi iniciado. Snapshot não é atestação.
O adapter nativo existente continua restrito a 128 MiB.

- BINDINGS_PROFILE_MISMATCH: 128 MiB or unspecified bindings cannot qualify this profile
- UNBOUND_ARTIFACT: image
- UNBOUND_ARTIFACT: worker_binary
- UNBOUND_ARTIFACT: executor_source
- UNBOUND_ARTIFACT: probe_binary
- UNBOUND_ARTIFACT: probe_source
- UNBOUND_ARTIFACT: runner
- UNBOUND_ARTIFACT: oracle
- UNBOUND_ARTIFACT: mount_manifest
- UNBOUND_ARTIFACT: seccomp_profile
- UNBOUND_ARTIFACT: abi_table
- UNBOUND_ARTIFACT: expanded_rule_manifest
- UNBOUND_ARTIFACT: effective_loaded_filter_evidence
- UNBOUND_ARTIFACT: source_snapshot
- EXTERNAL_AUTHORITY_NOT_ADMITTED: require a concrete external identity and authenticated key-attestation chain
- PENDING_IMPLEMENTATION: ['bind exact source/binaries, mount manifest and effective seccomp chain', 'implement and qualify native runner and resource oracles for the 1536 MiB tuple; current native adapter only accepts 128 MiB', 'validate dedicated-host headroom and stress budgets', 'execute all 22 vectors and required subchecks under the same sealed tuple', 'obtain external authority identity, key attestation and signed qualification admission']
