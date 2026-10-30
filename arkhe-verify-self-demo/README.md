# Arkhe verifier/loader executable demo

## Production continuation, 25 October 2026

The production WASM and both policy axes have now been implemented and executed:
[successful public workflow](https://github.com/rafael-arkhe/arkhe/actions/runs/40177979432),
[merged PR #2](https://github.com/rafael-arkhe/arkhe/pull/2).
Commit `b444c79a13fec25b7b944f3c8a7e39ab3f34f3dc` builds the real production
`arkhe-verify-wasm`, publicly signs it using GitHub OIDC/Cosign and Rekor, verifies
offline with Cosign and Rust 0.6.6, and runs one positive and fifteen rejected
policy attacks inside the admitted module. The earlier local answer-42 fixtures
remain a separate regression domain and have not been relabeled as production.

The production WASM SHA-256 is
`049672c75c9e96391d004a61f998c2893ffaa5ec0f8117d3ad03777b7b5b28de`.
`production::ReleaseTrust` implements its admission path; `verify_self` remains
the local fixture profile. Production trust is acquired by Cosign/TUF separately
from offline verification. The Rust 0.6.6 TUF acquisition path failed signature
threshold validation locally, so it is not used as a permissive fallback.

Local independent verification uses the downloaded production artifact and a
separately captured local public trust snapshot. Six further offline controls
reject tampering, wrong workflow identity, invalid Merkle path, forged SET,
forged checkpoint and a stale capture for their expected reasons.
See `evidence/public-release/`.

The native production policy module is
`verification/crates/arkhe-verify-core/src/policy.rs` in D:/arkhe and the isolated
public source snapshot. Native tests pass nine tests, including two independent
10,000-case properties generated from v1's actual allowed action domain. The
original changed-digest scenario 10 explicitly rejects. The action compatibility
relation does not imply reuse of old signed intents under a new policy digest:
those must be reauthorized. Migration reasons grant no runtime authority.

Five production policy mutations are exercised with **separate build directories
per mutant**, avoiding reuse of copied-workspace test binaries. They target intent
binding, worker/key binding, ambiguous delimiter encoding, module/version rules
and unjustified migration acceptance. Their source and Cargo.lock hashes are
recorded in `evidence/policy-mutations/result.json`; the original source is unchanged
and the final original suite passes. Earlier shared-cache diagnostic attempts are
explicitly excluded from the final mutation result.

Pure policy admission is not a replacement for journal nonce consumption,
transactional dispatch, host trust configuration or migration of all legacy
governance profiles. No formal proof or SLSA certification is claimed. The sections
below describe the original fixture demo; its original production/policy pending
statements are historical, superseded by this production continuation.

Standalone Cargo project; does not change the parent Arkhe workspace. Native
Windows Rust 1.96.0, exact `sigstore-verify`, `sigstore-types`, `sigstore-trust-root`
and `sigstore-merkle` 0.6.6; dependency resolution is recorded in `Cargo.lock`.

```powershell
cd D:\arkhe\arkhe-verify-self-demo
cargo build --locked
cargo test --locked
```

## What the fixtures mean

Two deliberately separate evidence domains are exercised:

1. `fixtures/arkhe_verify.wasm` and `other.wasm` are small valid WASM smoke
   modules, **not the Arkhe production verifier**. `answer()` returns 42; the
   second module adds a custom section. Their Sigstore-shaped bundles use real
   P-256 signatures, a test CA, signed CT SCT, signed Rekor SET/checkpoint and
   a two-leaf RFC6962 tree. These fixtures are generated locally, not issued by
   public Fulcio or anchored in public Rekor. No verifier is mocked or stubbed.
2. `fixtures/public-cosign` contains an actual upstream Cosign v3 blob fixture
   and public trust root. Its test invokes the native 0.6.6 high-level verifier
   with exact certificate identity and issuer and all verification flags enabled.
   It verifies a text blob, **not a public Arkhe WASM release**. This regression
   test bypasses the demo loader's local-domain profile and freshness policy.

The local root, its capture metadata and exact expected signer are compiled from
reviewed fixture files. `build.rs` independently hashes the WASM using its own
build dependencies and declares `rerun-if-changed`. This creates a build pin;
neither `env!` nor hashing is an independent signature or provenance claim.
Trust in the loader binary, its source/configuration and its build remains external.

Build DAG: generate WASM/test trust/bundles -> compile loader embedding those
inputs -> verify bundle over input buffer -> compile the same buffer -> instantiate
with no imports in the execution test. No file is reopened between verify/compile.

## Verification gates

`verify_self` accepts only untrusted WASM bytes and bundle JSON. It obtains the
root, identity and issuer from embedded configuration. `Ok(report)` is the sole
success representation; there is no `Ok(valid=false)` case.

The demo additionally requires exactly one Rekor entry, a SET and inclusion proof,
an exact checkpoint origin and matching checkpoint/proof size and root. It checks
the audit path using `sigstore-merkle` 0.6.6 (the high-level verifier also validates
inclusion through `sigstore-bundle`). It then calls the high-level
`Verifier::verify`, including certificate/SCT, identity/issuer, time, signatures
and hashedrekord binding. All warnings cause rejection. No log index is claimed;
`integrated_time` is a timestamp, not an index.

`load_verified_module` first checks the build-pinned digest, then attestation, then
`Module::new` on the same slice. A changed WASM returns the typed `HashMismatch`
before compilation. Runtime import capabilities/sandbox policy are application work.

The 30-day root-capture limit is an **application policy requested for this demo**,
not a universal expiry of Sigstore roots. Future captures also fail. The metadata
commits to the local root contents, but does not cryptographically authenticate its
capture time outside the trusted build. Tests cover exactly 30 days and 30 days +
one second, as well as staleness through the complete verifier with an injected
private test clock. The public API uses the system clock.

Local positive fixtures intentionally stop verifying once their embedded capture
is older than 30 days. Refresh by generating and reviewing a complete new local
fixture set, not by merely resetting capture age for an unchanged old snapshot:

```powershell
python -m pip install cryptography==50.0.1
python scripts/generate_fixtures.py
cargo test --locked
```

Generator private keys are ephemeral and never stored. Regeneration changes
signatures and root. No Python dependency is needed for ordinary Rust tests.

## Discriminating tests and limits

- Positive WASM and bundle verify; verified module compiles and executes to 42.
- B verifies with B's bundle before rejecting that bundle for A.
- A byte alteration fails the loader hash gate before WASM compilation.
- A valid WASM instruction alteration fails attestation verification.
- B's **complete, valid** Rekor entry/proof/SET replaces A's entry while A's
  message signature/certificate stay intact. The expected rejection specifically
  identifies the artifact hash binding, rather than a broken log signature.
- Modified Merkle sibling, SET, checkpoint signature and tree size are rejected.
- Stale/future root captures fail the configured freshness policy.
- Public upstream Cosign blob verifies with its exact signer and issuer.

Passing cases establish observed behavior for these inputs, not formal correctness,
SLSA level, reproducible-build guarantees, policy compatibility, or public signing
of Arkhe. Publishing/signing the actual Arkhe WASM in GitHub OIDC remains pending.
No login, remote publication or GitHub workflow was executed by this demo.

See `evidence/` for command outputs from the recorded local run.

## Mutation checks

```powershell
python scripts/run_gate_mutations.py
```

The runner first requires the unchanged suite to pass, then copies the project
to disposable directories. It never edits the installed Cargo registry or the
shipped verifier. One mutant path-patches a copy of `sigstore-verify` 0.6.6 and
removes its high-level `verify_hashedrekord_entries` call. This removes that
validator group (artifact/certificate/signature consistency and cryptographic
signature checking), not merely one digest comparison. The unrelated-entry test
must then fail because the mixed bundle is accepted.

The other mutant disables only the loader's build-pinned hash comparison. Its
negative suite must fail the pre-compilation hash test and a stronger control:
a different valid WASM with a valid attestation from the same signer must still
be rejected by the artifact pin. Without that pin the latter module can load.

Only named runtime assertion failures count as killed mutants; compilation or
dependency failures do not. The mutant lock preserves every version and dependency
edge, changing only the verifier's registry source to the intended local patch.
Rust compiler flags are identical for baseline and mutants. The runner records logs, exact replacements, hashes
of the original and mutated source, and a final passing run of the untouched
original. See `evidence/mutations/result.json` and its companion logs.

The extended runner exercises ten mutations: the original hashedrekord validator
group and artifact pin, plus capture freshness, warnings, unsuccessful result,
Merkle validation, SET, checkpoint, exact identity and issuer. Dependency-level
mutations disable checks in temporary copies of the upstream crates called by the
demo; they do not claim that those algorithms are implemented in the demo itself.
The Merkle mutation disables the shared dependency used by both the explicit gate
and high-level verifier, so neither redundant path can hide the change.

Warnings and `success=false` are **application guard unit tests with constructed
inputs**. They are not outputs observed from the real cryptographic fixtures, and
are not evidence that 0.6.6 emits a particular warning or unsuccessful Ok result.
Identity and issuer mutations are tested against the positive public blob fixture
through the same high-level API used by the demo, with mismatched constraints.
The report records the exact set of failed tests; compiler failures never count.
The original two-mutation runner remains available as `scripts/run_mutations.py`.

## Historical log count audit

`evidence/archive-15-tests.txt` preserves the previous run before the gate tests
were extended. It contains 1 + 11 + 2 + 1 = **15** passing tests (plus zero doc
tests), is 1872 bytes, and has SHA-256
`578ff0b05456d7d052d339f54e05a0d2042c4df05e4c3f7af8b5b228919eae54`.
Its equal hashes at `cargo-test.txt` and `mutations/final-original.txt` were
intentional: `snapshot_evidence.py` copies the latter to the former. Equal hashes
of those two paths do not imply that this was the older 14-test run.
See `evidence/log-audit-before-extension.json` for the independently parsed counts.

`scripts/snapshot_evidence.py` hashes source, fixtures and logs into a new manifest.
The manifest provides integrity checking of the saved snapshot, not signed
provenance, a proof that the logs were honestly produced, or formal correctness.

## Scope still open

This is only the `VerifierVerification` demo. It does not implement authenticated
`IntentBinding`, worker-to-key authorization, canonical policy request encoding,
policy version compatibility generators, or the original adversarial policy
scenario 10. Replacing a bundle is not a substitute for testing that scenario.
Deterministic verifier tests do not resolve a vacuous policy `proptest`.

The toolchain **is** pinned in `rust-toolchain.toml`; that does not establish
reproducible builds. No registry is used: bundles are detached local JSON files.
The demo exercises that format and does not establish a general Sigil-vs-Cosign
decision. A public OIDC-signed production Arkhe WASM and its executing workflow
remain pending. No test result in this project is a formal theorem.

## Public fixture provenance

Artifact and bundle copied without alteration from the published
[`sigstore-verify` 0.6.6 crate](https://crates.io/crates/sigstore-verify/0.6.6):
`test_data/bundles/cosign-v3-blob.txt` and `cosign-v3-blob.sigstore.json`.
Root copied from [`sigstore-trust-root` 0.6.6](https://crates.io/crates/sigstore-trust-root/0.6.6),
`src/trusted_root.json` (the root used by upstream's `production_root()` tests).
Upstream: [prefix-dev/sigstore-rust](https://github.com/prefix-dev/sigstore-rust),
Apache-2.0. Fixture content hashes are recorded in `evidence/fixture-hashes.json`.
