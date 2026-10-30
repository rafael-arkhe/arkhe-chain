# Verification contract

Two implementations share the same acceptance rule: an independently authored specification, passing baseline, nonempty unique mutant set, valid outcomes, and a mutation score at or above a positive configured threshold.

## Finite-domain oracles

`Specification` supplies requirement text, author, and explicit integer input/expected-output cases. `Implementation` is independent executable behavior. Every baseline case must pass. A mutant is killed when at least one expected result differs or returns an error. Equivalent/surviving mutants remain in the denominator. Scores use integer basis points (0..10000), rounded down. Empty suites, empty mutant sets, duplicate mutant IDs, and equal or empty author identities are rejected.

The caller must establish real author independence; comparing strings cannot establish this. Explicit cases cover a finite domain and are not formal proof or automatic natural-language test synthesis.

## Prepared source mutation campaigns

`cargo agi verify-spec campaign.json` executes a trusted test command in each supplied snapshot directory. Example (replace absolute paths and test commands with real prepared snapshots):

```json
{
  "specification_digest": "0000000000000000000000000000000000000000000000000000000000000000",
  "specification_author": "independent-test-owner",
  "implementation_author": "coding-worker",
  "baseline": { "program": "cargo", "args": ["test", "--locked"], "working_directory": "/snapshots/baseline" },
  "mutants": [
    { "id": "invert-comparison", "test": { "program": "cargo", "args": ["test", "--locked"], "working_directory": "/snapshots/mutant-1" } }
  ],
  "timeout_milliseconds": 60000,
  "minimum_score_basis_points": 8000
}
```

Use the real independent specification digest in place of the example zeros. The runner records a canonical campaign digest so command selection is auditable. Programs execute directly without an implicit shell. Windows users should provide the actual executable (for example `node.exe` with a test script), rather than relying on shell builtins.

The baseline must exit zero before mutants run. A nonzero mutant exit counts as killed; a zero exit is a survivor. Timeout or spawn error invalidates acceptance and does not count as a kill. The CLI prints the report and exits nonzero on rejection. Logs are suppressed by this minimal runner; callers needing diagnostic artifacts should use an isolated runner adapter. Timeout kills the direct child only. Mutant preparation, immutable snapshot integrity, avoiding compile-error mutants, identical independent suites, and sandboxing remain host responsibilities.
