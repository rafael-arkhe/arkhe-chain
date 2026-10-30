"""Decompose existing ungraded smoke usage; no price or success-rate inference."""
import argparse
import json
from pathlib import Path


def analyze(records):
    arms = {}
    for arm in ("A","B","C"):
        rows = [r for r in records if r["arm"] == arm]
        summary = {"assigned":len(rows),"prompt_tokens":0,"output_tokens":0,
            "measured_tokens":sum(r["usage"]["measured_tokens"] for r in rows),
            "usage_breakdown_missing":0,"wall_seconds":sum(r["usage"]["wall_seconds"] for r in rows),
            "generation_seconds":0,"preflight_seconds":0,"native_verification_seconds":0,
            "cost_per_success":None,"cost_per_success_reason":"no_grading"}
        for row in rows:
            response = row.get("provider_response") or row.get("partial_provider_observation",{}).get("provider_response")
            if response is None:
                summary["usage_breakdown_missing"] += 1
            else:
                prompt, output = response["prompt_eval_count"], response["eval_count"]
                if type(prompt) is not int or type(output) is not int or min(prompt,output)<0:
                    raise ValueError("invalid provider usage")
                if prompt+output != row["usage"]["measured_tokens"]:
                    raise ValueError("provider counts disagree with broker settlement")
                summary["prompt_tokens"] += prompt
                summary["output_tokens"] += output
            for stage in ("generation_seconds","preflight_seconds","native_verification_seconds"):
                summary[stage] += row.get("timings",{}).get(stage,0)
        arms[arm] = summary
    return {"phase":"protocol_usage_analysis","by_arm":arms,
        "gate_token_usage":"NONE_NATIVE_GATE_DOES_NOT_CALL_MODEL",
        "grading":"NOT_PERFORMED","capability_demonstrated":False}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    records=[json.loads(line) for line in args.records.read_text(encoding="utf-8").splitlines()]
    with args.output.open("x",encoding="utf-8") as stream:
        json.dump(analyze(records),stream,indent=2,allow_nan=False)
        stream.write("\n")
