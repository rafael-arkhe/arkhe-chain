import { E02InputError, verifyE02 } from '@/lib/e02.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 524288;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const expected = process.env.ARKHE_INTRA_ORIGIN || 'http://127.0.0.1:3003';
  if (request.headers.get('origin') !== expected) return json({ error: 'Origem inválida.' }, 403);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return json({ error: 'Envie JSON.' }, 415);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return json({ error: 'Requisição maior que 512 KiB.' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }
  try {
    return json(verifyE02(body));
  } catch (cause) {
    if (cause instanceof E02InputError) return json({ error: cause.message }, 400);
    console.error('e02 verify failed', cause);
    return json({ error: 'Falha ao verificar os ficheiros.' }, 500);
  }
}
