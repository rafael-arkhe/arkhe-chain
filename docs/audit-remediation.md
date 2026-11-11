# Audit remediation

These changes address four findings from the review of commit
`0379344bf6977a447ad0452faa3e8d0d03de0b2b`.

Three existing tamper tests now expect rejection during policy validation, before
the state-root comparison. The highest-round test exercises an uncommitted
height; the new restart regression covers certificate preservation after commit.
The stalled-peer test fixture uses a 60-second server timeout, exceeding the
client's 10-second timeout, so the server does not race the intended client error.

| Invariant | Enforcement | Regression evidence |
| --- | --- | --- |
| An admitted verdict matches the node's transfer policy | `ChainState::apply_tx` checks the locally constructed `chain-v1` policy, event, rule and digest | `fabricated_policy_metadata_is_refused_in_ingest_and_import` |
| Every restored committed height has a verified quorum | `ArkheNode::open` replays each claimed commit through `bft_commit` | Tests for a claim without votes and a claim above the certified height |
| Later votes cannot destroy a committed certificate | Votes at committed heights remain frozen after signature and block checks | `a_later_round_preserves_the_committed_certificate_across_restart` |
| A failed snapshot replacement preserves the previous destination | Exclusive temporary creation, file synchronization, atomic replacement through `tempfile`, no destination removal | Existing failed-write tests and the stale-temporary regression |
| Valid accumulated votes can exceed 1,000 | Decoder allocation is bounded by the available bytes, encoder retains all votes within the snapshot size limit | `more_than_one_thousand_distinct_votes_persist_and_reopen` |
| A gate identifies exactly the sources it ran | Clean checkout required before and after, commit and tree recorded with command, toolchain, exit code and log digest | `scripts/audit_gate.py` |

## Policy and compatibility

This protocol version locally authorizes the existing `chain-v1` policy, version 1,
with the `transfer` rule allowing `chain-transfer`. Balance, signature, nonce,
and halt checks still apply. The sender's policy metadata cannot install another
policy. Admission checks the locally defined rule and digest on ingest, block
import and snapshot replay. This is a fixed protocol policy, not a configurable
policy authority or a signed verdict service.

Existing transactions using this exact policy retain their encoding and
signatures. Histories using other policy metadata are refused on replay and need
an explicit migration decision. Legacy snapshot formats remain readable when
their state is valid. A claimed committed height without a preserved quorum
is refused without rewriting the file. Historical votes retain their existing
signature-version verification and quorum behavior.

## Persistence boundaries

Snapshot size remains limited to 64 MiB. This patch removes the premature
1,000-vote ceiling, not the need for a future segmented history store. A stale
`.arkhe-tmp` path is refused without truncation. After a crash, stop all users of
the chain file, preserve the temporary file for inspection, and remove or move
that temporary path before reopening the validated canonical snapshot.

The temporary file is synchronized before replacement. The parent directory is
not synchronized by this patch. Power-loss durability of the directory entry
remains an explicit limitation. Atomic replacement failure and whole-system
power-loss durability are separate properties.

## Consensus remains open

The current protocol permits competing proposals and retains the first adopted
tip. Quorum counting does not establish proposer selection, round changes,
locking, or convergence after a partition. A complete BFT protocol and its
adversarial multi-node verification remain required before production
homologation. Groth16 verification, bridge settlement and key custody also retain
the limitations recorded in `homologacao.md`.

## How to audit this code

Inspect `validate_transfer_policy` in `src/state.rs` for the allowed policy.
Inspect snapshot replay and vote freezing in `src/lib.rs`, then check that
`bft_commit` counts votes at the highest round. In `src/persist.rs`, inspect
exclusive temporary creation and confirm that replacement never removes the
destination first. Check the vote decoder's byte bound before its allocation.

From a clean commit, run the following command with evidence outside the repo.

```sh
python scripts/audit_gate.py --output ../arkhe-gate-result
```

The result contains the exact commit, tree, command, exit code and SHA-256 of
`cargo-test.log`. Evidence is kept outside the tested checkout so recording a
result does not change the sources under test. A passing run covers the chain
crate's tests, not production homologation or the unresolved consensus protocol.
