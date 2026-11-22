"""Linux multi-UID L1 acceptance harness for Arkhe native control lab.

Proves the 5 L1 OS-boundary properties on Linux with distinct OS UIDs:
  1. Agent UID cannot write/delete/replace protected target files or SQLite DB (EACCES).
  2. Authorized agent UID connects to public request.sock (stranger UID gets EACCES);
     valid mandate executes as executor UID; invalid/missing mandate produces no effect.
  3. Caller identity comes from kernel SO_PEERCRED, never from JSON requested_by.
  4. Daemon starts conservatively halted (engaged=1); agent UID gets EACCES on admin.sock;
     operator UID activates/halts via admin.sock with OS-derived operator identity.
  5. Observer runs under a distinct UID with protected evidence dir; agent gets EPERM on
     kill(observer_pid) and EACCES on evidence tampering.

Requirements: Linux, root/CAP_SETUID+CAP_SETGID+CAP_CHOWN (to spawn distinct UIDs and
chown directories/sockets), compiled Linux `arkhe-native-lab` binary, Python 3.12+ with
`cryptography`.
"""
import argparse
import base64
import errno
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import socket
import subprocess
import sys
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from verify import verify


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run_as(uid, gid, cmd, timeout=15):
    def drop():
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)

    return subprocess.run(
        cmd,
        preexec_fn=drop,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def spawn_as(uid, gid, cmd):
    def drop():
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)

    return subprocess.Popen(
        cmd,
        preexec_fn=drop,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def wait_file(path, timeout=10):
    deadline = time.monotonic() + timeout
    while not path.exists():
        if time.monotonic() > deadline:
            raise TimeoutError(f"timed out waiting for {path}")
        time.sleep(0.02)


UNIX_SEND_HELPER = r"""
import errno, json, socket, sys
sock_path = sys.argv[1]
payload_path = sys.argv[2]
data = open(payload_path, "rb").read()
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(10)
try:
    s.connect(sock_path)
    s.sendall(data)
    s.shutdown(socket.SHUT_WR)
    chunks = []
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        chunks.append(chunk)
    print(json.dumps({"connected": True, "response": json.loads(b"".join(chunks).decode())}))
except OSError as e:
    print(json.dumps({"connected": False, "errno": e.errno, "errname": errno.errorcode.get(e.errno, str(e.errno))}))
finally:
    s.close()
"""

TAMPER_HELPER = r"""
import errno, json, os, signal, sys
from pathlib import Path

target_dir = Path(sys.argv[1])
db_path = Path(sys.argv[2])
evidence_file = Path(sys.argv[3])
observer_pid = int(sys.argv[4])
agent_stage_file = Path(sys.argv[5])
approved_file = Path(sys.argv[6]) if len(sys.argv) > 6 else None

agent_stage_file.write_bytes(b"agent-forged-replacement")

def try_op(fn):
    try:
        fn()
        return {"denied": False}
    except OSError as e:
        return {"denied": True, "errno": e.errno, "errname": errno.errorcode.get(e.errno, str(e.errno))}

out = {
    "direct_target_write": try_op(lambda: (target_dir / "direct.txt").write_bytes(b"bypass")),
    "db_write": try_op(lambda: open(db_path, "ab").write(b"corrupt")),
    "db_unlink": try_op(lambda: os.unlink(db_path)),
    "db_replace": try_op(lambda: os.replace(agent_stage_file, db_path)),
    "evidence_write": try_op(lambda: evidence_file.write_bytes(b"tampered")),
    "observer_sigterm": try_op(lambda: os.kill(observer_pid, signal.SIGTERM)),
}
if approved_file is not None:
    out["approved_unlink"] = try_op(lambda: os.unlink(approved_file))
    out["approved_replace"] = try_op(lambda: os.replace(agent_stage_file, approved_file))
print(json.dumps(out))
"""

OBSERVER_HELPER = r"""
import ctypes, json, os, select, signal, struct, sys, time

directory = sys.argv[1]
ready_file = sys.argv[2]
out_file = sys.argv[3]

libc = ctypes.CDLL(None, use_errno=True)
fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
wd = libc.inotify_add_watch(fd, os.fsencode(directory), 0x00000FFF)
if fd < 0 or wd < 0:
    raise SystemExit(f"inotify failed errno={ctypes.get_errno()}")

events, healthy = [], True
running = True

def handle_stop(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, handle_stop)

def drain():
    global healthy
    while True:
        try:
            data = os.read(fd, 262144)
        except BlockingIOError:
            break
        off = 0
        while off < len(data):
            _, mask, cookie, length = struct.unpack_from("iIII", data, off)
            name = os.fsdecode(data[off + 16 : off + 16 + length].split(b"\0")[0])
            off += 16 + length
            if mask & (0x4000 | 0x8000 | 0x2000 | 0x400 | 0x800):
                healthy = False
            events.append({"name": name, "mask": mask, "cookie": cookie, "ts_ns": time.monotonic_ns()})

open(ready_file, "w").write(str(os.getpid()))
try:
    while running:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            drain()
    drain()
finally:
    os.close(fd)
    open(out_file, "w").write(json.dumps({"healthy": healthy, "events": events, "pid": os.getpid()}))
"""


def run_l1(
    binary: Path,
    output: Path,
    repository: Path,
    executor_uid: int,
    agent_uid: int,
    operator_uid: int,
    observer_uid: int,
    stranger_uid: int,
):
    if not sys.platform.startswith("linux"):
        raise SystemExit("run_l1_linux.py requires Linux (POSIX UIDs + SO_PEERCRED + inotify).")
    if os.geteuid() != 0:
        raise SystemExit("run_l1_linux.py must be launched with root/CAP_SETUID/CAP_CHOWN to enforce distinct UIDs.")
    uids = {executor_uid, agent_uid, operator_uid, observer_uid, stranger_uid}
    if len(uids) != 5:
        raise SystemExit("all five UIDs (executor, agent, operator, observer, stranger) must be distinct.")

    output.mkdir(parents=True, exist_ok=False)
    os.chmod(output, 0o755)

    # Distinct directories with strict OS ownership:
    db_dir = output / "db"
    target_dir = output / "target"
    sock_dir = output / "sockets"
    evidence_dir = output / "observer_evidence"
    payload_dir = output / "payloads"
    agent_stage_dir = output / "agent_stage"
    for d in (db_dir, target_dir, sock_dir, evidence_dir, payload_dir, agent_stage_dir):
        d.mkdir()

    # agent_stage_dir: owned by agent_uid on same filesystem so os.replace tests real EACCES (not EXDEV/ENOENT)
    os.chown(agent_stage_dir, agent_uid, agent_uid)
    os.chmod(agent_stage_dir, 0o700)

    # db_dir: executor-only (0700) -> agent gets EACCES on dispatch.sqlite
    os.chown(db_dir, executor_uid, executor_uid)
    os.chmod(db_dir, 0o700)

    # target_dir: executor writes, observer watches read-only (0750 executor:observer) -> agent gets EACCES
    os.chown(target_dir, executor_uid, observer_uid)
    os.chmod(target_dir, 0o750)

    # sock_dir: traversable (0755) while individual sockets enforce 0660 per-role group
    os.chown(sock_dir, executor_uid, executor_uid)
    os.chmod(sock_dir, 0o755)

    # evidence_dir: observer-only (0700) -> agent gets EACCES
    os.chown(evidence_dir, observer_uid, observer_uid)
    os.chmod(evidence_dir, 0o700)

    # payload_dir: world-readable inputs prepared for client subprocesses
    os.chmod(payload_dir, 0o755)

    # Copy binary into world-executable path inside output if needed so executor_uid can exec it
    exec_bin = output / "arkhe-native-lab-bin"
    shutil.copy2(binary, exec_bin)
    os.chmod(exec_bin, 0o755)

    request_sock = sock_dir / "request.sock"
    admin_sock = sock_dir / "admin.sock"
    ready_file = sock_dir / "daemon.ready"
    db_path = db_dir / "dispatch.sqlite"

    obs_ready = evidence_dir / "observer.ready"
    obs_out = evidence_dir / "observer.json"
    obs_sentinel = evidence_dir / "sentinel.txt"

    observer_proc = spawn_as(
        observer_uid,
        observer_uid,
        [sys.executable, "-c", OBSERVER_HELPER, str(target_dir), str(obs_ready), str(obs_out)],
    )
    daemon_proc = None
    try:
        wait_file(obs_ready)
        obs_sentinel.write_text("protected-evidence\n")
        os.chown(obs_sentinel, observer_uid, observer_uid)
        os.chmod(obs_sentinel, 0o600)

        daemon_proc = spawn_as(
            executor_uid,
            executor_uid,
            [
                str(exec_bin),
                "serve-l1",
                "--agent-uid",
                f"{agent_uid}=lab-agent",
                "--operator-uid",
                str(operator_uid),
                "--target-dir",
                str(target_dir),
                "--database",
                str(db_path),
                "--request-sock",
                str(request_sock),
                "--admin-sock",
                str(admin_sock),
                "--request-mode",
                "0600",
                "--admin-mode",
                "0600",
                "--ready-file",
                str(ready_file),
            ],
        )
        wait_file(ready_file)
        # Apply strict role group ownership + 0660 on each socket:
        os.chown(request_sock, executor_uid, agent_uid)
        os.chmod(request_sock, 0o660)
        os.chown(admin_sock, executor_uid, operator_uid)
        os.chmod(admin_sock, 0o660)

        def write_payload(name, obj):
            p = payload_dir / name
            p.write_bytes(canonical(obj))
            os.chmod(p, 0o644)
            return p

        def send_unix(uid, gid, sock, payload_path):
            r = run_as(uid, gid, [sys.executable, "-c", UNIX_SEND_HELPER, str(sock), str(payload_path)])
            if r.returncode != 0:
                raise RuntimeError(f"helper failed: {r.stderr}")
            return json.loads(r.stdout)

        def make_fixture(filename, tag, caller=None):
            cmd = [str(exec_bin), "prepare", str(target_dir / filename), tag]
            if caller is not None:
                cmd.append(caller)
            return json.loads(subprocess.check_output(cmd, timeout=10))

        # 1. Conservative startup halt: agent connects with valid mandate -> rejected kill_switch_engaged
        f_approved = make_fixture("approved.txt", "l1-approved")
        p_approved = write_payload("approved.json", {"fixture": f_approved})
        r1_halted = send_unix(agent_uid, agent_uid, request_sock, p_approved)

        # 2. Agent tries to connect to admin.sock to resume -> EACCES
        p_resume = write_payload("resume.json", {"action": "disengage", "reason": "l1 authorized activation"})
        r2_agent_admin = send_unix(agent_uid, agent_uid, admin_sock, p_resume)

        # 3. Stranger UID tries to connect to request.sock -> EACCES
        r3_stranger = send_unix(stranger_uid, stranger_uid, request_sock, p_approved)

        # 4. Agent direct tamper attempts (target write, SQLite write/unlink/replace, evidence write, kill observer)
        agent_stage_file = agent_stage_dir / "forged.bin"
        tamper_raw = run_as(
            agent_uid,
            agent_uid,
            [
                sys.executable,
                "-c",
                TAMPER_HELPER,
                str(target_dir),
                str(db_path),
                str(obs_sentinel),
                str(observer_proc.pid),
                str(agent_stage_file),
            ],
        )
        if tamper_raw.returncode != 0:
            raise RuntimeError(tamper_raw.stderr)
        r4_tamper = json.loads(tamper_raw.stdout)

        # 5. Operator activates over admin.sock (identity derived from OS SO_PEERCRED, not JSON)
        r5_activate = send_unix(operator_uid, operator_uid, admin_sock, p_resume)

        # 6. Authorized agent submits valid mandate -> succeeds; file owned by executor_uid
        r6_approved = send_unix(agent_uid, agent_uid, request_sock, p_approved)
        approved_path = target_dir / "approved.txt"
        approved_stat_uid = approved_path.stat().st_uid if approved_path.exists() else None

        # 6b. Agent attempts to unlink or replace the newly created protected resource -> EACCES
        tamper_post_raw = run_as(
            agent_uid,
            agent_uid,
            [
                sys.executable,
                "-c",
                TAMPER_HELPER,
                str(target_dir),
                str(db_path),
                str(obs_sentinel),
                str(observer_proc.pid),
                str(agent_stage_file),
                str(approved_path),
            ],
        )
        if tamper_post_raw.returncode != 0:
            raise RuntimeError(tamper_post_raw.stderr)
        r6b_tamper_post = json.loads(tamper_post_raw.stdout)

        # 7. Authorized agent submits request with missing mandate -> connected, rejected, no effect
        f_nomandate = make_fixture("no-mandate.txt", "l1-nomandate")
        f_nomandate["proof"]["mandate_signature"] = []
        p_nomandate = write_payload("nomandate.json", {"fixture": f_nomandate})
        r7_nomandate = send_unix(agent_uid, agent_uid, request_sock, p_nomandate)

        # 8. Authorized agent attempts JSON requested_by spoofing -> rejected peer_identity_mismatch
        f_spoof = make_fixture("spoof.txt", "l1-spoof", caller="other-agent")
        p_spoof = write_payload("spoof.json", {"fixture": f_spoof})
        r8_spoof = send_unix(agent_uid, agent_uid, request_sock, p_spoof)

        # 9. Operator halts via admin.sock -> next valid agent request blocked in <1s; agent still EACCES on admin
        p_halt = write_payload("halt.json", {"action": "engage", "reason": "l1 operator halt"})
        f_after_halt = make_fixture("after-halt.txt", "l1-after-halt")
        p_after_halt = write_payload("after-halt.json", {"fixture": f_after_halt})
        t0 = time.monotonic_ns()
        r9_halt = send_unix(operator_uid, operator_uid, admin_sock, p_halt)
        r9_blocked = send_unix(agent_uid, agent_uid, request_sock, p_after_halt)
        r9_latency_ms = (time.monotonic_ns() - t0) / 1_000_000.0
        r9_agent_resume_after = send_unix(agent_uid, agent_uid, admin_sock, p_resume)

        # Stop observer cleanly and collect kernel inotify evidence
        observer_proc.terminate()
        observer_proc.wait(timeout=5)
        observer_data = json.loads(obs_out.read_text())

        checks = {
            "c1_conservative_halt_blocks_agent": (
                r1_halted["connected"]
                and not r1_halted["response"]["ok"]
                and r1_halted["response"]["error"].startswith("kill_switch_engaged: initial_conservative_halt")
            ),
            "c2_agent_denied_admin_sock_eacces": (
                not r2_agent_admin["connected"] and r2_agent_admin["errno"] == errno.EACCES
            ),
            "c3_stranger_denied_request_sock_eacces": (
                not r3_stranger["connected"] and r3_stranger["errno"] == errno.EACCES
            ),
            "c4_agent_denied_direct_target_db_evidence_and_observer_signal": (
                r4_tamper["direct_target_write"]["denied"]
                and r4_tamper["direct_target_write"]["errno"] == errno.EACCES
                and r4_tamper["db_write"]["denied"]
                and r4_tamper["db_write"]["errno"] == errno.EACCES
                and r4_tamper["db_unlink"]["denied"]
                and r4_tamper["db_unlink"]["errno"] == errno.EACCES
                and r4_tamper["db_replace"]["denied"]
                and r4_tamper["db_replace"]["errno"] == errno.EACCES
                and r6b_tamper_post["approved_unlink"]["denied"]
                and r6b_tamper_post["approved_unlink"]["errno"] == errno.EACCES
                and r6b_tamper_post["approved_replace"]["denied"]
                and r6b_tamper_post["approved_replace"]["errno"] == errno.EACCES
                and r4_tamper["evidence_write"]["denied"]
                and r4_tamper["evidence_write"]["errno"] == errno.EACCES
                and r4_tamper["observer_sigterm"]["denied"]
                and r4_tamper["observer_sigterm"]["errno"] == errno.EPERM
            ),
            "c5_operator_activates_with_os_derived_identity": (
                r5_activate["connected"]
                and r5_activate["response"]["ok"]
                and r5_activate["response"]["derived_operator"].startswith(f"os-uid:{operator_uid}:")
                and not r5_activate["response"]["state"]["engaged"]
            ),
            "c6_agent_permitted_action_executes_as_executor_uid": (
                r6_approved["connected"]
                and r6_approved["response"]["ok"]
                and r6_approved["response"]["effect_completed"]
                and approved_stat_uid == executor_uid
                and observer_data["healthy"]
                and any(e["name"] == "approved.txt" and (e["mask"] & 0x100) for e in observer_data["events"])
            ),
            "c7_agent_missing_mandate_produces_no_effect": (
                r7_nomandate["connected"]
                and not r7_nomandate["response"]["ok"]
                and not (target_dir / "no-mandate.txt").exists()
            ),
            "c8_os_identity_rejects_json_spoofing": (
                r8_spoof["connected"]
                and not r8_spoof["response"]["ok"]
                and r8_spoof["response"]["error"].startswith("peer_identity_mismatch")
                and not (target_dir / "spoof.txt").exists()
            ),
            "c9_operator_halt_blocks_agent_under_1s_and_agent_cannot_resume": (
                r9_halt["connected"]
                and r9_halt["response"]["ok"]
                and r9_blocked["connected"]
                and not r9_blocked["response"]["ok"]
                and r9_blocked["response"]["error"].startswith("kill_switch_engaged")
                and r9_latency_ms < 1000.0
                and not (target_dir / "after-halt.txt").exists()
                and not r9_agent_resume_after["connected"]
                and r9_agent_resume_after["errno"] == errno.EACCES
            ),
        }

        commit = subprocess.check_output(
            ["git", "-c", "safe.directory=*", "-C", str(repository), "rev-parse", "HEAD"],
            text=True,
        ).strip()
        report = {
            "scope": "L1_MULTI_UID_DUAL_UNIX_SOCKET_SO_PEERCRED",
            "repository_commit": commit,
            "environment": {
                "platform": platform.platform(),
                "python": sys.version,
                "uids": {
                    "executor": executor_uid,
                    "agent": agent_uid,
                    "operator": operator_uid,
                    "observer": observer_uid,
                    "stranger": stranger_uid,
                },
            },
            "checks": checks,
            "all_passed": all(checks.values()),
            "enforcement_latency_ms": round(r9_latency_ms, 3),
            "evidence": {
                "r1_halted": r1_halted,
                "r2_agent_admin": r2_agent_admin,
                "r3_stranger": r3_stranger,
                "r4_tamper": r4_tamper,
                "r6b_tamper_post": r6b_tamper_post,
                "r5_activate": r5_activate,
                "r6_approved": r6_approved,
                "approved_file_owner_uid": approved_stat_uid,
                "r7_nomandate": r7_nomandate,
                "r8_spoof": r8_spoof,
                "r9_halt": r9_halt,
                "r9_blocked": r9_blocked,
                "r9_agent_resume_after": r9_agent_resume_after,
                "observer": observer_data,
            },
        }
        (output / "report.json").write_bytes(canonical(report))
        key = Ed25519PrivateKey.generate()
        public = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        manifest = canonical(
            {
                "format": "arkhe-lab-manifest-1",
                "files": {"report.json": sha((output / "report.json").read_bytes())},
            }
        )
        (output / "manifest.json").write_bytes(manifest)
        (output / "manifest.sig").write_bytes(key.sign(manifest))
        (output / "issuer.pub").write_bytes(public)
        print(json.dumps({"all_passed": report["all_passed"], "checks": checks, "latency_ms": report["enforcement_latency_ms"]}, indent=2))
        print("LAB_PUBLIC_KEY_BASE64=" + base64.b64encode(public).decode())
        print("VERIFIED_FILES=" + str(verify(output, public)))
        return 0 if report["all_passed"] else 1
    finally:
        if daemon_proc is not None and daemon_proc.poll() is None:
            daemon_proc.terminate()
            daemon_proc.wait(timeout=5)
        if observer_proc.poll() is None:
            observer_proc.terminate()
            observer_proc.wait(timeout=5)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--binary", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--repository", type=Path, required=True)
    p.add_argument("--executor-uid", type=int, default=2000)
    p.add_argument("--agent-uid", type=int, default=2001)
    p.add_argument("--operator-uid", type=int, default=2002)
    p.add_argument("--observer-uid", type=int, default=2003)
    p.add_argument("--stranger-uid", type=int, default=2004)
    a = p.parse_args()
    raise SystemExit(
        run_l1(
            a.binary.resolve(),
            a.output.resolve(),
            a.repository.resolve(),
            a.executor_uid,
            a.agent_uid,
            a.operator_uid,
            a.observer_uid,
            a.stranger_uid,
        )
    )
