import type { Stage } from '../lib/api';

export function Pipeline({ stages }: { stages: Stage[] }) {
  const firstFailure = stages.findIndex((s) => s.status === 'failed');
  return (
    <ol className="pipeline">
      {stages.map((stage, i) => {
        // Later stages are skipped by the runner after a failure; show them as done.
        const status = firstFailure >= 0 && i > firstFailure ? 'passed' : stage.status;
        return <li key={stage.name} className={status}>{stage.name}: {status}</li>;
      })}
    </ol>
  );
}
