# Control-evaluator adapter 0.2

Binds `forge test --json` output to an `arkhe.control-evaluator/0.1` assessment
and emits a fail-closed `ADMITTED` / `EXCLUDED` verdict.

```bash
python negative_control.py --adapter foundry_evaluator_adapter.py \
    --assessment path/to/assessment.json [--baseline path/to/0.1.py]
```

Exit 0 only if every expectation holds.

## Why 0.2 exists

0.1 was audited by negative control: synthetic `forge` payloads driven through
the gate to see whether it refuses for the right reason. It refused correctly
on a failing test, a missing test, no evidence at all, and a non-empty
`coverage.undetermined` — the core gating was real. Four defects were not.

| # | Defect in 0.1 | 0.1 verdict | 0.2 verdict |
|:--|:--|:--|:--|
| 1 | `lookup()` resolved bound tests with `name.startswith(fn)`, so renaming a bound test to any longer name kept the binding green | `ADMITTED` | `EXCLUDED` `untested_invariant` |
| 2 | `expires_at` was written and never compared; `produced_at` was the evaluation time, not the run time | `ADMITTED` | `EXCLUDED` `evidence_expired` |
| 3 | `source_commit` and `boundary` appeared **0×** in the file — evidence was never tied to the audited tree | `ADMITTED` | `EXCLUDED` `commit_unbound` / `commit_mismatch` |
| 4 | malformed `forge` output raised `JSONDecodeError` | crash, exit 1 | `EXCLUDED` `no_execution_evidence` |

Defect 1 is the sharp one. A test renamed to `test_fooDisabled` still
satisfied a binding on `test_foo`, so evidence was credited to a test that no
longer existed, and the verdict flipped to `ADMITTED`.

Defect 3 is the broadest: a `forge` run from *any* tree was accepted against
*any* assessment, including a tree where the problem had been removed from the
test rather than from the contract.

Also closed: `tests[].covers` was declared on every test and never read, so the
two binding directions could drift apart silently. 0.2 cross-checks them and
reports `binding_inconsistent`.

## What 0.2 requires that 0.1 did not

- `--evidence-commit <sha>` when ingesting with `--forge-json`. It must equal
  `boundary.source_commit` or `boundary.snapshot_commit`.
- `--run-forge REPO_DIR` reads the commit from `git HEAD` itself and refuses a
  dirty worktree, since a commit does not describe a tree with uncommitted
  changes on top of it.
- A production time for the evidence: `--evidence-produced-at`, else the
  `forge` file's mtime. It is compared against `--ttl-hours` (default 168).

## Reported but not blocking

A threat whose `mitigated_by` names no invariant can never be falsified by any
test, so `bypass_confirmed` can never fire for it. In the StakedHypeEscrow
assessment that is `TH-OVERFLOW` (listing only `ENF-*` ids) and
`TH-PAUSE-GRIEF` (empty). This is reported as an `ungated_threat` event but
does not block by default, because an accepted residual risk is a legitimate
state. `--strict-threats` makes it block unless the threat carries
`"accepted_residual": true` — silence blocks, explicit acceptance passes and is
then visible inside the signed `construction_root`.

Separately, the schema references 13 `ENF-*` enforcement ids and defines none
of them. Nothing binds an `ENF-*` id to code or to a test.

## What no version of this can fix

The verdict rests on `coverage.undetermined`, which the author writes by hand.
Emptying it yields `ADMITTED` with no new evidence — that is scenario
`sanity_admit` in the negative control, and it is how the gate is *supposed* to
work. No code here can detect an undetermined item that was never declared.
The gate is worth exactly as much as the honesty of that list.

`construction_root` makes the finished document tamper-evident, not true. It is
a SHA-256 over the canonical assessment with the root field removed; changing
any byte breaks it. It says nothing about whether the claims were right.
