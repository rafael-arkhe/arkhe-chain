"""Provision an isolated memo audit DB on the existing labelled local PG16.

Credentials stay in ignored ops/local and subprocess environments, never logs.
The database is retained for inspection; existing databases/volumes are untouched.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
engine = ["podman", "--connection", "arkhe-runtime"]
container = "arkhe-live-postgres"
label = subprocess.check_output(engine + ["inspect", container, "--format",
                                         '{{index .Config.Labels "io.arkhe.environment"}}'], text=True).strip()
if label != "live-v1":
    raise RuntimeError("refusing unrelated PostgreSQL container")
suffix = uuid.uuid4().hex
database = "arkhe_memo_audit_" + suffix
role = "arkhe_memo_" + suffix
password = secrets.token_hex(32)
output = ROOT / "output" / ("memo-postgres-audit-" + suffix)
output.mkdir()
cfg = json.loads((ROOT / "ops/local/live.json").read_text())
runtime_url = f"postgresql://{role}:{password}@127.0.0.1:55432/{database}"
admin_url = f"postgresql://postgres:{cfg['admin_password']}@127.0.0.1:55432/{database}"
private = ROOT / "ops/local" / ("memo-postgres-" + suffix + ".json")
private.write_text(json.dumps({"database": database, "runtime_url": runtime_url, "admin_url": admin_url}, indent=2))
psql = engine + ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"]
sql = (f"CREATE DATABASE {database};\n"
       f"CREATE ROLE {role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT PASSWORD '{password}';\n")
subprocess.run(psql, input=sql, text=True, check=True, stdout=subprocess.DEVNULL)

def run(label, command, env=None, cwd=ROOT):
    result = subprocess.run(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=180)
    # Defensive redaction before writing diagnostics in the public workspace.
    text = result.stdout.replace(password, "[redacted]").replace(cfg["admin_password"], "[redacted]")
    (output / f"{label}.log").write_text(text + f"\nexit_code={result.returncode}\n", encoding="utf-8")
    print(f"{label}: exit_code={result.returncode}", flush=True)
    if result.returncode:
        print(text, flush=True)
        raise RuntimeError(f"{label} failed; see audit log")
    return text

run("migrate", ["cargo", "run", "--locked", "-p", "arkhe-sql-migrate", "--", "migrate"],
    {**os.environ, "DATABASE_URL": admin_url})
for audit in ["checksum-verify", "rls-audit", "append-only-audit"]:
    run(audit, ["cargo", "run", "--locked", "-p", "arkhe-sql-migrate", "--", audit],
        {**os.environ, "DATABASE_URL": admin_url}, cwd=ROOT / "storage/sql")
subprocess.run(psql, input=f"GRANT arkhe_append,arkhe_read TO {role};", text=True,
               check=True, stdout=subprocess.DEVNULL)
run("build-example", ["cargo", "build", "--locked", "-p", "arkhe-wormgraph", "--example", "memo_persistence"])
binary = ROOT / "target/debug/examples" / ("memo_persistence.exe" if os.name == "nt" else "memo_persistence")
env = {**os.environ, "ARKHE_MEMO_DATABASE_URL": runtime_url, "ARKHE_MEMO_TEST_ADMIN_URL": admin_url,
       "ARKHE_MEMO_EXAMPLE_BINARY": str(binary)}
test_log = run("crash-and-recovery", ["cargo", "test", "--locked", "-p", "arkhe-wormgraph", "--test",
                                    "memo_postgres", "--", "--ignored", "--nocapture", "--test-threads=1"], env)
for marker in ["writer forcibly terminated", "package byte equality", "three-leaf graph",
               "cannot mutate", "zero package/envelope/checkpoint", "isolated by RLS"]:
    if marker not in test_log:
        raise RuntimeError(f"missing test evidence: {marker}")
# Also retain a CLI commit/export/offline-verify artifact in a separate tenant.
env["ARKHE_MEMO_TENANT"] = "memo-cli-audit"
fixture = ROOT / "evidence/arkhe-wormgraph/tests/fixtures/memo"
receipt = json.loads(run("cli-commit", [str(binary), "commit", str(fixture / "bundle.json"), str(fixture / "trust.json")], env).strip())
record_hash = bytes(receipt["record_hash"]).hex()
export_dir = output / "export"
run("cli-export", [str(binary), "export", record_hash, str(export_dir)], env)
run("offline-verify", [str(binary), "verify", str(export_dir / "export.json"), str(export_dir / "graph-trust.json")])
(output / "summary.json").write_text(json.dumps({
    "database": database, "restricted_runtime_role": role,
    "process_kill_after_commit": "passed", "process_kill_before_commit_rollback": "passed",
    "tenant_isolation": "passed", "append_only": "passed", "idempotency": "passed",
    "offline_reconstruction": "passed", "record_hash": record_hash,
    "external_anchor": False, "rpc_consensus_authenticated": False,
    "scope": "Isolated local PG16; synthetic invoice and retained RPC data; process crash, not power-loss test"
}, indent=2), encoding="utf-8")
print(f"Evidence: {output}", flush=True)
