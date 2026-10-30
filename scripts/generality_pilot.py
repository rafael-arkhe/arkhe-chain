"""Offline pilot accounting harness. Not an agent, sandbox, WER or MMR adapter."""
import argparse
import hashlib
import json
import math
import random
from collections import defaultdict
from pathlib import Path

ARMS = ("A", "B", "C")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def schedule(tasks, seed):
    """Randomized ordering, with each task represented in every arm."""
    if not tasks or len({t["id"] for t in tasks}) != len(tasks):
        raise ValueError("tasks must be nonempty with unique ids")
    rng = random.Random(seed)
    rows = []
    for task in tasks:
        arms = list(ARMS)
        rng.shuffle(arms)
        rows.extend({"task_id": task["id"], "axis": task["axis"], "arm": arm}
                    for arm in arms)
    rng.shuffle(rows)
    return rows


def validate_schedule(tasks, records, agenda):
    if agenda["tasks_sha256"] != digest(tasks):
        raise ValueError("schedule task digest mismatch")
    expected = schedule(tasks, agenda["seed"])
    if agenda["schedule"] != expected:
        raise ValueError("schedule differs from its seed")
    seen = []
    for record in records:
        index = record.get("schedule_index")
        if type(index) is not int or not 0 <= index < len(expected):
            raise ValueError("record requires valid schedule_index")
        row = expected[index]
        if (record["task_id"], record["arm"]) != (row["task_id"], row["arm"]):
            raise ValueError("record does not match schedule")
        if record["attempt"] == 1:
            seen.append(index)
        elif not seen or index != seen[-1]:
            raise ValueError("retry must immediately follow its scheduled primary")
    if seen != list(range(len(expected))):
        raise ValueError("primary records must follow the entire schedule in order")


def summarize(tasks, records, *, agenda=None, phase="fixture"):
    """No statistical PASS decision: fixtures and a pilot cannot confirm capability."""
    if phase not in ("fixture", "pilot"):
        raise ValueError("phase must be fixture or pilot")
    if phase == "pilot" and agenda is None:
        raise ValueError("pilot accounting requires a schedule")
    if agenda is not None:
        validate_schedule(tasks, records, agenda)
    task_map = {t["id"]: t for t in tasks}
    if not task_map or len(task_map) != len(tasks):
        raise ValueError("tasks must be nonempty with unique ids")
    grouped = defaultdict(list)
    for record in records:
        task = task_map.get(record["task_id"])
        if task is None or record["arm"] not in ARMS:
            raise ValueError("unknown task or arm")
        if type(record["attempt"]) is not int or record["attempt"] not in (1, 2):
            raise ValueError("attempt must be integer 1 or 2")
        if record["status"] not in ("SUCCESS", "FAILURE", "INVALID"):
            raise ValueError("unknown observed outcome")
        if record["reason"] in ("timeout", "abandoned", "token_limit", "tool_limit"):
            if record["status"] != "FAILURE":
                raise ValueError("agent budget failures cannot be excluded")
        if record["status"] == "INVALID" and record["reason"] not in ("infra", "runner_bug"):
            raise ValueError("INVALID requires an external failure reason")
        for metric in ("tokens", "tool_calls", "wall_seconds"):
            value = record[metric]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError("usage must be finite and nonnegative")
        grouped[(record["task_id"], record["arm"])].append(record)
    selected = {}
    for task_id in task_map:
        for arm in ARMS:
            attempts = grouped[(task_id, arm)]
            if not 1 <= len(attempts) <= 2:
                raise ValueError("each task/arm requires one primary and at most one INVALID retry")
            attempts.sort(key=lambda r: r["attempt"])
            if [r["attempt"] for r in attempts] != list(range(1, len(attempts) + 1)):
                raise ValueError("attempt numbers must start at one and be consecutive")
            if len(attempts) == 2 and attempts[0]["status"] != "INVALID":
                raise ValueError("primary agent failures cannot be retried")
            selected[(task_id, arm)] = attempts[-1]
    axes = {}
    for axis in sorted({t["axis"] for t in tasks}):
        ids = [t["id"] for t in tasks if t["axis"] == axis]
        arms = {}
        for arm in ARMS:
            final = [selected[(i, arm)] for i in ids]
            all_attempts = [r for i in ids for r in grouped[(i, arm)]]
            valid = [r for r in final if r["status"] != "INVALID"]
            successes = sum(r["status"] == "SUCCESS" for r in valid)
            arms[arm] = {
                "assigned_tasks": len(ids), "raw_attempts": len(all_attempts),
                "invalid_attempts": sum(r["status"] == "INVALID" for r in all_attempts),
                "unresolved_invalid_tasks": len(final) - len(valid),
                "capacity_denominator": len(valid), "successes": successes,
                "success_rate": successes / len(valid) if valid else None,
                "assigned_task_success_rate": successes / len(ids),
                "usage_including_invalid": {k: sum(r[k] for r in all_attempts)
                                            for k in ("tokens", "tool_calls", "wall_seconds")},
            }
        contrasts = {}
        for left, right in (("B", "A"), ("B", "C"), ("C", "A")):
            differences = [int(selected[(i, left)]["status"] == "SUCCESS") -
                           int(selected[(i, right)]["status"] == "SUCCESS") for i in ids
                           if all(selected[(i, a)]["status"] != "INVALID" for a in (left, right))]
            n = len(differences)
            mean = sum(differences) / n if n else None
            variance = sum((d - mean) ** 2 for d in differences) / (n - 1) if n > 1 else None
            contrasts[f"{left}-{right}"] = {"paired_tasks": n, "unpaired_tasks": len(ids) - n,
                                           "gain_pp": 100 * mean if n else None,
                                           "sample_variance_of_paired_difference": variance}
        axes[axis] = {"arms": arms, "contrasts": contrasts, "decision": "INCONCLUSIVE"}
    return {"schema": "arkhe/generality-pilot-accounting/v2", "phase": phase,
            "replication_status": "provisional", "decision": "INCONCLUSIVE",
            "decision_reason": "confirmatory_inference_not_implemented",
            "schedule_validation": "MATCHED_RECORD_ORDER" if agenda is not None else "NOT_VERIFIED",
            "schedule_seed": agenda["seed"] if agenda is not None else None,
            "schedule_sha256": digest(agenda) if agenda is not None else None,
            "capability_demonstrated": False, "human_comparison": "NOT_MEASURED",
            "native_wer": "NOT_INTEGRATED", "wormgraph_anchor": "NOT_INTEGRATED",
            "input_sha256": {"tasks": digest(tasks), "records": digest(records)}, "axes": axes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tasks", type=Path, required=True)
    parser.add_argument("--records", type=Path)
    parser.add_argument("--schedule", type=Path)
    parser.add_argument("--phase", choices=("fixture", "pilot"), default="fixture")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20261026)
    args = parser.parse_args()
    tasks = json.loads(args.tasks.read_text(encoding="utf-8"))
    agenda = json.loads(args.schedule.read_text(encoding="utf-8")) if args.schedule else None
    result = summarize(tasks, json.loads(args.records.read_text(encoding="utf-8")),
                       agenda=agenda, phase=args.phase) if args.records else {
        "tasks_sha256": digest(tasks), "seed": args.seed, "schedule": schedule(tasks, args.seed)}
    # Exclusive creation preserves previous reports and schedules.
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
        output.write("\n")


if __name__ == "__main__":
    main()
