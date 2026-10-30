"""Strict mount-family observations; EPERM never identifies seccomp by itself."""
import json
from containment_probe import no_duplicates, reject_constant
CASES={'mount':165,'umount2':166,'pivot_root':155}
def evaluate_cases(observation, expected_errno=1):
    if type(expected_errno) is not int or expected_errno not in (1,133):raise ValueError('unsupported explicitly scoped mount errno')
    if observation.get('state')!='OBSERVED':return 'ERROR'
    try:data=json.loads(observation['observations'],object_pairs_hook=no_duplicates,parse_constant=reject_constant)
    except (KeyError,TypeError,ValueError):return 'ERROR'
    if not isinstance(data,dict) or set(data)!={'schema','arch','cases'} or type(data['schema']) is not int or data['schema']!=2 or data['arch']!='x86_64':return 'ERROR'
    items=data['cases']
    if not isinstance(items,list) or len(items)!=3:return 'ERROR'
    seen=set()
    for case in items:
        if not isinstance(case,dict) or set(case)!={'syscall','number','result','errno'}:return 'ERROR'
        name=case['syscall']
        if not isinstance(name,str) or name not in CASES or name in seen:return 'ERROR'
        seen.add(name)
        if any(type(case[k]) is not int for k in ['number','result','errno']) or case['number']!=CASES[name]:return 'ERROR'
        if case['result']!=-1 or case['errno']!=expected_errno:return 'FAIL'
    return 'PASS' if seen==set(CASES) else 'ERROR'

def evaluate(observation,before,after):
    verdict=evaluate_cases(observation)
    if verdict!='PASS':return verdict
    for oracle in (before,after):
        fields=dict(line.split(':',1) for line in oracle['status'].splitlines() if ':' in line)
        if fields.get('CapEff','').strip()!='0000000000000000' or fields.get('NoNewPrivs','').strip()!='1':return 'FAIL'
        if oracle['namespaces']['mnt']==oracle['observer_namespaces']['mnt'] or oracle['membership']==oracle['observer_membership']:return 'ERROR'
    if before['container_id']!=after['container_id'] or before['host_pid']!=after['host_pid'] or before['namespaces']!=after['namespaces'] or before['boot_id']!=after['boot_id']:return 'ERROR'
    return 'PASS' if before['mountinfo']==after['mountinfo'] else 'FAIL'
