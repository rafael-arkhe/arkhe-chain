export interface Stage { name: string; status: 'passed' | 'failed' | 'running' }
export interface Health { ok?: boolean; stages: Stage[] }

export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await fetch('/api/health');
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
