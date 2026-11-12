"""Append-only audit log."""
import json
import time

LOG_PATH = "audit.log"


def log(action: str, name: str, user: str) -> None:
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.time(), "action": action, "name": name, "user": user}) + "\n")
