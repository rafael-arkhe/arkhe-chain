# Targeted mutation audit: memo verification

Local experiment, not CI, exhaustive mutation coverage or a correctness proof.
Eleven selected first-order mutants were run against the nine original memo
tests. Sources were restored after every mutant, with matching before/after
SHA-256 digests for both memo_reconciliation.rs and reconciliation.rs.

## Initial observations

Eight targeted runs failed an assertion as expected. Three selected tests
continued to pass with their corresponding mutation:

| Mutation | Selected-test result | Whole original memo suite |
| --- | --- | --- |
| Bypass raw memo layer in verify | Positive matching test still passed | Existing raw-memo substitution test detected bypass |
| Remove log-index uniqueness | Malformed-ABI/duplicate-frame test still passed | Survived |
| Remove evidence byte-size bound | Invalid-profile/all-zero oversized test still passed | Survived |

The first outcome is expected: successful matching on valid inputs need not
detect removal of an attack-rejection path. This is not a missing suite test,
because the existing negative case detects that bypass. Positive tests remain
useful for compatibility/regression checking.

The other two were actual coverage gaps. Duplicating a BeforeMemo event also
violates frame cardinality, so another check masked the removed uniqueness
guard. An oversized all-zero byte string is invalid JSON, so parser rejection
masked the removed byte-size guard.

Other selected mutants covered reference-prefix derivation (a behavior regression,
not a protection removal), invoice reference comparison, derived-transfer binding,
calldata-hash validation, receipt sender, network ID, evidence profile and reported
finalized height. A test containing several assertions only demonstrates detection
of the chosen mutant, not independent discrimination of every asserted guard.

## Refinement

Two new tests were retained alongside all nine original tests:

- `duplicate_index_on_unrecognized_event_is_rejected` adds a same-emitter log
  with an unrecognized signature sharing an existing index. Frame counts remain
  unchanged, isolating index uniqueness.
- `oversized_valid_rpc_json_is_rejected_by_size_bound` extends a real valid RPC
  response with legal JSON whitespace beyond the size limit. Parsing remains
  valid, isolating the size guard.

Both tests failed when their specific guard was removed and passed on the original
source. The raw memo bypass was also rerun against the existing negative test,
which failed as expected. No production verifier changes were required; only the
test suite was strengthened.

## Retained evidence

- [Initial eleven runs and source hashes](../output/arc-memo-mutation/7250c818157a4533ac5f380301d36d09/summary.json).
- [Positive-test survivor caught by whole suite](../output/arc-memo-mutation/7250c818157a4533ac5f380301d36d09/bypass-memo-layer-on-positive-test-whole-memo-suite.log).
- [Refined targeted results and source hashes](../output/arc-memo-mutation/0299c77b084942e58c02570c2c2601d5/summary.json).
- [Uniqueness mutation failure](../output/arc-memo-mutation/0299c77b084942e58c02570c2c2601d5/skip-log-index-uniqueness.log).
- [Size-bound mutation failure](../output/arc-memo-mutation/0299c77b084942e58c02570c2c2601d5/skip-evidence-size-bound.log).
- [Restored memo suite](../output/arc-memo-mutation/0299c77b084942e58c02570c2c2601d5/restored.log).
- [Full crate suite after refinement](../output/arc-memo-mutation/0299c77b084942e58c02570c2c2601d5/full-suite.log).

The runner is `output/arc-memo-mutation/run.py`. It classifies compile failures or
missing selected tests as inconclusive, not killed mutants, and repeats the whole
memo suite for targeted survivors. Do not run it concurrently with source edits
or builds: it temporarily changes active sources and restores exact saved bytes.

This campaign does not test combined mutations, universal layer independence,
every decoder branch, external source authentication, durable storage or anchoring.
It provides finite, reproducible evidence for the selected guard/regression cases.
