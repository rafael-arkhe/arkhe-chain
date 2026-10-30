"""Audit original model with focused mutants and an actual -continue run."""
import hashlib,json,re,subprocess
from pathlib import Path


def main():
    formal=Path('work/arc-agi-3/formal').resolve()
    out=Path('output/arc3-lane-original-audit-v2-20261027');out.mkdir(exist_ok=False)
    original=formal/'LaneIsolation.tla'
    attachment=Path(r'C:\Users\Lemes\.codex\attachments\7d360cfb-8ad4-4901-acdb-5f7a0679cd01\Texto colado.txt')
    assert original.read_bytes()==attachment.read_bytes()
    invariants='TypeOK Isolation AdmissionSound HoldoutSealed AdmissionBinding EffectsAreVerified'
    tests=[('safe',3,False,0,'INVARIANTS '+invariants+'\nPROPERTY AdmitOnlyViaGate',False,[]),
        ('first',1,True,0,'INVARIANTS '+invariants+'\nPROPERTY AdmitOnlyViaGate',False,['HoldoutSealed']),
        # TLC1.7.4 reports first failed invariant per successor, even with -continue.
        ('continue',1,True,0,'INVARIANTS '+invariants+'\nPROPERTY AdmitOnlyViaGate',True,['Isolation','HoldoutSealed']),
        ('continue-reordered',1,True,0,'INVARIANTS TypeOK EffectsAreVerified Isolation AdmissionSound HoldoutSealed AdmissionBinding',True,['EffectsAreVerified','HoldoutSealed']),
        ('effects',1,True,0,'INVARIANT EffectsAreVerified',False,['EffectsAreVerified']),
        ('unsound',1,False,1,'INVARIANT AdmissionSound',False,['AdmissionSound']),
        ('unbind',1,False,2,'INVARIANT AdmissionBinding',False,['AdmissionBinding']),
        ('shortcut',1,False,3,'PROPERTY AdmitOnlyViaGate',False,['AdmitOnlyViaGate'])]
    records=[]
    for name,n,buggy,fault,checks,cont,expected in tests:
        cfg=formal/f'LaneIsolationAudit-{name}.cfg'
        cfg.write_text(f'SPECIFICATION AuditSpec\nCONSTANTS MaxVer = {n}\n Buggy = {str(buggy).upper()}\n FaultMode = {fault}\nCHECK_DEADLOCK FALSE\n{checks}\n')
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(formal/'tla2tools.jar'),'tlc2.TLC','-workers','1']
        if cont:args.append('-continue')
        args+=['-metadir',str((out/name).resolve()),'-config',str(cfg),str(formal/'LaneIsolationAudit.tla')]
        r=subprocess.run(args,cwd=formal,capture_output=True,text=True,timeout=120)
        log=r.stdout+'\n'+r.stderr;(out/f'{name}.log').write_text(log,encoding='utf-8')
        found=sorted(set(re.findall(r'(?:Invariant|Action property) (\w+) is violated',log)))
        passed=(r.returncode==0 and 'Model checking completed. No error has been found.' in log) if name=='safe' else set(found)==set(expected)
        row={'case':name,'exit_code':r.returncode,'found_violations':found,'expected':expected,'outcome_verified':passed,'argv':args}
        records.append(row);print(json.dumps(row),flush=True)
    report={'original_attachment_bytes_unchanged':True,'records':records,'all_expected_outcomes':all(x['outcome_verified'] for x in records),
        'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [original,formal/'LaneIsolationAudit.tla',*formal.glob('LaneIsolationAudit-*.cfg')]}}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected TLC outcome')


if __name__=='__main__':main()
