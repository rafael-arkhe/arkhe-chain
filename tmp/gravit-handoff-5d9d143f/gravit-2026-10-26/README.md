# Arkhe / Gravit initial cross-check — 26 October 2026

Status: local, frozen primitive comparison. **144/144 results agree**, plus nine
noncryptographic record-screening comparisons. No Gravit executable or module was
imported or run. This is not a completed independent reproduction of the 54 full
Gravit decisions, nor a published interoperability agreement.

## Evidence

- 22 Arkhe exchange cases: 10 RFC 6962 inclusion cases, four Ed25519 cases,
  eight proposed witness quorum cases. Positive and negative verdicts are included.
- 118 evidence signature checks extracted from registry-enabled golden cases.
- Three detached registry root signatures, using the upstream test trust root.
- One hosted tree-head signature, size 14, written at 2026-10-26T12:58:35Z.
- Nine pre-signature exclusion comparisons match the upstream expected reasons.

The signature checks do not reproduce the semantic status, convergence metrics,
freshness rules, decision ID or full expected output of the 54 golden vectors.
The root-key threshold and registry validation are not claimed as fully reproduced
by checking its three individual signatures.

## Pinned sources

- [Gravit verifier](https://github.com/gravit-open-network-foundation/verifier/tree/6b2ecbabd098c9a381b0b08184703905c3cb8275/tests/golden)
- [Hosted publisher](https://github.com/gravit-open-network-foundation/gravit-verifier-service/blob/f97aee7df270f8abcff8e794529d86cd6706d555/private/publish_log.py)
- [Hosted proof endpoint](https://github.com/gravit-open-network-foundation/gravit-verifier-service/blob/f97aee7df270f8abcff8e794529d86cd6706d555/public/index.php)
- [Captured head](https://gravitverifier.space/log/latest.json) and
  [captured key](https://gravitverifier.space/api/v1/service-key).

The workspace has no `.git` directory. `manifest.json` pins the local runner,
the actual RFC 6962 implementation, Cargo manifests/lockfile, exchange files and
captured source bytes by SHA-256. This is a byte-level snapshot, not a signed
attestation or a claim of a known Arkhe Git revision. Upstream code and fixtures
retain their original Apache-2.0 licensing; see `upstream/LICENSE`.

## Reproduce

From the Arkhe workspace, with its locked Rust dependencies available:

```powershell
python verification/interop/gravit-2026-10-26/verify.py
```

This checks hashes and runs the example linked to Arkhe's actual core crate.
It compares fresh results against both expected verdicts and frozen results.
Cargo may need dependency downloads on a clean machine. `prepare.py` documents
the original fixture preparation (Python cryptography 50.0.1); do not regenerate
fixtures as part of an independent comparison. Use SPEC.md and frozen vectors
to implement the other reader before looking at frozen results.

## Remaining work

The public latest head contains no leaf or inclusion path. The published service
route `/api/v1/log/proof/{entry_hash}` requires an authenticated account and a receipt
belonging to that account. A public exported leaf/path fixture against this head
would allow Arkhe to complete the inclusion test without an account. Until then,
the actual hosted inclusion proof is **not tested**. No account was created.

Also pending: full independent decision reader for all 54 golden cases; RFC 3161
verification; independent confirmation of service key and operator independence;
public Git pinning of this exchange set; Gravit's frozen reader outputs.

No email or mailing-list message has been sent.
