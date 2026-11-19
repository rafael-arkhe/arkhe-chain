"""Refuse to score. The registered task is not frozen and has no human baseline."""
import json
import sys
from pathlib import Path

task = json.loads((Path(__file__).resolve().parents[1] / "tasks" / "none.json").read_text(encoding="utf-8"))
if task.get("id") != "none" or task.get("frozen") is not False or task.get("human_hours") is not None:
    sys.exit("task is not the unfrozen null task")
print("not scored")
