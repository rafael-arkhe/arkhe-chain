"""Generate a closed native seccomp candidate and static rule coverage obligations."""
import argparse,copy,hashlib,json
from pathlib import Path
from containment_probe import ROOT,write_json,manifest,no_duplicates,reject_constant

def condition_applies(condition):
    if not isinstance(condition,dict) or set(condition)-{'arches','caps'}:raise ValueError('unknown baseline selector')
    if 'arches' in condition and (not isinstance(condition['arches'],list) or any(not isinstance(a,str) for a in condition['arches'])):raise ValueError('bad architecture selector')
    if 'caps' in condition and (not isinstance(condition['caps'],list) or any(not isinstance(c,str) for c in condition['caps'])):raise ValueError('bad capability selector')
    return ('arches' not in condition or 'amd64' in condition['arches']) and ('caps' not in condition or not condition['caps'])

def active(rule):
    includes=rule.get('includes',{});excludes=rule.get('excludes',{})
    inc=condition_applies(includes)
    condition_applies(excludes)
    excluded=('arches' in excludes and 'amd64' in excludes['arches']) # no capabilities are present
    return inc and not excluded

def generate(baseline,abi,mandatory):
    if abi.get('audit_arch')!=0xc000003e or abi.get('architecture')!='SCMP_ARCH_X86_64':raise ValueError('wrong ABI')
    if baseline.get('defaultAction')!='SCMP_ACT_ERRNO' or baseline.get('defaultErrnoRet')!=38:raise ValueError('unreviewed baseline fallback')
    canonical={row['number']:row['name'] for row in abi['syscalls']}
    if len(canonical)!=len(abi['syscalls']) or len(set(canonical.values()))!=len(canonical):raise ValueError('duplicate native ABI entry')
    resolve=abi['baseline_name_resolution']
    for name in mandatory:
        if type(resolve.get(name)) is not int or resolve[name]<0 or resolve[name] not in canonical:raise ValueError('mandatory syscall absent from native ABI: '+name)
    denied={resolve[name] for name in mandatory}
    rules=[];expanded=[];skipped=[]
    for index,original in enumerate(baseline['syscalls']):
        rule=copy.deepcopy(original)
        if not active(rule):skipped.append({'baseline_rule':index,'reason':'nonmatching architecture/capability selector'});continue
        action=rule['action'];args=rule.get('args',[])
        if action not in ('SCMP_ACT_ALLOW','SCMP_ACT_ERRNO'):raise ValueError('unreviewed baseline action')
        seen_args=set()
        for arg in args:
            if set(arg)!={'index','op','value','valueTwo'} or type(arg['index']) is not int or not 0<=arg['index']<=5 or arg['index'] in seen_args or arg['op'] not in ('SCMP_CMP_EQ','SCMP_CMP_NE'):raise ValueError('unreviewed argument branch')
            if any(type(arg[k]) is not int or not 0<=arg[k]<2**64 for k in ['value','valueTwo']):raise ValueError('invalid argument value')
            seen_args.add(arg['index'])
        names=[]
        for name in rule['names']:
            number=resolve.get(name)
            if type(number) is not int:raise ValueError('missing ABI mapping: '+name)
            if number<0:
                skipped.append({'baseline_rule':index,'name':name,'reason':'non-native/pseudo number','resolver_number':number});continue
            if number not in canonical:raise ValueError('unbounded ABI number')
            if number in denied:continue
            native=canonical[number]
            if native in names:continue
            names.append(native)
            row={'id':f'baseline-{index}-{native}','name':native,'number':number,'action':action,'args':copy.deepcopy(args),'source_rule':index,'dynamic_status':'NOT_EXECUTED','coverage_required':['matching arguments','boundary and complement cases with precedence across all rules'] if args else ['fixed safe reviewed probe or explicit unsupported blocker']}
            if action=='SCMP_ACT_ERRNO':
                if type(rule.get('errnoRet')) is not int or not 1<=rule['errnoRet']<=4095:raise ValueError('invalid rule errno')
                row['errnoRet']=rule['errnoRet']
            expanded.append(row)
        if names:
            output={'names':names,'action':action,'args':args}
            if action=='SCMP_ACT_ERRNO':output['errnoRet']=rule['errnoRet']
            rules.append(output)
    for name in sorted(mandatory,key=lambda n:resolve[n]):
        native=canonical[resolve[name]]
        rules.append({'names':[native],'action':'SCMP_ACT_ERRNO','errnoRet':133,'args':[]})
        expanded.append({'id':'restricted-'+native,'name':native,'number':resolve[name],'action':'SCMP_ACT_ERRNO','errnoRet':133,'args':[],'dynamic_status':'NOT_EXECUTED','coverage_required':['fixed safe operands','independent effective-filter evidence','errno 133 attribution without privileged control']})
    profile={'defaultAction':'SCMP_ACT_ERRNO','defaultErrnoRet':38,'architectures':['SCMP_ARCH_X86_64'],'syscalls':rules}
    covered={r['number'] for r in expanded}
    fallback=[row for row in abi['syscalls'] if row['number'] not in covered]
    rules_manifest={'schema':1,'state':'STATIC_EXPANSION_DYNAMIC_COVERAGE_PENDING','runtime_verified':False,'arch':'linux/x86_64','target_capabilities':[],'rules':expanded,'default_action':{'action':'SCMP_ACT_ERRNO','errnoRet':38,'known_native_syscalls_without_explicit_rule':fallback,'unknown_numbers':'same default action; no kernel-availability claim'},'skipped_baseline_rules':skipped,'abi_compatibility_obligation':'deny i386/x32 and validate compiled/runtime behavior; static architectures list is not sufficient evidence','dynamic_coverage_complete':False,'compiled_effective_filter_verified':False}
    controls=['getpid','getppid']
    for name in controls:
        entries=[r for r in expanded if r['number']==resolve[name]]
        if not entries or any(r['action']!='SCMP_ACT_ALLOW' for r in entries) or not any(not r['args'] for r in entries):raise ValueError('positive control unexpectedly restricted')
    return profile,rules_manifest

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--baseline',type=Path,required=True);p.add_argument('--abi',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    output=a.output.resolve()
    if not output.is_relative_to(ROOT) or output.exists():raise ValueError('output must be a new workspace folder')
    read=lambda path:json.loads(path.read_text(),object_pairs_hook=no_duplicates,parse_constant=reject_constant)
    contract=read(ROOT/'config/runtime-unified-contract.json');profile,expanded=generate(read(a.baseline),read(a.abi),contract['seccomp_contract']['mandatory_restricted_syscalls'])
    output.mkdir(parents=True);write_json(output/'profile.json',profile);write_json(output/'rules.json',expanded)
    (output/'abi.json').write_bytes(a.abi.read_bytes());(output/'baseline.json').write_bytes(a.baseline.read_bytes())
    (output/'generator.py').write_bytes(Path(__file__).read_bytes())
    write_json(output/'provenance.json',{'schema':1,'state':'CANDIDATE_NOT_LOADED_NOT_ATTESTED','runtime_verified':False,'baseline_sha256':hashlib.sha256(a.baseline.read_bytes()).hexdigest(),'abi_sha256':hashlib.sha256(a.abi.read_bytes()).hexdigest(),'contract_input_sha256':hashlib.sha256((ROOT/'config/runtime-unified-contract.json').read_bytes()).hexdigest(),'profile_sha256':hashlib.sha256((output/'profile.json').read_bytes()).hexdigest(),'rules_sha256':hashlib.sha256((output/'rules.json').read_bytes()).hexdigest(),'expanded_rule_cases':len(expanded['rules']),'kernel_filter_loaded':False})
    manifest(output);print(json.dumps({'output':str(output),'expanded_rule_cases':len(expanded['rules']),'restricted_syscalls':len(contract['seccomp_contract']['mandatory_restricted_syscalls'])}))
if __name__=='__main__':main()
