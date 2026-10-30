"""Bounded Podman filesystem probe; no real agent, records or model inference."""
import argparse
import json
import subprocess
import time
import uuid
from pathlib import Path


def probe(connection="arkhe-runtime", image="docker.io/library/node:24-bookworm-slim"):
    def command(args, check=True):
        return subprocess.run(["podman","--connection",connection,*args],capture_output=True,
                              text=True,timeout=30,check=check)
    # Resolve once, never pull, then run by immutable image ID.
    image_id=command(["image","inspect",image,"--format","{{.Id}}"] ).stdout.strip()
    if len(image_id)==64 and all(c in "0123456789abcdef" for c in image_id):
        image_id="sha256:"+image_id
    if not image_id.startswith("sha256:") or len(image_id)!=71:
        raise ValueError("image identity unavailable")
    prefix="arkhe-arm-probe-"+uuid.uuid4().hex[:12]
    names={arm:prefix+"-"+arm.lower() for arm in ("A","B","C")}
    flags=["--pull=never","--read-only","--network=none","--cap-drop=ALL",
           "--security-opt=no-new-privileges","--cgroups=disabled",
           "--user=65534:65534","--tmpfs=/tmp:rw,nosuid,nodev,size=4m,mode=1777","--entrypoint=node"]
    try:
        controls={}
        configurations={}
        for arm,name in names.items():
            setup="const fs=require('fs');const arm="+json.dumps(arm)+";fs.mkdirSync('/tmp/arm-'+arm);fs.writeFileSync('/tmp/arm-'+arm+'/sentinel','synthetic-'+arm);setInterval(()=>{},1000);"
            command(["run","--detach","--name",name,*flags,image_id,"-e",setup])
            positive=False
            for _ in range(10):
                check="process.exit(require('fs').readFileSync('/tmp/arm-"+arm+"/sentinel','utf8')==='synthetic-"+arm+"'?0:3)"
                result=command(["exec",name,"node","-e",check],check=False)
                if result.returncode==0:
                    positive=True
                    break
                time.sleep(.1)
            if not positive:
                raise RuntimeError("positive control failed; no isolation conclusion")
            controls[arm]=True
            inspected=json.loads(command(["inspect",name]).stdout)[0]
            config=inspected["HostConfig"]
            configurations[arm]={"network_mode":config.get("NetworkMode"),
                "readonly_rootfs":config.get("ReadonlyRootfs"),"user":inspected["Config"].get("User"),
                "host_mount_sources":[m.get("Source") for m in inspected.get("Mounts",[]) if m.get("Type")!="tmpfs"]}
        observations=[]
        for observer,target in (("A","B"),("B","A"),("C","B")):
            code="const fs=require('fs');let cross;try{fs.readFileSync('/tmp/arm-"+target+"/sentinel');cross='READABLE'}catch(e){cross=e.code}console.log(JSON.stringify({cross_path_result:cross,uid:process.getuid(),cap_eff:fs.readFileSync('/proc/self/status','utf8').match(/^CapEff:\\s*(.*)$/m)[1]}));"
            seen=json.loads(command(["exec",names[observer],"node","-e",code]).stdout)
            observations.append({"observer":observer,"target":target,**seen})
        passed=(all(v["cross_path_result"]=="ENOENT" and v["uid"]==65534 and int(v["cap_eff"],16)==0 for v in observations)
            and all(v["network_mode"]=="none" and v["readonly_rootfs"] is True and not v["host_mount_sources"] for v in configurations.values()))
        return {"phase":"container_isolation_probe","image_id":image_id,"connection":connection,
            "positive_controls":controls,"observations":observations,"container_observations":configurations,
            "filesystem_probe":"PASSED" if passed else "FAILED","sandbox_qualified_for_pilot":False,
            "resource_limits":"NOT_ENFORCED_FILESYSTEM_ONLY_PROBE",
            "scope":"synthetic_files_in_distinct_containers_only","real_records_accessed":False,
            "model_calls":0,"capability_demonstrated":False}
    finally:
        errors=[]
        for name in names.values():
            try:
                exists=command(["container","exists",name],check=False)
                if exists.returncode==0: command(["rm","--force",name])
                elif exists.returncode!=1: errors.append(name)
            except (OSError,subprocess.SubprocessError): errors.append(name)
        if errors: raise RuntimeError("could not verify cleanup of probe containers: "+", ".join(errors))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection",default="arkhe-runtime")
    parser.add_argument("--image",default="docker.io/library/node:24-bookworm-slim")
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    # Reserve output before creating resources; never overwrite prior evidence.
    with args.output.open("x",encoding="utf-8") as stream:
        try:
            result=probe(args.connection,args.image)
        except Exception as error:
            json.dump({"phase":"container_isolation_probe","filesystem_probe":"INCOMPLETE",
                       "error_type":type(error).__name__,"sandbox_qualified_for_pilot":False},stream,indent=2)
            stream.write("\n")
            raise
        else:
            json.dump(result,stream,indent=2)
            stream.write("\n")
