/**
 * Conversores de timestamp pra horário de Brasília (pt-BR).
 *
 * O backend (ontology + intel) grava `detected_at` / `created_at` como
 * ISO 8601 UTC. Usar `.slice(11, 16)` cru mostra UTC pro operador —
 * que está em America/Sao_Paulo (-03), então fica 3h adiantado.
 *
 * Estes helpers sempre devolvem a hora local SP, formato 24h, pt-BR.
 */

const TZ = 'America/Sao_Paulo';

function parse(input: string | Date): Date {
  if (input instanceof Date) return input;
  // Trata strings ISO sem Z (FastAPI/SQLAlchemy às vezes gravam sem
  // sufixo) — Postgres TIMESTAMP without TZ é tratado como UTC pelo
  // backend, então forçamos UTC ao parsear.
  if (typeof input === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) {
    return new Date(input + 'Z');
  }
  return new Date(input);
}

export function formatHoraBR(iso: string | Date): string {
  return parse(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

export function formatHoraSegBR(iso: string | Date): string {
  return parse(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: TZ,
  });
}

export function formatDataBR(iso: string | Date): string {
  return parse(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ,
  });
}

export function formatDataHoraBR(iso: string | Date): string {
  return `${formatDataBR(iso)} ${formatHoraSegBR(iso)}`;
}
