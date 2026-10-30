# Replay dos quatro gates de status — 2026-10-23

Resultado: os quatro casos pedidos foram reproduzidos no perfil local
`arkhe-kya-status-local@1`, label `synthetic-poc`, sem alterações ao código.

| Gate | Teste exato | Resultado |
|---|---|---|
| Bit 0 | `isolated_bit_zero_returns_a_scoped_observation` | Observação válida de não-revogação no snapshot |
| Bit 1 | `isolated_bit_one_returns_credential_revoked` | `CredentialRevoked` |
| Lista indisponível | `isolated_missing_list_cannot_be_accepted` | `STATUS_UNAVAILABLE` |
| Snapshot obsoleto | `independent_freshness_policy_can_reject_still_valid_snapshot` | `STATUS_STALE`, mesmo antes da expiração |

O teste adicional `unavailable_snapshot_is_not_checked_and_never_positive`
confirma a tradução para `credential_revocation = NOT_CHECKED` e
`outcome = NOT_VERIFIABLE` no adaptador de composição existente.

Foram executados os cinco testes do módulo isolado (quatro gates + pins de
digest/propósito), um teste de composição selecionado e o manifest E02.
Os comandos, exit codes e hashes SHA-256 dos fontes/lockfile medidos estão em
`report.json`; as saídas completas estão em `check-1.txt` a `check-3.txt`.
O relatório não é assinado e não constitui auditoria externa.

Reprodução na raiz do workspace:

```powershell
cargo test --manifest-path integration/arkhe-kya/Cargo.toml --locked --test status_standalone
cargo test --manifest-path integration/arkhe-kya/Cargo.toml --locked --test status unavailable_snapshot_is_not_checked_and_never_positive -- --exact
node specs/e02/verify_manifest.mjs
```

## Alcance da evidência

Fecha os quatro gates funcionais de **status local**, não conformidade integral
W3C VC/Bitstring Status List, identidade legal ou estado live. Uma assinatura
offline verifica o snapshot recebido; não descobre uma revogação posterior.
O `max_snapshot_age_seconds` é escolhido pelo consumidor. A idade parte do
`valid_from` assinado; `evaluated_at` é o relógio explícito do consumidor,
não um `checked_at` de uma fonte cadastral externa. Não se acrescentou um campo
do emissor que possa relaxar a política do consumidor.

O freeze E02 manteve os 101 ficheiros. Não houve consulta a credenciais reais,
instalação do KYA Brasil, download/execução de modelos, TEE ou envio ao Rekor.
