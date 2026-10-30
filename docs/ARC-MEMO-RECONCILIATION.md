# Offline memo consumption in Rust

The opt-in profile `arkhe/arc-direct-memo-evidence/v1` consumes raw archived RPC
responses, not the Python reader's decoded status or its `confidence_score`.
It supports one direct EOA Memo wrapper frame targeting USDC `transfer()` with
one native movement and its ERC-20 mirror. Nested or multiple frames/movements
fail closed. The ordinary reconciliation v1 predicate and existing WorkIntent,
WER and MMR identities are unchanged.

## What the Rust verifier checks

1. Bounded JSON-RPC envelopes for chain ID, receipt, block and finalized head;
   only Testnet chain ID 5042002 is supported by this prototype.
2. Successful receipt, direct Memo target, consistent block hash/number, the
   transaction at its supplied block index, and matching per-log provenance.
3. Exactly one BeforeMemo/Memo/native Transfer/ERC-20 mirror, with unique ordered
   log indices and the same memo frame index.
4. Strict bounded ABI decoding, indexed addresses, dynamic bytes offset/length
   and zero padding. Sender, USDC target, native amount and mirror agree. Native
   values must convert exactly to micro-USDC; mint/burn and zero IDs are rejected.
5. Ethereum Keccak-256 of reconstructed USDC `transfer(payee, amount)` calldata
   equals the emitted callDataHash. RustCrypto sha3 0.10.8 is pinned in Cargo.lock;
   the implementation uses Keccak256, not Sha3_256.
6. A deterministic Transfer is derived with reference
   `arc-memo-id:0x` followed by the FULL 64 hex characters of memoId. No prefix,
   UTF-8 trimming or interpretation of memo text as an invoice ID is performed.
7. The transfer's source commits the exact evidence response bytes under a new
   domain. The reconciliation bundle must contain exactly that derived transfer.
   Ordinary intent/worker/input bindings, predicate reexecution and trusted MMR
   inclusion are then checked by the existing verifier.

The captured memoId is
`0x3837656331313461306600000000000000000000000000000000000000000000`.
The human-readable prefix `87ec114a0f` is its decoded ASCII, not its raw hex value.
The memo payload is `MeshPort #142`. Neither string establishes a commercial debt.

## Reproduction

Use new output directories. No RPC calls, keys or payments are made by this example:

```powershell
cargo test --locked -p arkhe-verify-core --test memo_reconciliation
cargo run --locked -p arkhe-verify-core --example arc_memo_reconciliation -- demo output/arc-memo-capture-02 output/arc-memo-rust-new
cargo run --locked -p arkhe-verify-core --example arc_memo_reconciliation -- verify output/arc-memo-rust-new/matched/bundle.json output/arc-memo-rust-new/matched/local-trust.json
```

The demo locates raw response files through the capture manifest, checks their
SHA-256 values, and independently decodes them in Rust. File names and read sizes
are restricted. Archive hashes establish consistency with that supplied manifest,
not authenticity of the manifest itself. Existing public raw response bytes were
also retained as offline regression fixtures under `tests/fixtures/arc-memo`.

The example constructs an explicit SYNTHETIC invoice with the exact derived
reference, payer, payee, amount and a time window. It produces:

| Case | Result |
| --- | --- |
| Real archived memo + corresponding synthetic invoice | Matched |
| Invoice amount increased by one micro-unit | Partial |
| Different invoice reference | Unmatched |
| Different invoice payee | Unmatched |
| No invoice | Unmatched |
| Raw memo ID changed after the bundle was committed | Rejected |

The matched memo transaction carries 2 USDC of test value. It is a different
transaction from the earlier unreferenced 16.17-USDC observation. Both are public
Testnet observations; neither invoice is a real commercial document.

## Evidence and limits

[Experiment results](../output/arc-memo-rust-01/results.json),
[derived observation](../output/arc-memo-rust-01/observation.json), and
[local test output](../output/arc-memo-rust-01/tests.log) are retained.

Raw response consumption, deterministic reference derivation and reconciliation
are implemented. Source identity, consensus signatures, head ancestry/freshness,
checkpoint issuance and invoice authenticity are NOT independently authenticated.
Finality remains RPC-reported. The local checkpoint/trusted expectations generated
alongside each example bundle are demonstration trust, not independently distributed
authority. A malicious source can fabricate a self-consistent RPC history.

The declared invoice fields, document authorship and business mapping still require
external authority. This profile makes a precise consistency claim, not a
high/low-confidence score. It does not authorize payments, prevent replay, persist
in PgWormGraph or anchor externally. A subsequent [targeted mutation audit](ARC-MEMO-MUTATION-AUDIT.md)
exercised eleven selected mutants and retained two new tests after finding coverage
gaps in index uniqueness and response-size rejection. All nine original tests
remain. No universal correctness or commercial demand claim is made.

A separate [durable PgWormGraph adapter](ARC-MEMO-PERSISTENCE.md) now stores the
package, observation envelope and graph checkpoint atomically, with live local
process-crash/recovery evidence. The pure memo verifier itself still performs no
database writes or external anchoring; the adapter retains the same source and
synthetic-invoice limitations.
