"""Run scoped envelope regressions and retain commands, logs and source hashes."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ["scripts/llama_cpp_bounded.py", "scripts/arkhe_b_retrieval.py", "scripts/portable_wer_smoke.py",
    "scripts/bounded_gguf_smoke.py", "scripts/tests/test_llama_cpp_bounded.py", "scripts/tests/test_arkhe_b_retrieval.py",
    "scripts/tool_broker.py", "scripts/ollama_arm_a.py", "scripts/prepare_external_citation_review.py",
    "scripts/grade_external_citation_review.py", "orchestration/arkhe-runtime/src/portable_wer.rs",
    "orchestration/arkhe-runtime/examples/pilot_wer_evidence.rs", "orchestration/arkhe-runtime/tests/portable_wer.rs"]


def main(output):
    output.mkdir(parents=True, exist_ok=False)
    def hashes(): return {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCES}
    before = hashes()
    commands = [(p, [sys.executable, "-m", "unittest", "discover", "-s", "scripts/tests", "-p", p+".py", "-v"])
        for p in ("test_tool_broker", "test_ollama_arm_a", "test_llama_cpp_bounded", "test_arkhe_b_retrieval",
                  "test_arkhe_arm_bc", "test_python_citation_crosscheck", "test_external_citation_review")]
    commands += [
        ("rust-tests", ["cargo", "test", "-p", "arkhe-runtime", "-p", "arkhe-wormgraph", "--lib", "--tests", "--examples", "--locked"]),
        ("rust-scoped-clippy", ["cargo", "clippy", "-p", "arkhe-runtime", "--no-deps", "--test", "portable_wer", "--example", "pilot_wer_evidence", "--locked", "--", "-D", "warnings"]),
        ("rust-format", ["rustfmt", "--check", "--edition", "2021", "--config", "skip_children=true",
            "orchestration/arkhe-runtime/src/portable_wer.rs", "orchestration/arkhe-runtime/examples/pilot_wer_evidence.rs",
            "orchestration/arkhe-runtime/tests/portable_wer.rs"])]
    results = []
    for name, cmd in commands:
        process = subprocess.run(cmd, cwd=ROOT, capture_output=True, timeout=600, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        raw = process.stdout + process.stderr
        (output/(name+".log")).write_bytes(raw)
        text = raw.decode(errors="replace")
        result = {"name": name, "command": cmd, "returncode": process.returncode,
                  "test_summaries": re.findall(r"(?:Ran \d+ tests.*|test result:.*)", text)}
        results.append(result)
        print(json.dumps(result), flush=True)
    after = hashes()
    report = {"scope": "LOCAL_ENVELOPE_REGRESSIONS", "results": results,
        "source_sha256_before": before, "source_sha256_after": after, "sources_unchanged": before == after,
        "all_commands_passed": all(r["returncode"] == 0 for r in results), "remote_ci": "NOT_RUN",
        "organizational_independence_verified": False, "production_qualified": False,
        "capability_demonstrated": False}
    (output/"report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    return 0 if report["all_commands_passed"] and before == after else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    raise SystemExit(main(args.output_dir.resolve()))
