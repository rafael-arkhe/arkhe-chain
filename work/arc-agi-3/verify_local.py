"""Capture the official starter smoke in an isolated Python environment. No upload."""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent
STARTER=ROOT/"reference/starter"
FRAMEWORK=STARTER/"vendor/ARC-AGI-3-Agents"
PYTHON=ROOT/".venv/Scripts/python.exe" if sys.platform=="win32" else ROOT/".venv/bin/python"


def capture(output,games="ls20,vc33",steps=50):
    output.mkdir(parents=True,exist_ok=False)
    def command(arguments,cwd=STARTER,timeout=30):
        return subprocess.run(arguments,cwd=cwd,text=True,capture_output=True,timeout=timeout,check=True)
    def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
    manifest={"phase":"official_starter_public_smoke","captured_at_utc":datetime.now(timezone.utc).isoformat(),
        "starter_commit":command(["git","rev-parse","HEAD"]).stdout.strip(),
        "framework_commit":command(["git","rev-parse","HEAD"],cwd=FRAMEWORK).stdout.strip(),
        "agent_source_sha256":sha(STARTER/"agent/my_agent.py"),
        "local_framework_init_sha256":sha(FRAMEWORK/"agents/__init__.py"),
        "framework_local_change":"official slim_framework.py replaces agents/__init__.py",
        "python":command([str(PYTHON),"--version"]).stdout.strip(),
        "games_requested":games.split(","),"max_steps_requested":steps,
        "agent":"unmodified official random starter","random_seed_controlled":False,
        "arkhe_native_gate":"NOT_INTEGRATED","native_wer":"NOT_INTEGRATED",
        "kaggle_execution":"NOT_RUN","submission_sent":False,"capability_demonstrated":False}
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    frozen=command([str(PYTHON),"-m","pip","freeze"]).stdout
    (output/"requirements.freeze.txt").write_text(frozen,encoding="utf-8")
    result=subprocess.run([str(PYTHON),"scripts/play_local.py","--game",games,"--max-steps",str(steps)],
        cwd=STARTER,text=True,capture_output=True,timeout=180)
    (output/"play-local.stdout.log").write_text(result.stdout,encoding="utf-8")
    (output/"play-local.stderr.log").write_text(result.stderr,encoding="utf-8")
    per_game=[]
    for line in result.stdout.splitlines():
        match=re.search(r"^\s*(\S+)\s+levels=\s*(\d+)\s+actions=\s*(\d+)\s+state=(.*)$",line)
        if match: per_game.append({"game_id":match[1],"levels_completed":int(match[2]),"actions":int(match[3]),"state":match[4]})
    score=re.search(r"Aggregate scorecard score:\s*(.*)",result.stdout)
    summary={"phase":"official_starter_public_smoke","process_exit_code":result.returncode,
        "per_game":per_game,"reported_score_text":score[1] if score else None,
        "requested_games_executed":len(per_game)==len(games.split(",")),
        "kaggle_evaluation_score":None,"agent_strength":"NOT_ESTABLISHED",
        "arkhe_native_integration":"NOT_IMPLEMENTED","capability_demonstrated":False}
    (output/"report.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    spec=importlib.util.spec_from_file_location("official_notebook_builder",STARTER/"scripts/build_notebook.py")
    builder=importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    builder.ACCELERATOR="cpu"
    notebook=builder.build()
    agent_cell=next(c for c in notebook["cells"] if c["cell_type"]=="code" and c["source"].startswith("%%writefile"))
    ast.parse(agent_cell["source"].split("\n",1)[1])
    if notebook["metadata"]["kaggle"]["isInternetEnabled"] is not False:
        raise ValueError("notebook must disable external internet")
    (output/"starter-cpu.ipynb").write_text(json.dumps(notebook,indent=1)+"\n",encoding="utf-8")
    (output/"notebook-check.json").write_text(json.dumps({"agent_cell_ast":"PASS","internet_enabled":False,
        "accelerator":"cpu","runtime_executed":False,"submission_ready":"NOT_KAGGLE_VALIDATED"},indent=2)+"\n",encoding="utf-8")
    return summary


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    report=capture(args.output_dir.resolve())
    print(json.dumps(report))
    raise SystemExit(0 if report["process_exit_code"]==0 and report["requested_games_executed"] else 2)
