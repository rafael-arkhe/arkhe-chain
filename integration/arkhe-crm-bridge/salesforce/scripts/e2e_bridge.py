"""Real Rust CLI -> approval mapping -> Python recovery, with simulated Salesforce transport."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import tempfile
import time
from deliver_write import deliver
from test_delivery import Org


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--binary",required=True,type=Path)
    args=parser.parse_args()
    binary=args.binary.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="arkhe-write-e2e-") as folder:
        root=Path(folder)
        def run(*arguments, fail=False):
            result=subprocess.run([str(binary),*map(str,arguments)],capture_output=True,text=True)
            if (result.returncode!=0)!=fail:
                raise RuntimeError("Unexpected CLI result; fixture contents withheld")
            return result.stdout
        def save(name,value):
            path=root/name
            path.write_text(json.dumps(value),encoding="utf-8")
            return path
        producer=run("keygen","--secret",root/"producer.key").strip()
        bridge=run("keygen","--secret",root/"bridge.key").strip()
        org=Org()
        now=int(time.time())
        policy=save("policy.json",{"schema":2,"log_id":"e2e","bridge_public_key":bridge,
            "max_age_secs":300,"max_ttl_secs":300,"future_skew_secs":5,"producers":[{
                "id":"e2e-producer","public_key":producer,"org_id":"00D000000000001AAA",
                "source_system":"e2e","object":"Lead","fields":["LeadSource"]}]})
        event=save("event.json",{"schema":2,"log_id":"e2e","event_id":"evt-e2e","producer_id":"e2e-producer",
            "issued_at":now,"expires_at":now+180,"record":{"org_id":"00D000000000001AAA","object":"Lead",
                "record_id":org.lead["Id"],"field":"LeadSource","value":"Web","source_system":"e2e",
                "observed_at":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")}})
        request=save("request.json",json.loads(run("sign","--input",event,"--secret",root/"producer.key")))
        proof=save("proof.json",json.loads(run("anchor","--input",request,"--database",root/"bridge.db",
            "--policy",policy,"--secret",root/"bridge.key")))
        intent=save("intent.json",json.loads(run("sign-write","--proof",proof,"--policy",policy,
            "--expected-version",org.lead["SystemModstamp"],"--secret",root/"producer.key")))
        payload=json.loads(run("prepare-write","--input",intent,"--policy",policy,"--org-id","00D000000000001AAA"))
        org.lose_patch=True
        try:
            deliver(org,payload)
            raise AssertionError("Expected simulated lost response")
        except TimeoutError:
            pass
        assert deliver(org,payload)=="consumed_value_observed"
        assert (org.posts,org.patches)==(1,1)
        changed=json.loads(intent.read_text())
        changed["expected_version"]="2026-10-25T12:00:00.124Z"
        run("prepare-write","--input",save("forged.json",changed),"--policy",policy,"--org-id","00D000000000001AAA",fail=True)
        run("prepare-write","--input",intent,"--policy",policy,"--org-id","00D000000000002AAA",fail=True)
    print("Real CLI signatures, version binding, org rejection and lost-response recovery passed; Salesforce transport was simulated")


if __name__=="__main__": main()
