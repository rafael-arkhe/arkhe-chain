# Arc Testnet observer

Read-only capture using the published public RPC `https://rpc.testnet.arc.io`.
No indexer account, wallet, faucet request, private key, or transaction submission
is required. Only chain ID 5042002 is accepted. This is a bounded single-event
integration demonstration, not a complete account history or production service.

## Reproduce

From D:\arkhe, use new output directories:

```powershell
python -m unittest discover -s integrations/arc-observer -p 'test_*.py' -v
python integrations/arc-observer/arc_capture.py output/arc-capture-new --lookback 32
cargo run --locked -p arkhe-verify-core --example arc_reconciliation -- observe output/arc-capture-new/transfer.json output/arc-observation-new
cargo run --locked -p arkhe-verify-core --example arc_reconciliation -- verify output/arc-observation-new/bundle.json output/arc-observation-new/local-trust.json
```

## Observation contract

### Reference semantics of reconciliation v1

This is an explicit-reference profile, not an amount/counterparty fallback:

| Supplied data | Behavior |
| --- | --- |
| Invoice has an empty reference | Invalid profile input; rejected |
| Transfer has an empty reference; invoice set empty | Unmatched |
| Transfer has an empty reference; invoices have nonempty references | No reference match; Unmatched |
| Transfer and invoice share a nonempty reference | Evaluate payer, payee, time window and amount |
| Matching reference/parties/window, receipt smaller than invoice | Partial |
| Matching reference/parties/window, receipt larger than invoice | Excess |
| More than one candidate | Ambiguous; do not automatically choose one |

Rejecting an empty invoice reference does not assert that the invoice is false,
illegal or an attempted fabrication. It means this profile lacks the correlation
key it requires. A transfer can remain unassociated without being invalid.
The synthetic experiment explicitly supplied the SAME nonempty reference on both
sides of a derived input. It never ignored the missing reference and never
matched using amount/parties alone. No low-confidence match is implemented.
Changing this behavior would require a separately versioned rule and tests.

- Capture the chain ID, finalized head, a bounded native-emitter log range,
  selected transaction receipt, and selected block. Retain the exact response
  bodies with request parameters and SHA-256 digests in `capture.json`.
- Use only the EIP-7708 emitter `0xfffffffffffffffffffffffffffffffffffffffe`
  at 18 decimals. Do not add ERC-20 mirror logs from `0x3600...0000` to this stream.
  Deduplicate identical deliveries by block hash, transaction hash and log index;
  reject conflicting duplicates. Equal-valued events at different indices remain
  separate movements.
- Normalize to integer USDC micro-units only when exactly representable. Record
  sub-micro, mint/burn and unsupported-range exclusions in `excluded.json`, rather
  than rounding or treating mint/burn as customer receipts. The current profile
  cannot represent every native precision value.
- Require a successful receipt, exact selected log presence and matching block
  hash/number. Bound the selected event to the RPC-reported finalized height.
  There is no arbitrary N+K confirmation rule or fallback to `latest`.
- Keep the whole transaction gas cost (`gasUsed * effectiveGasPrice`) separate
  in native units, with its payer and conversion remainder. Never deduct that fee
  from the transfer principal or allocate it once per log.
- Leave `reference` empty: a plain Transfer has no invoice reference. No synthetic
  invoice is created for a captured public transaction. The example imports the
  observation with an empty invoice set, producing `Unmatched`.

The source string commits the capture manifest SHA-256. The pure Rust verifier
commits that string as input, but does not open or authenticate the capture archive.
The manifest retains RPC metadata/finality and fees outside the current Transfer
schema; those fields are not independently checked by offline MMR verification.
RPC TLS observation, response-body hashes and cross-response consistency are not
an independently verified consensus certificate or proof of invoice authenticity.
The local trust file is generated alongside the bundle for demonstration only.
Real verifiers must provision trusted checkpoints independently.

The example uses `Simulate` to avoid implying authorization. No ContainmentGate
payment path, durable PgWormGraph append or external transparency anchor is used.
Off-chain reference evidence, independent source authentication and production
admission remain further integration work.

## Executed live observation

The retained [capture](../../output/arc-live-capture-02/capture.json) covers blocks
68612115–68612146: 490 raw logs, 466 eligible movements and 24 precision/scope
exclusions. One movement of 16.17 test USDC was selected:

`0x0f6bcb84a6064f3f4cb7c6cce91dee496fa277ad26b23a35d3b7d782e607fe5e`, log index 0.

Its receipt/block were checked by the capture script. The exported
[bundle](../../output/arc-live-observation-01/bundle.json) was verified locally,
producing [Unmatched](../../output/arc-live-observation-01/verify.log). This confirms
live read/normalize/package/verify behavior, not correct matching to a real invoice.
The first Python attempt received HTTP 403 with urllib's default user agent; the
capture succeeded after identifying the client as `ArkheArcObserver/0.1`.

The seven local adapter tests use synthetic event fixtures to exercise duplicate
delivery, ERC-20 mirror exclusion, distinct equal-valued movements, precision,
mint/burn, malformed logs and receipt/block consistency. They do not substitute
for live evidence or establish source authenticity.

## Primary references

- [Network and RPC](https://docs.arc.io/arc/references/connect-to-arc).
- [USDC emitter and fee semantics](https://docs.arc.io/arc/references/usdc-system-events).
- [Arc transaction finality](https://docs.arc.io/integrate/wallets/transaction-lifecycle).

Arc commits transactions without a probabilistic confirmation counter; the
observer records the RPC's finalized observation, not independent consensus
verification. Pre-Zero5 testnet history uses legacy events and is out of scope.

## Controlled matching experiment

The additional `arc_observation_matching` example uses the retained real RPC
observation together with a deliberately fabricated invoice and off-chain
reference. It preserves the original transfer bytes and exports a sidecar marked
`synthetic: true`. The reference is added only to a derived matching input, and
its source string commits the sidecar under a dedicated BLAKE3 domain. The
invoice is also marked synthetic; the worker explicitly records the mixed origin.
The core does not independently parse/authenticate this reference sidecar.

```powershell
cargo run --locked -p arkhe-verify-core --example arc_observation_matching -- output/arc-live-capture-02/transfer.json output/arc-matching-new
```

The existing predicate and verifier were not changed to accommodate the demo.
Its explicit assertions and local package verification established:

| Case | Result |
| --- | --- |
| Original observation with no invoices | Unmatched |
| Synthetic invoice and synthetic external reference, exact fields | Matched |
| Invoice amount increased by one micro-unit, rebuilt coherent package | Partial |
| Invoice payee changed, rebuilt coherent package | Unmatched |
| Empty invoice reference | Invalid input, rejected |
| Already committed package amount changed without rebuilding commitments | Rejected |

The amount case is Partial under the v1 rule, not Unmatched. Coherent scenario
changes exercise classification; corrupting a committed package exercises
integrity rejection. Neither is a code-mutation experiment.

[Results and source digest](../../output/arc-live-matching-01/results.json),
[synthetic association](../../output/arc-live-matching-01/synthetic-association.json),
[valid CLI verification](../../output/arc-live-matching-01/matched-verify.log), and
[tampered CLI rejection, exit 1](../../output/arc-live-matching-01/tampered-verify.log)
are retained. This demonstrates controlled matching over an observed transfer;
it does not establish a real invoice, customer-provided reference, authentic
obligation, consensus proof or independently trusted external checkpoint.

## Memo capture

Arc's documented Memo mechanism is a wrapper call
`memo(address,bytes,bytes32,bytes)` at
`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`, emitting indexed `BeforeMemo` and
`Memo` events around the target call. It is not assumed to be a USDC
`transferWithMemo` token method. See [Arc transaction memos](https://docs.arc.io/arc/concepts/transaction-memos)
and [the official tutorial/ABI](https://docs.arc.io/arc/tutorials/send-usdc-with-transaction-memo).

The optional memo reader uses pycryptodome 3.23.0 for Ethereum Keccak-256 (not
SHA3-256). It was already available in the execution environment; the base
transfer-only reader still uses the standard library alone.

```powershell
python -m pip install -r integrations/arc-observer/requirements-memo.txt
python integrations/arc-observer/arc_memos.py output/arc-memo-new --lookback 4096
python -m unittest discover -s integrations/arc-observer -p 'test_*.py' -v
```

The memo reader searches bounded 256-block chunks under an RPC-reported finalized
head, stops at the first nonempty chunk and retains responses. Direct wrapper
calls targeting USDC `transfer()` can be structurally associated only if sender,
event provenance, ordered frame, single enclosed native movement and reconstructed
calldata hash agree. Other/nested/multi-movement patterns are retained without
automatic association. Dynamic bytes are length/offset/padding checked and bounded.
Public-RPC 429 responses have bounded retries respecting numeric Retry-After up
to ten seconds; the scan also spaces chunk queries. An initial live scan hit 429;
the subsequent retained run completed with these controls.

The [live memo report](../../output/arc-memo-capture-02/memos.json) found one event
in blocks 68610133–68610388 after scanning 13 chunks. Transaction
`0x0fad27c8645d2e093959695f95b72c9dd6a1fe577b1f9eee8be7de6ebb5b79a0`
has memo log index 13, associated with movement log index 11 under the supported
direct-transfer checks. Its memo index is 795769. Source and finality remain RPC
observations, not independent consensus proofs.

The reader does NOT populate `Transfer.reference`, fabricate an invoice, assign a
confidence score, or change the v1 matching rule. MemoId and memo bytes are caller
metadata; application-specific invoice mapping and authenticated evidence would
still be required. The Python-decoded sidecar is not used as authority by Rust.
The new [offline Rust memo profile](../../docs/ARC-MEMO-RECONCILIATION.md)
independently consumes the raw archived responses and derives a full-memoId
reference. This adds structural verification, not RPC/consensus authentication.

There are now 15 local Python tests: the seven base-capture tests plus eight memo
tests covering direct-call binding, calldata mismatch, multiple movements, frame
ordering, malformed ABI/emitter, sender/target mismatch, cross-transaction evidence
and absent memos. These fixture tests are separate from the retained live capture.
