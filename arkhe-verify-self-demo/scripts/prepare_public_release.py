"""Create an isolated source package in the user-selected public repository.

Copies only reviewed Rust source/manifests, policy tests, verifier demo and public
test fixtures; excludes build products, local evidence, credentials and private keys.
"""
import hashlib
import json
from pathlib import Path
import shutil
import tomllib

ROOT=Path(__file__).resolve().parents[2]
REPO=ROOT/"output/wasm-policy-release-repo"
OUT=REPO/"verification/arkhe-proof-release"
OUT.mkdir(parents=True,exist_ok=True)
members=["kernel/arkhe-core","integration/auth-md","verification/crates/arkhe-verify-core","verification/crates/arkhe-verify-wasm"]
members += ["kernel/arkhe-kernel", "governance/arkhe-governance", "cognition/arkhe-agent", "cognition/arkhe-cognition-sdk"]
for member in members:
    source=ROOT/member; dest=OUT/member
    dest.mkdir(parents=True,exist_ok=True)
    (dest/"Cargo.toml").write_text((source/"Cargo.toml").read_text().rstrip()+"\n",encoding="utf-8")
    shutil.copytree(source/"src",dest/"src",dirs_exist_ok=True)
kernel_tests=OUT/"kernel/arkhe-kernel/tests"
kernel_tests.mkdir(parents=True,exist_ok=True)
for name in ["action_broker.rs", "broker_durable.rs", "authenticated_dispatch.rs"]:
    shutil.copyfile(ROOT/"kernel/arkhe-kernel/tests"/name,kernel_tests/name)
# Compile the exact production runtime factory without copying unrelated HTTP/SQL services.
host=OUT/"host-dispatch"
(host/"src").mkdir(parents=True,exist_ok=True)
(host/"Cargo.toml").write_text('''[package]
name = "arkhe-host-dispatch"
version.workspace = true
edition.workspace = true
license.workspace = true
[dependencies]
arkhe-kernel = { path = "../kernel/arkhe-kernel", features = ["sqlite-broker"] }
arkhe-governance = { path = "../governance/arkhe-governance" }
arkhe-verify-core = { path = "../verification/crates/arkhe-verify-core" }
''',encoding="utf-8")
shutil.copyfile(ROOT/"orchestration/arkhe-runtime/src/authenticated_dispatch.rs",host/"src/lib.rs")
members.append("host-dispatch")
reference=OUT/"runtime-reference"
(reference/"src").mkdir(parents=True,exist_ok=True)
for name in ["Cargo.toml", "src/lib.rs", "src/authenticated_dispatch.rs"]:
    shutil.copyfile(ROOT/"orchestration/arkhe-runtime"/name,reference/name)
test=OUT/"verification/crates/arkhe-verify-core/tests"
(test/"support").mkdir(parents=True,exist_ok=True)
for name in ["policy_adversarial.rs","policy_compatibility.rs","support/policy_cases.rs"]:
    shutil.copyfile(ROOT/"verification/crates/arkhe-verify-core/tests"/name,test/name)
root_text=(ROOT/"Cargo.toml").read_text()
suffix=root_text[root_text.index("[workspace.package]"):]
# Root has only workspace package/dependency tables after its members declaration.
(OUT/"Cargo.toml").write_text('[workspace]\nresolver="2"\nmembers='+json.dumps(members)+'\n\n'+suffix,encoding="utf-8")
if not (OUT/"Cargo.lock").exists():
    shutil.copyfile(ROOT/"Cargo.lock",OUT/"Cargo.lock")
shutil.copyfile(ROOT/"rust-toolchain.toml",OUT/"rust-toolchain.toml")
demo=ROOT/"arkhe-verify-self-demo"
dest=OUT/"loader"
dest.mkdir(exist_ok=True)
for name in ["Cargo.toml","Cargo.lock","build.rs","rust-toolchain.toml",".gitignore"]:
    shutil.copyfile(demo/name,dest/name)
for folder in ["src","tests","fixtures"]:
    shutil.copytree(demo/folder,dest/folder,dirs_exist_ok=True)
(OUT/".gitignore").write_text('/target/\n/loader/target/\n/artifacts/\n',encoding="utf-8")
(OUT/".gitattributes").write_text('* text eol=lf\n*.wasm binary\n',encoding="utf-8")
for path in OUT.rglob('*'):
    if path.is_file() and path.suffix!='.wasm' and 'target' not in path.relative_to(OUT).parts and 'artifacts' not in path.relative_to(OUT).parts:
        path.write_bytes(path.read_bytes().replace(b'\r\n',b'\n'))
files=[]
for path in sorted(OUT.rglob('*')):
    if path.is_file() and path.name!='source-manifest.json' and 'target' not in path.relative_to(OUT).parts and 'artifacts' not in path.relative_to(OUT).parts:
        files.append({"path":path.relative_to(OUT).as_posix(),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/"source-manifest.json").write_bytes((json.dumps({"source":"D:/arkhe reviewed source snapshot","files":files},indent=2)+'\n').encode())
print(f"Prepared {len(files)} source/fixture files in {OUT}")
