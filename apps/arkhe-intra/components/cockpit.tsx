'use client';
// Arkhe cockpit components. Render only inside a `.cockpit` container
// (app/cockpit.css). Rules live in lib/cockpit.mjs; components never decide
// verdicts on their own and never offer an override.
import { CheckCircle2, CircleDashed, HelpCircle, Lock, MinusCircle, XCircle } from 'lucide-react';
import { cascade, gateState, proofVerdict, triadState } from '@/lib/cockpit.mjs';
import type { Evidence, ProofStep, Tau } from '@/lib/cockpit.mjs';

const TAU_STYLE: Record<Tau, string> = {
  LEMMA: 'text-ck-lemma bg-ck-lemma/10 border-ck-lemma/40',
  CONJECTURE: 'text-ck-conjecture bg-ck-conjecture/10 border-ck-conjecture/40',
  REFUTED: 'text-ck-refuted bg-ck-refuted/10 border-ck-refuted/40',
  PENDING: 'text-ck-pending bg-ck-pending/10 border-ck-pending/40',
};
const TAU_STROKE: Record<Tau, string> = {
  LEMMA: 'stroke-ck-lemma', CONJECTURE: 'stroke-ck-conjecture', REFUTED: 'stroke-ck-refuted', PENDING: 'stroke-ck-pending',
};

/** Epistemic status chip. The label is always text; colour only reinforces it. */
export function TauBadge({ tau, children }: { tau: Tau; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-ck-mono text-ck-meta ${TAU_STYLE[tau]}`}>
      τ: {tau}{children ? <span className="text-ck-text-2">· {children}</span> : null}
    </span>
  );
}

const TRIAD_TITLE = { integrity: 'Integridade', authority: 'Autoridade', availability: 'Disponibilidade' } as const;

/**
 * One of the three independent guarantees. Never combine two kinds in one gauge:
 * integrity, authority and availability are separate properties.
 */
export function TriadGauge({ kind, have, need, tau, detail }: {
  kind: keyof typeof TRIAD_TITLE; have: number; need: number; tau: Tau; detail: string;
}) {
  const state = triadState({ have, need, tau });
  const r = 34;
  const circumference = 2 * Math.PI * r;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ck-border bg-ck-surface p-4" aria-label={TRIAD_TITLE[kind]}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-ck-mono text-ck-label uppercase text-ck-muted">{TRIAD_TITLE[kind]}</h3>
        <TauBadge tau={state.tau} />
      </div>
      <div className="flex items-center gap-4">
        <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${TRIAD_TITLE[kind]} ${state.label}, ${state.tau}`}>
          <circle cx="42" cy="42" r={r} fill="none" className="stroke-ck-border" strokeWidth="8" />
          <circle cx="42" cy="42" r={r} fill="none" className={TAU_STROKE[state.tau]} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - state.fraction)} transform="rotate(-90 42 42)" />
          <text x="42" y="47" textAnchor="middle" className="fill-ck-text font-ck-mono" fontSize={state.label.length > 5 ? 12 : 16}>{state.label}</text>
        </svg>
        <p className="m-0 text-ck-body">{detail}</p>
      </div>
    </section>
  );
}

/** L0–L9 with canonical names. A refuted layer greys out and blocks all layers above. */
export function LayerStack({ states }: { states: Partial<Record<string, Tau>> }) {
  const rows = cascade(states as Record<string, string>).slice().reverse();
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Pilha de camadas L0 a L9">
      {rows.map((row) => (
        <li key={row.id} className={`flex items-center gap-3 rounded border px-3 py-2 ${row.blockedBy ? 'border-ck-border bg-ck-canvas opacity-60' : 'border-ck-border bg-ck-surface'}`}>
          <span className="w-8 font-ck-mono text-ck-label text-ck-muted">{row.id}</span>
          <span className="flex-1 text-ck-body">{row.name}</span>
          {row.authority ? <Lock size={14} className="text-ck-muted" aria-label="Camada com autoridade" /> : null}
          {row.blockedBy
            ? <span className="font-ck-mono text-ck-meta text-ck-refuted">Bloqueada por {row.blockedBy}</span>
            : <TauBadge tau={row.tau} />}
        </li>
      ))}
    </ol>
  );
}

const STEP_GLYPH = {
  pass: { Icon: CheckCircle2, text: '[✔]', className: 'text-ck-lemma' },
  fail: { Icon: XCircle, text: '[✗]', className: 'text-ck-refuted' },
  pending: { Icon: CircleDashed, text: '[ ]', className: 'text-ck-pending' },
  skipped: { Icon: MinusCircle, text: '[–]', className: 'text-ck-muted' },
} as const;

/** Verification steps with a derived verdict; unimplemented steps stay pending. */
export function ProofStepTree({ steps }: { steps: ProofStep[] }) {
  const verdict = proofVerdict(steps);
  const verdictTau = verdict.tau;
  return (
    <section className="rounded-lg border border-ck-border bg-ck-surface p-4">
      <div className={`mb-4 flex flex-wrap items-center gap-3 rounded border px-3 py-2 ${TAU_STYLE[verdictTau]}`} role="status">
        <strong className="font-ck-mono text-ck-label">{verdict.verdict}</strong>
        {verdict.reason ? <code className="font-ck-mono text-ck-label">{verdict.reason}</code> : null}
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((step) => {
          const status = step.status in STEP_GLYPH ? step.status : 'pending';
          const glyph = STEP_GLYPH[status];
          return (
            <li key={step.id} className="flex gap-3 rounded border border-ck-border bg-ck-elevated px-3 py-2">
              <glyph.Icon size={16} className={`mt-0.5 ${glyph.className}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`font-ck-mono text-ck-label ${glyph.className}`}>{glyph.text}</span>
                  <span className="text-ck-body">{step.title}</span>
                  {step.optional ? <span className="font-ck-mono text-ck-meta text-ck-muted">opcional</span> : null}
                </div>
                {step.detail ? <p className="m-0 mt-1 break-all font-ck-mono text-ck-label">{step.detail}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * An action that runs only with evidence `{ ok: true }`. Otherwise it is
 * disabled and shows the typed reason. There is no bypass prop by design.
 */
export function FailClosedGate({ label, evidence, onAction }: { label: string; evidence: Evidence | null | undefined; onAction: () => void }) {
  const gate = gateState(evidence);
  const reasonId = `gate-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${gate.enabled ? 'border-ck-lemma/40 bg-ck-lemma/5' : 'border-ck-refuted/40 bg-ck-refuted/5'}`}>
      <button type="button" disabled={!gate.enabled} onClick={gate.enabled ? onAction : undefined}
        aria-describedby={gate.reason ? reasonId : undefined}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded border px-4 font-ck-mono text-ck-label ${gate.enabled ? 'border-ck-lemma bg-ck-lemma/15 text-ck-lemma' : 'border-ck-border bg-ck-canvas text-ck-muted'}`}>
        {gate.enabled ? <CheckCircle2 size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        {label}
      </button>
      {gate.reason
        ? <code id={reasonId} className="font-ck-mono text-ck-label text-ck-refuted">{gate.reason}</code>
        : <span className="inline-flex items-center gap-1 font-ck-mono text-ck-meta text-ck-muted"><HelpCircle size={12} aria-hidden="true" />evidência presente</span>}
    </div>
  );
}
