"""Post-hoc exact-state exploration diagnostics. No policy changes or new actions."""
from collections import Counter
import argparse
import json
from pathlib import Path


class TransitionModel:
    """Diagnostic lookup model. Predict BEFORE learning the current outcome.

    A new exact state/action pair or a tied empirical mode causes abstention.
    This does not generalize to unseen pairs or participate in action selection.
    """
    def __init__(self):
        self.outcomes={}

    def predict(self, key):
        counts=self.outcomes.get(key)
        if not counts:return None
        maximum=max(counts.values())
        modes=[state for state,count in counts.items() if count==maximum]
        return modes[0] if len(modes)==1 else None

    def observe(self,key,target):
        self.outcomes.setdefault(key,Counter())[target]+=1


def analyze(records, initial_levels=0):
    seen=Counter();states=Counter();repeated=0;self_loops=0;decisions=0;resets=0
    triples=Counter();same_outcome_repeats=0;changed_outcome_repeats=0
    model=TransitionModel();predictions=0;prediction_errors=0
    first_clear=None
    for r in records:
        if r['levels_completed']>0 and first_clear is None:first_clear=r['step']
        action=r['action']
        if action['id']==0:
            resets+=1;continue
        decisions+=1
        key=(r['before'],action['id'],action.get('x'),action.get('y'))
        triple=(key,r['after'])
        if triples[triple]:same_outcome_repeats+=1
        elif seen[key]:changed_outcome_repeats+=1
        predicted=model.predict(key)
        if predicted is not None:
            predictions+=1;prediction_errors+=int(predicted!=r['after'])
        # Updating here rather than before predict prevents current-target leakage.
        model.observe(key,r['after']);triples[triple]+=1
        repeated+=int(seen[key]>0);seen[key]+=1
        states[r['before']]+=1
        self_loops+=int(r['before']==r['after'])
    return {'actions_total':len(records),'non_reset_actions':decisions,'reset_actions':resets,
            'unique_exact_source_states':len(states),'unique_exact_state_action_pairs':len(seen),
            'repeated_exact_state_action_count':repeated,
            'repeat_ratio_exact_non_reset':repeated/decisions if decisions else None,
            'exact_self_loop_count':self_loops,
            'exact_self_loop_ratio_non_reset':self_loops/decisions if decisions else None,
            'source_state_revisit_ratio':(decisions-len(states))/decisions if decisions else None,
            'state_coverage_source_ratio':len(states)/decisions if decisions else None,
            'transition_novelty_pair_ratio':len(seen)/decisions if decisions else None,
            'unique_exact_transition_triples':len(triples),
            'same_outcome_repeat_count':same_outcome_repeats,
            'same_outcome_repeat_ratio_non_reset':same_outcome_repeats/decisions if decisions else None,
            'repeated_pair_new_outcome_count':changed_outcome_repeats,
            'stuck_classification':'NOT_IDENTIFIABLE_FROM_TRANSITION_DUPLICATION',
            'productive_confirmation':'NOT_IDENTIFIABLE_WITHOUT_EXPERIMENT_OBJECTIVE',
            'prediction_model_scope':'ANALYZER_ONLY_EXACT_TABULAR_PREQUENTIAL',
            'prediction_count':predictions,'prediction_error_count':prediction_errors,
            'prediction_coverage':predictions/decisions if decisions else None,
            'model_prediction_error_on_predictions':prediction_errors/predictions if predictions else None,
            'unseen_pair_generalization':'NOT_IMPLEMENTED',
            'levels_per_100_actions':100*(records[-1]['levels_completed']-initial_levels)/len(records) if records else None,
            'initial_levels_assumed':initial_levels,
            'first_positive_level_step':first_clear,
            'levels_completed_final':records[-1]['levels_completed'] if records else None,
            'interpretation_limit':'EXACT_PIXEL_STATE_IDENTITY_CAN_HIDE_SEMANTIC_REPETITION'}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);args=p.parse_args()
    rows=[]
    for path in sorted(args.directory.glob('*.jsonl')):
        records=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]
        if not records:continue
        rows.append({'trace':path.name,'game_id':records[0]['game_id'],
                     'policy':records[0]['manifest']['policy'],**analyze(records)})
    if not rows:raise SystemExit('No nonempty traces')
    report={'phase':'posthoc_exact_state_diagnostic','no_new_environment_actions':True,
            'denominator':'non-reset actions; first occurrence is not a repeat',
            'levels_per_100_actions_denominator':'all dispatches including RESET; fresh games start at zero levels',
            'identity':'recorded exact-state hash, action id and click coordinates',
            'mathematical_constraints':['same_outcome_repeat_ratio <= repeat_ratio',
                                        'transition_novelty_pair_ratio = 1 - repeat_ratio'],
            'collapse_threshold':'NOT_VALIDATED','rows':rows}
    (args.directory/'exploration-diagnostics-v2.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
