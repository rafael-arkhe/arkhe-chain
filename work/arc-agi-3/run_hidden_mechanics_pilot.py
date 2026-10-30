"""Random interactions + frozen finite-family predictive baseline; no Arkhe/LLM claim."""
import copy,hashlib,json,random
from pathlib import Path
from hidden_mechanics_micro import Episode,ACTIONS,RULES,FiniteEffectLearner,oracle_plan,reachable,render,advance


def key(grid,action):return json.dumps([grid,action],separators=(',',':'))


def episode_run(rule_id,layout_seed,action_seed):
    env=Episode(rule_id,layout_seed);initial=env.observe();learner=FiniteEffectLearner(initial)
    rng=random.Random(action_seed);seen=set();prefix=[]
    for _ in range(10):
        before=env.observe()['grid'];action=rng.choice(ACTIONS);after=env.step(action)['grid']
        seen.add(key(before,action));learner.update(before,action,after)
        prefix.append({'before':before,'action':action,'after':after})
    frozen=copy.deepcopy(learner)
    candidates=[(pos,action) for pos in sorted(reachable(env._base,env._pos)) for action in ACTIONS
                if key(render(env._base,pos),action) not in seen]
    random.Random(layout_seed+9876).shuffle(candidates)
    probes=candidates[:max(1,len(candidates)//5)]
    rows=[]
    for pos,action in probes:
        before=render(env._base,pos)
        expected=render(env._base,advance(env._base,pos,env._deltas[ACTIONS.index(action)]))
        prediction=frozen.predict(before,action)
        rows.append({'input_sha256':hashlib.sha256(key(before,action).encode()).hexdigest(),
            'abstained':prediction is None,'exact':prediction==expected,'identity_exact':before==expected})
    while not env.observe()['done']:env.step(rng.choice(ACTIONS))
    oracle=Episode(rule_id,layout_seed);plan=oracle_plan(oracle)
    if plan['status']!='FOUND':raise RuntimeError('oracle planning incomplete')
    for action in plan['actions']:oracle.step(action)
    actor_goal_reached_after_path=oracle._base[oracle._pos[1]][oracle._pos[0]]==oracle._goal
    stationary_action=ACTIONS[oracle._deltas.index((0,0))]
    while not oracle.observe()['done']:oracle.step(stationary_action)
    return {'private_evaluator_rule_id':rule_id,'layout_seed':layout_seed,'prefix':prefix,
        'probe_rows':rows,'agent_interactions':50,'prefix_learning_interactions':10,'offline_evaluator_queries':len(rows),
        'mechanics_parameter_sets':{a:sorted(list(v)) for a,v in frozen.possible.items()},
        'random_terminal_success':env.observe()['reward'],
        'omniscient_oracle':{'shortest_path_actions':len(plan['actions']),'bfs_expanded':plan['expanded'],
            'path_reaches_hidden_goal':actor_goal_reached_after_path,'terminal_success':oracle.observe()['reward'],'submitted_actions':50}}


def main():
    out=Path('output/arc3-hidden-mechanics-pilot-20261027');out.mkdir(exist_ok=False)
    plan={'phase':'ENGINEERING_PILOT_NOT_ARKHE_EVALUATION','grid_size':8,'rule_family_size':len(RULES),
        'rules':{'development':0,'evaluation':137},'layouts_per_rule':10,'horizon':50,'learn_prefix':10,
        'reward':'Final-position hidden marker color, revealed only at terminal step50.',
        'models':'Uniform random action policy; finite five-displacement learner; omniscient positional BFS.',
        'holdout_scope':'Offline20% of reachable render/action pairs not in prefix; not a sealed independent dataset.',
        'pending':['goal acquisition','Arkhe integration','human calibration','200/50 study','ARC transfer']}
    (out/'plan.json').write_text(json.dumps(plan,indent=2))
    records=[]
    for split,rule_id in plan['rules'].items():
        for i in range(10):records.append({'split':split,**episode_run(rule_id,1000+i+(0 if split=='development' else 100),2000+i)})
    summary={}
    for split in plan['rules']:
        episodes=[r for r in records if r['split']==split];rows=[x for r in episodes for x in r['probe_rows']]
        issued=[x for x in rows if not x['abstained']]
        summary[split]={'episodes':len(episodes),'random_successes':sum(r['random_terminal_success'] for r in episodes),
            'oracle_successes':sum(r['omniscient_oracle']['terminal_success'] for r in episodes),
            'probe_queries':len(rows),'issued':len(issued),'exact':sum(x['exact'] for x in rows),
            'predictive_itt':sum(x['exact'] for x in rows)/len(rows),
            'predictive_conditional':sum(x['exact'] for x in issued)/len(issued) if issued else None,
            'identity_exact':sum(x['identity_exact'] for x in rows)}
    report={'plan':plan,'records':records,'summary':summary,'model_calls':0,'arkhe_solver_executed':False}
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
