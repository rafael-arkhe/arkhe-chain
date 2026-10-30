import { mapBackendAlert, type BackendAlert } from '@/lib/api/alerts-map';

const base: BackendAlert = {
  id: 'a-1',
  kind: 'geofence',
  fired_at: '2026-06-12T14:00:00+00:00',
  classification: 'U',
  status: 'pending',
  severity: 'high',
  title: 'Cerca Norte: entrada de obj-1',
  object_id: 'obj-1',
  actor_id: null,
  payload: { event: 'enter', geofence_name: 'Cerca Norte', object_id: 'obj-1' },
  redacted: false,
};

describe('mapBackendAlert (wire → AlertItem da página /alertas)', () => {
  it('mapeia kind do backend para feed_kind da UI', () => {
    expect(mapBackendAlert({ ...base, kind: 'search_feed' }).feed_kind).toBe('feed');
    expect(mapBackendAlert({ ...base, kind: 'object_watch' }).feed_kind).toBe('watch');
    expect(mapBackendAlert({ ...base, kind: 'geofence' }).feed_kind).toBe('geofence');
    expect(mapBackendAlert({ ...base, kind: 'share' }).feed_kind).toBe('share');
    // Placa procurada (hotlist LPR) — observação de objeto → 'watch'.
    expect(mapBackendAlert({ ...base, kind: 'lpr_hotlist' }).feed_kind).toBe('watch');
  });

  it('snippet de placa procurada vem do payload (placa · câmera · motivo)', () => {
    const m = mapBackendAlert({
      ...base,
      kind: 'lpr_hotlist',
      title: 'Placa procurada ABC1D23 lida em cam-7',
      payload: {
        plate: 'ABC1D23',
        camera: 'cam-7',
        reason: 'veículo de interesse',
        watched_plate_id: 'wp-1',
      },
    });
    expect(m.feed_kind).toBe('watch');
    expect(m.channel).toBe('lpr_hotlist');
    expect(m.snippet).toContain('ABC1D23');
    expect(m.snippet).toContain('cam-7');
  });

  it('placa procurada redigida NÃO vaza a placa (PII)', () => {
    const m = mapBackendAlert({
      ...base,
      kind: 'lpr_hotlist',
      redacted: true,
      title: null,
      payload: null,
    });
    expect(m.snippet).toBe('');
    expect(m.title).toBe('');
  });

  it('mapeia severity para priority', () => {
    expect(mapBackendAlert({ ...base, severity: 'critical' }).priority).toBe('critica');
    expect(mapBackendAlert({ ...base, severity: 'high' }).priority).toBe('alta');
    expect(mapBackendAlert({ ...base, severity: 'medium' }).priority).toBe('normal');
    expect(mapBackendAlert({ ...base, severity: 'low' }).priority).toBe('normal');
  });

  it('usa fired_at como created_at e ack_at quando reconhecido', () => {
    const m = mapBackendAlert(base);
    expect(m.created_at).toBe(base.fired_at);
    expect(m.acknowledged_at).toBeNull();

    const acked = mapBackendAlert({
      ...base,
      status: 'acknowledged',
      ack_at: '2026-06-12T15:00:00+00:00',
    });
    expect(acked.acknowledged_at).toBe('2026-06-12T15:00:00+00:00');
  });

  it('preserva título honesto e payload', () => {
    const m = mapBackendAlert(base);
    expect(m.title).toBe('Cerca Norte: entrada de obj-1');
    expect(m.payload).toEqual(base.payload);
    expect(m.classification).toBe('U');
  });

  it('alerta redigido não vaza conteúdo', () => {
    const m = mapBackendAlert({
      ...base,
      redacted: true,
      title: null,
      payload: null,
      object_id: null,
      classification: 'S',
    });
    expect(m.redacted).toBe(true);
    expect(m.title).toBe('');
    expect(m.snippet).toBe('');
    expect(m.payload).toBeNull();
  });

  it('snippet honesto por kind a partir do payload', () => {
    expect(
      mapBackendAlert({
        ...base,
        kind: 'search_feed',
        payload: { feed_name: 'Busca X', matched_object_ids: ['a', 'b'] },
      }).snippet,
    ).toContain('Busca X');
    expect(
      mapBackendAlert({
        ...base,
        kind: 'object_watch',
        payload: { event_type: 'UPDATE', diff_summary: 'campo y' },
      }).snippet,
    ).toContain('campo y');
  });
});
