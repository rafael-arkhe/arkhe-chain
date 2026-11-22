"""Narrow Linux OS isolation probe. Run only through the namespace launcher on Linux."""
import errno
import json
import os
from pathlib import Path
import subprocess
import sys


if __name__ == "__main__":
    target = Path(sys.argv[1])
    observer_host_pid = int(sys.argv[2])
    result = {}
    try:
        with target.open("xb") as output:
            output.write(b"unauthorized direct namespace write")
        result["write_denied"] = False
    except OSError as error:
        result["write_denied"] = error.errno == errno.EROFS
        result["write_errno"] = error.errno
    remount = subprocess.run(
        ["mount", "-o", "remount,bind,rw", str(target.parent)],
        capture_output=True,
        text=True,
    )
    result["remount_denied"] = remount.returncode != 0
    result["remount_exit"] = remount.returncode
    result["remount_stderr"] = remount.stderr
    try:
        os.kill(observer_host_pid, 0)
        result["observer_host_pid_unreachable"] = False
    except ProcessLookupError:
        result["observer_host_pid_unreachable"] = True
    except PermissionError:
        result["observer_host_pid_unreachable"] = True
    status = Path("/proc/self/status").read_text()
    result["effective_caps_zero"] = "CapEff:\t0000000000000000" in status
    result["no_new_privileges"] = "NoNewPrivs:\t1" in status
    print(json.dumps(result))
