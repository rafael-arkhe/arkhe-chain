"""Pin local cohort materials and rehearse extracted kit; no human sessions."""
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
name='Arkhe-E01-Verifier-0.1.0-windows-x64'
kit=root/'dist'/name
archive=root/'dist'/(name+'.zip')
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as zipped:
    for p in sorted(kit.rglob('*')):
        if p.is_file():
            entry=zipfile.ZipInfo(name+'/'+p.relative_to(kit).as_posix(),(2026,10,19,0,0,0))
            entry.compress_type=zipfile.ZIP_DEFLATED
            entry.external_attr=0o100644<<16
            zipped.writestr(entry,p.read_bytes())
isolated=Path(tempfile.mkdtemp(prefix='arkhe-e01-isolated-'))
with zipfile.ZipFile(archive) as zipped:zipped.extractall(isolated)
extracted=isolated/name
env=os.environ.copy()
for key in ['NODE_PATH','NODE_OPTIONS']:env.pop(key,None)
env['PATH']=str(Path(env['WINDIR'])/'System32')
env['ARKHE_VERIFY_WASM_MODULE']=str(isolated/'nonexistent-host-verifier.js')
checks=[]
def check(label,args,expected,expected_status):
    r=subprocess.run(args,cwd=extracted,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
    payload=json.loads(r.stdout or r.stderr)
    assert r.returncode==expected,(label,r.returncode,r.stdout,r.stderr)
    assert payload['status']==expected_status,(label,payload)
    checks.append(dict(label=label,exit_code=r.returncode,result=payload))
node=str(extracted/'runtime/node.exe');cli=str(extracted/'lib/cli.mjs')
check('extracted doctor without host PATH',[node,cli,'doctor'],0,'PASS')
check('extracted MCP/WASM positive',[node,cli,'verify','fixtures/A.json'],0,'PROOF_VALID')
check('extracted MCP/WASM negative',[node,cli,'verify','fixtures/B.json'],1,'PROOF_INVALID')
fixture=extracted/'fixtures/A.json';original=fixture.read_bytes()
fixture.write_text('{}',encoding='utf-8')
check('doctor rejects changed fixture',[node,cli,'doctor'],2,'ERROR')
fixture.write_bytes(original)
(extracted/'malformed.json').write_text('{',encoding='utf-8')
check('malformed request is input error',[node,cli,'verify','malformed.json'],2,'ERROR')
# Exercise the participant's real .cmd launcher, including paths with quoting.
launcher=subprocess.run(['cmd.exe','/d','/c',str(extracted/'arkhe-verify.cmd'),'doctor'],cwd=extracted,env=env,capture_output=True,text=True,timeout=30)
assert launcher.returncode==0,(launcher.stdout,launcher.stderr)
assert json.loads(launcher.stdout)['status']=='PASS'
checks.append(dict(label='participant CMD launcher',exit_code=0,result=json.loads(launcher.stdout)))
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H%M%SZ')
out=root/'docs/evidence'/(stamp+'-e01-onboarding-kit');out.mkdir()
cohort={
    'schema':1,'cohort_id':'E01-WIN-X64-C01','material_revision':1,
    'state':'COHORT_MATERIALS_PINNED','human_study_status':'NOT_RUN',
    'journey':'E01_MCP_WASM_VERIFICATION','kit_version':'0.1.0','adapter_version':'0.2.0',
    'format':'portable ZIP with bundled Node and WASM',
    'artifact':'dist/'+archive.name,'artifact_sha256':digest(archive),
    'manifest_sha256':digest(kit/'manifest.json'),'tutorial_sha256':digest(kit/'TUTORIAL.md'),
    'entrypoints':{'cli':'arkhe-verify.cmd','mcp_stdio':'mcp-server.cmd'},
    'fixtures':{f:{'path':'fixtures/'+f+'.json','sha256':digest(kit/'fixtures'/(f+'.json'))} for f in ['A','B']},
    'evaluator_key':{'A':{'status':'PROOF_VALID','exit_code':0},'B':{'status':'PROOF_INVALID','exit_code':1},
        'required_interpretation':'Inclusion relative to supplied root; no checkpoint authentication, signature verification, execution authority or runtime certification'},
    'roles':{'operator':'admin','observer':'admin','reviewer':'admin','independence':'NOT_ESTABLISHED_SAME_IDENTITY','source':'human user reply admin'},
    'acceptance':{'planned_participants':5,'minimum_unassisted_successes':4,'maximum_journey_seconds':900,
        'positive_and_negative_correct':True,'scope_understood':True,'technical_intervention_disqualifies_unassisted_success':True},
    'sessions':[],'technical_rehearsal':{'status':'PASS','checks':len(checks),'environment':'different directory on same Windows host; restricted PATH','fresh_vm_verified':False,'os_network_isolation_verified':False},
    'publisher_signature':'NOT_PERFORMED','runtime_verified':False,'authority':False,
    'change_rule':'Any change to kit/tutorial/fixtures requires new material revision/cohort; keep prior evidence',
    'validation_reference':(out/'REPORT.md').relative_to(root).as_posix()
}
(root/'config/e01-onboarding-cohort.json').write_text(json.dumps(cohort,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'results.json').write_text(json.dumps({'status':'PASS','checks':checks,'isolated_extraction_path':str(extracted),
    'fresh_vm_verified':False,'human_sessions_run':0,'network_containment_verified':False},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for rel in ['config/e01-onboarding-cohort.json','packaging/e01/cli.mjs','packaging/e01/TUTORIAL.md','scripts/build_e01_kit.mjs','scripts/freeze_e01_onboarding_kit.py']:
    dst=out/'sources'/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/rel,dst)
shutil.copyfile(kit/'manifest.json',out/'kit-manifest.json')
(out/'REPORT.md').write_text(f'''# E01 — materiais da coorte fixados

Kit Windows x64 0.1.0 em ZIP portátil, runtime Node e WASM incluídos.
CLI: arkhe-verify.cmd; MCP stdio: mcp-server.cmd. Tutorial e duas fixtures
versionados. ZIP SHA-256: {digest(archive)}.

Seis checks técnicos PASS: doctor, prova positiva via MCP/WASM, prova adulterada,
rejeição de fixture alterada pelo doctor, JSON malformado e launcher CMD real.
Execução de cópia extraída fora do repositório, sem Node do host no PATH e sem
NODE_PATH/NODE_OPTIONS. O caminho WASM externo inválido foi sobrescrito pelo
entrypoint interno do kit. Isso não é VM limpa ou prova de isolamento de rede.
A árvore node_modules do host não acompanha o kit; dependências estão no bundle.
Avisos de 12 pacotes de terceiros e licença do runtime incluídos.

Coorte E01-WIN-X64-C01, revisão 1. Tutorial/fixtures/gabarito/critério 4 de 5
sem ajuda em até 900s fixados em config/e01-onboarding-cohort.json. admin exerce
as três funções informadas pelo usuário; independência NÃO estabelecida.
Nenhuma pessoa recrutada, nenhuma sessão humana executada e nenhum gate de
usabilidade aprovado. Mudanças exigem outra revisão/coorte, sem apagar esta.

Kit sem assinatura de editor. Hashes não autenticam origem por si mesmos.
Verificação é inclusão relativa à raiz fornecida; não há autoridade, autenticação
do checkpoint ou aprovação de contenção. runtime_verified=false.
''',encoding='utf-8')
files=sorted(p for p in out.rglob('*') if p.is_file())
(out/'SHA256SUMS').write_text(''.join(digest(p)+'  '+p.relative_to(out).as_posix()+'\n' for p in files),encoding='utf-8')
for line in (out/'SHA256SUMS').read_text().splitlines():
    h,rel=line.split('  ',1);assert digest(out/rel)==h
print(json.dumps({'archive':str(archive),'sha256':digest(archive),'report':str(out/'REPORT.md'),'checks':len(checks),'size_bytes':archive.stat().st_size}))
