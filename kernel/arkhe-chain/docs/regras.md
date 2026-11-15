# Agreement, liveness, and recovery rules

This document states the rules the code enforces today and, for each, where it lives and which test exercises it. Where a rule is weak, the text says it is weak. Nothing here is a formal proof: verification is by test, with the listed scenarios.

The scenario is the local testnet: four validators, weight 1 each, and a single sealing process. The crate is not homologated. The public reference tip is `1182b4ff` (`rafael-arkhe/arkhe-chain`); this monorepo ports A/P/R rules without the `executor` role from the tip.

## Model

- **Honest validator:** runs this code unmodified. Signs at most one precommit per height for the block canonical on its own node.
- **Faulty validator:** may sign different blocks at the same height, seal out of turn, or stay silent.
- **Network:** peers are named addresses. A message may delay or be lost. There is no discovery.

## Agreement

**A1. Confirmation requires more than two thirds.** A node records height `h` as confirmed when votes on the highest round, on its canonical hash at `h`, satisfy `votes × 3 > validators × 2`. With four validators that is three votes. Confirmation is sequential: `h` confirms only after `h − 1`. Confirming does not move the tip.
Where: `ArkheNode::bft_commit`. Test: `a1_a_height_commits_only_with_more_than_two_thirds_of_the_validators`.

**A2. A node counts votes only for its own canonical block.** Vote for a sibling is `Fork`. Vote for unknown block is `UnknownBlock`. Vote from non-validator is `NotProposer`. Signature not from validator key is `BadProposerSignature`. Vote for another chain id is `ChainId`. The same vote counted once.
Where: `ArkheNode::note_precommit`. Test: `a2_a_node_counts_votes_only_for_its_own_canonical_block`.

**A3. Two blocks at one height cannot both confirm with at most one faulty validator.** Confirmation needs three of four votes. Two sets of three share at least two validators, and an honest validator signs only one block per height. With zero faulty and the network split two-two, neither side confirms. With one faulty signing both blocks, at most one side confirms.
Where: A1 and A2 together. Test: `a3_two_blocks_at_one_height_cannot_both_commit_with_one_double_signer`.

**A4. With two faulty of four, agreement fails.** If two validators sign both blocks, both sides reach three votes and confirm different blocks. That is the rule’s limit, and the test shows it on purpose.
Test: `a4_two_double_signers_of_four_break_agreement`.

**A5. A canonical block is not replaced.** A sibling from another proposer is recorded as `Fork` and does not change the tip. A longer chain does not change the tip. Two blocks from the same proposer at the same height are `Equivocation` and the second is not stored. There is no reorg, before or after confirmation.
Where: `ArkheNode::import_block`. Test: `a5_a_committed_block_is_not_replaced_by_a_sibling_or_a_longer_chain`.

What agreement does not cover:

- There is no evidence of fault or punishment. Double signing is not detected by a node that only sees one side.
- A fork does not resolve itself. If two processes seal and the network splits, each node keeps the block it saw first, forever. Escaping that requires erasing the file on discarded-side nodes, which is an operator decision outside the protocol.
- The validator set is genesis. It does not change.

## Liveness

**P1. The sealer seals only after hearing every named peer in the pass.** A peer that did not answer, or whose announced tip lags, holds the seal. Transactions and attestations stay queued until a pass where everyone answers at the same tip. With one validator stopped, height does not advance; when it returns, what waited is sealed.
Where: `OperatorHandle::catch_up` and `heard_every_peer`. Test: `p1_the_sealer_seals_only_after_every_named_peer_answered`.

**P2. A block requires content.** With no transaction and no attestation in the queue, no block is sealed. Block 1 timestamp is `--time`; each following block uses parent plus one.
Where: `ArkheNode::propose_and_seal_block` and `seal_timestamp`. Test: `the_sealing_operator_takes_lists_from_the_inbox_and_seals_them`, in `tests/operator.rs`.

What liveness does not guarantee:

- **No crash tolerance.** A1 would confirm with three of four votes, but P1 does not let the block be born with a peer down. The network stops with any validator stopped. That is a choice: with no reorg, sealing without hearing everyone risks a permanent fork when more than one sealer exists.
- **No sealer failover.** If the only process with `--seal` stops, nobody seals. There is no round after 0 and no proposer selection.
- **No deadline.** Nothing guarantees an accepted transaction is sealed within a given time.

## Recovery

**R1. A node that lost its file resyncs from genesis.** It starts at height 0, fetches blocks from peers, replays each against header root, and votes again. Others’ votes arrive again and confirmed height is rebuilt.
Where: `sync_pass` and `attest_configured`. Test: `r1_a_follower_that_lost_its_file_syncs_from_genesis_and_votes_again`.

**R2. A restarted node resumes from its own file.** Height, tip, confirmed height, and transaction queue return as they were. The file is replayed from genesis on open and refused if result differs from what is stored. Confirmed height in the file is a claim: `open` rebuilds it with `bft_commit` and stored votes.
Where: `ArkheNode::open`. Test: `r2_a_restarted_node_resumes_from_its_file`.

**R3. An orphan temporary blocks startup until removed.** A process killed mid-write leaves `<file>.arkhe-tmp`. The node does not start while it exists and returns `Snapshot`. Chain file is swapped whole or not at all, so the orphan may be removed.
Where: `persist::write_atomic`. Tests: `r2_a_restarted_node_resumes_from_its_file` and `a_stale_temporary_file_cannot_be_followed_or_truncated`, in `tests/audit_regressions.rs`.

**R4. A block delivered two ways does not break sync.** A vote may carry the block while fetch still asks for it. Fetch accepts a block already canonical on the node.
Where: `import_synced` in `src/p2p.rs`. Test: `r4_a_synced_reimport_of_an_already_canonical_block_is_not_a_failed_walk`.

What recovery does not cover:

- **Attest queue is not in the file.** A restarted sealer loses waiting attestations. Waiting transactions return.
- **No fork recovery**, as stated under Agreement.
- **No backup.** A node with corrupted file must be erased and resynced (R1), which only works while the other three are up (P1).

## Authorization

Attest registry rules are in [atestados.md](atestados.md). In this monorepo the execution path differs from the public tip: there is no `executor` role.

**Z1. `Execute` has no signature of its own.** The block operation is `AttestOp::Execute` covered only by proposer signature. Whoever seals can consume a valid approval. The receipt does not name an executor. The public tip requires a `Execution` attestation signed by an account with `executor` role; that was not ported on purpose.
Where: `AttestOp::Execute` and `submit_execution`. See [atestados.md](atestados.md).

**Z2. Role separation on admission.** Evaluator and approver are distinct accounts; artifact author is not evaluator or approver. Genesis roles are `requester`, `author`, `evaluator`, and `approver`.
Attest suite test: `Attest("separation")` (gate `attest-separation`).

**Z3. Request `budget` is signed and not charged.** The registry stores the value; local execution does not sum costs against budget. The public tip refuses with `Attest("budget")`; that is not in this monorepo.
See [atestados.md](atestados.md).

**Z4. An approval is single-use.** Second execution of the same approval is `Attest("consumed")`.
See gate `attest-consumed`.

What authorization does not cover:

- **Transaction admission verdict is signed by nobody.** `apply_tx` requires `DecisionVerdict` with `Allow`, transaction `subject`, and local policy (`Admission("policy")`), and does not require signature from a policy authority. Whoever has an account key can emit their own verdict, as `examples/testnet_faucet_tx.rs` does.
- **`--inbox` does not authenticate writers.** What protects is each transaction and attestation signature. Whoever can write the directory can fill the queue.
- **Execution effect is off-chain.** The receipt records that execution was authorized and consumed, not that the action was applied correctly.

## How to rerun

```bash
cargo test -p arkhe-chain --test devnet_rules -- --test-threads=1
```

```bash
cargo test -p arkhe-chain --test audit_regressions -- --test-threads=1
```

```bash
bash kernel/arkhe-chain/testnet/scripts/smoke-local.sh
```

The third command starts local processes and checks transfer, attestations (4 ops), replay, stopping a follower, catch-up, and restart. It does not homologate.