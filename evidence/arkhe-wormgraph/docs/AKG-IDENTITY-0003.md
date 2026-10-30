# AKG-IDENTITY-0003 v0.1 — Identity binding (AKG-IDBIND v1)

Status: **DRAFT — code and tests landed (D2), no production keys.**

Module: `arkhe_wormgraph::binding` (`src/binding.rs`).
Companions: AKG-IDENTITY-0002 (the `GovernanceRoster` that authorizes the
Arkhe key) and [ARKHE-ARQUITETURA-COMPLETA §4.3](../../../docs/ARKHE-ARQUITETURA-COMPLETA.md).

> A binding proves that the holders of an Arkhe roster key and of an external key
> (Nostr or Radicle) both signed the same statement. It does not prove they are
> the same person, and it grants no permission: what the role may do is decided
> downstream (ContainmentGate). Without a binding in force an external key is
> only a `ProviderIdentity`.

## 1. Object

```text
IdentityBinding {               // AKG-CBOR-v1, all keys always present
  version: 1
  arkhe_key: bytes(32)          // Ed25519, must be a roster entry
  external_kind: "nostr-npub" | "radicle-did-key"
  external_id: bytes(32)        // BIP-340 x-only key | Ed25519 key
  role: "publisher" | "delegate" | "seed" | "witness"
  scope: text                   // e.g. "arkhe-e02", a RID
  valid_from: uint, valid_until: uint | null     // declared unix seconds, inclusive
}
binding_digest = BLAKE3("AKG:IDBIND:v1\0" || CBOR(binding))
```

## 2. Two signatures (bidirectional possession)

| Side | Signature | Message |
|---|---|---|
| Arkhe | Ed25519 | `"AKG:IDBIND-SIG:v1\0" || binding_digest` |
| Radicle | Ed25519 by `external_id` | `"AKG:IDBIND-EXT:v1\0" || binding_digest` (different domain; `external_id == arkhe_key` rejected) |
| Nostr | BIP-340 over the NIP-01 event id | event kind 30078 (NIP-78), pubkey = `external_id`, exactly one tag `["d","akg-idbind:<binding_digest hex>"]`, content ≤ 1024 bytes |

Using a Nostr event means any ordinary Nostr signer (extension, bunker) can
produce the proof. The id is recomputed from NIP-01 serialization; strings with
control characters other than `\n \r \t \b \f` are rejected rather than guessed.
An all-zero signature is reported as `ExternalProofMissing`.

## 3. In force

`binding_in_force(signed, revocations, roster, parent_roster, at)` returns the
role only if, in order:

1. the roster verifies (quorum, succession);
2. both signatures verify;
3. the Arkhe key is a roster entry covering both `valid_from` and `at`;
4. `valid_from <= at <= valid_until`;
5. no **verified** revocation for this digest has `revoked_at <= at`.

## 4. Revocation

`BindingRevocation { binding_digest, revoked_at, reason, signer, signature }`,
digest `BLAKE3("AKG:IDBIND-REVOKE:v1\0" || CBOR(core))`, Ed25519 over
`"AKG:IDBIND-REVOKE-SIG:v1\0" || digest`. The binding's own Arkhe key or any
roster member active at `revoked_at` may revoke: revocation only removes
authority. Effective from `revoked_at`; uses before that stay attributable.
Revocations with an unknown signer, a broken signature or another digest carry
no authority and are ignored. The external key cannot revoke (open question).

## 5. Anchoring

`binding_envelope` and `revocation_envelope` produce `EvidenceEnvelope`s:
`record_hash` = binding digest (or revocation digest), `payload_digest` =
`BLAKE3("AKG:IDBIND-SIGNED:v1\0" || CBOR(signed))`, `subject` shared by every
binding of one external identity, revocation `causal_parents` = binding digest.
The MMR leaf is `SignedBinding::canonical_bytes`.

## 6. Evidence

| Check | Where |
|---|---|
| CBOR, digests and NIP-01 ids equal an independent stdlib Python reference | `scripts/generate_identity_binding_vectors.py`, `tests/identity_binding_vectors.json` |
| Deterministic signed fixtures from public TEST seeds | `examples/idbind-vectors.rs` (`--check`), `tests/identity_binding_*.json` |
| Missing/foreign/moved/tampered external proofs, Arkhe side, roster windows, binding windows, revocations, MMR inclusion | `tests/binding.rs` (9 tests) |
| Nostr event accepted by the independent `nostr` 0.44.8 crate; tampered event rejected | `integration/arkhe-p2p/tests/idbind_nostr.rs` |

```powershell
cargo test --offline --locked -p arkhe-wormgraph --test binding
cargo run --offline -p arkhe-wormgraph --example idbind-vectors -- --check
cd scripts; python generate_identity_binding_vectors.py --check
cargo test --offline --locked --manifest-path integration/arkhe-p2p/Cargo.toml --test idbind_nostr
```

## 7. Limits

- Fixtures use public TEST seeds. The governance trust registry is unprovisioned;
  no real Arkhe key exists, so no production binding was made.
- Binding the real E02 publisher (`npub16azl5…`) needs that key holder to sign
  the event template with their own Nostr signer, and a provisioned roster key.
- Times are declared, not trusted. Revocation propagation is a distribution
  question (D4/D6), not solved here.
- Adds `k256 0.13.4` (pure Rust, `schnorr`) to the main workspace lockfile.
