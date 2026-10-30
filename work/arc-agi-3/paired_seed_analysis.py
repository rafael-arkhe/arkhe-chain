"""Post-hoc paired seed-block bootstrap for two FIXED public development games."""
from itertools import product
import argparse
import hashlib
import json
from pathlib import Path
import statistics

def quantile(values,p):
    values=sorted(values);position=(len(values)-1)*p;lo=int(position);hi=min(lo+1,len(values)-1)
    return values[lo]+(values[hi]-values[lo])*(position-lo)

def paired_blocks(rows,baseline='random',candidate='frontier'):
    index={};seeds=sorted({r['seed'] for r in rows});games=sorted({r['game_id'] for r in rows})
    for row in rows:
        key=(row['seed'],row['game_id'],row['profile'])
        if key in index:raise ValueError('duplicate episode; do not count deterministic repeats as independent seeds')
        if row['status']!='COMPLETED':raise ValueError('failed runs require explicit missingness policy before inference')
        index[key]=row
    blocks=[]
    for seed in seeds:
        differences=[]
        for game in games:
            try:a=index[seed,game,baseline];b=index[seed,game,candidate]
            except KeyError as e:raise ValueError('unpaired or missing episode') from e
            if a['budget']!=b['budget']:raise ValueError('unequal paired budgets')
            differences.append(b['levels_completed']-a['levels_completed'])
        blocks.append({'seed':seed,'mean_level_difference_fixed_games':statistics.mean(differences)})
    return blocks,games

def summarize(rows):
    blocks,games=paired_blocks(rows);values=[b['mean_level_difference_fixed_games'] for b in blocks];n=len(values)
    if not n or n>7:raise ValueError('this exact enumerator supports 1..7 seed blocks')
    samples=[statistics.mean(draw) for draw in product(values,repeat=n)]
    return {'scope':'POSTHOC_DESCRIPTIVE_FIXED_GAME_POLICY_SEED_ANALYSIS','seed_blocks':blocks,
            'fixed_games':games,'independent_policy_seed_blocks_assumed':n,
            'mean_completed_level_difference':statistics.mean(values),
            'enumerated_seed_bootstrap_draws':len(samples),
            'descriptive_percentile_interval_95':[quantile(samples,.025),quantile(samples,.975)],
            'bootstrap_standard_deviation':statistics.pstdev(samples),
            'resampling_unit':'entire policy-seed vector across both fixed games and both policies',
            'cluster_robust_standard_error_by_game':None,
            'game_cluster_limit':'only two public games; no reliable across-game population inference asserted',
            'assumptions':'policy seeds treated as exchangeable blocks; engine seed not independently controlled',
            'preregistered_analysis':False,'superiority_established':False,'equivalence_established':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('report',type=Path);args=p.parse_args()
    result=summarize(json.loads(args.report.read_text())['rows'])
    result['source_report_sha256']=hashlib.sha256(args.report.read_bytes()).hexdigest()
    (args.report.parent/'paired-seed-analysis.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
