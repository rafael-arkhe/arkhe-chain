import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent/'reference/starter/vendor/ARC-AGI-3-Agents'))
from arcengine import FrameData,GameState
from arkhe_agent import Explorer,MyAgent,candidates,state_key,TransitionRecorder

class Tests(unittest.TestCase):
    def test_legal_clicks_and_no_unadvertised_action(self):
        f=FrameData(frame=[[[0,0],[0,1]]],available_actions=[6],state=GameState.NOT_FINISHED)
        choices=candidates(f)
        self.assertTrue(choices)
        self.assertTrue(all(a==6 and 0<=x<64 and 0<=y<64 for a,x,y in choices))

    def test_frontier_routes_to_unexplored_state(self):
        e=Explorer();a=(1,None,None);b=(2,None,None)
        e.options['next']=(a,b);e.observe('start',a,'next');e.observe('start',b,'start')
        self.assertEqual(e.choose('start',[a,b]),a)

    def test_conflicting_edge_is_not_used_for_planning(self):
        e=Explorer();a=(1,None,None);e.observe('s',a,'t');e.observe('s',a,'u')
        self.assertNotIn(('s',a),e.edges)

    def test_budget_rejects_before_transport(self):
        a=object.__new__(MyAgent);a.dispatched=2;a.MAX_ACTIONS=2
        with patch('agents.agent.Agent.take_action') as transport:
            with self.assertRaises(RuntimeError):a.take_action(None)
            transport.assert_not_called()

    def test_seed_replay_and_transport_fields_ignored(self):
        choices=[(1,None,None),(2,None,None)]
        self.assertEqual(Explorer(7).choose('s',choices),Explorer(7).choose('s',choices))
        a=FrameData(frame=[[[1]]],levels_completed=0,guid='first')
        b=FrameData(frame=[[[1]]],levels_completed=0,guid='second')
        self.assertEqual(state_key(a),state_key(b))

    def test_native_rejection_prevents_dispatch(self):
        a=object.__new__(MyAgent);a.dispatched=0;a.MAX_ACTIONS=2;a.selected=(1,None,None)
        a.current=FrameData(frame=[[[1]]]);a.game_id='synthetic';a.manifest={};a.bridge='enabled'
        a.explorer=Explorer();a.trace_path=None
        with patch.object(a,'native',side_effect=RuntimeError('reject')),patch('agents.agent.Agent.take_action') as transport:
            with self.assertRaises(RuntimeError):a.take_action(None)
            self.assertEqual(a.dispatched,0);transport.assert_not_called()

    def test_choose_returns_advertised_sdk_enum(self):
        a=object.__new__(MyAgent);a.explorer=Explorer();a.bridge=None
        f=FrameData(frame=[[[0]]],available_actions=[4],state=GameState.NOT_FINISHED)
        self.assertEqual(a.choose_action([],f).name,'ACTION4')

    def test_recorder_counts_prediction_events_not_unique_pairs(self):
        r=TransitionRecorder();action=(1,None,None)
        r.record('s',action,'t','t',0,0)
        r.record('s',action,'u','t',0,0)
        r.record('s',action,'t','t',0,1)
        m=r.metrics()
        self.assertEqual(m['prediction_coverage'],1)
        self.assertEqual(m['model_prediction_error'],1/3)
        self.assertEqual(m['same_outcome_repeat_ratio'],1/3)
        self.assertIsNone(m['stuck_repeat_ratio'])
        self.assertEqual(m['prediction_frequency'],1)
        self.assertEqual(m['visited_pair_prediction_coverage'],1)

    def test_recorder_abstention_and_reset_denominators(self):
        r=TransitionRecorder();r.record('s',(0,None,None),'t',None,0,0)
        r.record('t',(1,None,None),'u',None,0,1)
        m=r.metrics();self.assertEqual(m['prediction_coverage'],0)
        self.assertIsNone(m['model_prediction_error'])
        self.assertEqual(m['levels_per_100_actions'],50)

    def test_live_frequency_is_not_unique_pair_coverage(self):
        r=TransitionRecorder()
        r.record('s',(1,None,None),'t',None,0,0)
        for _ in range(9):r.record('s',(1,None,None),'t','t',0,0)
        m=r.metrics();self.assertEqual(m['prediction_frequency'],0.9)
        self.assertEqual(m['visited_pair_prediction_coverage'],1)

    def test_prediction_is_persisted_before_transport(self):
        import tempfile,json,gzip
        from arcengine import GameAction
        with tempfile.TemporaryDirectory() as directory:
            a=object.__new__(MyAgent);a.dispatched=0;a.MAX_ACTIONS=2;a.selected=(1,None,None)
            a.current=FrameData(frame=[[[1]]],available_actions=[1],state=GameState.NOT_FINISHED)
            outcome=FrameData(frame=[[[2]]],available_actions=[1],state=GameState.NOT_FINISHED)
            a.game_id='synthetic';a.manifest={'profile':'arc-observation-explorer-v2-recorder','max_actions':2}
            a.bridge=None;a.previous_hash='0'*64
            a.trace_path=str(Path(directory)/'trace.jsonl');a.explorer=Explorer();a.transition_recorder=TransitionRecorder()
            source=state_key(a.current);target=state_key(outcome)
            a.explorer.model.observe(source,a.selected,target)
            def transport(action):
                proposal=json.loads(Path(a.trace_path+'.proposals').read_text())
                self.assertEqual(proposal['prediction']['predicted_next'],target)
                self.assertFalse(Path(a.trace_path).exists())
                return outcome
            with patch('agents.agent.Agent.take_action',side_effect=transport):a.take_action(GameAction.ACTION1)
            record=json.loads(Path(a.trace_path).read_text())
            self.assertTrue(record['prediction_correct'])
            raw=gzip.decompress((Path(directory)/record['before_frame']['relative_path']).read_bytes())
            import hashlib
            self.assertEqual(hashlib.sha256(raw).hexdigest(),source)
            from verify_arc_traces import verify
            self.assertEqual(verify(Path(a.trace_path))['snapshots_verified'],2)
            frame_path=Path(directory)/record['before_frame']['relative_path']
            frame_path.write_bytes(gzip.compress(b'{}'))
            with self.assertRaisesRegex(ValueError,'snapshot digest mismatch'):verify(Path(a.trace_path))
            frame_path.write_bytes(gzip.compress(raw))
            proposal_path=Path(a.trace_path+'.proposals');proposal=json.loads(proposal_path.read_text())
            proposal['prediction']['predicted_next']=None;proposal_path.write_text(json.dumps(proposal)+'\n')
            with self.assertRaisesRegex(ValueError,'proposal/outcome mismatch'):verify(Path(a.trace_path))

if __name__=='__main__':unittest.main()
