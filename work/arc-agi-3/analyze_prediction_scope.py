"""Separate recorded prediction frequency, visited-pair coverage and unseen-pair tests.

Reads the prediction frozen in each trace. Does not fit a retrospective model,
change the agent, dispatch actions, or invent a logical-state denominator.
"""
import argparse
import hashlib
import json
from pathlib import Path


def analyze(records):
    pairs=set();predicted_pairs=set();sources=set();raw_states=set()
    queries=0;predictions=0;errors=0;unseen_queries=0;unseen_predictions=0;unseen_errors=0
    seen_queries=0;seen_predictions=0
    for r in records:
        raw_states.update((r['before'],r['after']))
        action=r['action']
        if action['id']==0:continue
        queries+=1;sources.add(r['before'])
        key=(r['before'],action['id'],action.get('x'),action.get('y'))
        novel=key not in pairs
        unseen_queries+=int(novel);seen_queries+=int(not novel)
        prediction=r['prediction']['predicted_next']
        if prediction is not None:
            predictions+=1;predicted_pairs.add(key);wrong=prediction!=r['after'];errors+=int(wrong)
            unseen_predictions+=int(novel);seen_predictions+=int(not novel)
            if novel:unseen_errors+=int(wrong)
        pairs.add(key)
    return {'prediction_queries_non_reset':queries,'prediction_events':predictions,
            'prediction_frequency':predictions/queries if queries else None,
            'visited_state_action_pairs':len(pairs),'visited_pairs_with_prediction':len(predicted_pairs),
            'visited_pair_prediction_coverage':len(predicted_pairs)/len(pairs) if pairs else None,
            'full_state_action_space_coverage':None,
            'prediction_error_on_issued_predictions':errors/predictions if predictions else None,
            'unseen_pair_queries':unseen_queries,'unseen_pair_predictions':unseen_predictions,
            'unseen_pair_prediction_frequency':unseen_predictions/unseen_queries if unseen_queries else None,
            'unseen_pair_prediction_error':unseen_errors/unseen_predictions if unseen_predictions else None,
            'seen_pair_queries':seen_queries,'seen_pair_predictions':seen_predictions,
            'seen_pair_prediction_frequency':seen_predictions/seen_queries if seen_queries else None,
            'distinct_exact_source_hashes':len(sources),'distinct_exact_hashes_before_and_after':len(raw_states),
            'logical_state_count':None,'fragmentation_rate':None,
            'fragmentation_status':'UNIDENTIFIED_NO_LOGICAL_STATE_LABELS',
            'causal_root_cause':'NOT_ESTABLISHED'}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);args=p.parse_args()
    rows=[]
    for path in sorted(args.directory.glob('seed-*/*.jsonl')):
        records=[json.loads(l) for l in path.read_text(encoding='utf-8').splitlines()]
        if not records:continue
        rows.append({'trace':str(path.relative_to(args.directory)),
                     'trace_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                     'game_id':records[0]['game_id'],'policy':records[0]['manifest']['policy'],
                     'action_cap':records[0]['manifest']['max_actions'],**analyze(records)})
    if not rows:raise SystemExit('No recorded prediction traces')
    result={'phase':'RECORDED_PREDICTION_SCOPE_AUDIT','new_environment_actions':0,
            'query_scope':'successful recorded non-reset dispatches; one model query per dispatch',
            'metric_compatibility':'historical prediction_coverage was event frequency; historical reports unchanged',
            'coverage_scope':'observed state/action pairs only; not the unknown full space',
            'fragmentation_denominator':'requires external logical labels or an independently validated equivalence',
            'rows':rows}
    target=args.directory/'prediction-scope-audit.json';target.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps([{k:r[k] for k in ('action_cap','game_id','policy','prediction_frequency',
                                      'visited_pair_prediction_coverage','unseen_pair_predictions','fragmentation_rate')} for r in rows],indent=2))

if __name__=='__main__':main()
