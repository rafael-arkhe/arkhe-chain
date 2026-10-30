import { FALLBACK_INTEL_STREAMS } from '@/lib/api/intel';

describe('intel-module fallback', () => {
  it('expõe 2 câmeras reais de rodovia SP no mesmo host nip.io', () => {
    expect(FALLBACK_INTEL_STREAMS).toHaveLength(2);
    const urls = FALLBACK_INTEL_STREAMS.map((s) => s.url);
    expect(urls).toContain('https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8');
    expect(urls).toContain('https://34.104.32.249.nip.io/SP123-KM026B/stream.m3u8');
  });

  it('SP-123 KM026A (offline buffer) foi substituído por SP-055 KM110A (ao vivo)', () => {
    const urls = FALLBACK_INTEL_STREAMS.map((s) => s.url);
    expect(urls).not.toContain('https://34.104.32.249.nip.io/SP123-KM026A/stream.m3u8');
    const sp055 = FALLBACK_INTEL_STREAMS.find((s) => s.url.includes('SP055'));
    expect(sp055).toBeTruthy();
    expect(sp055!.city).toContain('Bertioga');
  });

  it('todas as URLs são HLS (.m3u8) servidas pelo mesmo host nip.io', () => {
    for (const s of FALLBACK_INTEL_STREAMS) {
      expect(s.url).toMatch(/\.m3u8$/);
      expect(s.url).toContain('34.104.32.249.nip.io');
    }
  });

  it('câmeras vêm com detection_enabled true e tag lpr-ready', () => {
    for (const s of FALLBACK_INTEL_STREAMS) {
      expect(s.detection_enabled).toBe(true);
      expect(s.tags).toContain('lpr-ready');
    }
  });

  it('ambas as câmeras estão no litoral norte SP (lat -23/-24, lng -45/-46)', () => {
    for (const s of FALLBACK_INTEL_STREAMS) {
      expect(s.latitude).toBeLessThan(-23);
      expect(s.latitude).toBeGreaterThan(-24);
      expect(s.longitude).toBeLessThan(-45);
      expect(s.longitude).toBeGreaterThan(-46);
    }
  });

  it('não expõe mais detecções fabricadas (FALLBACK_INTEL_DETECTIONS removido)', () => {
    const intel = jest.requireActual('@/lib/api/intel');
    expect(intel.FALLBACK_INTEL_DETECTIONS).toBeUndefined();
  });
});
