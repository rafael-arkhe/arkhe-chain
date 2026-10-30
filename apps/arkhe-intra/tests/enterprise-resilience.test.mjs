import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryResilience, registryGet, RegistryUnavailable } from '../lib/enterprise-resilience.mjs';
test('Serpro retries only transient GET responses with backoff, jitter and bounded Retry-After', async () => {
  const delays = []; let calls = 0;
  const response = await registryGet('https://example.invalid', { signal: AbortSignal.timeout(1000) }, {
    request: async () => ++calls < 3 ? new Response('', {status:503}) : Response.json({ok:true}),
    wait: async ms => delays.push(ms), random: () => .5,
  });
  assert.equal(response.status,200); assert.equal(calls,3); assert.deepEqual(delays,[250,450]);
  calls=0;
  const denied = await registryGet('unused', {}, {request:async()=>{ calls++; return new Response('',{status:401}); }});
  assert.equal(denied.status,401); assert.equal(calls,1);
  await assert.rejects(registryGet('unused', {}, {request:async()=>new Response('',{status:429,headers:{'Retry-After':'60'}}),wait:async()=>assert.fail('early retry')}), RegistryUnavailable);
});
test('Serpro circuit opens, recovers after cooldown and bounds in-flight operations', async () => {
  let time=0, calls=0;
  const run = createRegistryResilience({now:()=>time,threshold:2,cooldown:100,maxConcurrent:1});
  const fail=async()=>{calls++;throw new RegistryUnavailable('synthetic');};
  await assert.rejects(run(fail)); await assert.rejects(run(fail)); await assert.rejects(run(fail)); assert.equal(calls,2);
  time=101; assert.equal(await run(async()=>42),42);
  let release; const pending=run(()=>new Promise(resolve=>{release=resolve;}));
  await assert.rejects(run(async()=>99)); release(1); assert.equal(await pending,1);
});
