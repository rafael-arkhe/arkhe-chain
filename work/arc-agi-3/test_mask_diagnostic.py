import unittest
import numpy as np
from mask_diagnostic import frame,load_rows,split_units,make_masks,table,diagnose,predict

def grid(border=0,center=0):
    a=np.zeros((64,64),np.uint8);a[0,0]=border;a[30,30]=center;return a

def transition(b,a,t):return {'before':b,'after':t,'action':a,'context':{},'next_context':{},'logical':None}

class Tests(unittest.TestCase):
    def test_bad_pixels_and_shapes_do_not_wrap_silently(self):
        for value in (np.zeros((2,2)),np.full((64,64),-1),np.full((64,64),256),np.full((64,64),.5)):
            with self.assertRaises(ValueError):frame(value)

    def test_discontinuity_does_not_create_fake_transition(self):
        rows=[{'game':'g','episode':0,'level':0,'t':t,'action':1,'frame':grid().tolist()} for t in (0,2)]
        groups,stats=load_rows(rows);self.assertEqual(dict(groups),{})
        self.assertEqual(stats['omitted_gap_predecessors'],1)
        with self.assertRaises(ValueError):load_rows(rows+[rows[0]])

    def test_action_coordinates_are_hashable_and_distinct(self):
        rows=[{'game':'g','episode':0,'level':0,'t':t,'action':{'id':6,'x':t,'y':1},
               'frame':grid().tolist(),'next_frame':grid().tolist()} for t in (0,1)]
        grouped,_=load_rows(rows);units=grouped['g','unspecified'];t=table(units[0]['transitions'],np.ones((64,64),bool))
        self.assertEqual(len(t),2)

    def test_episode_split_is_disjoint_and_single_unit_is_rejected(self):
        units=[{'episode':e,'level':l,'transitions':[transition(grid(),'a',grid())]} for e in (0,1) for l in (0,1)]
        train,test,ids=split_units(units,'episode',.5)
        self.assertFalse({u['episode'] for u in train}&{u['episode'] for u in test})
        self.assertTrue(train and test)
        level_train,level_test,_=split_units(units,'level',.5)
        self.assertFalse({u['level'] for u in level_train}&{u['level'] for u in level_test})
        self.assertEqual({u['episode'] for u in level_train},{0,1})
        self.assertEqual({u['episode'] for u in level_test},{0,1})
        with self.assertRaises(ValueError):split_units(units[:1],'episode',.5)

    def test_conflict_attribution_keeps_action_in_key(self):
        a=grid(1);b=grid(2)
        tr=[transition(a,'action-one',grid(center=1)),transition(a,'action-one',grid(center=2)),
            transition(a,'action-two',grid(center=3)),transition(b,'action-two',grid(center=4))]
        result=diagnose([{'transitions':tr}],[],[.5])['border2']
        self.assertEqual(result['observed_projected_conflict_pairs'],2)
        self.assertEqual(result['conflicts_within_same_raw_state_and_action'],1)
        self.assertEqual(result['conflicts_only_between_distinct_raw_sources'],1)

    def test_variance_uses_training_only_and_degenerate_mask_is_flagged(self):
        unchanged=[transition(grid(),'a',grid())]
        self.assertTrue(make_masks(unchanged,[.5])['variance-0.5'].all())
        changed=[transition(np.zeros((64,64),np.uint8),'a',np.ones((64,64),np.uint8))]
        result=diagnose([{'transitions':changed}],[],[.5])['variance-0.5']
        self.assertTrue(result['degenerate_mask']);self.assertEqual(result['kept_cells'],0)

    def test_mode_and_conflict_abstention_are_explicitly_different(self):
        from collections import Counter
        c=Counter({'b':2,'a':2})
        self.assertIsNone(predict(c,'unique'));self.assertEqual(predict(c,'mode'),'a')

    def test_level_holdout_excludes_boundary_outcomes_from_other_level(self):
        within=transition(grid(),'a',grid());boundary=transition(grid(),'a',grid())
        within['context']={'level':0};within['next_context']={'level':0}
        boundary['context']={'level':0};boundary['next_context']={'level':1}
        other=transition(grid(),'a',grid());other['context']={'level':1};other['next_context']={'level':1}
        units=[{'episode':0,'level':0,'transitions':[within,boundary]},
               {'episode':0,'level':1,'transitions':[other]}]
        train,test,info=split_units(units,'level',.5)
        self.assertEqual(info['omitted_cross_level_boundary_transitions'],1)
        self.assertEqual(len(train[0]['transitions']),1)

if __name__=='__main__':unittest.main()
