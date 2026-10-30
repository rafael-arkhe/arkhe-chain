# Round 2 — complete decision comparison

**54/54 complete DecisionRecords agree**, including final state, status, all
convergence metrics, evidence exclusions, registry/trust-root digests, reasons,
trace fields and RFC 8785/SHA3-256 decision IDs. **17 security controls pass.**
The original round's 144 Rust primitive results still reproduce unchanged.

## What was implemented

`reader.py` is a separate local implementation of record screening, connected
component source grouping, worst-theta representatives, convergence, freshness,
signed results and decision composition. It authenticates the registry against
the pinned test trust root and enforces the three-of-five majority before use.
`decision_ids.mjs` uses ECMAScript number serialization and UTF-16 key ordering.
`compare.py` evaluates requests with expected outputs removed, freezes the
outputs, and compares every field against the pinned 54-vector corpus.

The implementation does **not** import or execute the Gravit modules. Python's
cryptography library verifies signatures in this reader; the first round separately
checks the extracted signatures using Arkhe's Rust/ed25519-dalek runner.

This is **source-informed compatibility evidence**, not a blind or clean-room
reimplementation from prose alone. Golden outputs were visible during development;
the pinned upstream kernel was reviewed to resolve the definition of f and exact
composition/trace formatting. Freeze-before-compare for a future Gravit reader of
Arkhe's exchange vectors remains a separate step. No upstream library was run.

## Reproduce offline

Requirements: Python 3 with `cryptography==50.0.1`, and Node.js with SHA3-256 support.
No network or API key is needed when those dependencies are installed.

```powershell
python verification/interop/gravit-2026-10-26/round2/verify.py
```

Inside a complete Arkhe workspace, also rerun the original Rust checks:

```powershell
python verification/interop/gravit-2026-10-26/round2/verify.py --with-arkhe
```

The verifier validates `manifest.json` before execution, compares fresh decisions
with the frozen decisions and upstream expected outputs, and runs 17 controls.
The controls exercise signature quorum, repeated/unknown signers, threshold types,
tampering, replay, connected components, time boundaries, output injection,
comparison non-vacuity and the text/compatibility distinction.

`initial-reader.txt`, `initial-decisions.json` and `initial-comparison.json` preserve
the first draft of this round. Its assumption that f counted theta < 0.3 was
incorrect; source review established theta < 0.5. The final implementation fixes
that local mistake. The draft is not a separate conformance result.

## Text/implementation difference to discuss

The public signed-result text and CANON-RES-012 say two independent supporting
sources are required. In `two_keys_one_operator`, both signed records report true
but represent one operator. The golden output has `supporting_sources: 1` with
`constraint_ok: true` for RES-012. The implementation only fails for insufficient
support when at least one record has no verdict, or when a contradiction exists.

Our `strict-text` profile marks RES-012 false in this case; the compatibility
profile marks it true. This is the **only compared semantic-field difference**
under the final strict profile. Both profiles reach Probabilistic Assessment /
DEGRADED because SIG-011 independently caps the decision. This is an explanatory
consistency question, not evidence that the case can reach Verified Fact.

See `comparison.json` for the complete results and preserved difference; the
question is written in `email-draft.txt` without claiming a security bypass.

## Hosted inclusion remains pending

A read-only request to the documented proof route without credentials returned
HTTP 401. `proof-endpoint-response.json` records it. The all-zero hash in that
request is a route probe, not an asserted receipt or inclusion proof. The pinned
public head contains no leaf or path. The publisher defines each leaf's raw bytes
as the 32-byte decoded receipt entry_hash before Merkle leaf hashing.

Completion requires a public exported leaf/path fixture against a pinned signed
head, or an explicitly authorized service account and receipt. No account was
created, no email was sent, and no public repository was changed. RFC 3161 token
validation and real-world operator/key identity checks remain outside this round.

The first round's manifest and outputs are unchanged. This round adds its own
manifest rather than replacing the original freeze. New upstream files retain
Apache-2.0 licensing (`../upstream/LICENSE`); the captured Internet-Draft includes
its own IETF Trust copyright and license notice. The local reader and scripts are
offered under the Arkhe workspace's MIT OR Apache-2.0 licensing.
