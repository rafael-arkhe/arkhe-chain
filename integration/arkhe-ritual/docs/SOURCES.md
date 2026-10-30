# Fontes consultadas em 26/10/2026

- RFC 9334, arquitetura RATS: https://www.rfc-editor.org/rfc/rfc9334.html
  Nonce, timestamp e epoch são mecanismos; a RFC não impõe contador de hardware.
- PostgreSQL 18, locking: https://www.postgresql.org/docs/current/explicit-locking.html
  Locks de linhas existentes, concorrência e deadlocks. Uma leitura sem linha não
  serializa a futura inserção; a aceitação usa UNIQUE + inserção + bloqueio.
- Ed25519-dalek: https://docs.rs/ed25519-dalek/2.2.0/ed25519_dalek/struct.VerifyingKey.html
  Implementação fixada na série 2.2 e verificação estrita de assinatura.
- NVIDIA: https://docs.nvidia.com/attestation/index.html
  Referência para futura integração específica de hardware; não implementada.
- Ritual, documentação oficial fornecida posteriormente:
  https://docs.ritualfoundation.org/
  Base do ABI utilizado pelo smoke test Ed25519 e das consultas RPC somente leitura.
- Ritual, endereço informado nos anexos:
  https://github.com/ritual-foundation/ritual-dapp-skills
  Retornou 404 na consulta inicial. A documentação acima substitui essa lacuna;
  a consulta do precompile é testada, o formato NRAS continua não implementado.

Fontes locais efetivamente usadas: kernel/arkhe-core/src/canonical.rs,
kernel/arkhe-kernel/src/lib.rs, governance/arkhe-governance/src/lib.rs,
evidence/arkhe-wormgraph/src/anchor.rs e regenerate.rs,
verification/crates/arkhe-verify-core/src/mmr/inclusion.rs.

PostgreSQL portátil de teste: distribuição Zonky embedded-postgres 16.14.0,
https://repo.maven.apache.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/16.14.0/
O runtime foi extraído em tmp/ritual-postgres; não é parte do código entregue.
