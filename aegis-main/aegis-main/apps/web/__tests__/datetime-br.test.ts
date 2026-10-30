import { formatHoraBR, formatHoraSegBR, formatDataBR, formatDataHoraBR } from '@/lib/datetime';

describe('datetime helpers (pt-BR / America/Sao_Paulo)', () => {
  // 16:23 UTC = 13:23 BRT (UTC-3)
  const isoZ = '2026-05-17T16:23:09Z';
  const isoNaive = '2026-05-17T16:23:09';  // sem sufixo — backend FastAPI

  it('formatHoraBR converte 16:23Z → 13:23 (BRT)', () => {
    expect(formatHoraBR(isoZ)).toBe('13:23');
  });

  it('formatHoraBR trata string ISO sem Z como UTC (igual a com Z)', () => {
    expect(formatHoraBR(isoNaive)).toBe('13:23');
  });

  it('formatHoraSegBR inclui segundos', () => {
    expect(formatHoraSegBR(isoZ)).toBe('13:23:09');
  });

  it('formatDataBR usa formato DD/MM/AAAA', () => {
    expect(formatDataBR(isoZ)).toBe('17/05/2026');
  });

  it('formatDataHoraBR combina data + hora:min:seg', () => {
    expect(formatDataHoraBR(isoZ)).toBe('17/05/2026 13:23:09');
  });

  it('aceita Date object direto', () => {
    const d = new Date('2026-05-17T16:23:09Z');
    expect(formatHoraBR(d)).toBe('13:23');
  });

  it('respeita offset explícito em ISO com +/-HH:MM', () => {
    // 18:00 -02:00 = 20:00 UTC = 17:00 BRT
    expect(formatHoraBR('2026-05-17T18:00:00-02:00')).toBe('17:00');
  });
});
