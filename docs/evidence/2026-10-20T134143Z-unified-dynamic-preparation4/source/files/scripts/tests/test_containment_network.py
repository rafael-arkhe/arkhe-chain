import copy
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from containment_network import evaluate,parse_events,positive_response


class NetworkOracleTests(unittest.TestCase):
    def setUp(self):
        self.run='test-run';self.target='a'*64;self.before_nonce='b'*64;self.after_nonce='c'*64
        self.request={'nonce':self.target}
        self.before=[self.event('ready',0),self.event('heartbeat',500),self.event('received',600,self.before_nonce)]
        self.after=self.before+[self.event('heartbeat',1000),self.event('heartbeat',1500),self.event('heartbeat',2000),self.event('received',2200,self.after_nonce)]
        self.controls={'before':{'nonce':self.before_nonce,'response_valid':True},'after':{'nonce':self.after_nonce,'response_valid':True}}
        self.lifecycle={'running_before':True,'running_after':True,'restarts':0}
        self.oracle={'network':{'dev':'Inter-| Receive\n lo: 0 0 0\n','route':'Iface Destination Gateway Flags\n'}}
        self.observation={'state':'OBSERVED','observations':json.dumps([{'case':'exchange','outcome':'error','value':'Network unreachable','errno':101}])}

    def event(self,kind,time,nonce=''):
        return {'run_id':self.run,'event':kind,'protocol':'tcp' if nonce else '', 'nonce':nonce,'elapsed_ms':time}

    def assess(self):
        return evaluate('tcp-egress',self.observation,self.request,self.oracle,self.before,self.after,self.controls,self.lifecycle)

    def test_blocked_with_both_controls_and_coverage(self):
        self.assertEqual(self.assess(),'PASS')

    def test_silence_without_control_is_error(self):
        self.controls['before']['response_valid']=False
        with self.assertRaises(ValueError):self.assess()

    def test_missing_after_control_is_error(self):
        self.after.pop()
        with self.assertRaises(ValueError):self.assess()

    def test_target_nonce_receipt_is_fail(self):
        self.after.append(self.event('received',2300,self.target))
        self.assertEqual(self.assess(),'FAIL')

    def test_successful_target_exchange_is_fail(self):
        self.observation['observations']=json.dumps([{'case':'exchange','outcome':'ok','value':'echo:'+self.target,'errno':None}])
        self.assertEqual(self.assess(),'FAIL')

    def test_heartbeat_gap_invalidates_negative(self):
        self.after=self.before+[self.event('heartbeat',3000),self.event('received',3200,self.after_nonce)]
        with self.assertRaises(ValueError):self.assess()

    def test_oracle_restart_or_down_is_error(self):
        self.lifecycle['restarts']=1
        with self.assertRaises(ValueError):self.assess()

    def test_log_reset_is_error(self):
        self.after=self.after[1:]
        with self.assertRaises(ValueError):self.assess()

    def test_non_loopback_interface_is_fail(self):
        self.oracle['network']['dev']+=' eth0: 0 0 0\n'
        self.assertEqual(self.assess(),'FAIL')

    def test_unrelated_errno_is_not_denial(self):
        data=json.loads(self.observation['observations']);data[0]['errno']=22
        self.observation['observations']=json.dumps(data)
        with self.assertRaises(ValueError):self.assess()

    def test_malformed_oracle_or_duplicate_json_keys_rejected(self):
        with self.assertRaises(ValueError):parse_events(b'{"event":"ready","event":"received"}',self.run)
        bad=self.event('error',1)
        with self.assertRaises(ValueError):parse_events(json.dumps(bad).encode(),self.run)

    def test_positive_control_requires_echoed_nonce(self):
        obs={'state':'OBSERVED','observations':json.dumps([{'case':'exchange','outcome':'ok','value':'echo:'+self.before_nonce,'errno':None}])}
        self.assertTrue(positive_response(obs,self.before_nonce))
        self.assertFalse(positive_response(obs,self.target))
