"""Package native Arkhe gate + observation policy into an offline CPU notebook."""
import base64
import lzma
import hashlib
import importlib.util
import json
from pathlib import Path
import nbformat

ROOT=Path(__file__).resolve().parent

def build(output):
    output.mkdir(parents=True,exist_ok=False)
    spec=importlib.util.spec_from_file_location('official_builder',ROOT/'reference/starter/scripts/build_notebook.py')
    builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
    builder.ACCELERATOR='cpu';builder.AGENT_SRC=ROOT/'arkhe_agent.py'
    book=builder.build()
    binary=(ROOT/'native/arc_action_gate-linux-x86_64').read_bytes()
    sha=hashlib.sha256(binary).hexdigest()
    encoded=base64.b64encode(lzma.compress(binary,preset=9)).decode()
    bootstrap=f'''import base64, lzma, hashlib, json, os, pathlib, subprocess
gate = pathlib.Path('/tmp/arkhe_arc_action_gate')
binary = lzma.decompress(base64.b64decode({encoded!r}))
assert hashlib.sha256(binary).hexdigest() == {sha!r}
gate.write_bytes(binary)
gate.chmod(0o700)
request = {{'run_id':'kaggle-native-selftest','phase':'preflight',
           'observation':{{'frame':[[[0]]],'state':'NOT_FINISHED','levels_completed':0,'available_actions':[1]}},
           'action':{{'id':1}}}}
def native_call(payload):
    p = subprocess.run([str(gate)], input=json.dumps(payload), text=True, capture_output=True, timeout=15, check=True)
    return json.loads(p.stdout)
pre = native_call(request)
assert pre['gate'] == 'ALLOW'
post = native_call({{**request,'phase':'record','outcome':request['observation']}})
assert post['gate'] == 'ALLOW' and post['intent_digest'] == pre['intent_digest']
assert post['wormgraph'] == 'IN_MEMORY_READBACK_ONLY'
assert native_call({{**request,'emergency_stop':True}})['gate'] == 'REJECT'
os.environ['ARKHE_ARC_GATE_EXE'] = str(gate)
os.environ['ARKHE_ARC_SEED'] = '0'
os.environ['ARKHE_ARC_POLICY'] = 'frontier'
os.environ['ARKHE_ARC_TRACE'] = '/kaggle/working/arkhe-actions.jsonl'
pathlib.Path('/kaggle/working/native-selftest.json').write_text(json.dumps({{
    'status':'PASS','binary_sha256':{sha!r},'policy':'DEV_UNPROTECTED',
    'signature':'UNSIGNED','wormgraph':'IN_MEMORY_READBACK_ONLY',
    'intent_digest':pre['intent_digest'],'worker_digest':post['worker_digest']}}))
print('Arkhe native bootstrap: PASS (unprotected simulation, unsigned evidence)')
'''
    book['cells'].insert(3,builder.code_cell(bootstrap))
    book['cells'][0]=builder.markdown_cell('# Arkhe ARC3 observation explorer v1\n\n'
        'Experimental observation-only frontier policy, exact 160-action cap. '
        'Native ContainmentGate + unsigned WER + in-memory WormGraph readback. '
        'Development policy only. Local comparison did not demonstrate an advantage. '
        'No LLM, game-specific rules, hidden engine access, production signatures or AGI claim.')
    raw=json.dumps(book,indent=1)
    if 'KGAT_' in raw:raise ValueError('credential marker found')
    nbformat.validate(nbformat.reads(raw,as_version=4))
    (output/'submission.ipynb').write_text(raw,encoding='utf-8')
    meta={'id':'henark/arkhe-arc3-native-explorer','title':'Arkhe ARC3 Native Explorer',
          'code_file':'submission.ipynb','language':'python','kernel_type':'notebook',
          'is_private':True,'enable_gpu':False,'enable_tpu':False,'enable_internet':False,
          'competition_sources':['arc-prize-2026-arc-agi-3'],
          'dataset_sources':[],'kernel_sources':[],'model_sources':[]}
    (output/'kernel-metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    manifest={'native_binary_sha256':sha,'agent_sha256':hashlib.sha256((ROOT/'arkhe_agent.py').read_bytes()).hexdigest(),
              'notebook_sha256':hashlib.sha256(raw.encode()).hexdigest(),
              'native_source_sha256':hashlib.sha256((ROOT.parents[1]/'orchestration/arkhe-runtime/examples/arc_action_gate.rs').read_bytes()).hexdigest(),
              'status':'BUILT_NOT_EXECUTED','capability_demonstrated':False}
    (output/'build-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(manifest))

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output-dir',type=Path,required=True)
    build(p.parse_args().output_dir.resolve())
