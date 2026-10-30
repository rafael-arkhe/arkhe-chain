import copy
import json
import unittest
from run_resource_trial import assess_resource, LIMITS

class ResourceAssessmentTests(unittest.TestCase):
    def setUp(self):
        self.before={'cgroup':dict(LIMITS, **{'memory.events':'oom_kill 0\n','cpu.stat':'nr_throttled 0\nthrottled_usec 0\n','pids.events':'max 0\n'})}
        self.receipt={'samples':[{'memory.events':'oom_kill 1\n','cpu.stat':'nr_throttled 3\nthrottled_usec 100\n','pids.events':'max 10\n'}],'exit_code':137,'deadline_exceeded':False,'observer_inside_target':False}
    def test_memory_requires_oom_counter(self):
        self.assertEqual(assess_resource('memory-bounded',self.before,self.receipt,None),'PASS')
        self.receipt['samples'][0]['memory.events']='oom_kill 0\n'
        self.assertEqual(assess_resource('memory-bounded',self.before,self.receipt,None),'FAIL')
    def test_timeout_never_passes(self):
        self.receipt['deadline_exceeded']=True
        self.assertEqual(assess_resource('memory-bounded',self.before,self.receipt,None),'ERROR')
    def test_swap_must_be_disabled(self):
        self.before['cgroup']['memory.swap.max']='max'
        self.assertEqual(assess_resource('memory-bounded',self.before,self.receipt,None),'FAIL')
    def test_wrong_quota_rejected(self):
        self.before['cgroup']['cpu.max']='max 100000'
        self.assertEqual(assess_resource('cpu-bounded',self.before,self.receipt,None),'FAIL')
    def test_inside_observer_rejected(self):
        self.receipt['observer_inside_target']=True
        self.assertEqual(assess_resource('memory-bounded',self.before,self.receipt,None),'ERROR')
    def test_cpu_requires_throttling(self):
        self.receipt['exit_code']=0
        obs={'state':'OBSERVED','observations':json.dumps({'threads':2,'elapsed_ms':3000,'iterations':100})}
        self.assertEqual(assess_resource('cpu-bounded',self.before,self.receipt,obs),'PASS')
        self.receipt['samples'][0]['cpu.stat']='nr_throttled 0\nthrottled_usec 0\n'
        self.assertEqual(assess_resource('cpu-bounded',self.before,self.receipt,obs),'FAIL')
    def test_pids_requires_external_event_and_reaping(self):
        self.receipt['exit_code']=0
        data={'attempts':24,'spawned':13,'eagain':11,'other_errors':0,'reaped':13}
        obs={'state':'OBSERVED','observations':json.dumps(data)}
        self.assertEqual(assess_resource('pids-bounded',self.before,self.receipt,obs),'PASS')
        self.receipt['samples'][0]['pids.events']='max 0\n'
        self.assertEqual(assess_resource('pids-bounded',self.before,self.receipt,obs),'FAIL')
    def test_memory_survival_is_failure(self):
        self.receipt['exit_code']=0
        self.assertEqual(assess_resource('memory-bounded',self.before,self.receipt,None),'FAIL')

if __name__=='__main__':unittest.main()
