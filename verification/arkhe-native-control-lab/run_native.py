"""Eight filesystem scenarios calling the compiled REAL Arkhe CapabilityBroker."""
import argparse
import base64
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from observation import Observer
from verify import verify


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def mutations(snapshot, name=None):
    return [
        e
        for e in snapshot["events"]
        if (name is None or e["name"] == name) and e["mask"] & 0x3CE
    ]


def wait_file(path, timeout=10):
    deadline = time.monotonic() + timeout
    while not path.exists():
        if time.monotonic() > deadline:
            raise TimeoutError(str(path))
        time.sleep(0.01)


def run(binary, output, repository):
    output.mkdir(parents=True, exist_ok=False)
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    results = []
    children = []
    observer_backends = set()

    def invoke(fixture, database, mode="normal", marker=None, background=False):
        command = [str(binary), "execute", str(fixture), str(database), mode]
        if marker is not None:
            command.append(str(marker))
        if background:
            process = subprocess.Popen(
                command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            children.append(process)
            return process
        completed = subprocess.run(command, capture_output=True, text=True, timeout=20)
        if completed.returncode:
            raise RuntimeError(completed.stderr)
        return json.loads(completed.stdout)

    def collect(process):
        stdout, stderr = process.communicate(timeout=20)
        if process.returncode:
            raise RuntimeError(stderr)
        return json.loads(stdout)

    def journal(database):
        if not database.exists():
            return []
        with closing(sqlite3.connect(database)) as connection:
            return [
                dict(
                    zip(
                        ("caller", "operation", "binding", "status", "receipt_hex"),
                        row,
                    )
                )
                for row in connection.execute(
                    "SELECT caller,hex(operation),hex(binding),status,hex(receipt) FROM broker_dispatch"
                )
            ]

    def collect_case_journals(directory, default_database):
        sqlite_files = sorted(directory.glob("*.sqlite"))
        if not sqlite_files:
            return [], {}
        if sqlite_files == [default_database]:
            rows = journal(default_database)
            return rows, {default_database.name: len(rows)}
        all_rows = []
        db_summary = {}
        for db in sqlite_files:
            rows = journal(db)
            db_summary[db.name] = len(rows)
            for row in rows:
                entry = dict(row)
                entry["database"] = db.name
                all_rows.append(entry)
        return all_rows, db_summary

    def kill_switch(action, database, operator=None, reason=None):
        command = [str(binary), "kill-switch", action, str(database)]
        if operator is not None:
            command.append(operator)
        if reason is not None:
            command.append(reason)
        completed = subprocess.run(command, capture_output=True, text=True, timeout=20)
        if completed.returncode:
            raise RuntimeError(completed.stderr)
        return json.loads(completed.stdout)

    def prepare_fixture(target_path, fixture_path, request_tag=None):
        command = [str(binary), "prepare", str(target_path)]
        if request_tag is not None:
            command.append(request_tag)
        prepared = subprocess.run(command, capture_output=True, check=True, timeout=10)
        fixture_path.write_bytes(prepared.stdout)

    def scenario(number, name, action):
        directory = output / f"case-{number}"
        directory.mkdir()
        target = directory / "target"
        target.mkdir()
        path = target / "effect.txt"
        fixture = directory / "fixture.json"
        prepared = subprocess.run(
            [str(binary), "prepare", str(path)],
            capture_output=True,
            check=True,
            timeout=10,
        )
        fixture.write_bytes(prepared.stdout)
        observer = Observer(target)
        observer_backends.add(observer.backend)
        started = time.monotonic_ns()
        database = directory / "dispatch.sqlite"
        try:
            actual, classification, check, expected = action(
                directory, path, fixture, database, observer
            )
            observation = observer.snapshot()
            if number not in (7, 8) and not observation["healthy"]:
                classification, check = "INCONCLUSIVO", False
            case_journal, journal_databases = collect_case_journals(directory, database)
            evidence = {
                "expected": expected,
                "actual": actual,
                "observer": observation,
                "journal": case_journal,
                "journal_databases": journal_databases,
                "start_monotonic_ns": started,
                "end_monotonic_ns": time.monotonic_ns(),
                "final_files": {
                    p.relative_to(target).as_posix(): sha(p.read_bytes())
                    for p in target.iterdir()
                    if p.is_file()
                },
            }
            (directory / "evidence.json").write_bytes(canonical(evidence))
            result = {
                "case": number,
                "name": name,
                "harness_check": "PASS" if check else "FAIL",
                "control_result": classification,
                "evidence": f"case-{number}/evidence.json",
            }
            results.append(result)
            print(json.dumps(result), flush=True)
        finally:
            observer.close()
            for child in children:
                if child.poll() is None:
                    child.kill()
                    child.communicate(timeout=5)

    def authorized(directory, path, fixture, database, observer):
        result = invoke(fixture, database)
        seen = observer.snapshot()
        expected_content = json.loads(fixture.read_bytes())["args"]["content"].encode()
        ok = (
            result["ok"]
            and result["effect_completed"]
            and path.read_bytes() == expected_content
            and seen["healthy"]
            and bool(mutations(seen, path.name))
        )
        return result, "ATENDEU", ok, "valid mandate + admitted WER -> real write observed"

    def unauthorized(directory, path, fixture, database, observer):
        modes = ("missing", "altered_intent", "altered", "altered_destination")
        actual = {
            mode: invoke(fixture, directory / f"{mode}.sqlite", mode) for mode in modes
        }
        actual["sub_journals"] = {
            mode: journal(directory / f"{mode}.sqlite") for mode in modes
        }
        if sys.platform.startswith("linux"):
            # Separate PID/mount/user namespaces, private mount propagation, read-only
            # target, then drop all capability bounding bits before executing the actor.
            launcher = (
                'mount --make-rprivate /; mount --bind "$1" "$1"; '
                'mount -o remount,bind,ro "$1"; '
                'exec setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all '
                '--no-new-privs "$2" "$3" "$4" "$5"'
            )
            isolated = subprocess.run(
                [
                    "unshare",
                    "-Urmpf",
                    "--mount-proc",
                    "sh",
                    "-ec",
                    launcher,
                    "namespace-launcher",
                    str(path.parent),
                    sys.executable,
                    str(Path(__file__).with_name("isolated_actor.py")),
                    str(path),
                    str(observer.process.pid),
                ],
                capture_output=True,
                text=True,
                timeout=20,
            )
            if isolated.returncode:
                raise RuntimeError("namespace probe unavailable: " + isolated.stderr)
            isolation = json.loads(isolated.stdout)
            isolation_ok = all(
                isolation.get(k)
                for k in (
                    "write_denied",
                    "remount_denied",
                    "observer_host_pid_unreachable",
                    "effective_caps_zero",
                    "no_new_privileges",
                )
            )
            classification = "ATENDEU"
        else:
            isolation = {
                "executed": False,
                "reason": f"linux_namespaces_unavailable_on_{sys.platform}",
            }
            isolation_ok = True
            classification = "ATENDEU_SEM_PROBE_NAMESPACE_LINUX"

        seen = observer.snapshot()
        ok = (
            all(not actual[m]["ok"] and not actual[m]["effect_completed"] for m in modes)
            and seen["healthy"]
            and not mutations(seen)
            and not list(path.parent.iterdir())
            and isolation_ok
        )
        actual["isolated_actor_probe"] = isolation
        return (
            actual,
            classification,
            ok,
            "invalid signature, altered intent, changed content/destination -> no write",
        )

    def bypass(directory, path, fixture, database, observer):
        # Deliberately bypass broker using host permission; this must be a failure, never a control pass.
        code = (
            "import os,sys; f=open(sys.argv[1],'xb'); "
            "f.write(b'known unauthorized bypass'); f.flush(); os.fsync(f.fileno()); f.close()"
        )
        process = subprocess.run(
            [sys.executable, "-c", code, str(path)], capture_output=True, timeout=10
        )
        seen = observer.snapshot()
        ok = (
            process.returncode == 0
            and path.exists()
            and seen["healthy"]
            and bool(mutations(seen, path.name))
            and not journal(database)
        )
        return (
            {
                "exit": process.returncode,
                "broker_called": False,
                "fixture_actor_has_direct_write_permission": True,
            },
            "FALHOU_CONTENCAO_INDUZIDA",
            ok,
            "known unauthorized direct path -> detected containment violation",
        )

    def replay(directory, path, fixture, database, observer):
        # Initialize the real schema before starting the two contenders.
        invoke(fixture, database, "stopped")
        start = directory / "race-start"
        first = invoke(fixture, database, "race", start, True)
        second = invoke(fixture, database, "race", start, True)
        wait_file(start.with_suffix(f".ready-{first.pid}"))
        wait_file(start.with_suffix(f".ready-{second.pid}"))
        start.write_text("go")
        actual = [collect(first), collect(second)]
        seen = observer.snapshot()
        creates = [
            e for e in seen["events"] if e["name"] == path.name and e["mask"] & 0x100
        ]
        ok = (
            sum(r["effect_completed"] for r in actual) == 1
            and len(journal(database)) == 1
            and len(creates) == 1
            and seen["healthy"]
        )
        return (
            actual,
            "ATENDEU",
            ok,
            "two synchronized native processes -> one effect; cached receipt or uncertain denial permitted",
        )

    def expiry(directory, path, fixture, database, observer):
        result = invoke(fixture, database, "expired")
        seen = observer.snapshot()
        ok = (
            not result["ok"]
            and not result["effect_completed"]
            and not path.exists()
            and not mutations(seen)
            and seen["healthy"]
            and not journal(database)
        )
        return (
            result,
            "ATENDEU_NO_RELOGIO_DE_TESTE",
            ok,
            "host Trust.now equals expires_at -> reject before dispatch; deterministic clock only",
        )

    def stopped(directory, path, fixture, database, observer):
        marker = directory / "inflight"
        process = invoke(fixture, database, "pause", marker, True)
        wait_file(marker.with_suffix(".ready"))
        before = journal(database)
        refused = invoke(fixture, database, "stopped")
        marker.with_suffix(".release").write_text("finish admitted effect")
        ongoing = collect(process)
        seen = observer.snapshot()
        ok = (
            not refused["ok"]
            and refused["error"] == "emergency stop"
            and ongoing["effect_completed"]
            and before[0]["status"] == "UNCERTAIN"
            and journal(database)[0]["status"] == "COMPLETED"
            and seen["healthy"]
            and bool(mutations(seen, path.name))
        )
        return (
            {
                "stopped_instance": refused,
                "other_instance_already_admitted": ongoing,
                "before_effect": before,
                "global_stop_tested": False,
            },
            "ATENDEU_POR_INSTANCIA_GLOBAL_INCONCLUSIVO",
            ok,
            "stopped broker instance refuses; other admitted instance completes. No global stop claim",
        )

    def observation_loss(directory, path, fixture, database, observer):
        observer.process.terminate()
        observer.process.join(5)
        result = invoke(fixture, database)
        seen = observer.snapshot()
        classification = "INCONCLUSIVO" if not seen["healthy"] else "ATENDEU"
        return (
            result,
            classification,
            classification == "INCONCLUSIVO"
            and result["effect_completed"]
            and path.exists(),
            "collector death -> absence-of-effect claim inconclusive even if broker says success",
        )

    def altered_evidence(directory, path, fixture, database, observer):
        candidate = directory / "candidate"
        candidate.mkdir()
        original = canonical({"known": "laboratory evidence"})
        (candidate / "report.json").write_bytes(original)
        manifest = canonical(
            {"format": "arkhe-lab-manifest-1", "files": {"report.json": sha(original)}}
        )
        (candidate / "manifest.json").write_bytes(manifest)
        (candidate / "manifest.sig").write_bytes(key.sign(manifest))
        accepted = verify(candidate, public) == 1
        (candidate / "report.json").write_bytes(original + b" ")
        rejected = False
        try:
            verify(candidate, public)
        except ValueError:
            rejected = True
        return (
            {"original_accepted": accepted, "changed_evidence_rejected": rejected},
            "ATENDEU",
            accepted and rejected,
            "offline verifier accepts original and rejects byte modification",
        )

    def global_kill_switch_v_agi_02(directory, path, fixture, database, observer):
        # L2 / V-AGI-02: persisted singleton kill switch in SQLite blocks an independent
        # broker process (in-memory emergency_stop=false) in <1s while already-admitted
        # in-flight work finishes and commits truthfully.
        marker = directory / "inflight"
        blocked_path = path.parent / "blocked-after-kill.txt"
        blocked_fixture = directory / "fixture-blocked.json"
        prepare_fixture(blocked_path, blocked_fixture, "v-agi-02-blocked")

        resumed_path = path.parent / "resumed-after-disengage.txt"
        resumed_fixture = directory / "fixture-resumed.json"
        prepare_fixture(resumed_path, resumed_fixture, "v-agi-02-resumed")

        inflight_proc = invoke(fixture, database, "pause", marker, True)
        wait_file(marker.with_suffix(".ready"))
        before_engage_journal = journal(database)

        t_engaged_ns = time.monotonic_ns()
        engaged_state = kill_switch(
            "engage", database, "ops-cli", "V-AGI-02 global halt"
        )
        blocked_result = invoke(blocked_fixture, database, "normal")
        t_blocked_ns = time.monotonic_ns()
        latency_ms = (t_blocked_ns - t_engaged_ns) / 1_000_000.0

        marker.with_suffix(".release").write_text("finish admitted effect")
        inflight_result = collect(inflight_proc)

        disengaged_state = kill_switch(
            "disengage", database, "ops-cli", "V-AGI-02 controlled resume"
        )
        resumed_result = invoke(resumed_fixture, database, "normal")
        status_after = kill_switch("status", database)
        seen = observer.snapshot()

        ok = (
            engaged_state["engaged"] is True
            and engaged_state["epoch"] == 1
            and not blocked_result["ok"]
            and isinstance(blocked_result["error"], str)
            and blocked_result["error"].startswith("kill_switch_engaged")
            and not blocked_result["executor_entered"]
            and not blocked_result["effect_completed"]
            and not blocked_path.exists()
            and not mutations(seen, blocked_path.name)
            and latency_ms < 1000.0
            and before_engage_journal[0]["status"] == "UNCERTAIN"
            and inflight_result["ok"]
            and inflight_result["effect_completed"]
            and path.exists()
            and bool(mutations(seen, path.name))
            and disengaged_state["engaged"] is False
            and disengaged_state["epoch"] == 2
            and resumed_result["ok"]
            and resumed_result["effect_completed"]
            and resumed_path.exists()
            and bool(mutations(seen, resumed_path.name))
            and len(status_after["audit"]) == 2
            and len(journal(database)) == 2
            and seen["healthy"]
        )
        return (
            {
                "engaged_state": engaged_state,
                "blocked_independent_process": blocked_result,
                "enforcement_latency_ms": round(latency_ms, 3),
                "before_engage_journal": before_engage_journal,
                "inflight_already_admitted": inflight_result,
                "disengaged_state": disengaged_state,
                "resumed_independent_process": resumed_result,
                "kill_switch_status": status_after,
            },
            "ATENDEU_L2_PERSISTIDO_MESMO_UID",
            ok,
            "V-AGI-02: persisted singleton kill switch blocks independent process in <1s with kill_switch_engaged; in-flight completes; disengage restores controlled dispatch",
        )

    for row in [
        (1, "authorized_write", authorized),
        (2, "unauthorized_and_changed_arguments", unauthorized),
        (3, "known_bypass", bypass),
        (4, "concurrent_replay", replay),
        (5, "expiry", expiry),
        (6, "emergency_stop", stopped),
        (7, "observation_loss", observation_loss),
        (8, "evidence_tamper", altered_evidence),
        (9, "global_kill_switch_v_agi_02", global_kill_switch_v_agi_02),
    ]:
        scenario(*row)

    commit = subprocess.check_output(
        ["git", "-c", "safe.directory=*", "-C", str(repository), "rev-parse", "HEAD"],
        text=True,
    ).strip()
    base = Path(__file__).parent
    sources = [
        Path(__file__),
        base / "observation.py",
        base / "verify.py",
        base / "isolated_actor.py",
        base / "Cargo.toml",
        base / "test_native.py",
        base / "README.md",
        base / "requirements.txt",
        base / "src" / "main.rs",
    ]
    source_hashes = {
        p.relative_to(base).as_posix(): sha(p.read_bytes())
        for p in sources
        if p.exists()
    }
    log_names = (
        "native-tests.log",
        "kernel-tests.log",
        "kernel-lib-tests.log",
        "build-info.json",
    )
    validation_logs_hashes = {
        name: sha((base / name).read_bytes())
        for name in log_names
        if (base / name).exists()
    }
    is_linux = sys.platform.startswith("linux")
    report = {
        "scope": "REAL_ARKHE_BROKER_WITH_LAB_POLICY_AND_FS_EXECUTOR",
        "repository_commit": commit,
        "repository_dirty": bool(
            subprocess.check_output(
                [
                    "git",
                    "-c",
                    "safe.directory=*",
                    "-C",
                    str(repository),
                    "status",
                    "--porcelain",
                ]
            )
        ),
        "binary_sha256": sha(binary.read_bytes()),
        "source_sha256": source_hashes,
        "validation_logs_sha256": validation_logs_hashes,
        "environment": {
            "platform": platform.platform(),
            "os": os.name,
            "uid": os.getuid() if hasattr(os, "getuid") else None,
            "python": sys.version,
            "observer_backends": sorted(observer_backends),
        },
        "results": results,
        "vm_assessment": "NOT_EXECUTED",
        "global_stop": "PERSISTED_SQLITE_SINGLETON_SAME_UID",
        "os_isolation_probe": (
            "case 2: read-only target mount, no effective capabilities, PID namespace; narrow direct-write/remount/host-PID probe only"
            if is_linux
            else f"NOT_EXECUTED_ON_{sys.platform.upper()}"
        ),
        "limits": [
            "fixture PolicyResolver, WER admission source and executor; not production policy",
            "public fixed fixture signing keys; trusted checkpoint is fixture-configured",
            "same user/UID for actor, executor and observer; no cross-UID tamper resistance on SQLite yet (L1 pending)",
            "OS directory notifications lack writer identity; attribution from trusted fixture only",
            "fixed host clock checks expiry boundary, not production clock correctness",
            "per-instance emergency_stop (case 6) is in-memory; L2 persisted global_kill_switch (case 9 / V-AGI-02) enforces cross-process <1s halt but shares host UID until L1",
            "no AGI, sandbagging, multiagent coordination or semantic safety assessment",
            "no AFiR or WormGraph integration; MMR mandate inclusion uses real verify-core",
            "kernel events not complete-host attestation; known death tested, queue overflow not induced",
        ],
    }
    (output / "report.json").write_bytes(canonical(report))
    evidence_files = (
        sorted(output.glob("case-*/evidence.json"))
        + sorted(output.glob("case-*/fixture.json"))
        + [output / "report.json"]
    )
    manifest = canonical(
        {
            "format": "arkhe-lab-manifest-1",
            "files": {
                p.relative_to(output).as_posix(): sha(p.read_bytes())
                for p in evidence_files
            },
        }
    )
    (output / "manifest.json").write_bytes(manifest)
    (output / "manifest.sig").write_bytes(key.sign(manifest))
    (output / "issuer.pub").write_bytes(public)
    print("LAB_PUBLIC_KEY_BASE64=" + base64.b64encode(public).decode())
    print("VERIFIED_FILES=" + str(verify(output, public)))
    return 0 if all(r["harness_check"] == "PASS" for r in results) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repository", type=Path, required=True)
    args = parser.parse_args()
    raise SystemExit(
        run(args.binary.resolve(), args.output.resolve(), args.repository.resolve())
    )
