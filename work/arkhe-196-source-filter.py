#!/usr/bin/env python3
import json,pathlib,shutil,subprocess,os,tempfile
root=pathlib.Path('/mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe')
env=os.environ.copy();env['PATH']='/home/arkhen/.nix-profile/bin:/usr/bin:/bin';env['NIX_CONFIG']='experimental-features = nix-command flakes'
with tempfile.TemporaryDirectory(prefix='arkhe-filter-') as tmp:
 test=pathlib.Path(tmp)/'arkhe'
 shutil.copytree(root,test,ignore=shutil.ignore_patterns('validation','.git','__pycache__'))
 def evaluate():
  expr=f'let p = (builtins.getFlake "path:{test}").packages.x86_64-linux; in builtins.listToAttrs (map (n: {{name=n;value={{src=toString p.${{n}}.src;drv=p.${{n}}.drvPath;}};}}) ["arkhe-verify-cli" "arkhe-verify-wasm" "arkhe-sdd-parser" "arkhe-ask"])'
  return json.loads(subprocess.check_output(['nix','eval','--impure','--json','--expr',expr],env=env))
 before=evaluate()
 p=test/'source/apps/arkhe-ask/src/main.rs';p.write_bytes(p.read_bytes()+b'\n// unrelated-source filtering probe\n')
 after=evaluate()
 for n in ['arkhe-verify-cli','arkhe-verify-wasm','arkhe-sdd-parser']:assert before[n]==after[n],(n,before[n],after[n])
 assert before['arkhe-ask']['src']!=after['arkhe-ask']['src']
 report={'status':'PASS','mutation':'apps/arkhe-ask/src/main.rs comment appended','unaffected':['arkhe-verify-cli','arkhe-verify-wasm','arkhe-sdd-parser'],'positive_control_changed':'arkhe-ask','before':before,'after':after}
 pathlib.Path('/mnt/d/arkhe/work/arkhe-196-source-filter.json').write_text(json.dumps(report,indent=2)+'\n')
 print('Source-filter invariance: PASS')