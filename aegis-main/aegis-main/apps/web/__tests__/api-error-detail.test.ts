/**
 * S7 (hardening) — client.ts: erro HTTP desembrulhado (não JSON cru em inglês).
 *
 * Antes: `apiFetch` jogava o CORPO BRUTO da resposta em `ApiError.message`
 * (`{"detail":"..."}` ou a lista de validação do 422) → o banner do board
 * mostrava JSON cru. Agora desembrulha `.detail` (string OU lista 422 → texto
 * legível) preservando `status`, para os componentes traduzirem/mapearem.
 */
import { apiFetch, ApiError } from '@/lib/api/client';

function mockFetchOnce(status: number, body: string, contentType = 'application/json') {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'ERR',
    headers: { get: () => contentType },
    text: async () => body,
    json: async () => JSON.parse(body),
  }) as unknown as typeof fetch;
}

describe('S7 — ApiError desembrulha detail', () => {
  afterEach(() => jest.restoreAllMocks());

  it('detail string vira a message (sem JSON cru)', async () => {
    mockFetchOnce(409, JSON.stringify({ detail: "trigger slug 'x' already exists" }));
    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 409,
      message: "trigger slug 'x' already exists",
    });
  });

  it('detail lista (422) vira texto legível, não [object Object]', async () => {
    mockFetchOnce(
      422,
      JSON.stringify({ detail: [{ loc: ['body', 'nome'], msg: 'campo obrigatório' }] }),
    );
    let err: ApiError | null = null;
    try {
      await apiFetch('/x');
    } catch (e) {
      err = e as ApiError;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect(err!.status).toBe(422);
    expect(err!.message).toContain('campo obrigatório');
    expect(err!.message).not.toContain('[object Object]');
    expect(err!.message).not.toContain('{"detail"');
  });

  it('corpo não-JSON cai no texto cru (sem quebrar)', async () => {
    mockFetchOnce(502, 'Bad Gateway', 'text/plain');
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });
});
