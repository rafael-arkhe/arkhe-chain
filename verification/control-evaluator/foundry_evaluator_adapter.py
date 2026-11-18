#!/usr/bin/env python3
"""
Foundry -> ARKHE control-evaluator adapter.  Adapter version 0.2.

Runs (or ingests) `forge test --json`, binds each result to the assessment's
invariants, writes SHA-256'd evidence, and emits a FAIL-CLOSED verdict:

    ADMITTED  iff  every invariant has a bound, PASSING, UNEXPIRED test
               AND the evidence is bound to the audited commit
               AND the two binding directions agree
               AND coverage.undetermined is empty
               AND construction_root is computed.
    EXCLUDED  otherwise.

The evaluator checks STRUCTURE and EVIDENCE. It does not run the EVM --
Foundry produces the evidence, this binds and gates it.

-----------------------------------------------------------------------------
WHAT 0.2 FIXES

Three fail-open holes in 0.1, each demonstrated by negative control before and
after (see negative_control.py):

1. PREFIX MATCHING CREDITED EVIDENCE TO THE WRONG TEST.
   0.1 resolved a bound function with `name.startswith(fn)`. Renaming the
   bound test to any longer name -- `test_fooDisabled` -- kept the binding
   green although the named test no longer existed, and the verdict flipped
   to ADMITTED. 0.2 matches the function base name EXACTLY. A bound test that
   is renamed or deleted now reads as missing, which blocks.

2. THE TTL WAS COMPUTED AND NEVER ENFORCED.
   0.1 wrote `expires_at` into every evidence row and never compared it to
   anything, and stamped `produced_at` with the time of EVALUATION rather than
   the time of the test run. Ingesting a year-old forge JSON therefore
   produced evidence that looked minutes old. 0.2 enforces the TTL and takes
   the production time from the run itself: `now()` when it runs forge, the
   forge file's mtime when ingesting, or an explicit --evidence-produced-at.
   Expired evidence reads as `expired`, which blocks.

3. NOTHING TIED THE EVIDENCE TO THE AUDITED COMMIT.
   The strings `source_commit` and `boundary` did not appear in 0.1 at all, so
   a forge run from any tree was accepted against any assessment -- including
   a tree where the problem was removed from the TEST rather than the
   contract. 0.2 requires the evidence commit to match boundary.source_commit
   or boundary.snapshot_commit: read from git HEAD under --run-forge (which
   also refuses a dirty worktree), or asserted with --evidence-commit when
   ingesting. Unbound or mismatched evidence blocks.

Also closed: `tests[].covers` was declared on every test and never read, so
the two binding directions could silently disagree. 0.2 cross-checks them.

NOT CHANGED, DELIBERATELY: a threat whose `mitigated_by` names no invariant
(e.g. one listing only ENF-* ids, or an empty list) is still not a blocker by
default, because an accepted residual risk is a legitimate state. It is now
reported, and --strict-threats turns it into a blocker unless the threat
carries `"accepted_residual": true`. Silence blocks; explicit acceptance
passes and is visible inside the signed construction_root.

STILL TRUE AFTER 0.2: the verdict rests on `coverage.undetermined`, which the
author writes by hand. Emptying it yields ADMITTED with no new evidence. No
code in this file can detect an undetermined item that was never declared.

Usage:
    python foundry_evaluator_adapter.py --assessment a.json \\
        --forge-json out.json --evidence-commit <sha> [--ttl-hours 168]
    python foundry_evaluator_adapter.py --assessment a.json --run-forge REPO_DIR

Produce forge evidence with:
    forge test --json > out.json
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

ADAPTER_VERSION = "0.2"


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def iso(dt):
    return dt.astimezone(datetime.timezone.utc).replace(microsecond=0).isoformat()


def sha256_hex(b):
    return "sha256:" + hashlib.sha256(b).hexdigest()


# ---------------------------------------------------------------------------
# Evidence provenance: when the tests actually ran, and against what tree.
# ---------------------------------------------------------------------------
class Provenance:
    def __init__(self, produced_at, commit, commit_source, dirty=None):
        self.produced_at = produced_at
        self.commit = commit
        self.commit_source = commit_source
        self.dirty = dirty

    def as_dict(self):
        return {
            "produced_at": iso(self.produced_at),
            "commit": self.commit,
            "commit_source": self.commit_source,
            "worktree_dirty": self.dirty,
        }


def git(repo_dir, *args):
    p = subprocess.run(["git", "-C", repo_dir, *args],
                       capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 else None


def run_forge(repo_dir):
    """Run forge test --json in repo_dir. Returns (json_text, provenance, note)."""
    head = git(repo_dir, "rev-parse", "HEAD")
    porcelain = git(repo_dir, "status", "--porcelain")
    dirty = bool(porcelain) if porcelain is not None else None
    try:
        p = subprocess.run(["forge", "test", "--json"], cwd=repo_dir,
                           capture_output=True, text=True, timeout=3600)
        out = p.stdout.strip()
        if not out:
            return None, None, (f"forge produced no JSON (exit {p.returncode}): "
                                f"{p.stderr[:300]}")
        prov = Provenance(now(), head, "git HEAD of --run-forge repo", dirty)
        return out, prov, f"forge exit {p.returncode}"
    except FileNotFoundError:
        return None, None, "forge not installed in this environment"
    except Exception as e:  # noqa: BLE001
        return None, None, f"forge run failed: {e}"


def parse_forge(json_text):
    """forge test --json -> {file_path: {fn_base_name: [status, ...]}}.

    Tolerates a non-JSON preamble (warnings, compiler chatter) by starting at
    the first '{'. Returns None if the payload cannot be parsed at all, so a
    malformed run fails closed instead of raising.
    """
    start = json_text.find("{")
    if start < 0:
        return None
    try:
        data = json.loads(json_text[start:])
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    suites = {}
    for suite_key, suite in data.items():
        file_path = suite_key.split(":", 1)[0]
        results = (suite or {}).get("test_results", {}) or {}
        fns = suites.setdefault(file_path, {})
        for test_name, res in results.items():
            # "testFuzz_bar(uint256)" -> "testFuzz_bar"; overloads collapse and
            # every overload must pass.
            base = test_name.split("(", 1)[0]
            fns.setdefault(base, []).append((res or {}).get("status", "Unknown"))
    return suites


def lookup(suites, file_path, fn):
    """'pass' | 'fail' | 'missing' for a bound test. EXACT name matching."""
    suite = suites.get(file_path)
    if suite is None:
        return "missing"
    if fn:
        statuses = suite.get(fn)          # exact base-name match, no prefixes
        if statuses is None:
            return "missing"
        return "pass" if all(s == "Success" for s in statuses) else "fail"
    if not suite:
        return "missing"
    every = [s for sts in suite.values() for s in sts]
    return "pass" if every and all(s == "Success" for s in every) else "fail"


# ---------------------------------------------------------------------------
def check_commit_binding(assessment, prov):
    """Returns (ok, reason_or_None, detail)."""
    boundary = assessment.get("boundary", {}) or {}
    accepted = [c for c in (boundary.get("source_commit"),
                            boundary.get("snapshot_commit")) if c]
    if not accepted:
        return False, "commit_unbound", "assessment declares no commit to bind to"
    if prov is None or not prov.commit:
        return False, "commit_unbound", (
            "evidence carries no commit; pass --evidence-commit when ingesting "
            "a forge JSON, or use --run-forge")
    if prov.commit not in accepted:
        return False, "commit_mismatch", (
            f"evidence commit {prov.commit} is not {' or '.join(accepted)}")
    if prov.dirty:
        return False, "worktree_dirty", (
            "forge ran against a worktree with uncommitted changes, so the "
            "commit does not describe what was tested")
    return True, None, f"evidence bound to {prov.commit} via {prov.commit_source}"


def check_binding_directions(assessment):
    """tests[].covers must agree with invariants[].bound_tests."""
    declared, bound = set(), set()
    for t in assessment.get("tests", []):
        for i in t.get("covers", []) or []:
            declared.add((t["id"], i))
    for inv in assessment.get("invariants", []):
        for b in inv.get("bound_tests", []) or []:
            bound.add((b, inv["id"]))
    known = {t["id"] for t in assessment.get("tests", [])}
    dangling = sorted({b for (b, _) in bound if b not in known})
    return sorted(declared - bound), sorted(bound - declared), dangling


def check_threat_gating(assessment):
    """Threats that no invariant can ever falsify."""
    inv_ids = {i["id"] for i in assessment.get("invariants", [])}
    ungated = []
    for th in assessment.get("threat_model", []):
        if not [m for m in th.get("mitigated_by", []) or [] if m in inv_ids]:
            ungated.append({"threat": th["id"],
                            "mitigated_by": th.get("mitigated_by", []),
                            "accepted_residual": bool(th.get("accepted_residual"))})
    return ungated


# ---------------------------------------------------------------------------
def evaluate(assessment, suites, evidence_hash, ttl_hours, prov,
             strict_threats=False):
    events = []
    evidence = []
    evaluated = now()
    produced = prov.produced_at if prov else evaluated
    expires = produced + datetime.timedelta(hours=ttl_hours)
    expired = evaluated >= expires

    # 1. resolve each bound test, honouring freshness
    test_status = {}
    for t in assessment.get("tests", []):
        if suites is None:
            st = "undetermined"
        else:
            st = lookup(suites, t["file"], t.get("function"))
            if st == "pass" and expired:
                st = "expired"
        test_status[t["id"]] = st
        evidence.append({
            "test_id": t["id"], "file": t["file"], "function": t.get("function"),
            "result": st, "evidence_sha256": evidence_hash,
            "evidence_commit": prov.commit if prov else None,
            "produced_at": iso(produced), "expires_at": iso(expires),
            "evaluated_at": iso(evaluated),
        })
    if expired and suites is not None:
        events.append({"type": "evidence_expired",
                       "reason": f"evidence produced {iso(produced)} is past "
                                 f"its {ttl_hours}h TTL",
                       "ts": iso(evaluated)})

    # 2. roll up invariants (fail-closed)
    unmet_kinds = ("missing", "undetermined", "expired")
    inv_status = {}
    for inv in assessment.get("invariants", []):
        bound = inv.get("bound_tests", []) or []
        if not bound:
            inv_status[inv["id"]] = "untested"
            events.append({"type": "untested_invariant", "reason": "no bound tests",
                           "invariant": inv["id"], "ts": iso(evaluated)})
        else:
            statuses = [test_status.get(b, "missing") for b in bound]
            if any(s == "fail" for s in statuses):
                inv_status[inv["id"]] = "violated"
                events.append({"type": "invariant_violated",
                               "reason": "a bound test failed",
                               "invariant": inv["id"],
                               "failing_tests": [b for b in bound
                                                 if test_status.get(b) == "fail"],
                               "ts": iso(evaluated)})
            elif any(s in unmet_kinds for s in statuses):
                inv_status[inv["id"]] = "untested"
                events.append({"type": "untested_invariant",
                               "reason": "a bound test has no fresh passing evidence",
                               "invariant": inv["id"],
                               "unmet_tests": [b for b in bound
                                               if test_status.get(b) in unmet_kinds],
                               "ts": iso(evaluated)})
            else:
                inv_status[inv["id"]] = "verified"
        inv["status"] = inv_status[inv["id"]]

    # 3. bypass_confirmed: a violated invariant that mitigates a modeled threat
    for th in assessment.get("threat_model", []):
        broken = [i for i in th.get("mitigated_by", []) or []
                  if inv_status.get(i) == "violated"]
        if broken:
            events.append({"type": "bypass_confirmed",
                           "reason": "mitigating invariant violated",
                           "threat": th["id"], "via_invariants": broken,
                           "ts": iso(evaluated)})

    reasons = []

    # 4. evidence provenance gates
    commit_ok, commit_reason, commit_detail = check_commit_binding(assessment, prov)
    if not commit_ok and suites is not None:
        reasons.append(commit_reason)
        events.append({"type": "evidence_unbound", "reason": commit_detail,
                       "ts": iso(evaluated)})

    # 5. binding-direction agreement
    covers_only, bound_only, dangling = check_binding_directions(assessment)
    if covers_only or bound_only or dangling:
        reasons.append("binding_inconsistent")
        events.append({"type": "binding_inconsistent",
                       "reason": "tests[].covers and invariants[].bound_tests disagree",
                       "covers_only": covers_only, "bound_only": bound_only,
                       "dangling_bound_tests": dangling, "ts": iso(evaluated)})

    # 6. threat gating (reported always; blocking only under --strict-threats)
    ungated = check_threat_gating(assessment)
    for u in ungated:
        events.append({"type": "ungated_threat",
                       "reason": "no invariant in mitigated_by, so no test can "
                                 "ever falsify this threat",
                       "threat": u["threat"], "mitigated_by": u["mitigated_by"],
                       "accepted_residual": u["accepted_residual"],
                       "ts": iso(evaluated)})
    if strict_threats and any(not u["accepted_residual"] for u in ungated):
        reasons.append("ungated_threat")

    # 7. structural gate
    undetermined = assessment.get("coverage", {}).get("undetermined", [])
    structural_checks_passed = (
        len(undetermined) == 0 and not covers_only and not bound_only
        and not dangling)

    # 8. fail-closed verdict
    if any(s == "violated" for s in inv_status.values()):
        reasons.append("invariant_violated")
    if any(s == "untested" for s in inv_status.values()):
        reasons.append("untested_invariant")
    if expired and suites is not None:
        reasons.append("evidence_expired")
    if len(undetermined) != 0:
        reasons.append("coverage_undetermined")
    if suites is None:
        reasons.append("no_execution_evidence")
    verdict = "ADMITTED" if not reasons else "EXCLUDED"

    assessment["adapter_version"] = ADAPTER_VERSION
    assessment["evidence_provenance"] = prov.as_dict() if prov else None
    assessment["evidence"] = evidence
    assessment["events"] = events
    assessment["structural_checks_passed"] = structural_checks_passed
    assessment["verdict"] = {"status": verdict, "reasons": sorted(set(reasons)),
                             "evaluated_at": iso(evaluated),
                             "ttl_hours": ttl_hours,
                             "invariant_status": inv_status}

    # 9. construction_root over the canonical assessment (root field excluded)
    root_input = dict(assessment)
    root_input.pop("construction_root", None)
    canon = json.dumps(root_input, sort_keys=True, separators=(",", ":")).encode()
    assessment["construction_root"] = {
        "alg": "sha256", "value": sha256_hex(canon),
        "anchor": "opentimestamps (pending)", "computed_at": iso(evaluated),
    }
    return assessment


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assessment", required=True)
    ap.add_argument("--forge-json", help="output of `forge test --json`")
    ap.add_argument("--run-forge", metavar="REPO_DIR",
                    help="run forge in REPO_DIR instead of ingesting a file")
    ap.add_argument("--evidence-commit",
                    help="commit the ingested forge JSON was produced from; "
                         "required with --forge-json")
    ap.add_argument("--evidence-produced-at",
                    help="ISO-8601 time the forge run happened; defaults to the "
                         "forge file's mtime when ingesting")
    ap.add_argument("--ttl-hours", type=int, default=168)
    ap.add_argument("--strict-threats", action="store_true",
                    help="block on threats that no invariant can falsify unless "
                         "they carry accepted_residual: true")
    ap.add_argument("--out")
    args = ap.parse_args()

    with open(args.assessment, encoding="utf-8") as f:
        assessment = json.load(f)

    forge_text, prov = None, None
    note = "no forge evidence supplied -> coverage undetermined"

    if args.run_forge:
        forge_text, prov, note = run_forge(args.run_forge)
    elif args.forge_json:
        with open(args.forge_json, "rb") as f:
            forge_text = f.read().decode()
        if args.evidence_produced_at:
            produced = datetime.datetime.fromisoformat(args.evidence_produced_at)
            if produced.tzinfo is None:
                produced = produced.replace(tzinfo=datetime.timezone.utc)
            src = "--evidence-produced-at"
        else:
            produced = datetime.datetime.fromtimestamp(
                os.path.getmtime(args.forge_json), datetime.timezone.utc)
            src = "mtime of the forge JSON"
        prov = Provenance(produced, args.evidence_commit,
                          "--evidence-commit" if args.evidence_commit else None)
        note = f"ingested {args.forge_json}; production time from {src}"

    suites = parse_forge(forge_text) if forge_text else None
    if forge_text and suites is None:
        note += "  [forge output could not be parsed -> treated as no evidence]"
    evidence_hash = (sha256_hex(forge_text.encode()) if forge_text
                     else "sha256:undetermined")
    result = evaluate(assessment, suites, evidence_hash, args.ttl_hours, prov,
                      strict_threats=args.strict_threats)

    out = args.out or (args.assessment.replace(".json", "") + ".evaluated.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    v = result["verdict"]
    print(f"# ARKHE control-evaluator, adapter {ADAPTER_VERSION}  ({note})")
    print(f"verdict: {v['status']}")
    print(f"reasons: {', '.join(v['reasons']) or '(none)'}")
    print(f"structural_checks_passed: {result['structural_checks_passed']}")
    if result["evidence_provenance"]:
        p = result["evidence_provenance"]
        print(f"evidence: produced {p['produced_at']} commit {p['commit']} "
              f"({p['commit_source']}) dirty={p['worktree_dirty']}")
    print("invariants:")
    for iid, st in v["invariant_status"].items():
        print(f"  {iid}: {st}")
    if result["events"]:
        print(f"events: {len(result['events'])}")
        for e in result["events"][:12]:
            print(f"  - {e['type']}: {e.get('invariant') or e.get('threat') or ''} "
                  f"({e['reason']})")
    print(f"construction_root: {result['construction_root']['value']}")
    print(f"wrote {out}")
    sys.exit(0 if v["status"] == "ADMITTED" else 2)


if __name__ == "__main__":
    main()
