import json,pathlib,subprocess,shutil
out=pathlib.Path('/root/validation'); records=json.loads((out/'results.json').read_text()); expected=json.loads(pathlib.Path('/root/arkhe/expected-host.json').read_text()); e=expected['arkhe']
shutil.copyfile(out/'arkhe.log',out/'arkhe-initial-seed-failure.log')
with (out/'arkhe.log').open('w') as log:
 result=subprocess.run(['nix','build','path:/root/arkhe#arkhe','--no-link','--no-update-lock-file','--print-out-paths','--option','substitute','false','--option','builders','','--cores','3','--max-jobs','1','-L'],stdout=log,stderr=subprocess.STDOUT)
assert result.returncode==0
h=subprocess.check_output(['nix','hash','path',e['path']],text=True).strip();d=subprocess.check_output(['nix','eval','--raw','path:/root/arkhe#arkhe.drvPath'],text=True).strip()
assert h==e['hash'] and d==e['drv']
records['packages']['arkhe']={'build_exit_code':0,'drv':d,'derivation_matches_host':True,'hash':h,'matches_host':True,'path':e['path']}
records['metapackage_retry_reason']='Added omitted build inputs lndir and stdenv-linux-no-cc; no Arkhe target output was copied'
(out/'results.json').write_text(json.dumps(records,indent=2)+'\n')
print('Metapackage rebuilt and matched host')