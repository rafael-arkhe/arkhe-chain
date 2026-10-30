import copy
from dataclasses import replace
from pathlib import Path
import tempfile
import unittest
from publisher import (Request, Policy, Journal, Sink, canonical, digest, prove,
                       check_proof, review, authorize, dispatch, memory_read,
                       event_chain, validate_chain)


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.key = b'fixture-only'
        self.r = Request('tenant-a', 'publisher', 'n1', 'internal-reports', 'report', (20,30,50))
        self.p = Policy()
        self.proof = prove(self.r.costs)
        self.approval = review(self.r,self.p,self.key)
        self.tmp = tempfile.TemporaryDirectory(prefix='arkhe-book-test-')
        self.jp = str(Path(self.tmp.name)/'journal.db')
        self.j = Journal(self.jp)
        self.sink = Sink(str(Path(self.tmp.name)/'sink.db'))

    def tearDown(self):
        self.sink.close()
        self.j.close()
        self.tmp.cleanup()

    def run_dispatch(self, **kwargs):
        return dispatch(self.r,self.p,self.proof,self.approval,self.key,10,self.j,self.sink,**kwargs)

    def test_canonical_key_order(self):
        self.assertEqual(canonical({'b':1,'a':2}),canonical({'a':2,'b':1}))

    def test_float_is_outside_profile(self):
        with self.assertRaises(ValueError): canonical({'amount':1.0})

    def test_operation_excludes_parameters(self):
        other=replace(self.r,content='different')
        self.assertEqual(self.r.operation(),other.operation())
        self.assertNotEqual(self.r.identity(),other.identity())

    def test_operation_includes_tenant(self):
        self.assertNotEqual(self.r.operation(),replace(self.r,tenant='tenant-b').operation())

    def test_valid_proof(self):
        self.assertTrue(check_proof(self.proof,self.r.costs,self.p))

    def test_forged_step(self):
        bad=copy.deepcopy(self.proof);bad['prefix'][2]=49
        with self.assertRaises(ValueError): check_proof(bad,self.r.costs,self.p)

    def test_over_budget(self):
        with self.assertRaises(ValueError): check_proof(prove((101,)),(101,),self.p)

    def test_overflow(self):
        with self.assertRaises(ValueError): prove((2**64-1,1))

    def test_empty_proof(self):
        with self.assertRaises(ValueError): prove(())

    def test_boolean_is_not_cost(self):
        with self.assertRaises(ValueError): prove((True,))

    def test_authentication_failure(self):
        with self.assertRaises(ValueError): authorize(self.r,self.p,self.proof,self.approval,b'rogue',10)

    def test_review_cannot_transfer(self):
        other=replace(self.r,content='changed')
        with self.assertRaises(ValueError): authorize(other,self.p,self.proof,self.approval,self.key,10)

    def test_changed_policy_requires_new_review(self):
        with self.assertRaises(ValueError): authorize(self.r,replace(self.p,epoch=2),self.proof,self.approval,self.key,10)

    def test_review_expiry(self):
        with self.assertRaises(ValueError): authorize(self.r,self.p,self.proof,self.approval,self.key,1000)

    def test_scope_denial(self):
        with self.assertRaises(ValueError): authorize(replace(self.r,target='public'),self.p,self.proof,self.approval,self.key,10)

    def test_success_replay_does_not_dispatch(self):
        self.assertEqual(self.run_dispatch(),self.run_dispatch())
        self.assertEqual(self.sink.calls,1)

    def test_denial_has_no_local_effect(self):
        with self.assertRaises(ValueError): self.run_dispatch(stopped=True)
        self.assertEqual(self.sink.count(),0)

    def test_stop_also_blocks_receipt_replay(self):
        self.run_dispatch()
        with self.assertRaises(ValueError): self.run_dispatch(stopped=True)
        self.assertEqual(self.sink.calls,1)

    def test_lost_acknowledgment_is_uncertain(self):
        with self.assertRaises(RuntimeError): self.run_dispatch(fail_after_effect=True)
        self.assertEqual(self.sink.count(),1)
        with self.assertRaises(ValueError): self.run_dispatch()
        self.assertEqual(self.sink.calls,1)

    def test_reopen_preserves_uncertainty(self):
        with self.assertRaises(RuntimeError): self.run_dispatch(fail_after_effect=True)
        self.j.close();self.j=Journal(self.jp)
        with self.assertRaises(ValueError): self.run_dispatch()

    def test_parameter_conflict(self):
        self.run_dispatch()
        other=replace(self.r,content='changed')
        with self.assertRaisesRegex(ValueError,'conflict'):
            dispatch(other,self.p,self.proof,review(other,self.p,self.key),self.key,10,self.j,self.sink)

    def test_lineage_allowed(self):
        self.assertEqual(memory_read(7,{'orders.total'},{'orders.total'}),7)

    def test_lineage_derived_secret_denied(self):
        with self.assertRaises(ValueError):memory_read('summary',{'orders.total','staff.salary'},{'orders.total'})

    def test_unknown_lineage_denied(self):
        with self.assertRaises(ValueError):memory_read('summary',None,{'orders.total'})

    def test_complete_chain(self):
        chain,head=event_chain([('allow',{}),('effect',{})]);self.assertTrue(validate_chain(chain,head))

    def test_chain_tampering(self):
        chain,head=event_chain([('allow',{}),('effect',{})]);chain[0]['kind']='deny'
        with self.assertRaises(ValueError):validate_chain(chain,head)

    def test_truncation_against_retained_head(self):
        chain,head=event_chain([('allow',{}),('effect',{})])
        with self.assertRaises(ValueError):validate_chain(chain[:1],head)


if __name__ == '__main__':unittest.main()
