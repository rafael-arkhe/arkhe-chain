import subprocess,datetime,json,re,hashlib
from pathlib import Path
out=Path('docs/evidence/local/2026-10-18/starknet-expanded-tests')
command=['wsl','-d','Ubuntu','--','bash','/mnt/c/Users/Lemes/Downloads/Arkhe_AGI_Environment_v0.1/ops/local/starknet-cairo-tools/run-tests.sh','all']
index=1
while (out/f'cairo-full-{index:02}.log').exists():index+=1
log=out/f'cairo-full-{index:02}.log'
with log.open('w',encoding='utf-8') as f:
    p=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
    for line in p.stdout:
        f.write(line);f.flush()
        if 'Tests:' in line or '[FAIL]' in line or '[ERROR]' in line or 'Collected' in line:print(line,end='',flush=True)
    code=p.wait()
raw=log.read_text(encoding='utf-8')
matches=re.findall(r'Tests: (\d+) passed, (\d+) failed, (\d+) ignored, (\d+) filtered out',raw)
result={'classification':'UPSTREAM_REGRESSION_TESTS_NOT_INDEPENDENT_AUDIT','checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'exit_code':code,'test_summaries':matches,'pass_lines':len(re.findall(r'^\[PASS\]',raw,re.M)),'fail_lines':len(re.findall(r'^\[FAIL\]',raw,re.M)),'log':log.name,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest(),'fuzzer_runs':32,'fuzzer_seed':20261018,'fork_feature_enabled':False}
(out/f'cairo-full-{index:02}.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result),flush=True)
raise SystemExit(code)
