# Interrupted audit recovery evidence

Source commit `ebbecaa4cbf83641837526c85d89a8d874d90fab`.
Source tree `dc5919e849eb14bbe8a5397706d0797304eebf23`.

This step adds `reconcile`, which verifies an already published result and closes its existing reservation. The operation validates the signed grant, receipt, artifact hashes, state replay, certificate and MMR proof, then matches the exact reserved delegation and signed attempt budget in an immediate SQLite transaction. Repeated reconciliation is idempotent. Successful completion is terminal.

| Environment | Chain tests | Control tests | Failures | Ignored | Real audit and recovery exercise |
| --- | --- | --- | --- | --- | --- |
| Local Linux | 157 | 42 | 0 | 0 | Passed |
| GitHub Ubuntu | 157 | 42 | 0 | 0 | Passed |
| GitHub Windows | 157 | 42 | 0 | 0 | Passed |

CI run https://github.com/rafael-arkhe/arkhe-chain/actions/runs/42959105301 completed successfully in both jobs. The artifacts were downloaded, raw hashes checked, and both public bundles verified again in Linux. The trust pins in `metadata.json` were checked against the respective CI job stdout.

## What was exercised

An actual child process committed a reservation, signaled readiness and was abruptly killed. Opening the same database in another process refused a replay. This is a process-crash test, not a power-loss test.

The completion window after ledger publication was modeled separately. A complete real audit output was copied, and only its copied reservation was set to `running`. The normal reconciliation CLI changed it to `completed` while preserving one attempt. The second CLI invocation returned `reservation_changed=false`. All ten public artifacts, including the block, signatures and snapshots, retained their hashes. The original run was preserved. Each environment's `reconciliation/summary.json` identifies the injection precisely and records the original artifact hashes.

The 42 control tests include missing/altered evidence, another reservation or delegation, invalid attempt counts, an identity swap after verification, terminal-state safety, idempotency, CLI operation, process death, cancellation, timeout and the existing authorization/quorum/proof cases. Their synthetic artifact fixtures are labeled in the test code. The real audit's 157-test receipt and the separate 42-test control log have distinct provenance; the receipt binds the chain gate, while the CI artifact and this dossier preserve the control log.

The new reconciler also recovered a copied real bundle produced by source commit `52d508d6ee971f812a0a7aee3e1e1a2b6a8efb8f`. See `older-bundle-compatibility/` and the prior delegated-audit dossier for that bundle's original public artifacts. This tests compatible historical verification without the old signing keys.

## Records

Each environment retains its signed grant, plan, receipt, report, raw gate log, manifest, ledger evidence, public trust root, binary snapshots, public verification and first/second reconciliation results. Runtime reservation databases are excluded from this permanent dossier. The exercise is reproducible using the documented helper. Windows raw file bytes and line endings are preserved. Windows summary artifact names use the producer's path syntax; the Linux recheck interpreted those names as Windows paths while checking the original bytes.

## Scope

The original audit action is not dispatched by reconciliation. Tests assert that both reconciliations call only the ledger's public `verify` operation. Host integrity and the verifier executable remain trusted. This does not establish atomic commit across external effects, SQLite and the ledger. Incomplete evidence remains in doubt and needs operator review.

The planner remains external ChatGPT and the executor dispatches a fixed action. Native model inference is not configured in this repository. Learning, retention, uncertainty calibration, matched-model baselines and cognitive generalization remain unevaluated. Two validator identities share one operator, and BFT convergence, OS sandboxing and parent-directory power-loss durability remain outside the verified claims.

## How to audit this code

Read the exact source and reproduction steps at https://github.com/rafael-arkhe/arkhe-chain/blob/ebbecaa4cbf83641837526c85d89a8d874d90fab/docs/delegated-audit-demo.md. Inspect `reconcile_task`, `Reservations.complete_verified` and the terminal/idempotent behavior of `finish`. Check `scripts/exercise_reconciliation.py` and the corresponding tests, then compare every artifact digest with the summaries. The evidence branch adds records only to the prior main tree and does not alter the tested source.
