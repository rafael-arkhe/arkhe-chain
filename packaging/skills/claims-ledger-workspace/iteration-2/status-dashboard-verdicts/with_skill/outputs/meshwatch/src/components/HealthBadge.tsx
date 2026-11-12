import type { Health } from '../lib/api';

export function HealthBadge({ health }: { health: Health | null }) {
  const ok = health?.ok ?? true;
  return <span className={`badge ${ok ? 'green' : 'red'}`}>{ok ? 'Healthy' : 'Degraded'}</span>;
}
