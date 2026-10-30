"""Ungraded A/B/C integration repetitions, not a capability campaign."""
import argparse
import json
import time
from pathlib import Path

from arkhe_arm_bc import execute
from generality_pilot import digest, schedule
from ollama_arm_a import generate, check_matches_manifest, SAMPLING_SEED, SAMPLING_TEMPERATURE
from tool_broker import BudgetExceeded, ToolBroker


def run_a(config, prompt, limits, output_cap, placement, persist):
    broker = ToolBroker(limits)
    manifest = {"phase":"adapter_smoke", "arm":"A", "config":config, "limits":limits,
        "prompt_sha256":digest(prompt), "output_cap":output_cap,
        "device_placement_requested":placement,
        "sampling":{"seed":SAMPLING_SEED,"temperature":SAMPLING_TEMPERATURE,
                    "num_ctx":config["context_tokens"],"raw_prompt":True}}
    persist("manifest.json", manifest)
    persist("input-snapshot.json", {"task_prompt":prompt,"memory":"","model_prompt":prompt})
    record = {"phase":"adapter_smoke","arm":"A","execution_status":"FAILED",
        "capability_demonstrated":False,"grading":"NOT_PERFORMED","native_wer":"NOT_APPLICABLE",
        "sandbox":"NOT_QUALIFIED","total_token_cap":"POSTCHECK_ONLY"}
    started = time.monotonic()
    try:
        result = generate(config, prompt, broker, output_cap=output_cap,
                          require_hard_total_cap=False, device_placement=placement)
        check_matches_manifest(result, manifest)
        record.update(result)
        record.update(usage=broker.finish(), execution_status="COMPLETED_UNGRADED")
    except (BudgetExceeded, ValueError, RuntimeError, KeyError, OSError) as error:
        record.update(reason=getattr(error,"reason",type(error).__name__),error=str(error))
        partial = getattr(error,"provider_observation",None)
        if partial is not None:
            persist("generation-partial.json", partial)
            record["partial_provider_observation"] = partial
    record.setdefault("usage",broker.usage())
    record.update(usage_complete=record["usage"]["reserved_tokens"] == 0,
                  timings={"generation_seconds":time.monotonic()-started}, broker_events=broker.events)
    return record


def run(config, fixture, executable, output):
    tasks = [{**task,"axis":"PROTOCOL_ONLY"} for task in fixture["tasks"]]
    order = schedule(tasks, fixture["seed"])
    task_map = {task["id"]:task for task in tasks}
    if fixture["limits"]["max_tool_calls"] != 0:
        raise ValueError("these smoke adapters do not support model tool calls")
    output.mkdir(parents=True, exist_ok=False)
    def write(path, value):
        with path.open("x",encoding="utf-8") as stream:
            json.dump(value,stream,indent=2,allow_nan=False)
            stream.write("\n")
    manifest = {"phase":"protocol_smoke","fixture":fixture,"fixture_sha256":digest(fixture),
                "config":config,"seed":fixture["seed"],"schedule":order,
                "capability_demonstrated":False,"grading":"NOT_PERFORMED"}
    write(output/"manifest.json", manifest)
    records = []
    with (output/"records.jsonl").open("x",encoding="utf-8") as ledger:
        for index,row in enumerate(order):
            directory = output/f"execution-{index:03d}-{row['arm']}"
            directory.mkdir()
            def persist(name,value):
                write(directory/name,value)
            prompt = task_map[row["task_id"]]["prompt"]
            if row["arm"] == "A":
                record = run_a(config,prompt,fixture["limits"],fixture["output_cap"],fixture["placement"],persist)
            else:
                memory = fixture["memory"] if row["arm"] == "B" else ""
                record = execute(config,prompt,memory,row["arm"],fixture["limits"],executable,
                    directory.name,fixture["output_cap"],fixture["placement"],True,persist)
            record.update(task_id=row["task_id"],arm=row["arm"],schedule_index=index,attempt=1)
            persist("record.json",record)
            ledger.write(json.dumps(record,allow_nan=False)+"\n")
            ledger.flush()
            records.append(record)
            print(json.dumps({"completed_executions":len(records),"total":len(order),
                  "arm":row["arm"],"status":record["execution_status"],"reason":record.get("reason")}),flush=True)
    completed = sum(r["execution_status"] == "COMPLETED_UNGRADED" for r in records)
    report = {"phase":"protocol_smoke","assigned_executions":len(order),
        "completed_ungraded":completed,"failed_executions":len(records)-completed,
        "decision":"INCONCLUSIVE","decision_reason":"no_grading_or_capability_inference",
        "capability_demonstrated":False,"grading":"NOT_PERFORMED",
        "task_design":"repeated_identical_prompt_distinct_ids_not_five_capabilities",
        "memory_origin":"synthetic_fixture_not_learned_experience",
        "isolation":"API_ONLY_NOT_SANDBOX","wormgraph_anchor":"NOT_INTEGRATED",
        "by_arm":{arm:{"completed_ungraded":sum(r["arm"]==arm and r["execution_status"]=="COMPLETED_UNGRADED" for r in records),
                         "assigned":sum(r["arm"]==arm for r in records),
                         "measured_tokens":sum(r["usage"]["measured_tokens"] for r in records if r["arm"]==arm),
                         "unresolved_reserved_tokens":sum(r["usage"]["reserved_tokens"] for r in records if r["arm"]==arm)}
                  for arm in ("A","B","C")}}
    write(output/"report.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",type=Path,default=Path(__file__).resolve().parents[1]/"config/ollama.json")
    parser.add_argument("--fixture",type=Path,required=True)
    parser.add_argument("--bridge-exe",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args = parser.parse_args()
    config, fixture = (json.loads(p.read_text(encoding="utf-8")) for p in (args.config,args.fixture))
    report = run(config,fixture,args.bridge_exe.resolve(strict=True),args.output_dir)
    raise SystemExit(0 if report["failed_executions"] == 0 else 2)


if __name__ == "__main__":
    main()
