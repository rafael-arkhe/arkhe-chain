#!/usr/bin/env python3
import json,os,pathlib,subprocess
r=pathlib.Path('/mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe');v=r/'docs/validation/rust-1.96.0';v.mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env['PATH']='/home/arkhen/.nix-profile/bin:/usr/bin:/bin';env['NIX_CONFIG']='experimental-features = nix-command flakes'
expr=f'let f=builtins.getFlake "path:{r}"; in {{checks=builtins.mapAttrs (_: p: {{drv=p.drvPath;out=p.outPath;}}) f.checks.x86_64-linux;packages=builtins.mapAttrs (_: p: {{drv=p.drvPath;out=p.outPath;src=if p ? src then toString p.src else null;}}) f.packages.x86_64-linux;}}'
data=json.loads(subprocess.check_output(['nix','eval','--json','--impure','--expr',expr],env=env))
for name in ['tests-arkhe-core','tests-arkhe-kernel','tests-arkhe-governance','tests-clippy','toolchain-version','sdd-parser-smoke','wasm-smoke']:
 d=data['checks'][name];assert subprocess.run(['nix','path-info',d['out']],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 with (v/(name+'.log')).open('wb') as f:subprocess.run(['nix','log',d['drv']],env=env,stdout=f,check=True)
 data['checks'][name]['valid']=True
scan={};hashes={};sources={}
for name,rel in [('arkhe-verify-cli','bin/arkhe-verify'),('arkhe-verify-wasm','lib/arkhe-verify.wasm'),('arkhe-sdd-parser','bin/arkhe-sdd-parser')]:
 p=pathlib.Path(data['packages'][name]['out'])/rel;b=p.read_bytes();forbidden=[b'/mnt/d/arkhe',b'/home/arkhen',b'D:\\arkhe'];assert not any(s in b for s in forbidden),(name,'machine path embedded')
 scan[name]={'status':'PASS','file':str(p),'excluded_prefixes':[s.decode() for s in forbidden]}
 sources[name]={'path':data['packages'][name]['src'],'narHash':subprocess.check_output(['nix','hash','path',data['packages'][name]['src']],env=env,text=True).strip()}
 hashes[name]=subprocess.check_output(['nix','hash','path',data['packages'][name]['out']],env=env,text=True).strip()
(v/'source-hashes.json').write_text(json.dumps(sources,indent=2)+'\n');(v/'derivations.json').write_text(json.dumps(data,indent=2)+'\n');(v/'machine-path-scan.json').write_text(json.dumps(scan,indent=2)+'\n');(v/'hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
print('Recorded:',len(data['checks']),'checks; machine-path scan passed')