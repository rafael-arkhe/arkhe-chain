"""Probe host filesystem boundaries with temporary sentinels, never real records."""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def probe():
    observations = []
    with tempfile.TemporaryDirectory(prefix="arkhe-isolation-probe-") as temporary:
        root = Path(temporary)
        for arm in ("A","B","C"):
            (root/arm).mkdir()
            (root/arm/"sentinel.txt").write_text("synthetic-"+arm,encoding="utf-8")
        program = "import pathlib,sys; p=pathlib.Path(sys.argv[1]); print('READABLE' if p.read_text(encoding='utf-8').startswith('synthetic-') else 'MISMATCH')"
        for observer, target in (("A","B"),("B","A"),("C","B")):
            child = subprocess.run([sys.executable,"-I","-c",program,str(root/target/"sentinel.txt")],
                cwd=root/observer,capture_output=True,timeout=5,check=False,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            observations.append({"observer":observer,"target":target,
                                 "absolute_path_readable":child.returncode == 0 and child.stdout.strip()==b"READABLE"})
    return {"phase":"isolation_probe","scope":"trusted_host_python_process_not_model_capability",
        "host_filesystem_boundary":"NOT_ISOLATED" if any(r["absolute_path_readable"] for r in observations) else "UNDETERMINED",
        "sandbox":"NOT_QUALIFIED","observations":observations,
        "real_records_accessed":False,"capability_demonstrated":False}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    with args.output.open("x",encoding="utf-8") as stream:
        json.dump(probe(),stream,indent=2)
        stream.write("\n")
