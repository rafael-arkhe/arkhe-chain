"""Assess Metadata API evidence without treating an accepted/pending job as a pass."""
from pathlib import Path


def assess(body, project):
    result = body.get("result", {})
    tests = result.get("details", {}).get("runTestResult", {})
    coverage = tests.get("codeCoverage", [])
    if isinstance(coverage, dict):
        coverage = [coverage]
    percentages = {}
    for row in coverage:
        total = int(row.get("numLocations", 0))
        uncovered = int(row.get("numLocationsNotCovered", total))
        if total > 0:
            percentages[row.get("name")] = round(100*(total-uncovered)/total, 2)
    root = Path(project)/"force-app/main/default"
    expected = {p.stem for p in (root/"classes").glob("*.cls") if "@IsTest" not in p.read_text(encoding="utf-8")}
    expected |= {p.stem for p in (root/"triggers").glob("*.trigger")}
    missing = sorted(expected-percentages.keys())
    insufficient = {name:percentages[name] for name in sorted(expected & percentages.keys()) if percentages[name]<75}
    passed = (body.get("status") == 0 and result.get("done") is True and result.get("success") is True
        and result.get("checkOnly") is True and result.get("status") == "Succeeded"
        and int(tests.get("numTestsRun",0)) > 0 and int(tests.get("numFailures",-1)) == 0
        and not missing and not insufficient)
    return {"passed":passed,"tests_run":tests.get("numTestsRun"),"coverage_percent":percentages,
        "missing_coverage":missing,"below_75_percent":insufficient,
        "resource_metrics_verified":False,"server_concurrency_verified":False}
