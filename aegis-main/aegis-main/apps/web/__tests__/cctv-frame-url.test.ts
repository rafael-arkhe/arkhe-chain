import { detectionFrameUrl, type CCTVDetection } from '@/lib/api/cctv';

function det(metadata: unknown): CCTVDetection {
  return {
    id: 'x', stream_id: 's1', kind: 'object', label: 'person', confidence: 0.9,
    t_start_ms: 0, t_end_ms: 0, bbox: null,
    metadata: metadata as Record<string, unknown>,
    detected_at: '2026-05-17T12:00:00Z', linked_entity_id: null,
  };
}

describe('detectionFrameUrl', () => {
  const ORIG_ENV = process.env.NEXT_PUBLIC_ONTOLOGY_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_ONTOLOGY_API_URL = ORIG_ENV;
  });

  it('retorna null quando não há metadata.frame_url', () => {
    expect(detectionFrameUrl(det({}))).toBeNull();
    expect(detectionFrameUrl(det(null))).toBeNull();
  });

  it('passa por URL absoluta http(s)', () => {
    expect(detectionFrameUrl(det({ frame_url: 'https://cdn/x.jpg' }))).toBe('https://cdn/x.jpg');
  });

  it('prefixa path do ontology com NEXT_PUBLIC_ONTOLOGY_API_URL', () => {
    process.env.NEXT_PUBLIC_ONTOLOGY_API_URL = 'http://192.168.1.65:8002';
    expect(
      detectionFrameUrl(det({ frame_url: '/api/v1/cctv/frames/abc.jpg' })),
    ).toBe('http://192.168.1.65:8002/api/v1/cctv/frames/abc.jpg');
  });

  it('retorna null pra paths antigos do MinIO do intel-module', () => {
    expect(detectionFrameUrl(det({ frame_url: '/cctv-detections/stream_5/x.jpg' }))).toBeNull();
  });
});
