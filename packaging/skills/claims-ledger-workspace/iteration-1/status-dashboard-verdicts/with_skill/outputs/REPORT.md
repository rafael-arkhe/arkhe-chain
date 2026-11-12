<!-- Saved by the evaluator from the run's final reply: the run's own Write was refused for report files. -->
# Claims ledger report: meshwatch status dashboard

**Verdict:** 5 claims from meshwatch/docs/spec.md: 0 enforced, 0 partial, 5 absent. 6 overclaims a viewer sees, 1 in the spec. `check` passes; table in CLAIMS.md.

## Headline findings
1. MW-04 TPM attestation shown VERIFIED with no attestation code: Attestation.tsx:5 renders a constant green "TPM 2.0: VERIFIED" (OC-1 + OC-4).
2. MW-05 "1,248 nodes online" is a literal: NodeCount.tsx:2 (OC-5).
3. MW-02 Health badge fails open: HealthBadge.tsx:4 `health?.ok ?? true` shows Healthy on fetch error, non-2xx or missing ok (OC-2); fetched once only.
4. MW-03 Pipeline shows skipped stages as passed: Pipeline.tsx:9 (OC-3).
5. MW-01 The only real check is not on the dashboard: verifyManifest() is a real Ed25519 check and ManifestBadge derives its verdict from it correctly, but Dashboard.tsx never renders it; no key source, no signing step.

## Claims
| ID | Label | State | Claim | Gap |
|---|---|---|---|---|
| MW-01 | LEMMA | absent | Manifests signed with Ed25519 and verified in the browser | Verify code exists but badge not rendered; no key source; no tests |
| MW-02 | LEMMA | absent | Health badge reflects live probes, red on failure | Fails open (?? true); fetched once; no tests |
| MW-03 | LEMMA | absent | Pipeline shows true state of each stage | Stages after failure shown passed; no tests |
| MW-04 | LEMMA | absent | Every node TPM 2.0 attested | No attestation code; constant card |
| MW-05 | LEMMA | absent | Node counter shows nodes online now | Constant 1,248 |

## Overclaims
| Where | Pattern | Fix |
|---|---|---|
| Attestation.tsx:5 | OC-1 + OC-4 | Remove the card or show "not performed" |
| NodeCount.tsx:2 | OC-5 | Bind to a live source or show "unavailable" |
| HealthBadge.tsx:4 | OC-2 | Green only on ok === true, red on false, grey Unknown otherwise |
| Pipeline.tsx:8-9 | OC-3 | Stages after first failure as "not evaluated" |
| Dashboard.tsx:15 | OC-2 (minor) | "pipeline unavailable" when the fetch fails |
| ManifestBadge.tsx:9 | OC-6 (minor; computed, not rendered) | Say "signature valid" and name the key |
| docs/spec.md:6 | OC-4 | Move TPM line to Planned |

## Not checked
No tests, no package.json: nothing built or run. /api/health server not in repo. spec.md undated.

## Next steps
1. MW-04 remove or relabel attestation before Friday. 2. MW-05 remove or bind counter. 3. MW-02 three-state badge + interval + tests. 4. MW-03 "not evaluated" + test. 5. MW-01 render ManifestBadge with pinned key; valid/tampered/wrong-key tests. 6. Add check to CI.
