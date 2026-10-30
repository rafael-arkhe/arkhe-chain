#!/usr/bin/env python3
import json, pathlib, subprocess, os
root=pathlib.Path('/mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe')
env=os.environ.copy();env['PATH']='/home/arkhen/.nix-profile/bin:/usr/bin:/bin';env['NIX_CONFIG']='experimental-features = nix-command flakes'
expr=f'builtins.mapAttrs (_: p: {{ path = p.outPath; drv = p.drvPath; }}) (builtins.removeAttrs (builtins.getFlake "path:{root}").packages.x86_64-linux [ "default" ])'
records=json.loads(subprocess.check_output(['nix','eval','--impure','--json','--expr',expr],env=env))
# Put the metapackage last: its dependency outputs must come from guest builds.
ordered={k:records[k] for k in ['arkhe-verify','arkhe-runtime','arkhe-sql-migrate','arkhe-twin','arkhe-ollama','arkhe-crm-bridge','arkhe-python-gate','arkhe-ask','arkhe-verify-wasm','arkhe']}
for a,r in ordered.items():
 hash_result=subprocess.run(['nix','hash','path',r['path']],env=env,text=True,capture_output=True)
 r['hash']=hash_result.stdout.strip() if hash_result.returncode==0 else None
(root/'docs/validation/vm/expected-host.json').write_text(json.dumps(ordered,indent=2)+'\n')
print('Expected output paths recorded:',len(ordered))