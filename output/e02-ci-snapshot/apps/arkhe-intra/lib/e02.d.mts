export class E02InputError extends Error {}

export interface E02Observed {
  root: string | null;
  n: number | null;
  anchor_ref: string | null;
  anchor_slot: number | null;
  anchor_payer: string | null;
  cluster: string;
  dataset_digest: string | null;
  dataset_origin: string;
  provenance_kid: string | null;
  signed: boolean;
}

export interface E02Result {
  complete?: boolean;
  aborted?: number | null;
  checks?: { id: number; label: string; status: 'PASS' | 'FAIL' | 'NOT_RUN'; reason: string | null }[];
  proof_details?: Record<string, unknown>;
  outcome: 'VERIFIED' | 'NOT_VERIFIABLE';
  reason: string | null;
  observed: E02Observed;
  statement: string;
  observation_warning: string;
}

export function normalizeRequest(body: unknown): {
  signature: string;
  ref: Record<string, unknown>;
  anchor: Record<string, unknown> | null;
  dataset: string;
  cluster: string;
  origin: string;
};

export function verifyE02(body: unknown): E02Result;
