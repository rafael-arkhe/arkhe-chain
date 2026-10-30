import sys, tarfile, hashlib, subprocess
from pathlib import Path
root=Path(sys.argv[1]).resolve()
expected_commit="2c2729d47b9b5c7421c16fd258b2fa7e3ad6ddfc"
assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()==expected_commit
archive=root/".dep/starkware-solidity-dependencies.tar"
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="843d1fc68aed15dcbd2dc6c3a30592cebedbfc6b60d5fae0c1071391516efcda"
dest=Path(__file__).resolve().parent/"starkgate-deps"
dest.mkdir(exist_ok=True)
with tarfile.open(archive) as t:
    members=t.getmembers()
    assert sum(m.size for m in members)<5_000_000
    assert all(m.isfile() or m.isdir() for m in members)
    t.extractall(dest,filter="data")
print("Dependencies extracted from hash-verified upstream archive.")
