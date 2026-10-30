"""Execute deterministic broker fixtures. No real A/B/C or capacity pilot yet."""
import argparse
import json
from pathlib import Path

from generality_pilot import digest, schedule, summarize, validate_schedule
from tool_broker import BudgetExceeded, ToolBroker


def execute_fixture(tasks, agenda, limits, on_record=None):
    # Validate the complete agenda before starting any work.
    if agenda["tasks_sha256"] != digest(tasks) or agenda["schedule"] != schedule(tasks, agenda["seed"]):
        raise ValueError("agenda does not match tasks and seed")
    task_map = {t["id"]: t for t in tasks}
    records = []
    for index, row in enumerate(agenda["schedule"]):
        task = task_map[row["task_id"]]
        broker = ToolBroker(limits, data=task.get("data", {}))
        status, reason, answer = "FAILURE", "abandoned", None
        try:
            # The same scripted adapter is deliberately used in every arm.
            # Candidate never receives the expected answer; grading occurs below.
            steps = json.loads(json.dumps(task.get("fixture_steps", []), allow_nan=False))
            for step in steps:
                answer = broker.call(step["tool"], step["arguments"])
            usage = broker.finish()
            if steps:
                status = "SUCCESS" if answer == task["expected"] else "FAILURE"
                reason = "correct" if status == "SUCCESS" else "incorrect"
        except BudgetExceeded as error:
            status, reason, usage = "FAILURE", error.reason, broker.usage()
        except ValueError:
            status, reason, usage = "FAILURE", "tool_error", broker.usage()
        # OSError / runner defects abort; do not silently convert host defects
        # into agent failures or discard their executions in a success report.
        records.append({"task_id": row["task_id"], "arm": row["arm"],
                        "schedule_index": index, "attempt": 1, "status": status,
                        "reason": reason, **usage, "answer": answer,
                        "broker_events": broker.events, "adapter": "scripted_fixture",
                        "token_meter": "NO_MODEL_CALLS", "sandbox": "NOT_QUALIFIED"})
        if on_record:
            on_record(records[-1])
    validate_schedule(tasks, records, agenda)
    report = summarize(tasks, records, agenda=agenda, phase="fixture")
    report["execution"] = {"adapter": "scripted_fixture", "limits": dict(limits),
                           "model": "NONE", "memory_isolation": "NOT_QUALIFIED",
                           "same_limits_per_task_arm": True}
    return records, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tasks", type=Path, required=True)
    parser.add_argument("--schedule", type=Path, required=True)
    parser.add_argument("--limits", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    tasks, agenda, limits = (json.loads(p.read_text(encoding="utf-8"))
                             for p in (args.tasks, args.schedule, args.limits))
    # New directory only, preserving all earlier runs.
    args.output_dir.mkdir(parents=True, exist_ok=False)
    # Write initial manifest before execution. If execution aborts, it remains
    # visibly incomplete and no successful report is emitted.
    manifest = {"phase": "fixture", "tasks_sha256": digest(tasks),
                "agenda": agenda, "limits": limits, "adapter": "scripted_fixture"}
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    with (args.output_dir / "records.jsonl").open("x", encoding="utf-8") as ledger:
        def persist(record):
            ledger.write(json.dumps(record, allow_nan=False) + "\n")
            ledger.flush()
        records, report = execute_fixture(tasks, agenda, limits, on_record=persist)
    for filename, value in (("records.json", records), ("report.json", report)):
        with (args.output_dir / filename).open("x", encoding="utf-8") as output:
            json.dump(value, output, indent=2, allow_nan=False)
            output.write("\n")


if __name__ == "__main__":
    main()
