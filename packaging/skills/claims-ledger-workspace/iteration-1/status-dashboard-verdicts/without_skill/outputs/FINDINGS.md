<!-- Saved by the evaluator from the run's final reply: the run's own Write was refused for report files. -->
# meshwatch: what the dashboard actually computes

Very little of what the meshwatch dashboard shows is actually computed. The one real check isn't on the dashboard, and the other four can't show a failure.

| # | Spec claim | Reality | Evidence |
|---|---|---|---|
| 1 | Release manifest verified in the browser (Ed25519) before the Manifest badge turns green | Real check, not on the dashboard | lib/verify.ts does a WebCrypto Ed25519 check; ManifestBadge.tsx is correct, but Dashboard.tsx never renders it and nothing loads a manifest, signature or key. |
| 2 | Health badge reflects live checks, red on any failure | Green when it can't tell | HealthBadge.tsx:4 `const ok = health?.ok ?? true;` shows Healthy on network error, non-2xx, bad JSON, missing ok, or loading. Fetched once, not live. |
| 3 | Pipeline view shows true state of each stage | Turns failures into passes | Pipeline.tsx:8-9 relabels every stage after the first failure as 'passed'; the comment says they were skipped. |
| 4 | Every node TPM 2.0 attested before joining | Fixed text | Attestation.tsx always renders "TPM 2.0: VERIFIED" with no inputs. |
| 5 | Node counter shows nodes online now | Fixed text | NodeCount.tsx returns the literal "1,248". |

Fixes: label or remove attestation and node count for the demo; health badge grey "Unknown" or red unless ok === true, refresh on a timer; remove the pipeline relabelling and add a "skipped" status; render the Manifest badge wired to a real manifest, signature and pinned key; feed node count and attestation from real data (/api/nodes, per-node attestation records).
