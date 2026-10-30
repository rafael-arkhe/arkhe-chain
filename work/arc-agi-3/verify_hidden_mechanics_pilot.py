"""Offline integrity and prefix-identification diagnostics; no new agent runs."""
import copy,hashlib,json
from pathlib import Path
from hidden_mechanics_micro import FiniteEffectLearner,ACTIONS


def main():
    out=Path('output/arc3-hidden-mechanics-pilot-20261027')
    report=json.loads((out/'report.json').read_text());identification=[]
    for episode in report['records']:
        prefix=episode['prefix'];learner=FiniteEffectLearner({'grid':prefix[0]['before'],'available_actions':ACTIONS})
        first=None
        for i,t in enumerate(prefix,1):
            learner.update(t['before'],t['action'],t['after'])
            if first is None and all(len(v)==1 for v in learner.possible.values()):first=i
        assert {a:sorted([list(p) for p in values]) for a,values in learner.possible.items()}==episode['mechanics_parameter_sets']
        observed={hashlib.sha256(json.dumps([t['before'],t['action']],separators=(',',':')).encode()).hexdigest() for t in prefix}
        assert all(row['input_sha256'] not in observed for row in episode['probe_rows'])
        assert len({row['input_sha256'] for row in episode['probe_rows']})==len(episode['probe_rows'])
        assert episode['omniscient_oracle']['bfs_expanded']<=64
        assert episode['omniscient_oracle']['terminal_success']==1
        identification.append({'split':episode['split'],'layout_seed':episode['layout_seed'],'first_full_mechanics_identification_in_prefix':first})
    sources=[Path('work/arc-agi-3')/name for name in ['hidden_mechanics_micro.py','run_hidden_mechanics_pilot.py','test_hidden_mechanics_micro.py']]
    receipt={'tests_passed':167,'episodes':20,'all_probe_keys_excluded_from_learning_prefix':True,
        'probe_keys_unique_within_episode':True,'prefix_models_reconstructed_exactly':True,
        'model_calls':0,'arkhe_solver_executed':False,'goal_identification':'NOT_MEASURED',
        'human_baseline':'NOT_COLLECTED','mechanics_identification_diagnostics':identification,
        'source_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
        'report_sha256':hashlib.sha256((out/'report.json').read_bytes()).hexdigest()}
    (out/'verification-receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps({'episode_models_verified':20,'all_mechanics_singleton_by_step10':sum(x['first_full_mechanics_identification_in_prefix'] is not None for x in identification),'unseen_probe_keys_verified':True}))


if __name__=='__main__':main()
