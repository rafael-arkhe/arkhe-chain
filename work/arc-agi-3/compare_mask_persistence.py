"""Check border-2 lookup against persistence on exactly its issued unseen queries."""
from collections import Counter
import argparse
import json
from pathlib import Path
from analyze_saved_frames import load
from border_mask_probe import project,sha,single_prediction

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input-dir',required=True,type=Path)
    p.add_argument('--output-dir',required=True,type=Path);args=p.parse_args();rows=[]
    for path in sorted((args.input_dir/'seed-0-budget-5000').glob('*.jsonl')):
        records=[json.loads(l) for l in path.read_text().splitlines()];model={};rawpairs=set()
        for r in records[:2500]:
            if r['action']['id']==0:continue
            b=load(path.parent,r['before_frame']);a=load(path.parent,r['after_frame']);action=sha(r['action'])
            rawpairs.add((r['before'],action))
            model.setdefault((sha(project(b,2)),action),Counter())[sha(project(a,2))]+=1
        stats=Counter()
        for r in records[2500:]:
            if r['action']['id']==0:continue
            action=sha(r['action'])
            if (r['before'],action) in rawpairs:continue
            b=load(path.parent,r['before_frame']);a=load(path.parent,r['after_frame'])
            before=sha(project(b,2));target=sha(project(a,2));pred=single_prediction(model.get((before,action)))
            stats['unseen_raw_pair_queries']+=1
            stats['persistence_correct_all_unseen']+=int(before==target)
            if pred is None:continue
            stats['model_issued_unseen']+=1;stats['model_correct_unseen']+=int(pred==target)
            stats['persistence_correct_on_model_issued_unseen']+=int(before==target)
            stats['issued_queries_with_retained_change']+=int(before!=target)
            stats['model_correct_retained_changes']+=int(before!=target and pred==target)
        issued=stats['model_issued_unseen'];total=stats['unseen_raw_pair_queries']
        rows.append({'trace':path.name,'counts':dict(stats),
                     'model_accuracy_on_issued_unseen':stats['model_correct_unseen']/issued if issued else None,
                     'persistence_accuracy_on_same_issued_unseen':stats['persistence_correct_on_model_issued_unseen']/issued if issued else None,
                     'model_correct_coverage_unseen':stats['model_correct_unseen']/total if total else None,
                     'persistence_accuracy_all_unseen':stats['persistence_correct_all_unseen']/total if total else None})
        print(json.dumps(rows[-1]),flush=True)
    report={'phase':'POSTHOC_SAME_QUERY_PERSISTENCE_CONTROL','border_rows_each_end':2,
            'train_prefix':2500,'test_updates':False,'new_environment_actions':0,'rows':rows}
    (args.output_dir/'persistence-control-border2.json').write_text(json.dumps(report,indent=2))

if __name__=='__main__':main()
