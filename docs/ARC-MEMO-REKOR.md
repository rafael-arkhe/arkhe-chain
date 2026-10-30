# Memo checkpoint anchored in public Rekor

A real durable MMR checkpoint was submitted to public Rekor on 2026-10-23.
The combined bundle now verifies Rekor and the original MMR/memo evidence
offline. No database migration or admission/payment path changed.

## Observed result

- [Public entry](https://rekor.sigstore.dev/api/v1/log/entries/108e9186e8c5677af076356d2c0c7075f0d7cddd02eeb52964bbd8219609d6772f84b48367ee9ed5).
- Global `logIndex`: `3418197865`; shard proof index: `3296293603`.
- Signed checkpoint tree size: `3296294542`; signed integrated time: `1792753326`.
- Artifact SHA-256: `e8cc818b9edee7b12e6eb358a361394708513f74613cd3cf61fc15120b089442`.
- [Bundle](../output/arc-memo-rekor-01/bundle.json),
  [raw response](../output/arc-memo-rekor-01/rekor-create-response.json),
  [report](../output/arc-memo-rekor-01/report.json),
  [offline tests](../output/arc-memo-rekor-01/offline-tests.log),
  [architecture audit](../output/arc-memo-rekor-01/architecture.log).

Source: PostgreSQL export from `memo-postgres-audit-8cfd83aa088742daac03a176160a3713`.
It contains a real Arc Testnet memo and a **synthetic invoice**. The result is
`Matched` for `synthetic-memo-invoice`; invoice authenticity is not established.

## Format and independent trust

`arkhe/memo-rekor/v1` contains `durable_export`, `signer_public_key` and
`sigstore_bundle`. The original package bytes and local MMR proof are retained.
The signed artifact is this UTF-8 JSON array, with no trailing newline:

```text
["arkhe/memo-graph-checkpoint/v1", tenant_id, stream_id, root_lowercase_hex, leaf_count, profile_digest]
```

Rekor receives **only its SHA-256**, a detached ECDSA P-256 signature and an
ephemeral public key, using `hashedrekord/0.0.1`. No invoice, tenant identifier,
raw RPC response, database credential or private key is uploaded. The private
key is not persisted. Receipts are saved in the export directory, not yet in
a PostgreSQL anchor table.

Two files must arrive separately from the untrusted bundle:

1. `trusted_root.json`: fetched using pinned `@sigstore/tuf@4.0.2`, starting
   from the official client's embedded bootstrap root and a fresh cache. The
   official client verifies root rotations, metadata signatures, versions,
   expiry and target digest. Cache metadata is retained under `tuf-cache/`.
2. `policy.json`: exact root SHA-256, checkpoint commitment, signer SPKI SHA-256
   and accepted integrated-time window. Recipients must obtain/approve this
   policy through an authenticated independent channel. The adjacent demo policy
   records this run's choices; adjacency alone does not authenticate the issuer
   or the recipient's intended checkpoint.

Offline verification never refreshes TUF or accepts policy embedded in the
bundle. The adapter selects the exact Rekor log ID and public instance URL
from the pinned root. It requires both SET and Merkle inclusion proof with a
signed checkpoint. Official `@sigstore/verify@4.1.2` performs cryptographic
verification. Adapter checks additionally bind the Rekor body public key,
message digest, declared proof root and tree size, and reject unsafe integers.

Rekor v1 global and shard-local indices intentionally differ: SET authenticates
the former, while the checkpoint/inclusion proof authenticates the latter.
After external verification, the adapter invokes native Rust
`memo_persistence verify`, using the authenticated graph checkpoint. Rust checks
the package hash, MMR proof, raw memo derivation and reconciliation reexecution.
The existing Fulcio profile remains separate and still rejects plain keys.

## Reproduce

Use a supported Node version (this run: bundled Node 24.19.0) and the root lockfile:

```powershell
pnpm install --frozen-lockfile
cargo build -p arkhe-wormgraph --example memo_persistence --locked
node integrations/cosign/memo-rekor-cli.mjs verify output/arc-memo-rekor-01/bundle.json output/arc-memo-rekor-01/trusted_root.json output/arc-memo-rekor-01/policy.json target/debug/examples/memo_persistence.exe
pnpm --filter @arkhe/sigstore-verifier test
```

For an explicitly intended new public submission (new directory required):

```powershell
node integrations/cosign/memo-rekor-cli.mjs anchor PATH_TO_EXPORT.json NEW_OUTPUT_DIRECTORY target/debug/examples/memo_persistence.exe
```

`anchor` verifies the export, refreshes TUF, saves checkpoint/policy/submission
files, and publishes. It polls up to ten times for inclusion if necessary.
Investigate failed/ambiguous submissions before retrying: an accepted log entry
is public and permanent. `verify` needs no network/database and emits success
only after both layers pass.

## Test evidence and limits

The package suite passed **31 tests**, including **19 memo anchor tests**, with
network access denied. The command built the native verifier from source.
Architecture passed: 27 Rust crates, 7 Node packages, 17 immutable migrations.

- Modified MMR proof passes Rekor, then fails Rust. Modified package bytes do too.
- Changed Rekor sibling hash, checkpoint signature, SET, global/shard index,
  time, log ID, body or artifact signature reject.
- Removing either proof or SET rejects. Mismatched proof root/tree size reject.
- Root replacement, removed authority, wrong signer pin and invalid time reject.
- The complete CLI positive check also runs with sockets denied.

These are tamper tests, not an exhaustive mutation audit. This live MMR has one
leaf; the prior PostgreSQL suite separately tested three-leaf proofs and older
checkpoints. Fixtures and provenance are in `integrations/cosign/test/fixtures/memo-rekor/`.

Rekor establishes inclusion of a signed commitment under an authenticated log
checkpoint and the log's signed integrated-time assertion. It does not prove
true/complete/latest operator data, invoice authenticity, Arc RPC authenticity,
consensus/ancestry, named operator identity or consistency between checkpoints.
An operator can still publish conflicting roots. No Fulcio/OIDC identity or
RFC 3161 TSA is claimed for the ephemeral signer. Monitoring/witnessing,
recipient policy distribution, source authentication and commercial demand
remain separate work.

References: [official TUF client](https://github.com/sigstore/sigstore-js/tree/main/packages/tuf),
[official verifier](https://github.com/sigstore/sigstore-js/tree/main/packages/verify),
[Rekor](https://docs.sigstore.dev/logging/overview/),
[hashed records](https://docs.sigstore.dev/logging/sign-upload/).
