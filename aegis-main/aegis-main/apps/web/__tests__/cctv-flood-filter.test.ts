import { isAggregateDetection, nonAggregate, type CCTVDetection } from '@/lib/api/cctv';

function det(p: Partial<CCTVDetection>): CCTVDetection {
  return {
    id: 'x',
    stream_id: 's1',
    kind: 'object',
    label: 'person',
    confidence: 0.9,
    t_start_ms: 0,
    t_end_ms: 0,
    bbox: [0, 0, 10, 10],
    metadata: {},
    detected_at: '2026-05-17T12:00:00Z',
    linked_entity_id: null,
    ...p,
  };
}

describe('flood-control filter (UI)', () => {
  it('isAggregateDetection marca true para label="__flow__"', () => {
    expect(isAggregateDetection(det({ label: '__flow__', bbox: null }))).toBe(true);
  });

  it('isAggregateDetection marca true via metadata.aggregate', () => {
    expect(
      isAggregateDetection(
        det({ label: 'qualquer', metadata: { aggregate: true, class_counts: { car: 5 } } }),
      ),
    ).toBe(true);
  });

  it('nonAggregate filtra batches __flow__ mas mantém person/lpr/face/motorcycle', () => {
    const arr: CCTVDetection[] = [
      det({ label: '__flow__', bbox: null, metadata: { aggregate: true } }),
      det({ label: 'person', kind: 'object' }),
      det({ label: 'ABC1D23', kind: 'lpr' }),
      det({ label: 'pes-001', kind: 'face' }),
      det({ label: 'motorcycle', kind: 'object' }),
      det({ label: 'other', metadata: { aggregate: true } }),
    ];
    const kept = arr.filter(nonAggregate).map((d) => d.label);
    expect(kept).toEqual(['person', 'ABC1D23', 'pes-001', 'motorcycle']);
  });
});
