# Arc → Arkhe: offline reconciliation prototype

This opt-in library/example observes supplied transfer records. It does not
authorize payments, query Arc, claim invoice authenticity, or execute an action.
The fixture is entirely synthetic, including hashes, times and documents.

The pure verifier checks four independent conditions:

1. The supplied WorkIntent and rule match independently retained expectations.
2. OperationId, input, decision and WorkerExecutionRecord commitments agree.
3. An independent, finite matching predicate reproduces the decision.
4. The exact record belongs at the specified index in the accepted `arkhe-mmr@1`
   checkpoint, using the existing profile digest and proof verifier.

The canonical input is the typed Input structure (operation ID, rule, transfer,
invoice sequence) encoded with the existing deterministic encoder under new
domain separators. Existing WER/WorkIntent projections and MMR profiles do not
change. Invoice IDs must be strictly ascending; money is integer USDC micro-units.
The supported rule requires exact reference, payer, payee and inclusive time
window. Multiple candidates are Ambiguous. A sole candidate is Matched, Partial
or Excess according to amount; no candidate is Unmatched. These are per-event
classifications, not aggregated invoice balances or accounting conclusions.

Exact document bytes are committed and supplied, but their content is not parsed
or authenticated: matching evaluates the typed invoice fields. A document's
meaning, authorship and consistency with those fields remain unverified.
`observed_at` is supplied evidence, not a trusted timestamp.

## Run

From D:\arkhe, choose a new output directory:

```powershell
cargo test --locked -p arkhe-verify-core --test arc_reconciliation
cargo run --locked -p arkhe-verify-core --example arc_reconciliation -- demo output/arc-reconciliation-demo
cargo run --locked -p arkhe-verify-core --example arc_reconciliation -- verify output/arc-reconciliation-demo/bundle.json output/arc-reconciliation-demo/demo-trust.json
```

The example refuses to overwrite an existing directory. Its trust file is a
local synthetic checkpoint, generated alongside the bundle solely for the demo.
For real use, a verifier must provision trust independently; accepting an
attacker's root and expected intent proves nothing about trusted provenance.
The verifier does not authenticate checkpoint issuance, freshness, consistency
across checkpoints or external transparency anchoring.

Tests cover document/amount/operation substitution, a wrong checkpoint, malformed
proof/profile, and a forged decision with internally consistent hashes and valid
membership that is rejected by predicate reexecution. Read-only verification is
repeatable. It does not consume a proof, prevent replay, prevent invoice reuse
across cases, or replace a persistent journal.

## Remaining integration

The separate [read-only Arc observer](../integrations/arc-observer/README.md) now
captures a bounded live Testnet observation, retains raw responses, normalizes
the native stream, and packages it through the `observe` example command. The
executed result is Unmatched because no invoice/reference was supplied. Finality
and gas metadata remain in its capture manifest, outside the offline proof's
source-authentication scope. The statements below describe production work still
required, not an absence of the new bounded read path.

A production Arc capture adapter must normalize native/ERC-20 representations without
double-counting, convert units explicitly, retain source responses, and qualify
the origin/finality of observations. A reference is not part of a plain USDC
Transfer event and needs a separately evidenced source. Gas must be recorded
separately from transferred principal. No testnet transaction was submitted by
this prototype or observer; the observer read an existing public transaction.

The local MMR fixture is not a production PgWormGraph append and has no external
anchor. Durable admission, authenticated capture, checkpoint distribution and a
production Arc ingestion remain separate integration work. No legal, fiscal, delivery,
exclusive-market-position or willingness-to-pay claim follows from this demo.

## Targeted mutation evidence

The predicate reexecution guard was previously removed in a controlled run;
the forged-decision test failed with the mutant and passed after byte-exact
restoration. Three additional guard mutations were then exercised locally:

- Skipping MMR inclusion is detected by `untrusted_checkpoint_rejected`.
- Removing the intent/input digest comparison initially survived the original
  document-substitution test, since other checks still rejected that input.
- Removing the OperationId comparison likewise survived the original test.

Two additional tests isolate the latter bindings by rebuilding the decision,
worker digests and synthetic checkpoint. The foreign-operation fixture also
refreshes the expected intent digest, leaving only the OperationId mismatch.
Both detect their targeted mutants. Synthetic fixture trust is deliberately
constructed for isolation; this does not model an attacker changing real host
trust. The verifier source was restored byte-for-byte after each experiment.

Initial survivors and final results are retained separately:

- [Initial results](../output/arc-reconciliation-mutation/a1adba7c476b42daa2230bedcf172875/summary.json).
- [Isolated-test results](../output/arc-reconciliation-mutation/b7fbd168991d426cbea29332b75a1e90/summary.json).
- [Full restored suite output](../output/arc-reconciliation-mutation/b7fbd168991d426cbea29332b75a1e90/full-suite.log).

The audit covers four specific guards when combined with the prior predicate
experiment. It is not an exhaustive mutation score or proof that four broad
verification conditions are universally independent. These experiments mutate
the source temporarily; do not run them concurrently with other edits/builds.
