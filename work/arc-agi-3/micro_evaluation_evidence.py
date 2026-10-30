"""Prospective local evaluation log, NOT native WER/WormGraph or attestation."""
import hashlib,json,os,random
from pathlib import Path
from hidden_mechanics_micro import Episode,FiniteEffectLearner,ACTIONS


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(value):return hashlib.sha256(canonical(value).encode()).hexdigest()
def snapshot(learner):return {'base':learner.base,'possible':{a:sorted(list(v)) for a,v in learner.possible.items()}}


class Writer:
    def __init__(self,path):self.file=Path(path).open('x',encoding='utf-8',newline='\n');self.seq=0;self.previous='0'*64
    def append(self,payload):
        row={'seq':self.seq,'previous':self.previous,'payload':payload};row['hash']=digest(row)
        self.file.write(canonical(row)+'\n');self.file.flush();os.fsync(self.file.fileno())
        self.previous=row['hash'];self.seq+=1;return row['hash']
    def close(self):self.file.close()


def produce(out):
    out=Path(out);out.mkdir(exist_ok=False)
    source=Path(__file__);environment=source.with_name('hidden_mechanics_micro.py')
    (out/'sources').mkdir()
    for path in (source,environment):(out/'sources'/path.name).write_bytes(path.read_bytes())
    policy={'actions':'uniform random','learning_prefix':10,'horizon':50,'predictions':'finite effect learner, frozen after prefix'}
    manifest={'format':'LOCAL_EVALUATION_TRACE_V1','trust':'LOCAL_UNSIGNED_NO_EXTERNAL_ANCHOR',
        'episodes':[{'id':'dev-0','rule_id':0,'layout_seed':1000,'action_seed':2000},
                    {'id':'eval-0','rule_id':137,'layout_seed':1100,'action_seed':2000}],
        'policy':policy,'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (source,environment)},
        'scope':'Known synthetic rerun; baseline only, no sealed holdout or Arkhe native integration.'}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
    writer=Writer(out/'events.jsonl')
    try:
        writer.append({'event':'run_start','manifest_digest':digest(manifest),'expected_episodes':len(manifest['episodes'])})
        for spec in manifest['episodes']:
            env=Episode(spec['rule_id'],spec['layout_seed'],policy['horizon'])
            learner=FiniteEffectLearner(env.observe());rng=random.Random(spec['action_seed'])
            training=set();history=set()
            writer.append({'event':'episode_start','episode_id':spec['id'],'initial_observation':env.observe()})
            for step in range(policy['horizon']):
                before=env.observe();action=rng.choice(ACTIONS)
                prediction=learner.predict(before['grid'],action)
                query=digest([before['grid'],action])
                committed=writer.append({'event':'prediction_committed','episode_id':spec['id'],'step':step,
                    'before':before,'before_hash':digest(before),'action':action,
                    'predicted_grid':prediction,'predicted_grid_hash':None if prediction is None else digest(prediction),
                    'predicted_win':None,'win_prediction_status':'NOT_ESTIMATED',
                    'model_digest':manifest['source_sha256']['hidden_mechanics_micro.py'],
                    'policy_digest':digest(policy),'learner_state_digest':digest(snapshot(learner)),
                    'partition':'DEV_PREFIX' if step<policy['learning_prefix'] else 'FROZEN_SUFFIX',
                    'unseen_to_fit':query not in training,'first_in_episode':query not in history})
                # The prediction line is flushed/fsynced before dispatch.
                after=env.step(action)
                writer.append({'event':'observation_recorded','episode_id':spec['id'],'step':step,'prediction_event_hash':committed,
                    'after':after,'after_hash':digest(after),'observed_grid_hash':digest(after['grid']),
                    'observed_win':after['reward'] if after['done'] else None})
                history.add(query)
                if step<policy['learning_prefix']:
                    learner.update(before['grid'],action,after['grid']);training.add(query)
            writer.append({'event':'episode_end','episode_id':spec['id'],'submitted_actions':policy['horizon'],'terminal_reward':env.observe()['reward']})
        writer.append({'event':'run_end','episodes_completed':len(manifest['episodes'])})
    finally:writer.close()
    checkpoint={'format':'LOCAL_HASH_CHAIN_CHECKPOINT_V1','signed':False,'external_anchor':False,
        'events':writer.seq,'last_hash':writer.previous,'manifest_digest':digest(manifest),
        'log_sha256':hashlib.sha256((out/'events.jsonl').read_bytes()).hexdigest()}
    (out/'checkpoint.json').write_text(json.dumps(checkpoint,indent=2))


def verify(out,replay=True):
    out=Path(out);manifest=json.loads((out/'manifest.json').read_text());checkpoint=json.loads((out/'checkpoint.json').read_text())
    raw=(out/'events.jsonl').read_bytes()
    if checkpoint.get('format')!='LOCAL_HASH_CHAIN_CHECKPOINT_V1' or checkpoint.get('signed') is not False or checkpoint.get('external_anchor') is not False:raise ValueError('UNSUPPORTED_TRUST_CLAIM')
    for name,expected in manifest['source_sha256'].items():
        if name not in ('micro_evaluation_evidence.py','hidden_mechanics_micro.py'):raise ValueError('SOURCE_NAME')
        if hashlib.sha256((out/'sources'/name).read_bytes()).hexdigest()!=expected:raise ValueError('SOURCE_SNAPSHOT')
    if replay and hashlib.sha256(Path(__file__).with_name('hidden_mechanics_micro.py').read_bytes()).hexdigest()!=manifest['source_sha256']['hidden_mechanics_micro.py']:raise ValueError('ENVIRONMENT_VERSION')
    if hashlib.sha256(raw).hexdigest()!=checkpoint['log_sha256']:raise ValueError('LOG_DIGEST')
    rows=[json.loads(line) for line in raw.decode().splitlines()];previous='0'*64
    for i,row in enumerate(rows):
        if set(row)!={'seq','previous','payload','hash'}:raise ValueError('EVENT_ENVELOPE')
        claimed=row['hash'];unsigned={k:v for k,v in row.items() if k!='hash'}
        if row['seq']!=i or row['previous']!=previous or digest(unsigned)!=claimed:raise ValueError('EVENT_CHAIN')
        previous=claimed
    if len(rows)!=checkpoint['events'] or previous!=checkpoint['last_hash'] or digest(manifest)!=checkpoint['manifest_digest']:raise ValueError('CHECKPOINT_BINDING')
    events=[r['payload'] for r in rows];cursor=0;metrics={'queries':0,'issued':0,'exact':0,'unseen_to_fit_queries':0,'unseen_to_fit_issued':0,'unseen_to_fit_exact':0,'first_in_episode_queries':0}
    def take(kind):
        nonlocal cursor
        if cursor>=len(events) or events[cursor]['event']!=kind:raise ValueError('EVENT_ORDER')
        value=events[cursor];cursor+=1;return value
    start=take('run_start')
    if start['manifest_digest']!=digest(manifest) or start['expected_episodes']!=len(manifest['episodes']):raise ValueError('RUN_BINDING')
    for spec in manifest['episodes']:
        begin=take('episode_start')
        if begin['episode_id']!=spec['id']:raise ValueError('EPISODE_ID')
        env=Episode(spec['rule_id'],spec['layout_seed'],manifest['policy']['horizon'])
        rng=random.Random(spec['action_seed'])
        before=begin['initial_observation'];learner=FiniteEffectLearner(before);training=set();history=set()
        if replay and before!=env.observe():raise ValueError('INITIAL_REPLAY')
        for step in range(manifest['policy']['horizon']):
            p=take('prediction_committed');prediction_hash=rows[cursor-1]['hash'];o=take('observation_recorded')
            if p['episode_id']!=spec['id'] or o['episode_id']!=spec['id'] or p['step']!=step or o['step']!=step:raise ValueError('TRANSITION_BINDING')
            if o['prediction_event_hash']!=prediction_hash or p['before']!=before or p['before_hash']!=digest(before):raise ValueError('PREDICTION_BINDING')
            pred=p['predicted_grid'];after=o['after'];action=p['action'];query=digest([before['grid'],action])
            if action not in before['available_actions']:raise ValueError('ACTION_AVAILABILITY')
            if action!=rng.choice(ACTIONS):raise ValueError('POLICY_REPLAY')
            if p['predicted_grid_hash']!=(None if pred is None else digest(pred)):raise ValueError('PREDICTED_DIGEST')
            if o['after_hash']!=digest(after) or o['observed_grid_hash']!=digest(after['grid']):raise ValueError('OBSERVED_DIGEST')
            expected_partition='DEV_PREFIX' if step<manifest['policy']['learning_prefix'] else 'FROZEN_SUFFIX'
            if p['partition']!=expected_partition or p['unseen_to_fit']!=(query not in training) or p['first_in_episode']!=(query not in history):raise ValueError('PARTITION_OR_NOVELTY')
            if p['learner_state_digest']!=digest(snapshot(learner)) or p['policy_digest']!=digest(manifest['policy']):raise ValueError('MODEL_POLICY_BINDING')
            if p['model_digest']!=manifest['source_sha256']['hidden_mechanics_micro.py']:raise ValueError('MODEL_CODE_BINDING')
            if replay and (pred!=learner.predict(before['grid'],action) or after!=env.step(action)):raise ValueError('DYNAMIC_REPLAY')
            if o['observed_win']!=(after['reward'] if after['done'] else None) or p['predicted_win'] is not None or p['win_prediction_status']!='NOT_ESTIMATED':raise ValueError('GOAL_REPORTING')
            if expected_partition=='FROZEN_SUFFIX':
                issued=pred is not None;correct=pred==after['grid']
                metrics['queries']+=1;metrics['issued']+=issued;metrics['exact']+=correct
                metrics['unseen_to_fit_queries']+=p['unseen_to_fit'];metrics['unseen_to_fit_issued']+=p['unseen_to_fit'] and issued
                metrics['unseen_to_fit_exact']+=p['unseen_to_fit'] and correct;metrics['first_in_episode_queries']+=p['first_in_episode']
            history.add(query)
            if step<manifest['policy']['learning_prefix']:learner.update(before['grid'],action,after['grid']);training.add(query)
            before=after
        end=take('episode_end')
        if end['episode_id']!=spec['id'] or end['submitted_actions']!=manifest['policy']['horizon'] or end['terminal_reward']!=before['reward']:raise ValueError('EPISODE_COMPLETENESS')
    end=take('run_end')
    if end['episodes_completed']!=len(manifest['episodes']) or cursor!=len(events):raise ValueError('RUN_COMPLETENESS')
    return {'status':'LOCAL_CHAIN_AND_REPLAY_VERIFIED','events':len(rows),'metrics_frozen_suffix':metrics,
        'authentication':'NOT_ESTABLISHED','external_time_or_completeness':'NOT_ESTABLISHED','holdout_access_isolation':'NOT_ESTABLISHED','native_wer_wormgraph':'NOT_INTEGRATED'}


if __name__=='__main__':
    out=Path('output/arc3-micro-evaluation-evidence-v2-20261027');produce(out)
    result=verify(out);(out/'verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
