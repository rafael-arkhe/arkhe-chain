#!/usr/bin/env python3
import json, os, pathlib, subprocess
root=pathlib.Path('/mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe')
env=os.environ.copy(); env['PATH']='/home/arkhen/.nix-profile/bin:/usr/bin:/bin';env['NIX_CONFIG']='experimental-features = nix-command flakes ca-derivations'
env['NIX_SSHOPTS']='-i /home/arkhen/.cache/arkhe-repro/id_ed25519 -p 22429 -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/arkhen/.cache/arkhe-repro/known_hosts'
def run(*args,**kw):return subprocess.run(args,env=env,check=True,**kw)
attrs=['arkhe-verify','arkhe-runtime','arkhe-sql-migrate','arkhe-twin','arkhe-ollama','arkhe-crm-bridge','arkhe-python-gate','arkhe-ask','arkhe-verify-wasm']
refs=[f'path:{root}#{a}' for a in attrs]
data=json.loads(run('nix','derivation','show',*refs,stdout=subprocess.PIPE).stdout)
drvs=data.get('derivations',data);deps=set();srcs=set();targets=set()
for name,d in drvs.items():
 if 'inputs' in d:
  deps.update('/nix/store/'+k for k in d['inputs']['drvs']); srcs.update('/nix/store/'+s for s in d['inputs']['srcs'])
 else:
  deps.update(d['inputDrvs']);srcs.update(d['inputSrcs'])
 for out in d['outputs'].values():
  if 'path' in out:targets.add(out['path'] if out['path'].startswith('/') else '/nix/store/'+out['path'])
outpaths=set()
for dep in sorted(deps):
 outpaths.update(run('nix-store','--realise',dep,stdout=subprocess.PIPE).stdout.decode().splitlines())
pkgs=run('nix','eval','--raw','--impure','--expr',f'(builtins.getFlake "path:{root}").inputs.nixpkgs.outPath',stdout=subprocess.PIPE).stdout.decode()
paths=sorted(outpaths|srcs|{pkgs})
closure=set(run('nix-store','-qR',*paths,stdout=subprocess.PIPE).stdout.decode().splitlines())
assert not targets & closure,'Target outputs must never be copied to reproduction VM'
v=root/'docs/validation/vm';v.mkdir(exist_ok=True)
(v/'seed-paths.json').write_text(json.dumps({'targets_not_copied':sorted(targets),'seed_paths':paths,'seed_closure_count':len(closure)},indent=2)+'\n')
run('nix','copy','--no-check-sigs','--to','ssh-ng://root@127.0.0.1',*paths)
ssh=['ssh','-i','/home/arkhen/.cache/arkhe-repro/id_ed25519','-p','22429','-o','BatchMode=yes','-o','UserKnownHostsFile=/home/arkhen/.cache/arkhe-repro/known_hosts','root@127.0.0.1']
run(*ssh,'mkdir -p /root/arkhe')
tar=subprocess.Popen(['tar','-C',str(root),'--exclude=./docs','--exclude=./.git','-cf','-','.'],stdout=subprocess.PIPE,env=env)
run(*ssh,'tar -C /root/arkhe -xf -',stdin=tar.stdout);tar.stdout.close();assert tar.wait()==0
print('VM inputs seeded; no Arkhe target output copied',flush=True)