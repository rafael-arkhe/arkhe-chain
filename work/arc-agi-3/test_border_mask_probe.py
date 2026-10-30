import unittest
from border_mask_probe import project,sha,FrozenLookup

def frame(grid,state='NOT_FINISHED',levels=0):
    return {'frame':[grid],'state':state,'levels_completed':levels,'available_actions':[1]}

class Tests(unittest.TestCase):
    def test_border_removal_preserves_interior_and_metadata(self):
        a=frame([[1]*4,[2]*4,[3]*4,[4]*4]);b=frame([[9]*4,[2]*4,[3]*4,[8]*4])
        self.assertEqual(sha(project(a,1)),sha(project(b,1)))
        b['levels_completed']=1
        self.assertNotEqual(sha(project(a,1)),sha(project(b,1)))

    def test_center_change_and_full_target_are_not_hidden(self):
        a=frame([[0]*4 for _ in range(4)]);b=frame([[0]*4 for _ in range(4)])
        b['frame'][0][1][1]=2
        self.assertNotEqual(sha(project(a,1)),sha(project(b,1)))

    def test_alias_conflict_abstains_and_predictions_do_not_refit(self):
        m=FrozenLookup();key=('masked','action')
        m.observe(key,'retained','full-one');m.observe(key,'retained','full-two')
        frozen=m.digest();self.assertEqual(m.predict(key),('retained',None))
        self.assertEqual(m.digest(),frozen)
        self.assertEqual(m.conflicts()['full_target_conflicting_train_pairs'],1)

    def test_mask_cannot_erase_entire_grid(self):
        with self.assertRaises(ValueError):project(frame([[0],[0]]),1)

if __name__=='__main__':unittest.main()
