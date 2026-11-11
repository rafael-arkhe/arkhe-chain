# Delegated audit demonstration evidence

Source commit `52d508d6ee971f812a0a7aee3e1e1a2b6a8efb8f`.
Source tree `0ccc362673e555937395a71ad5f9a3689f8e5f26`.

The real task audits the actual clean repository, executes its chain suite, produces a report and signed receipt, binds the receipt digest in a zero-value transaction, synchronizes two local nodes over libp2p, exchanges precommits, reopens both snapshots and verifies the public export in a separate process.

| Environment | Chain tests passed | Adversarial tests passed | Failures | Ignored | Complete flow |
| --- | --- | --- | --- | --- | --- |
| Local Linux | 157 | 31 | 0 | 0 | Verified |
| GitHub Ubuntu | 157 | 31 | 0 | 0 | Verified |
| GitHub Windows | 157 | 31 | 0 | 0 | Verified |

The CI run https://github.com/rafael-arkhe/arkhe-chain/actions/runs/42955812894 completed successfully in both jobs. Artifacts were downloaded and checked against the exact source commit and tree. Their raw log digests and the 31-test adversarial result were verified. The trust pins below were also checked against CI job stdout.

| Environment | Pinned SHA-256 of trust.json |
| --- | --- |
| Local Linux | `27588de8caf4e1b42ca90b3604e3f7b5f750a6245e1206bd23ad184a0fe1276b` |
| GitHub Ubuntu | `d5f0b1998323173a806b69124e3e3b1b3f7bffab09df47e2dd761a36f41edfcd` |
| GitHub Windows | `c66ee9948103023fccc85dcad1aed3877ef5de553312923a90ca5f9ad86ca7df` |

## Public verification and fault injection

A public-only local bundle copy verified from another working directory after the original executor process ended. Appending one byte to that copy's report caused verification to fail with `receipt artifact mismatch`. The original bundle was preserved. The local reservation database recorded one completed attempt.

The Windows-produced bundle was verified again by the Linux verifier using only exported public artifacts and its pinned trust root. The result is retained in `github-windows/verified-again-in-linux.json`. This measures cross-platform evidence portability. It does not measure cognitive transfer.

Each environment directory retains the signed grant, bounded plan, signed receipt, report, raw chain test log, gate manifest, block and vote evidence, MMR proof, two binary snapshots, public trust root and verification result. Windows line endings are preserved so raw log hashes remain reproducible. Private signing seeds were generated in memory and are not exported. Runtime reservation databases are excluded from this permanent dossier.

The first Windows attempt on `69793ddd026c37385336abc58c54c3d40795d183` found five errors involving database cleanup and output-path comparison. Its unedited log is retained as `prior-windows-unit-69793dd.log`. The corrected source explicitly closes SQLite connections and preserves foreign-host signed paths during historical verification. All current results above refer to the corrected commit.

## Cognitive scope

The external ChatGPT assistant selected and implemented this fixed audit workflow. The executor itself dispatches a predetermined action. Native Arkhe model inference, learning, retention, uncertainty calibration, cross-domain generalization and matched-model cognitive benchmarks were not evaluated. `assessment.json` records this distinction explicitly.

Two validator identities share one operator. The verifier reuses the project cryptographic stack. Host integrity, OS sandboxing, remote attestation, BFT convergence and parent-directory power-loss durability remain outside the verified claims. The experiment does not certify AGI or production homologation.

## How to audit this code

Read the source, invariants, threat model and reproduction commands at https://github.com/rafael-arkhe/arkhe-chain/blob/52d508d6ee971f812a0a7aee3e1e1a2b6a8efb8f/docs/delegated-audit-demo.md.

Check each gate manifest's source commit/tree and unchanged-checkout flag, hash its raw log, verify the grant and receipt signatures with the pinned public trust root, and invoke the public verifier on the corresponding bundle. This evidence branch is based on the prior main commit and adds evidence files only, so publishing evidence does not change the tested source commit.
