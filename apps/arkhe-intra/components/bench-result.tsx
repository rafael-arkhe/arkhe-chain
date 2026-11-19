'use client';
import { runScreen } from '@/lib/bench.mjs';

export function boundaryTone(line: string): 'reject' | 'held' | 'unavailable' | 'pending' {
  const lower = line.toLowerCase();
  if (lower.startsWith('reject') || lower.startsWith('deny')) return 'reject';
  if (lower.startsWith('held')) return 'held';
  if (lower.includes('unavailable') || lower.includes('notimplemented') || lower.includes('not scored')) {
    return 'unavailable';
  }
  return 'pending';
}

export function BenchResult({ id, stopped }: { id: string; stopped: boolean }) {
  const view = runScreen(id, stopped);
  if (!view) return <p>Esta função não está na bancada.</p>;
  return (
    <>
      <p className="bench-fn">
        <code>fn {view.fn}()</code>
      </p>
      <p>{view.summary}</p>
      <dl className="bench-fields">
        {view.fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="bench-pin">Efeito solto: não</p>
    </>
  );
}
