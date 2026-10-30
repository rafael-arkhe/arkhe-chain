"""Counterexample to pooling matching alternatives before intersection."""
from itertools import permutations,product
import json
from pathlib import Path


def counterexample():
    before=(5,10);after=(6,11)
    matchings=[tuple(y-x for x,y in zip(before,p)) for p in permutations(after)]
    projected=set(d for matching in matchings for d in matching)
    # Repeat the same observed transition twice: intersection changes nothing.
    intersection=projected & projected
    admitted=[]
    for choices in product(sorted(intersection),repeat=2):
        target=tuple(x+d for x,d in zip(before,choices))
        if len(set(target))==2 and all(0<=x<20 for x in target):
            admitted.append({'deltas':choices,'target':sorted(target),'matches_training':sorted(target)==list(after)})
    spurious=[x for x in admitted if not x['matches_training']]
    assert spurious
    # Identity ambiguity may preserve the observed render exactly.
    same=(5,10)
    swaps=[tuple(y-x for x,y in zip(same,p)) for p in permutations(same)]
    targets={tuple(sorted(x+d for x,d in zip(same,ds))) for ds in swaps}
    assert len(swaps)==2 and targets=={same}
    return {'status':'COUNTEREXAMPLE_CONFIRMED','before_x':before,'after_x':after,
            'full_matching_delta_vectors':matchings,'pooled_then_intersected':sorted(intersection),
            'spurious_joint_assignments':spurious,
            'identity_swap':{'matching_vectors':swaps,'rendered_position_sets':sorted(targets)},
            'conclusion':'intersection of marginal delta sets does not preserve joint matching constraints',
            'scope':'synthetic logic counterexample; no learned ARC model or real trace evaluation'}

if __name__=='__main__':
    out=Path('output/arc3-matching-projection-audit-20261027');out.mkdir(parents=True,exist_ok=True)
    r=counterexample();(out/'counterexample.json').write_text(json.dumps(r,indent=2),encoding='utf-8');print(json.dumps(r,indent=2))
