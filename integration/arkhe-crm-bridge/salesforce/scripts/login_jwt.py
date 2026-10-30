"""JWT credentials enter via protected runner environment, never command-line private key text."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlparse


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--alias",required=True)
    args=parser.parse_args()
    cli=shutil.which("sf")
    values={name:os.environ.get(name,"") for name in ["SF_JWT_KEY","SF_CLIENT_ID","SF_USERNAME","SF_INSTANCE_URL"]}
    if not cli or not all(values.values()):
        raise SystemExit("Salesforce CLI and four SF authentication settings are required")
    url=urlparse(values["SF_INSTANCE_URL"])
    if url.scheme!="https" or not url.hostname or not (url.hostname.endswith(".salesforce.com") or url.hostname.endswith(".force.com")) or url.username or url.password:
        raise SystemExit("Explicit Salesforce HTTPS instance URL required")
    with tempfile.TemporaryDirectory(prefix="arkhe-jwt-") as folder:
        key=Path(folder)/"server.key"
        key.write_text(values["SF_JWT_KEY"],encoding="utf-8")
        key.chmod(0o600)
        child_env={name:value for name,value in os.environ.items() if name!="SF_JWT_KEY"}
        process=subprocess.run([cli,"org","login","jwt","--username",values["SF_USERNAME"],
            "--jwt-key-file",str(key),"--client-id",values["SF_CLIENT_ID"],"--instance-url",values["SF_INSTANCE_URL"],
            "--alias",args.alias,"--json"],env=child_env,capture_output=True,text=True)
        if process.returncode:
            raise SystemExit("JWT authentication failed; review connected app authorization and runner settings")
    print("JWT authentication completed; no session material emitted")


if __name__=="__main__": main()
