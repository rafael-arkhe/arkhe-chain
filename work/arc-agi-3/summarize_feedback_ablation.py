"""Offline metrics; repeated fixed-seed requests are not independent samples."""
import json
from pathlib import Path
from audit_proposal_identity import controls
from dsl_proposal_loop import parse_response
import finite_grid_dsl_runtime as rt


def main():
    out=Path('output/arc3-feedback-ablation-20261027')
    report=json.loads((out/'report.json').read_text());summary={}
    cases=controls()
    for condition in 'ABCD':
        rows=[r for r in report['records'] if r['condition']==condition]
        stats={'requests':len(rows),'executed':0,'same_parent_hash':0,'unique_programs':set(),'grid_mismatch_pairs':0,
            'required_change_pairs':0,'required_change_pairs_exact':0,'required_cells':0,'required_cells_correct':0,
            'stationary_target_pairs':0,'stationary_target_pairs_exact':0,'noop_action_pairs':0,'noop_action_pairs_exact':0,
            'inappropriate_grid_noops':0,'training_pass':0}
        for r in rows:
            if r['status']!='EXECUTED':continue
            stats['executed']+=1;stats['same_parent_hash']+=r['same_parent_hash'];stats['unique_programs'].add(r['proposal_sha256'])
            stats['training_pass']+=r['training']['status']=='REPLAY_PASS'
            label=f"{r['repetition']}-{r['control']}-{condition}"
            proposal=parse_response(json.loads((out/label/'response-1.json').read_text())['response'])
            for episode in cases[r['control']]:
                state={}
                for before,action,target in episode:
                    result=rt.execute(proposal['ast'],before,action,state,proposal['uses_memory']);pred=result['grid'];state=result['state']
                    exact=pred==target;changing=before!=target
                    stats['grid_mismatch_pairs']+=not exact
                    stats['required_change_pairs']+=changing
                    stats['required_change_pairs_exact']+=changing and exact
                    stats['inappropriate_grid_noops']+=changing and pred==before
                    stats['stationary_target_pairs']+=not changing
                    stats['stationary_target_pairs_exact']+=not changing and exact
                    stats['noop_action_pairs']+=action['kind']=='NOOP'
                    stats['noop_action_pairs_exact']+=action['kind']=='NOOP' and exact
                    for y in range(64):
                        for x in range(64):
                            if before[y][x]!=target[y][x]:
                                stats['required_cells']+=1;stats['required_cells_correct']+=pred[y][x]==target[y][x]
        stats['unique_programs']=len(stats['unique_programs'])
        stats['same_parent_rate_among_executed']=stats['same_parent_hash']/stats['executed'] if stats['executed'] else None
        summary[condition]=stats
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
