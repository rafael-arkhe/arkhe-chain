export type Tau = 'LEMMA' | 'CONJECTURE' | 'REFUTED' | 'PENDING';
export interface Layer { id: string; name: string; authority: boolean }
export interface LayerRow extends Layer { tau: Tau; blockedBy: string | null }
export type StepStatus = 'pass' | 'fail' | 'pending' | 'skipped';
export interface ProofStep { id: string; title: string; status: StepStatus; detail?: string; optional?: boolean }
export interface Verdict { verdict: 'Verified' | 'Incomplete' | 'Rejected'; tau: Tau; reason: string | null }
export type Evidence = { ok: true } | { ok: false; kind: 'Incomplete' | 'Refuted' | 'Pending'; detail: string };
export interface GateState { enabled: boolean; reason: string | null }
export interface TriadState { tau: Tau; fraction: number; label: string }
export declare const TAU: readonly Tau[];
export declare const LAYERS: readonly Layer[];
export declare function isTau(value: unknown): value is Tau;
export declare function cascade(states?: Record<string, string>): LayerRow[];
export declare function proofVerdict(steps?: ProofStep[]): Verdict;
export declare function gateState(evidence: Evidence | null | undefined): GateState;
export declare function triadState(input: { have: number; need: number; tau: Tau }): TriadState;
