# arkhe-network

Composition fabric for Arkhe DePIN receipts, NRAS attestation verdicts, and P2P
distribution observations. This crate is **not** a peer-to-peer network, DHT, or
libp2p stack.

Run `cargo test -p arkhe-network` from the workspace root.

## Layers

| Layer | Source | What it contributes |
| --- | --- | --- |
| DePIN receipt | `arkhe-depin` adapters | Structural `NativeReceipt` |
| NRAS port | `arkhe-depin::attestation` | Explicit `AttestationVerdict` |
| P2P observation | `arkhe-p2p` verified acquisition | Digests + publisher metadata |
| Anchor | `CompositeProof` MMR | Offline inclusion against a trusted checkpoint |

`NetworkPipeline::compose` validates each present layer, attaches hardware
evidence only when attestation is `Verified`, and anchors an `AttestedReceipt`.
`RequireAttestation::Verified` refuses compose/verify without a Verified
verdict; `Optional` still allows receipt-only (or receipt + distribution)
anchors when NRAS is `Unsupported` or `Denied`.

Publisher identity on a `DistributionObservation` is distribution metadata, not
artifact authority. Integrity of bytes and availability of peers remain distinct
properties.

## Trust limits

- No live NVIDIA NRAS client in this slice.
- No upstream DePIN signature authentication.
- No libp2p / DHT / direct peer transport.
- No slashing or kernel admission policy.

See also `arkhe-depin` and `arkhe-p2p` READMEs.
