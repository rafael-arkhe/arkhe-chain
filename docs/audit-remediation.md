# Audit remediation

Notes ported from public tip `607551fa` / `1182b4ff` (`rafael-arkhe/arkhe-chain`). They describe what the local monorepo already enforces. They do not homologate the crate.

| Invariant | Where | Evidence |
| --- | --- | --- |
| Admitted verdict matches local policy `chain-v1` | `validate_transfer_policy` in `src/state.rs` | `fabricated_policy_metadata_is_refused_in_ingest_and_import` |
| Confirmed height in snapshot is a claim, not a certificate | `open` reruns `bft_commit` | `a_claimed_commit_without_votes_is_refused_without_rewriting`, `advancing_a_claimed_commit_past_its_certificate_is_refused` |
| Later vote does not destroy confirmed certificate | `store_precommit` freezes height ≤ `committed` | `a_later_round_preserves_the_committed_certificate_across_restart` |
| Snapshot replacement fails without erasing destination | `persist::write_atomic` (`create_new`, `sync_all`, `TempPath::persist`) | `a_stale_temporary_file_cannot_be_followed_or_truncated` |
| More than 1,000 distinct votes fit in the file | decoder limited by bytes present | `more_than_one_thousand_distinct_votes_persist_and_reopen` |
| Block already canonical on a sync walk does not abort the list | `import_synced` | `r4_a_synced_reimport_of_an_already_canonical_block_is_not_a_failed_walk` |

## Policy

This version authorizes only `chain-v1` / rule `transfer` / event `chain-transfer`. Policy metadata in the sender payload does not install another policy. Balance, signature, nonce, and halt still apply. There is no signed policy authority or verdict service.

## Persistence

Snapshot limit 64 MiB. The fixed ceiling of 1,000 votes was removed; decoder allocation follows what fits in the bytes. Orphan `.arkhe-tmp` blocks write until removal. Parent directory is not synced: durability of the directory entry under power loss remains an explicit limitation.

## Consensus

The protocol allows concurrent proposals and keeps the first tip. Quorum does not elect proposer, does not advance round, and does not converge after partition. Full BFT, Groth16, settlement, and HSM custody remain open in [homologacao.md](homologacao.md). A/P/R rules: [regras.md](regras.md).

## How to rerun

```bash
cargo test -p arkhe-chain --test audit_regressions --test devnet_rules -- --test-threads=1
```

```bash
python kernel/arkhe-chain/scripts/audit_gate.py --output ../arkhe-gate-result
```

This does not close A3 or mark homologation. `audit_gate` requires a clean `kernel/arkhe-chain` and writes the manifest outside the monorepo.