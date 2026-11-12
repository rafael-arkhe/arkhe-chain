import { useEffect, useState } from 'react';
import { fetchHealth, type Health } from '../lib/api';
import { Attestation } from './Attestation';
import { HealthBadge } from './HealthBadge';
import { NodeCount } from './NodeCount';
import { Pipeline } from './Pipeline';

export function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { fetchHealth().then(setHealth); }, []);
  return (
    <main>
      <HealthBadge health={health} />
      <NodeCount />
      <Pipeline stages={health?.stages ?? []} />
      <Attestation />
    </main>
  );
}
