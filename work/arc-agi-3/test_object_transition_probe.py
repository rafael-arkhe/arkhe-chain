import unittest
from object_transition_probe import scene,reconstruct,TranslationModel

def board(x,y=1,width=10):
    grid=[[0]*width for _ in range(5)]
    for dy in (0,1):
        for dx in (0,1):grid[y+dy][x+dx]=3
    return grid

class Tests(unittest.TestCase):
    def test_palette_scene_reconstructs_pixels_including_irregular_regions(self):
        grid=[[0,0,2,2],[0,1,2,0],[1,1,0,0]]
        self.assertEqual(reconstruct(scene(grid)),grid)

    def test_position_independent_translation_predicts_unseen_position(self):
        model=TranslationModel();action={'id':4}
        model.observe(board(1),action,board(2));model.observe(board(2),action,board(3))
        predicted,reason=model.predict(board(5),action)
        self.assertEqual(predicted,board(6));self.assertEqual(reason,'PREDICTED_TRANSLATION')

    def test_conflicting_motion_abstains(self):
        model=TranslationModel();action={'id':4}
        model.observe(board(1),action,board(2));model.observe(board(2),action,board(2))
        self.assertIsNone(model.predict(board(4),action)[0])

    def test_prediction_does_not_update_model_and_bounds_abstain(self):
        model=TranslationModel();action={'id':4}
        model.observe(board(1),action,board(2));model.observe(board(2),action,board(3))
        exported=model.export();self.assertIsNone(model.predict(board(8),action)[0])
        self.assertEqual(model.export(),exported)

    def test_clicks_are_not_treated_as_coordinate_free_actions(self):
        model=TranslationModel();action={'id':6,'x':1,'y':1}
        model.observe(board(1),action,board(2))
        self.assertEqual(model.rules,{})
        self.assertEqual(model.predict(board(1),action),(None,'UNSUPPORTED_ACTION'))

if __name__=='__main__':unittest.main()
