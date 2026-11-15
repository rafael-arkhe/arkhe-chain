# Remediação de auditoria

Notas portadas da tip pública `607551fa` / `1182b4ff` (`rafael-arkhe/arkhe-chain`). Descrevem o que o monorepo local já impõe. Não homologam o crate.

| Invariante | Onde | Evidência |
| --- | --- | --- |
| Veredito admitido bate com a política local `chain-v1` | `validate_transfer_policy` em `src/state.rs` | `fabricated_policy_metadata_is_refused_in_ingest_and_import` |
| Altura confirmada no snapshot é reivindicação, não certificado | `open` reexecuta `bft_commit` | `a_claimed_commit_without_votes_is_refused_without_rewriting`, `advancing_a_claimed_commit_past_its_certificate_is_refused` |
| Voto posterior não destrói certificado confirmado | `store_precommit` congela altura ≤ `committed` | `a_later_round_preserves_the_committed_certificate_across_restart` |
| Substituição de snapshot falha sem apagar o destino | `persist::write_atomic` (`create_new`, `sync_all`, `TempPath::persist`) | `a_stale_temporary_file_cannot_be_followed_or_truncated` |
| Mais de 1 000 votos distintos cabem no arquivo | decoder limitado por bytes presentes | `more_than_one_thousand_distinct_votes_persist_and_reopen` |
| Bloco já canônico numa caminhada de sync não derruba a lista | `import_synced` | `r4_a_synced_reimport_of_an_already_canonical_block_is_not_a_failed_walk` |

## Política

Esta versão autoriza só `chain-v1` / regra `transfer` / evento `chain-transfer`. Metadados de política no payload do remetente não instalam outra política. Saldo, assinatura, nonce e halt continuam a aplicar. Não há autoridade de política assinada nem serviço de veredito.

## Persistência

Limite de snapshot 64 MiB. O teto fixo de 1 000 votos foi removido; a alocação do decoder é pelo que cabe nos bytes. `.arkhe-tmp` órfão impede gravação até remoção. O diretório pai não é sincronizado: durabilidade da entrada de diretório sob perda de energia continua limitação explícita.

## Consenso

O protocolo permite propostas concorrentes e retém a primeira ponta. Quórum não elege proposer, não muda de rodada e não converge após partição. BFT completo, Groth16, liquidação e custódia HSM permanecem abertos em [homologacao.md](homologacao.md). Regras A/P/R: [regras.md](regras.md).

## Como repetir

```bash
cargo test -p arkhe-chain --test audit_regressions --test devnet_rules -- --test-threads=1
```

```bash
python kernel/arkhe-chain/scripts/audit_gate.py --output ../arkhe-gate-result
```

Isso não fecha A3 nem marca homologação. O `audit_gate` exige `kernel/arkhe-chain` limpo e grava o manifesto fora do monorepo.
