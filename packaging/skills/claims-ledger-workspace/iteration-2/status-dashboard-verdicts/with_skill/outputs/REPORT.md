<!-- Saved by the evaluator from the run's final reply (runs were told to report in the reply). -->
# Claims ledger report: meshwatch status dashboard

**Verdict:** 7 claims from docs/spec.md: 0 enforced, 4 partial, 3 absent. 4 overclaims on the dashboard. `claims_ledger.py check` prints OK.

## Headline findings
1. C-06 (LEMMA) absent: TPM attestation is fiction. Attestation.tsx:5 always renders green "TPM 2.0: VERIFIED"; no attestation code anywhere.
2. C-07 absent: NodeCount.tsx:2 prints literal 1,248.
3. C-04 partial: HealthBadge.tsx:4 `health?.ok ?? true` is green on network error, non-2xx, missing ok, or loading.
4. C-05 partial: Pipeline.tsx:9 rewrites every stage after the first failure to "passed".
5. C-03 partial: health fetched once, no probes in repo.
6. C-01 absent / C-02 partial: verify.ts is a real Ed25519 check and ManifestBadge reflects it, but Dashboard.tsx never renders it; no key pinning; nothing signs manifests.

| ID | State | Claim | Gap |
|---|---|---|---|
| C-01 | absent | Release manifests are signed with Ed25519. | Nothing signs manifests |
| C-02 | partial | Manifests are verified in the browser before the badge turns green. | No tests; badge not rendered; no key pinning |
| C-03 | partial | Health badge reflects live probes. | No probe code; single fetch; no tests |
| C-04 | partial | Health badge turns red when any probe fails. | Fails open; no tests |
| C-05 | partial | Pipeline view shows the true state of each stage. | Skipped stages shown passed; no tests |
| C-06 | absent | Every node is TPM 2.0 attested. | No attestation code |
| C-07 | absent | Node counter shows nodes online now. | Literal 1,248 |

## Overclaims (4)
| Where | Pattern | Fix |
|---|---|---|
| Attestation.tsx:5 | OC-4 (+OC-1) | Remove or "Attestation: not performed" |
| NodeCount.tsx:2 | OC-5 | Bind to live source or "unavailable" |
| HealthBadge.tsx:4 | OC-2 | Green only when health?.ok === true; grey Unknown otherwise |
| Pipeline.tsx:9 | OC-3 | Stages after first failure "not evaluated" |

**Wording notes (not overclaims):** ManifestBadge.tsx:9 "Manifest: VERIFIED" is computed (can show red/grey); "signature valid" would be more precise without a pinned key.

## Not checked
No tests or package.json; /api/health backend not in repo; spec undated.

## Next steps
1. C-06 remove/relabel before Friday. 2. C-07 real count or "unavailable". 3. C-04/C-03 grey unknown, polling, tests. 4. C-05 "not evaluated" + test. 5. C-02/C-01 mount ManifestBadge with pinned key; valid/tampered/wrong-key tests; signing step. 6. Optional CI check.
