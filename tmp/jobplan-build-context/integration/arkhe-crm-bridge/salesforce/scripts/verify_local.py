"""Record reproducible offline gates; no authentication, deploy or external service assertion."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    root=Path(__file__).resolve().parents[1]
    if not (root/"native/Cargo.toml").is_file():
        raise SystemExit("Run from the exported standalone repository")
    evidence=root/"evidence/local"
    evidence.mkdir(parents=True,exist_ok=True)
    binary=root/"native/target/debug"/("arkhe-crm-bridge-cli.exe" if sys.platform=="win32" else "arkhe-crm-bridge-cli")
    commands=[
        ["node","scripts/check-syntax.mjs"],
        [sys.executable,"scripts/check_metadata.py"],
        [sys.executable,"-m","unittest","discover","-s","scripts","-p","test_*.py","-v"],
        ["cargo","fmt","--manifest-path","native/Cargo.toml","--all","--check"],
        ["cargo","test","--manifest-path","native/Cargo.toml","-p","arkhe-crm-bridge-cli","--locked"],
        ["cargo","clippy","--manifest-path","native/Cargo.toml","-p","arkhe-crm-bridge-cli","--all-targets","--locked","--","-D","warnings"],
        ["cargo","build","--manifest-path","native/Cargo.toml","-p","arkhe-crm-bridge-cli","--locked"],
        [sys.executable,"scripts/e2e_bridge.py","--binary",str(binary)],
    ]
    results=[]
    for index,command in enumerate(commands,1):
        executable=shutil.which(command[0])
        if not executable:
            raise SystemExit("Missing required local executable: "+command[0])
        process=subprocess.run([executable,*command[1:]],cwd=root,capture_output=True,text=True,encoding="utf-8",errors="replace")
        log=evidence/f"{index:02d}.log"
        log.write_text(process.stdout+process.stderr,encoding="utf-8")
        results.append({"command":command,"exit_code":process.returncode,"log":log.name,
            "log_sha256":hashlib.sha256(log.read_bytes()).hexdigest()})
        print(f"Gate {index}/{len(commands)}: exit {process.returncode}",flush=True)
        if process.returncode:
            break
    record={"scope":"offline standalone Salesforce package; no org execution", "gates":results,
        "passed":len(results)==len(commands) and all(row["exit_code"]==0 for row in results),
        "salesforce_compilation_verified":False,"live_permissions_verified":False,"live_concurrency_verified":False}
    (evidence/"results.json").write_text(json.dumps(record,indent=2),encoding="utf-8")
    return 0 if record["passed"] else 1


if __name__=="__main__": raise SystemExit(main())
