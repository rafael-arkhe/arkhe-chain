"""Bounded staging chaos drill with cleanup and explicit writer fencing gates.

Provider-specific commands are trusted operator configuration, never generated
from replica data. This program does not implement a distributed writer lock.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time

STEPS = ("assert_primary", "inject_fault", "assert_secondary", "verify_replica",
         "fence_primary", "promote_secondary", "assert_writer", "restore_fault")


def drill(config, run=None, clock=time.monotonic, sleep=time.sleep):
    if config.get("environment") != "staging":
        raise ValueError("chaos runner accepts staging only")
    commands = config["commands"]
    if set(commands) != set(STEPS):
        raise ValueError("all failover gates and restoration must be configured")
    for command in commands.values():
        if not isinstance(command, list) or not command or not all(isinstance(s, str) for s in command):
            raise ValueError("each step must be an argv array")
    budget = config.get("failover_timeout_seconds", 180)
    if type(budget) is not int or not 1 <= budget <= 600:
        raise ValueError("failover budget must be 1..600 seconds")
    if run is None:
        def run(step, timeout):
            subprocess.run(commands[step], timeout=timeout, check=True, stdin=subprocess.DEVNULL)
    completed = []
    def step(name, timeout=120):
        run(name, timeout)
        completed.append(name)
    step("assert_primary")
    try:
        # Even partial injection can mutate infrastructure, so cleanup is armed first.
        step("inject_fault")
        start = clock()
        deadline = start + budget
        while True:
            remaining = deadline - clock()
            if remaining <= 0:
                raise TimeoutError("secondary placement was not observed within deadline")
            try:
                step("assert_secondary", min(10, remaining))
                if clock() > deadline:
                    raise TimeoutError("placement check exceeded deadline")
                break
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                sleep(min(5, max(0, deadline - clock())))
        rto = clock() - start
        step("verify_replica")
        step("fence_primary")
        step("promote_secondary")
        step("assert_writer")
        return {"scope": "staging-chaos", "routing_rto_seconds": rto,
                "completed": completed.copy()}
    finally:
        # Restore routing/fault only. Must not re-enable AWS writer credentials.
        step("restore_fault")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("config", type=Path)
    a = p.parse_args()
    print(json.dumps(drill(json.loads(a.config.read_text())), indent=2))
