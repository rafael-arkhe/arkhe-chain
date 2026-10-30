"""Global and executable-conditional summaries, also stratified by control."""
import json
from collections import Counter
from pathlib import Path


def summarize(rows):
    keys=['required_cells','required_correct','pairs','exact_pairs','stationary_pairs','stationary_exact']
    totals={k:sum(r['score'][k] for r in rows) for k in keys}
    executed=[r for r in rows if r['status']=='EXECUTED']
    conditional={k:sum(r['score'][k] for r in executed) for k in keys}
    return {'requests':len(rows),'executed':len(executed),'failures':dict(Counter(r.get('failure_stage') for r in rows if r['status']!='EXECUTED')),
        'global':totals,'conditional':conditional,
        'primary_global':totals['required_correct']/totals['required_cells'] if totals['required_cells'] else None,
        'whole_grid_global':totals['exact_pairs']/totals['pairs'] if totals['pairs'] else None,
        'stationary_global':totals['stationary_exact']/totals['stationary_pairs'] if totals['stationary_pairs'] else None,
        'primary_conditional':conditional['required_correct']/conditional['required_cells'] if conditional['required_cells'] else None,
        'whole_grid_conditional':conditional['exact_pairs']/conditional['pairs'] if conditional['pairs'] else None,
        'stationary_conditional':conditional['stationary_exact']/conditional['stationary_pairs'] if conditional['stationary_pairs'] else None,
        'identity_among_executed':sum(r['score']['grid_identity'] is True for r in executed),
        'unique_programs':len({r['proposal_sha256'] for r in executed}),
        'training_pass':sum(r['training']['status']=='REPLAY_PASS' for r in executed),
        'reported_input_tokens':sum(c.get('prompt_eval_count') or 0 for r in rows for c in r['usage']),
        'reported_output_tokens':sum(c.get('eval_count') or 0 for r in rows for c in r['usage']),
        'generation_wall_seconds':sum(c.get('wall_seconds') or 0 for r in rows for c in r['usage'])}


def main():
    out=Path('output/arc3-example-packages-20261027')
    report=json.loads((out/'report.json').read_text())
    result={'complete':report['complete'],'conditions':{},'controls':{}}
    for condition in ('E0','E1','E2'):
        rows=[r for r in report['records'] if r['condition']==condition]
        result['conditions'][condition]=summarize(rows)
        for control in ('click','move'):
            result['controls'][f'{condition}-{control}']=summarize([r for r in rows if r['control']==control])
    (out/'summary.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({'complete':report['complete'],'conditions':result['conditions']},indent=2))


if __name__=='__main__':main()
