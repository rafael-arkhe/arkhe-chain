import { labelLineageKind, isKnownLineageKind } from '@/lib/lineage-i18n';

describe('lineage i18n (pt-BR)', () => {
  it('traduz kinds CCTV conhecidos', () => {
    expect(labelLineageKind('cctv.face.observe')).toBe('Rosto identificado');
    expect(labelLineageKind('cctv.detection.lpr')).toBe('Placa detectada');
    expect(labelLineageKind('cctv.stream.create')).toBe('Câmera cadastrada');
    expect(labelLineageKind('cctv.stream.update')).toBe('Câmera atualizada');
  });

  it('traduz event_type genérico', () => {
    expect(labelLineageKind('ingest')).toBe('Ingestão');
    expect(labelLineageKind('enrich')).toBe('Enriquecimento');
  });

  it('faz fallback pro próprio kind quando desconhecido', () => {
    expect(labelLineageKind('algo.novo')).toBe('algo.novo');
  });

  it('trata null/undefined/empty', () => {
    expect(labelLineageKind(null)).toBe('Evento');
    expect(labelLineageKind(undefined)).toBe('Evento');
    expect(labelLineageKind('')).toBe('Evento');
  });

  it('isKnownLineageKind', () => {
    expect(isKnownLineageKind('cctv.face.observe')).toBe(true);
    expect(isKnownLineageKind('algo.novo')).toBe(false);
    expect(isKnownLineageKind(null)).toBe(false);
  });
});
