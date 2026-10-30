"""Post-hoc all-request scoring and prospective blocked randomization plan."""
import json, random
from pathlib import Path
from audit_proposal_identity import controls


def required_cells(episodes):
    return sum(bv!=tv for episode in episodes for before,_,target in episode
               for br,tr in zip(before,target) for bv,tv in zip(br,tr))


def itt(report, conditional):
    cases=controls();result={}
    for condition in 'ABCD':
        rows=[r for r in report['records'] if r['condition']==condition]
        denominator=sum(required_cells(cases[r['control']]) for r in rows)
        numerator=conditional[condition]['required_cells_correct']
        result[condition]={'requests':len(rows),'required_cells_all_requests':denominator,
            'required_cells_correct':numerator,'all_request_cell_score':numerator/denominator if denominator else None,
            'executed':conditional[condition]['executed'],
            'failed_or_rejected_requests':sum(r['status']!='EXECUTED' for r in rows),
            'training_pass_all_requests':conditional[condition]['training_pass']/len(rows) if rows else None}
    return result


def plan(seed=27102026):
    rng=random.Random(seed);schedule=[]
    # Each block contains every feedback/control pair once; ten blocks.
    for block in range(10):
        entries=[{'block':block+1,'control':control,'feedback':feedback,'examples':'generic_current'}
                 for control in ('click','move') for feedback in 'ABCD']
        rng.shuffle(entries);schedule.extend(entries)
    for position,entry in enumerate(schedule,1):entry['position']=position
    return {'status':'PLAN_ONLY_NOT_EXECUTED','generation_requests':80,'randomization_seed':seed,
        'model_seed':0,'temperature':0,'max_output_tokens_per_request':1024,'context_tokens':8192,
        'timeout_seconds_per_request':180,'model':'north-mini-code-1.0:latest',
        'schedule':schedule,
        'primary_metric':'Correct target values at cells that differ between before and target, divided by required cells over ALL scheduled requests; operational/rejection/runtime failures score zero.',
        'secondary_metrics':['whole-grid exactness','stationary-target exactness','type/schema acceptance','hash diversity','empirical grid identity','usage and walltime'],
        'admission':'DISABLED','retry_policy':'No replacement of failed generation requests.',
        'scope':'Twenty requests per feedback condition, ten per known control; randomization does not create independent model seeds or novel tasks.',
        'separate_factor_stages':[
            {'factor':'examples','status':'SPECIFICATION_REQUIRED_BEFORE_RUN','design':'Hold one feedback condition fixed before results; compare generic against task-related examples on DISJOINT demonstration coordinates and evaluate all requests. Do not include evaluation target ASTs. This measures in-context adaptation, not discovery without task-specific demonstrations.'},
            {'factor':'configuration','status':'SPECIFICATION_REQUIRED_BEFORE_RUN','design':'Hold feedback and examples fixed; vary only ONE of model, context or output limit. Context and output changes are different factors. No configuration contrast is estimated by the feedback stage.'}],
        'limitations':['Fixed model seed, repeated known controls and backend nondeterminism; descriptive only.','No guarantee that eighty additional calls resolve causal ambiguity.','Randomized order reduces systematic position confounding, not all time-dependent interference.']}


def main():
    source=Path('output/arc3-feedback-ablation-20261027')
    report=json.loads((source/'report.json').read_text());conditional=json.loads((source/'summary.json').read_text())
    out=Path('output/arc3-feedback-itt-plan-20261027');out.mkdir(exist_ok=False)
    result=itt(report,conditional)
    (out/'itt.json').write_text(json.dumps(result,indent=2))
    (out/'randomized-feedback-plan.json').write_text(json.dumps(plan(),indent=2))
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
