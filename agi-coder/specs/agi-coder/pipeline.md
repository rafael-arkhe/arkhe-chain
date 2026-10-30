# Pipeline contract

`run_stage(intent, trusted_policy, now, worker, executor)` follows this order:

1. Admit a stable operation ID and full intent digest into the journal.
2. Return a cached receipt on exact completed replay. Reject conflicting, pending, failed, or reconciliation admissions without invoking the worker.
3. Dispatch the worker. An error may follow a remote effect, so mark ManualReconciliationRequired.
4. Verify the record and store evidence by its recomputed hash. Malformed evidence ends in Failed.
5. Apply the containment gate with exact intent/output and trust/freshness policy. Denial ends in Failed.
6. Append the authorized evidence digest to the local MMR.
7. Invoke the protected executor with the private-field authorization capability.
8. Store the receipt and mark Completed, or require reconciliation on uncertain executor failure.

The worker may create remote coding sessions but must not merge protected branches or deploy. A host-owned executor performs those effects after authorization and must enforce its own artifact and capability handling. The plan determines stage order; stage execution alone does not infer dependency satisfaction. `merge` combines caller-provided path-to-content digests and rejects inconsistent overlapping changes; it does not modify Git repositories.

All stores are single-process. The current API must not be represented as crash-safe exactly-once execution. A future adapter needs transactional admission, durable evidence and MMR updates, an outbox, and reconciliation for both remote session creation and protected effects. Terminal entries cannot be silently reset to Pending.
