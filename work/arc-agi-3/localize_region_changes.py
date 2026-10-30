"""Retrospective diff localization, NEVER an inference-time region selector."""
import json
from pathlib import Path
import object_transition_probe as b


def localize(before,after):
    if len(before)!=len(after) or any(len(x)!=len(y) for x,y in zip(before,after)):raise ValueError('same dimensions required')
    changed={(x,y) for y,row in enumerate(before) for x,v in enumerate(row) if v!=after[y][x]}
    result={'changed_pixels':len(changed),'scope':'uses observed after; diagnostic only','sides':{}}
    union=set()
    for name,grid in [('before',before),('after',after)]:
        s=b.scene(grid);regions=[];occupied=set();touched=set();untouched=set()
        for o in s['objects']:
            cells={(o['x']+dx,o['y']+dy) for dx,dy in o['shape']};occupied|=cells
            overlap=cells&changed
            if overlap:touched|=cells
            else:untouched|=cells
            regions.append({'signature':o['signature'],'position':[o['x'],o['y']],'area':len(cells),
                            'changed_cells':len(overlap),'label':'DIFF_TOUCHED' if overlap else 'NO_DIFF_ON_VISIBLE_CELLS'})
        union|=occupied
        result['sides'][name]={'background':s['background'],'regions':regions,
            'diff_on_nonbackground_cells':len(changed&occupied),
            'diff_on_inferred_background_cells':len(changed-occupied),
            'changed_cell_coverage_by_diff_touched_regions':len(changed&touched)/len(changed) if changed else None,
            'unchanged_cells_in_touched_regions':len(touched-changed),
            'unchanged_cells_in_untouched_regions':len(untouched),
            'warning':'NO_DIFF on old visible cells does not prove same component shape after; no semantic persistence label'}
    result['diff_outside_regions_on_both_sides']=len(changed-union)
    return result


def run(source,out):
    data=json.loads(source.read_text());report={'scope':'same80 sampled transitions; uses after frames, not predictive evaluation','new_environment_actions':0,'samples':[]}
    for trace in data['runs']:
        for s in trace['samples']:
            # snapshot refs are relative to historical trace directory
            root=Path('output/arc3-budget-matrix-20261027/seed-0-budget-5000')
            before=b.render(b.load(root,s['before_frame']));after=b.render(b.load(root,s['after_frame']))
            report['samples'].append({'trace':trace['trace'],'step':s['step'],'partition':s['partition'],'statistics':localize(before,after)})
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x',encoding='utf-8') as f:json.dump(report,f,indent=2)
    return report

if __name__=='__main__':
    r=run(Path('output/arc3-region-decomposition-20261027/report.json'),Path('output/arc3-region-localization-20261027/report.json'))
    print(json.dumps({'samples':len(r['samples']),'changed_pixels':sum(s['statistics']['changed_pixels'] for s in r['samples']),
        'changed_background_before':sum(s['statistics']['sides']['before']['diff_on_inferred_background_cells'] for s in r['samples']),
        'changed_background_after':sum(s['statistics']['sides']['after']['diff_on_inferred_background_cells'] for s in r['samples']),
        'samples_with_unaffected_old_regions':sum(any(o['label']=='NO_DIFF_ON_VISIBLE_CELLS' for o in s['statistics']['sides']['before']['regions']) for s in r['samples'])},indent=2))
