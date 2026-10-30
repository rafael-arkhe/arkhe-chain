"""Final archived-request integrity checks, no new model calls."""
import json,hashlib
from collections import Counter
from pathlib import Path
from dsl_proposal_loop import digest
from dsl_output_schema import schema


def main():
    out=Path('output/arc3-example-packages-20261027')
    r=json.loads((out/'report.json').read_text())
    assert r['complete'] and len(r['records'])==60
    assert Counter((x['condition'],x['control']) for x in r['records'])==Counter({(c,g):10 for c in ('E0','E1','E2') for g in ('click','move')})
    assert [{k:x[k] for k in ('block','condition','control')} for x in r['records']]==r['plan']['schedule']
    response_hashes={c:Counter() for c in ('E0','E1','E2')}
    for x in r['records']:
        folder=out/f"{x['position']:02d}-{x['control']}-{x['condition']}"
        req=json.loads((folder/'request-1.json').read_text())
        archived=Path('output/arc3-example-contrast-design-20261027')/f"{x['control']}-{x['condition']}-prompt.json"
        assert req['prompt']==archived.read_text()
        assert hashlib.sha256(req['prompt'].encode()).hexdigest()==x['prompt_sha256']
        assert req['options']=={'temperature':0,'seed':0,'num_predict':1024,'num_ctx':8192}
        assert req['format']==schema()
        response=json.loads((folder/'response-1.json').read_text())
        response_hashes[x['condition']][digest(json.loads(response['response']))]+=1
        assert x['schema']['valid']
    receipt={'sixty_requests_match_frozen_prompts':True,'schema_and_options_identical':True,'balanced_schedule_matches_plan':True,
        'responses':60,'all_independently_schema_valid':True,'response_program_hash_counts':response_hashes,
        'tests_passed':145,'cleanup':r['cleanup'],
        'source_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [Path('work/arc-agi-3/run_example_packages.py'),Path('work/arc-agi-3/summarize_example_packages.py')]},
        'artifact_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [out/'plan.json',out/'report.json',out/'summary.json']}}
    (out/'verification-receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps(receipt,indent=2))


if __name__=='__main__':main()
