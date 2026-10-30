import test from 'node:test';
import assert from 'node:assert/strict';
import {schedule} from './e01_schedule.mjs';
test('matrix is deterministic with exactly 30 slots per batch size',()=>{
  const plan=schedule([1000,5000,10000],30,20261019);
  assert.equal(plan.length,90);
  for (const n of [1000,5000,10000]) assert.equal(plan.filter(x=>x===n).length,30);
  assert.deepEqual(plan,schedule([1000,5000,10000],30,20261019));
  assert.notDeepEqual(plan,schedule([1000,5000,10000],30,20261020));
});
test('invalid and excessive schedules are rejected',()=>{
  for (const [sizes,reps,seed] of [[[1000],30,1],[[1000,5000,10000],31,1],[[1000,5000,10000],30,0]])
    assert.throws(()=>schedule(sizes,reps,seed));
});
