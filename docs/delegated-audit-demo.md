# Delegated repository audit

## Real task

Audit a clean, explicitly identified `arkhe-chain` checkout, run its complete
chain test suite, produce a report, sign a receipt, commit that receipt's digest
in a zero-value transaction, synchronize a second local node, exchange a
precommit over libp2p, reopen both snapshots, and verify the exported evidence in
a new process using public keys only.

The task was chosen because it operates on the real repository and has an
objective result. It requires no purchase, external payment or production
deployment. The chain's existing native transfer format is preserved. The
recipient `audit/<SHA-256 of receipt.json>` binds the exact signed receipt. The
delegation is evaluated by the demo executor; the chain evaluates `chain-v1` and
the transaction signatures. This distinction is part of the trust model.

## Invariants, threats, enforcement and verification

| Invariant | Threat | Enforcement | Verification |
| --- | --- | --- | --- |
| Only an authorized task, action, commit, tree, delegate and output directory may execute | Forged or broadened delegation | Authority signature and exact schema checks in `validate_grant` | Forged signature, substituted authority, other commit/tree/delegate/output, unknown action and extra command field |
| Attempts cannot exceed the signed budget | Replay, concurrency, retries after uncertain completion | SQLite immediate transaction reserves before dispatch; running tasks fail closed after restart | One-winner concurrency, restart, failed-attempt budget and completed-task replay tests |
| Cancellation and timeout stop the dispatched process | Unbounded execution | Supervisor checks before dispatch and while running, then terminates the process tree | Pre-dispatch cancellation, running cancellation and timeout tests |
| Success requires consistent gate evidence | False success or artifact substitution | Gate command, exit code, clean checkout, hashes and result totals checked before receipt | Altered log, report and signed receipt tests |
| The exact receipt is included in an authenticated ledger result | Swapped receipt, invalid transaction, forged checkpoint or invalid inclusion proof | Transaction recipient binding, public replay, proposer signature, both precommit signatures and MMR inclusion | Changed receipt digest, block, vote, missing quorum, duplicate validator keys and MMR proof tests |
| Public verification does not require execution keys | Verification tied to the executor's secret state | `verify` mode accepts the public trust root, artifacts and a trusted verifier binary | Complete exported-fixture verification without the generated private seeds |

## Reproduce

Use Python 3.10 or later, the repository's Rust toolchain, and a clean checkout.
The Python signature dependency is pinned in `scripts/requirements-demo.txt`.

```sh
python -m pip install -r scripts/requirements-demo.txt
cargo build --locked --example delegated_audit_ledger
python -B -m unittest discover -s tests -p test_delegated_audit.py -v
python -B scripts/delegated_audit.py run \
  --output ../delegated-audit-result \
  --ledger-binary target/debug/examples/delegated_audit_ledger
```

On Windows the binary name ends with `.exe`. The output directory must be fresh
and outside the checkout. The `CARGO_TARGET_DIR` environment variable is supported
by the Python tests when sharing an existing Cargo build directory.

The run writes `trust.json`, `verification.json`, the public `bundle/`, and a
`runtime/` reservation database. Private keys are generated for this controlled
demo, held in memory and not exported. `bundle/gate/manifest.json` identifies the
exact source commit and tree. The original raw log is retained, including its
line endings, and checked by SHA-256.

The operator can create `runtime/cancel` to request cancellation. The supervisor
polls every 50 milliseconds while the gate runs, terminates its process tree,
and checks cancellation again before issuing the receipt and dispatching the
ledger operation. A host crash or forced termination of the supervisor itself
is handled as an in-doubt reservation, not as a completed cancellation.

Obtain the SHA-256 of `trust.json` from the operator through a trusted channel.
Copy the public bundle and trust file to another directory, then verify them.

```sh
python -B scripts/delegated_audit.py verify \
  --bundle ../delegated-audit-result/bundle \
  --trust ../delegated-audit-result/trust.json \
  --trust-sha256 OPERATOR_PINNED_SHA256 \
  --ledger-binary target/debug/examples/delegated_audit_ledger
```

Historical verification checks the delegation at the receipt's recorded
execution time. It does not require that the original delegation remain active
when the auditor checks the exported bundle. The receipt and ledger timestamp
must still lie within that original window.

Execution requires the signed canonical output path on the execution host.
Historical verification preserves that signed string without resolving it on the
auditor's operating system. SQLite connections are explicitly closed after their
transactions, including exceptions and concurrent reservation attempts.

## Trust boundaries and limits

The authority, delegate and two validator identities are controlled by the same
experiment operator. These are separate cryptographic identities, not separate
administrative operators. The verifier implementation is a new process using
the repository's public codecs and cryptographic libraries, not an independently
implemented cryptographic stack. A pinned trust root is required; replacing all
keys and artifacts together must not establish a new trusted history.

The subprocess allowlist constrains the supervisor's entry point. It is not an
operating-system sandbox for the Rust tests or their descendants. The clean
source checkout and the verifier executable are trusted inputs. This demo does
not prove host integrity, remote attestation, or that a malicious executor could
not fabricate a signed log. It checks the consistency and authorization of the
reported evidence while executing the real command under the controlled host.

The two-node loopback run demonstrates synchronization and the current quorum
path without faults. It does not establish BFT convergence, tolerance of a
Byzantine validator, or recovery from arbitrary network partitions. Existing
directory power-loss durability and snapshot-size limits remain applicable.
Delegations and receipts use Ed25519; transaction admission also checks
ML-DSA-65. The complete workflow is not a post-quantum protocol.

After a crash, a reservation that remains `running` is intentionally in doubt
and is not automatically repeated. The operator must reconcile external state
and issue a new delegation if appropriate. The demo does not implement atomic
commit across subprocess effects, SQLite and the ledger.

## Cognitive evaluation status

| Capability | Evidence from this experiment | Remaining experiment |
| --- | --- | --- |
| Planning and tool use | External ChatGPT assistant selected and implemented the workflow; the runner dispatches a fixed action | A versioned Arkhe inference interface must generate plans for unseen tasks |
| Execution control | Deterministic executor and adversarial tests | Evaluate additional action types and operating-system isolation |
| Verifiable result | Real gate, signed receipt, state replay, quorum and inclusion checks | Independently operated witnesses and an independent verifier implementation |
| Long-horizon recovery | Reservation restart, cancellation and timeout are tested narrowly | Multi-step tasks with injected failures, measured interventions and durable recovery |
| Learning and retention | Not evaluated | Teach previously unseen rules, then measure later use and regression |
| Cross-domain transfer | Not evaluated | Reserved tasks across multiple domains, with the same model and resource budget |
| Uncertainty calibration | Not evaluated | Score confidence and false-success claims against independently graded answers |
| Added cognitive value of Arkhe | Not evaluated | Compare a fixed base model, that model with tools, and the full Arkhe system under matched budgets |

No native Arkhe model inference endpoint or reserved multi-domain evaluation set
is provided by this repository. The demo therefore reports engineering results
and leaves those cognitive measurements explicitly unevaluated. The Python unit
suite uses labeled synthetic fixtures for fault injection. Only the separate
`run` command's gate is a real source-checkout audit.

## How to audit this code

Start with `validate_grant`, `Reservations.reserve`, `run_process` and
`verify_bundle` in `scripts/delegated_audit.py`. Check the public-only replay and
certificate verification in `examples/delegated_audit_ledger.rs`. The small
public APIs added to the core expose the existing proposer preimage and public
account initialization, without changing the transaction format or quorum rule.
Inspect `tests/test_delegated_audit.py` for each negative case, then verify the
real run's commit, clean-checkout flag, signatures, log digest, receipt digest
binding, MMR proof and the separate-process verification result.
