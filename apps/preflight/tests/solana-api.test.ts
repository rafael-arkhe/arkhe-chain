import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { solanaApi } from '../src/solana-api.ts';

test('RPC proxy validates origins/endpoints/methods and propagates unhealthy RPC', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', solanaApi());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as {port: number}).port}/api`;
  const nativeFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith(url)) return nativeFetch(input, init);
    upstreamCalls++;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'unhealthy' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const payload = { rpcUrl: 'https://api.devnet.solana.com', body: { jsonrpc: '2.0', method: 'getSlot', params: [], id: 1 } };
  const post = (body: unknown, origin?: string) => fetch(url + '/solana-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ ...payload, rpcUrl: 'http://169.254.169.254' })).status, 400);
    assert.equal((await post(payload, 'https://foreign.example')).status, 403);
    assert.equal((await post({ ...payload, body: { ...payload.body, method: 'unknown' } })).status, 400);
    assert.equal(upstreamCalls, 0);
    const healthy = await fetch(url + '/solana/health');
    assert.equal(healthy.status, 502);
    assert.equal((await healthy.json()).ok, false);
    const response = await post(payload);
    assert.equal((await response.json()).error.code, -32005);
    assert.equal(upstreamCalls, 2);
  } finally {
    globalThis.fetch = nativeFetch;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
