export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 524_288;

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function gatewayConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = (process.env.ARKHE_SOLANA_SWAP_GATEWAY_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.ARKHE_SOLANA_SWAP_TOKEN || '').trim();
  if (!baseUrl || !token) return null;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { baseUrl, token };
}

function validateOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const expected = process.env.ARKHE_INTRA_ORIGIN || 'http://127.0.0.1:3003';
  return origin === expected;
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export async function POST(request: Request) {
  if (!validateOrigin(request)) {
    return json({ error: 'Origem inválida.' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return json({ error: 'Envie JSON.' }, 415);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    return json({ error: 'Requisição maior que 512 KiB.' }, 413);
  }

  let body: { action?: string; receiptId?: string; limit?: number; offset?: number; payload?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const cfg = gatewayConfig();
  if (!cfg) {
    return json(
      {
        configured: false,
        error:
          'Gateway /v1/solana/swap/* não configurado no servidor (defina ARKHE_SOLANA_SWAP_GATEWAY_URL e ARKHE_SOLANA_SWAP_TOKEN). A verificação local via WASM continua 100% operacional offline.',
      },
      503,
    );
  }

  let method: 'GET' | 'POST' = 'GET';
  let path = '';
  let outboundBody: string | undefined;

  switch (body.action) {
    case 'health':
      path = '/v1/solana/swap/health';
      break;
    case 'public-keys':
      path = '/v1/solana/swap/public-keys';
      break;
    case 'policy':
      path = '/v1/solana/swap/policy';
      break;
    case 'checkpoint':
      path = '/v1/solana/swap/checkpoint';
      break;
    case 'receipts': {
      const limit = Math.min(Math.max(Number(body.limit ?? 25) || 25, 1), 200);
      const offset = Math.max(Number(body.offset ?? 0) || 0, 0);
      path = `/v1/solana/swap/receipts?limit=${limit}&offset=${offset}`;
      break;
    }
    case 'bundle': {
      const id = String(body.receiptId || '');
      if (!SAFE_ID.test(id)) return json({ error: 'receiptId inválido.' }, 400);
      path = `/v1/solana/swap/receipts/${encodeURIComponent(id)}/bundle`;
      break;
    }
    case 'confirmation': {
      const id = String(body.receiptId || '');
      if (!SAFE_ID.test(id)) return json({ error: 'receiptId inválido.' }, 400);
      path = `/v1/solana/swap/receipts/${encodeURIComponent(id)}/confirmation`;
      break;
    }
    case 'verify-bundle':
      method = 'POST';
      path = '/v1/solana/swap/verify-bundle';
      outboundBody = JSON.stringify(body.payload ?? {});
      break;
    default:
      return json({ error: 'Ação não permitida.' }, 400);
  }

  try {
    const upstream = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(outboundBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: outboundBody,
      cache: 'no-store',
    });
    const raw = await upstream.text();
    try {
      return json(JSON.parse(raw), upstream.status);
    } catch {
      return json({ status: upstream.status, body: raw }, upstream.status);
    }
  } catch (cause) {
    return json(
      { error: `Falha ao contatar gateway Solana Swap: ${cause instanceof Error ? cause.message : 'erro desconhecido'}` },
      502,
    );
  }
}
