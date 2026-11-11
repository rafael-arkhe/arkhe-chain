# Local inference pilot evidence — f24e619

Source commit: `f24e619dc566ab7790d9df5dcc1b4d78bb1ae95a`.
Source tree: `6a9f30fb0bf73873f0bf69c3e8e5f724f4ec4918`.
Source PR: https://github.com/rafael-arkhe/arkhe-chain/pull/11

## Observed results

- 37 Python control tests passed on the exact final source, including six new pilot tests.
- Qwen3-0.6B Q8_0 served by official llama.cpp b12282 on local CPU.
- 18 real inference requests finished, with zero transport errors.
- Explicit-rule condition: 0/6 exact successes.
- Examples-only induction: 0/6 exact successes.
- Wording transfer: 0/6 exact successes.
- Source, weights and server binary unchanged before/after the pilot.
- The server was terminated after evaluation. It is not a deployed service.

A zero pilot exit code means operational completion and identity checks passed.
It does not mean cognitive success. Exact scoring requires an integer-only
answer and finish reason `stop`. There are both reasoning errors and output
format violations. No post-hoc answer repair or changed scoring was applied.
Example: for y=2*x+1, x=5, expected 11, explicit-rule response was `5`.
For the examples 1->3, 2->5, 3->7, the model inferred x+2 and answered 7 for 5.

This is one affine task family with six items per condition. It cannot establish
broad generality, persistent learning, retention, weight updates, or cognitive
uplift due to Arkhe. The external model is not an Arkhe-trained intelligence.
The pilot does not invoke the delegated-audit ledger or seal an inference receipt.

## Attempts retained without selection

`cognitive-pilot-5628c76`: initial source
`5628c76877e1a99b7d541600b59cab6e486d7fd1`, 18 connection-refused errors.
The server/client ran in separate isolated execution sessions.

`cognitive-pilot-5628c76-live`: same initial source, co-located server/client,
18 completed requests, zero transport errors, 0/6 exact successes per condition.

`cognitive-evidence-f24e619`: final source based directly on current main,
excluding unrelated recovery changes from the PR. Identical prompts, tasks,
model, generation limits and scoring. 18 completed requests, zero transport
errors, 0/6 exact successes per condition. No protocol tuning after outcomes.

## How to audit this code

Read source `docs/cognitive-pilot.md` for invariants and limits.
Final `backend.json` records invocation, official model revision, archive hash,
binary/runtime file hashes, source commit and exit codes. `tests.log` is the raw
37-test execution. `server.log` is the final server output. The final `pilot/`
contains manifest, raw started/finished events, requests, expected labels,
responses, errors, latencies and scores. Unit-test fixtures are explicitly
synthetic and are separate from actual inference records.

Recompute each score: `finish_reason == "stop"` and
`answer.strip() == expected`. Require 18 unique starts and matching finishes.
Recompute summary file hashes. Check every summary identity flag is true.
`SHA256SUMS.json` covers original artifact bytes. Trust its values only through
the published evidence commit or another trusted copy. This is a host-generated
record, not remote attestation or an independently signed certificate.

The six new cognitive controls ran locally on the exact source. The existing
GitHub workflow does not discover those six new tests, and CI should not be
represented as live model evaluation. No new Rust logic is introduced here.
