/**
 * cctv bridge (ontology-module) — Tarefa E (2026-06-11).
 *
 * Este arquivo validava o FALLBACK_CCTV_* fabricado (placas/face/"arma
 * sugerida" renderizando como dado real). O fallback foi REMOVIDO: estado
 * inicial é vazio, backend fora vira estado de erro honesto. Aqui fica o
 * guarda anti-regressão + o shape do client.
 */
import * as cctv from '@/lib/api/cctv';

describe('cctv client (ontology-module bridge)', () => {
  it('NÃO expõe mais dados fabricados (fallback fake removido)', () => {
    const mod = cctv as Record<string, unknown>;
    expect(mod.FALLBACK_CCTV_STREAMS).toBeUndefined();
    expect(mod.FALLBACK_CCTV_DETECTIONS).toBeUndefined();
  });

  it('expõe o caminho "Detectar agora" do contrato (detectNow + pollDetectNow)', () => {
    expect(typeof cctv.Cctv.streams.detectNow).toBe('function');
    expect(typeof cctv.pollDetectNow).toBe('function');
  });

  it('mantém os helpers puros usados pela página', () => {
    expect(typeof cctv.nonAggregate).toBe('function');
    expect(typeof cctv.detectionFrameUrl).toBe('function');
    expect(typeof cctv.findStreamByFocusParam).toBe('function');
  });
});
