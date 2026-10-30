import express from 'express';

export function solanaApi(extraEndpoints = '') {
  const router = express.Router();
  const allowed = new Set(['https://api.devnet.solana.com', 'https://api.testnet.solana.com', 'https://api.mainnet-beta.solana.com', 'http://127.0.0.1:8899', ...extraEndpoints.split(',').map(value => value.trim()).filter(Boolean)]);
  const methods = new Set(['getHealth', 'getSlot', 'getBalance', 'getTransaction', 'getLatestBlockhash', 'getSignatureStatuses', 'sendTransaction', 'requestAirdrop']);
  function endpoint(value: unknown): string {
    if (typeof value !== 'string') throw new Error('RPC endpoint inválido.');
    const url = new URL(value);
    if (url.username || url.password || url.hash || !allowed.has(value.replace(/\/$/, ''))) throw new Error('RPC não configurado no servidor.');
    return value;
  }
  router.post('/solana-proxy', async (req, res) => {
    try {
      if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) { res.status(403).json({ error: 'Origem não permitida.' }); return; }
      const target = endpoint(req.body?.rpcUrl ?? 'https://api.devnet.solana.com');
      const body = req.body?.body;
      if (!body || body.jsonrpc !== '2.0' || !methods.has(body.method) || !Array.isArray(body.params) || body.params.length > 10) {
        res.status(400).json({ error: 'Requisição RPC inválida.' }); return;
      }
      if (body.method === 'requestAirdrop' && !['https://api.devnet.solana.com', 'https://api.testnet.solana.com', 'http://127.0.0.1:8899'].includes(target.replace(/\/$/, ''))) {
        res.status(400).json({ error: 'Airdrop restrito às redes de teste.' }); return;
      }
      const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) { res.status(502).json({ error: 'RPC indisponível (HTTP ' + response.status + ').' }); return; }
      res.json(await response.json());
    } catch (error) {
      res.status(error instanceof Error && /RPC|endpoint|URL/.test(error.message) ? 400 : 502).json({ error: 'Não foi possível consultar o RPC configurado.' });
    }
  });
  router.get('/solana/health', async (req, res) => {
    try {
      const target = endpoint(req.query['rpc'] ?? 'https://api.devnet.solana.com');
      const start = Date.now();
      const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] }), redirect: 'error', signal: AbortSignal.timeout(5000) });
      const result = await response.json();
      const ok = response.ok && !result.error && result.result === 'ok';
      res.status(ok ? 200 : 502).json({ ok, latencyMs: Date.now() - start, result: result.result ?? null });
    } catch { res.status(502).json({ ok: false, error: 'RPC indisponível ou não configurado.' }); }
  });
  return router;
}
