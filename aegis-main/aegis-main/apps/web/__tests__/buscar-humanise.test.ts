/**
 * Onda 1 — tradução amigável de erros de conector (pt-BR). Garante que NUNCA
 * vaza corpo HTTP cru (`{"detail":"circuit-open:..."}`, `upstream-error:...`)
 * pro operador, e que falha transitória/infra é distinta de input/permissão.
 */
import { humaniseSearchError } from '@/lib/buscar/humanise';
import { ApiError } from '@/lib/api/client';

describe('humaniseSearchError', () => {
  it('503 com corpo circuit-open → mensagem de indisponibilidade, sem corpo cru', () => {
    const msg = humaniseSearchError(new ApiError(503, '{"detail":"circuit-open:camara-deputados"}'));
    expect(msg).toBe('Fonte temporariamente indisponível. Tente de novo em instantes.');
    expect(msg).not.toContain('circuit-open');
    expect(msg).not.toContain('detail');
  });

  it('upstream-error/ConnectTimeout (Senado) → indisponível', () => {
    const msg = humaniseSearchError(
      new ApiError(503, '{"detail":"upstream-error:senado-federal:ConnectTimeout"}'),
    );
    expect(msg).toBe('Fonte temporariamente indisponível. Tente de novo em instantes.');
    expect(msg).not.toContain('ConnectTimeout');
  });

  it('400 → input incompatível', () => {
    expect(humaniseSearchError(new ApiError(400, "'id' é obrigatório"))).toBe(
      'Esta fonte não aceita este tipo de busca.',
    );
  });

  it('403 → permissão', () => {
    expect(humaniseSearchError(new ApiError(403, 'forbidden'))).toBe(
      'Sem permissão para esta fonte.',
    );
  });

  it('erro não-ApiError (mensagem própria do worker) → preserva a mensagem amigável', () => {
    expect(humaniseSearchError(new Error('Esta fonte só aceita URL — cole o endereço.'))).toBe(
      'Esta fonte só aceita URL — cole o endereço.',
    );
  });

  it('status genérico → só a classe, nunca o corpo', () => {
    const msg = humaniseSearchError(new ApiError(500, '<html>stacktrace secreto</html>'));
    expect(msg).toBe('Erro ao consultar a fonte (HTTP 500).');
    expect(msg).not.toContain('stacktrace');
  });
});
