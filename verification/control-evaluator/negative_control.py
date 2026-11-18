#!/usr/bin/env python3
"""
Negative control for the Foundry -> ARKHE control-evaluator adapter.

A gate that cannot say EXCLUDED for the right reason is not a gate. This
builds synthetic `forge test --json` payloads, drives the adapter with each,
and asserts the verdict. Run it against the 0.2 adapter alone, or against a
0.1 baseline too to see the three fail-open holes close.

    python negative_control.py --adapter foundry_evaluator_adapter.py \\
        --assessment path/to/assessment.json [--baseline path/to/0.1.py]

Exit 0 only if every expectation holds for the adapter under test.
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

UTC = datetime.timezone.utc


def iso(dt):
    return dt.replace(microsecond=0).isoformat()


def build_forge(tests, skip=(), fail=(), rename=None):
    """Synthetic forge output. skip/fail are test ids; rename=(test_id, suffix)."""
    suites = {}
    for t in tests:
        f = t["file"]
        key = f + ":" + os.path.basename(f).split(".")[0] + "Test"
        suite = suites.setdefault(key, {})
        if t["id"] in skip:
            continue
        fn = t.get("function") or f"test_synthetic_{t['id'].replace('-', '_')}"
        if rename and t["id"] == rename[0]:
            fn = fn + rename[1]
        suite[fn + "()"] = {"status": "Failure" if t["id"] in fail else "Success"}
    return {k: {"test_results": v} for k, v in suites.items() if v}


class Runner:
    def __init__(self, adapter, assessment, tmp, label):
        self.adapter, self.tmp, self.label = adapter, tmp, label
        with open(assessment, encoding="utf-8") as fh:
            self.A = json.load(fh)
        os.makedirs(tmp, exist_ok=True)

    def run(self, tag, forge_obj=None, mutate=None, extra=(), raw_forge=None):
        a = json.loads(json.dumps(self.A))
        if mutate:
            mutate(a)
        slug = f"{self.label}_{tag}"
        apath = os.path.join(self.tmp, f"a_{slug}.json")
        with open(apath, "w", encoding="utf-8") as fh:
            json.dump(a, fh)
        cmd = [sys.executable, "-I", self.adapter, "--assessment", apath,
               "--out", os.path.join(self.tmp, f"o_{slug}.json")]
        if forge_obj is not None or raw_forge is not None:
            fpath = os.path.join(self.tmp, f"f_{slug}.json")
            with open(fpath, "w", encoding="utf-8") as fh:
                if raw_forge is not None:
                    fh.write(raw_forge)
                else:
                    json.dump(forge_obj, fh)
            cmd += ["--forge-json", fpath]
        cmd += list(extra)
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode not in (0, 2):
            return f"CRASH(exit {p.returncode})", p.stderr.strip().splitlines()[-1:]
        get = lambda k: next((l.split(":", 1)[1].strip()
                              for l in p.stdout.splitlines() if l.startswith(k)), "")
        return get("verdict:"), get("reasons:")


def scenarios(A, commit, fresh, stale):
    """Each: (tag, forge, mutate, v2_extra_args, expect_v1, expect_v2, why)."""
    tests = A["tests"]
    clear = lambda a: a["coverage"].__setitem__("undetermined", [])
    ok = build_forge(tests)
    bind = ["--evidence-commit", commit, "--evidence-produced-at", fresh]

    def break_covers(a):
        clear(a)
        a["tests"][0]["covers"] = ["INV-DOES-NOT-EXIST"]

    return [
        ("sanity_admit", ok, clear, bind,
         "ADMITTED", "ADMITTED", "the gate must be able to say yes"),
        ("shipped", ok, None, bind,
         "EXCLUDED", "EXCLUDED", "coverage.undetermined present"),
        ("failing_test", build_forge(tests, fail=("T-REENTRANCY",)), clear, bind,
         "EXCLUDED", "EXCLUDED", "a bound test failed"),
        ("missing_test", build_forge(tests, skip=("T-ACCOUNTING-INV",)), clear, bind,
         "EXCLUDED", "EXCLUDED", "a bound test is absent"),
        ("no_evidence", None, clear, bind,
         "EXCLUDED", "EXCLUDED", "no forge output at all"),
        # --- the three fail-open holes ---
        ("hole1_renamed_test", build_forge(tests, rename=("T-AUTH-ROLLBACK", "Disabled")),
         clear, bind,
         "ADMITTED", "EXCLUDED", "HOLE 1: prefix match credits a renamed test"),
        ("hole2_stale_evidence", ok, clear,
         ["--evidence-commit", commit, "--evidence-produced-at", stale],
         "ADMITTED", "EXCLUDED", "HOLE 2: evidence older than the TTL"),
        ("hole3_no_commit", ok, clear, ["--evidence-produced-at", fresh],
         "ADMITTED", "EXCLUDED", "HOLE 3: evidence not bound to any commit"),
        ("hole3_wrong_commit", ok, clear,
         ["--evidence-commit", "0" * 40, "--evidence-produced-at", fresh],
         "ADMITTED", "EXCLUDED", "HOLE 3: evidence from the wrong tree"),
        # --- extras closed in 0.2 ---
        ("covers_disagree", ok, break_covers, bind,
         "ADMITTED", "EXCLUDED", "tests[].covers contradicts bound_tests"),
        # 0.1 raises JSONDecodeError here: it produces no verdict and no output
        # file. Nonzero exit makes that safe in a CI that gates on exit code,
        # and a hard error in one that parses the verdict. 0.2 fails closed.
        ("malformed_forge", None, clear, bind,
         "CRASH", "EXCLUDED", "unparseable forge output (0.1 crashes)"),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--baseline", help="0.1 adapter, to show the holes")
    ap.add_argument("--assessment", required=True)
    ap.add_argument("--tmp", default=os.path.join(os.path.dirname(__file__), ".negctl"))
    args = ap.parse_args()

    with open(args.assessment, encoding="utf-8") as fh:
        A = json.load(fh)
    commit = A["boundary"]["source_commit"]
    now = datetime.datetime.now(UTC)
    fresh = iso(now - datetime.timedelta(hours=1))
    stale = iso(now - datetime.timedelta(days=30))
    raw_bad = "warning: something\nnot json at all {{{"

    new = Runner(args.adapter, args.assessment, args.tmp, "new")
    old = Runner(args.baseline, args.assessment, args.tmp, "old") if args.baseline else None

    print(f"assessment: {len(A['tests'])} tests, {len(A['invariants'])} invariants")
    print(f"binding commit: {commit}")
    print(f"{'scenario':<22} {'baseline 0.1':<14} {'adapter 0.2':<14} verdict")
    print("-" * 78)

    failures = []
    for tag, forge, mutate, extra, exp1, exp2, why in scenarios(A, commit, fresh, stale):
        raw = raw_bad if tag == "malformed_forge" else None
        v2, r2 = new.run(tag, forge, mutate, extra, raw_forge=raw)
        if old:
            # 0.1 has none of the provenance flags
            v1, _ = old.run(tag, forge, mutate, (), raw_forge=raw)
        else:
            v1 = "-"
        match1 = v1.startswith("CRASH") if exp1 == "CRASH" else v1 == exp1
        good = (v2 == exp2) and (not old or match1)
        if not good:
            failures.append(f"{tag}: got 0.1={v1} 0.2={v2}, expected {exp1}/{exp2}")
        mark = "ok  " if good else "FAIL"
        print(f"{tag:<22} {v1:<14} {v2:<14} [{mark}] {why}")
        if v2 == "EXCLUDED" and r2:
            print(f"{'':<22} {'':<14} {'':<14}        reasons: {r2}")

    print("-" * 78)
    if failures:
        print(f"{len(failures)} FAILURES")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("every expectation held")
    if old:
        print("the three holes are open in 0.1 and closed in 0.2")
    sys.exit(0)


if __name__ == "__main__":
    main()
