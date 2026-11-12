<!-- Saved by the evaluator from the run's final reply (runs were told to report in the reply). -->
# tinyqueue: README claims gate

Added: claims.json (5 claims, anchor evidence), CLAIMS.md, tools/claims_ledger.py (vendored checker), and a CI step after pytest:
    - name: Claims ledger
      run: python3 tools/claims_ledger.py check
Verified on a scratch copy: renaming run_with_retry -> FAIL C-02, exit 1; deleting tests/test_queue.py -> FAIL C-01, C-03, exit 1. Real repo: OK enforced 1, partial 2, absent 2; pytest 4 passed.

| ID | State | Claim | Gap |
|---|---|---|---|
| C-01 | enforced | FIFO job queue with push() and pop(). | — |
| C-02 | partial | Automatic retries with exponential backoff for failing jobs. | Queue never calls run_with_retry |
| C-03 | partial | Duplicate jobs (same id) are dropped. | Only pending ids are deduplicated |
| C-04 | absent | Jobs are persisted to disk and survive restarts. | No persistence code |
| C-05 | absent | Thread-safe. | No lock; racy id check |

Limits: the gate is green today although two README features are absent (it catches drift, not already-absent claims); it does not read the README, so a new bullet is uncovered until added to claims.json; anchors prove the symbol exists, tests prove behaviour.
