import unittest
import context_transition_probe as c
import object_transition_probe as b

class ContextTests(unittest.TestCase):
    def test_controls(self):self.assertEqual(c.controls()['status'],'PASS')
    def test_context_translation_and_boundary(self):
        a=c.board(4,3,True);d=c.board(4,5,True)
        obj=lambda g:next(o for o in b.scene(g)['objects'] if o['color']==5)
        self.assertEqual(c.context(a,obj(a),0),c.context(d,obj(d),0))
        edge=c.board(0,3,False);interior=c.board(4,3,False)
        self.assertNotEqual(c.context(edge,obj(edge),0),c.context(interior,obj(interior),0))
    def test_frozen_and_click(self):
        m=c.ContextModel();row=(c.board(4,3,False),{'id':4},c.board(5,3,False))
        for _ in range(2):m.observe(*row)
        h=b.digest(m.export());m.predict(row[0],row[1]);self.assertEqual(b.digest(m.export()),h)
        self.assertIsNone(m.predict(row[0],{'id':6,'x':4,'y':3})[0])
    def test_gate_cannot_pass_abstention_or_wrong(self):
        for m in (c.metrics(10,0,0),c.metrics(10,10,9),c.metrics(0,0,0)):
            self.assertEqual(c.gate(m)['status'],'FAIL')
