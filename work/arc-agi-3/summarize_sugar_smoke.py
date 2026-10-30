"""Global scoring and multi-location inventory on new and frozen proposals."""
import hashlib,json
from pathlib import Path
from audit_proposal_identity import controls
from run_example_packages import score
from source_diagnostics import diagnose


def main():
    out=Path('output/arc3-python-sugar-smoke-20261027')
    r=json.loads((out/'report.json').read_text());rows=[]
    for control,run in r['runs'].items():
        for i,usage in enumerate(run['usage']):
            row={'control':control,'request':i+1,'usage':usage,'score':score(controls()[control]),'executed':False}
            if i<len(run['frontend']):
                entry=run['frontend'][i];row['frontend_status']=entry['status'];row['first_reason']=entry.get('reason')
                row['diagnostics']=diagnose(json.loads(entry['raw_response'])['source'])
                if entry['status']=='LOWERED_AND_TYPED':
                    try:row['score']=score(controls()[control],entry['proposal']);row['executed']=True
                    except Exception as exc:row['execution_error']=type(exc).__name__
            rows.append(row)
    frozen=[]
    for path in sorted(Path('output/arc3-python-frontend-smoke-20261027').glob('*/response-*.json')):
        source=json.loads(json.loads(path.read_text())['response'])['source']
        before=diagnose(source,False);after=diagnose(source,True)
        key=lambda x:(x['line'],x['column'],x['node'],x['rule'])
        old={key(x) for x in before['known_blockers']};new={key(x) for x in after['known_blockers']}
        frozen.append({'source':str(path),'response_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'v1_inventory':before,'v2_inventory':after,'recognized_blocker_occurrences_before':len(old),
            'recognized_blocker_occurrences_after':len(new),'removed_inventory_tags':sorted(old-new),'added_inventory_tags':sorted(new-old)})
    keys=['required_cells','required_correct','pairs','exact_pairs','stationary_pairs','stationary_exact']
    result={'requests':len(rows),'complete_responses':sum(c['usage'].get('done') is True for c in rows),
        'lowered_typed':sum(x.get('frontend_status')=='LOWERED_AND_TYPED' for x in rows),'executed':sum(x['executed'] for x in rows),
        'global':{k:sum(x['score'][k] for x in rows) for k in keys},'conditional':{k:sum(x['score'][k] for x in rows if x['executed']) for k in keys},
        'rows':rows,'frozen_inventory_comparison':frozen,
        'warning':'Inventory tags are partial syntactic occurrences, not a count of independent or exhaustive compilation/semantic errors. Rule matching changes do not establish behavior gains.',
        'reported_input_tokens':sum(c['usage'].get('prompt_eval_count') or 0 for c in rows),
        'reported_output_tokens':sum(c['usage'].get('eval_count') or 0 for c in rows),
        'generation_wall_seconds':sum(c['usage']['wall_seconds'] for c in rows),'cleanup':r.get('cleanup')}
    (out/'summary.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({k:v for k,v in result.items() if k not in ('rows','frozen_inventory_comparison')},indent=2))


if __name__=='__main__':main()
