import { useEffect, useState } from 'react'
import { BlurReveal } from '@/components/amicro/BlurReveal'
import { GateStatusBars, type GateRow } from '@/components/amicro/GateStatusBars'
import { MagneticButton } from '@/components/amicro/MagneticButton'
import { PulseDots } from '@/components/amicro/PulseDots'
import { HeroVisual } from '@/components/HeroVisual'

const GITHUB = 'https://github.com/rafael-arkhe/arkhe-chain'
const HASHTREE =
  'https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain'
const RADICLE = 'https://app.radicle.xyz/nodes/seed.radicle.garden/rad:zC1r1HgkAcmHm8fLCqaNugjny8i1'

const GATE_ROWS: GateRow[] = [
  {
    id: 'A1',
    status: 'logged',
    label: 'Logged (T)',
    detail: '236 passed · 0 failed · 15 Nov 2026',
  },
  { id: 'A3', status: 'pending', label: 'PENDING', detail: 'Third-person rerun on published T′' },
  { id: 'A4', status: 'pending', label: 'PENDING', detail: 'Third-person rerun on published root' },
  {
    id: 'C2',
    status: 'partial',
    label: 'Partial LEMMA',
    detail: 'CanonicalVote + bft_commit tested; live wire unchanged',
  },
  { id: 'C1', status: 'verified', label: 'VERIFIED (REFUTED)', detail: 'tests/c1_reorg.rs: Fork holds; no tip-replacing reorg in live import_block' },
  { id: 'F1', status: 'open', label: 'Open', detail: 'Guest ELF / image_id / verification key' },
  { id: 'F2', status: 'open', label: 'Open', detail: 'broadcast stays false' },
  { id: 'F3', status: 'open', label: 'Open', detail: 'settled stays false' },
  { id: 'KMS', status: 'open', label: 'Open', detail: 'No HSM custody in crate' },
  { id: 'Testnet', status: 'scaffold', label: 'Scaffolding', detail: 'testnet/ — not homologated' },
]

const DOCS = [
  { href: `${GITHUB}/blob/main/docs/homologacao.md`, title: 'Gate record' },
  { href: `${GITHUB}/blob/main/docs/admissao.md`, title: 'Admission' },
  { href: `${GITHUB}/blob/main/docs/consenso.md`, title: 'Tip, fork, finality' },
  { href: `${GITHUB}/blob/main/docs/seguranca_chaves.md`, title: 'Key hardening' },
  { href: `${GITHUB}/blob/main/docs/testnet.md`, title: 'Local testnet' },
]

function App() {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), 420)
    return () => window.clearTimeout(t)
  }, [])

  return (
  <div className="min-h-dvh">
    <header className="relative min-h-[100dvh] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,rgba(61,143,138,0.12),transparent_55%)]"
        aria-hidden
      />
      <div className="absolute inset-0 opacity-90 max-lg:opacity-40">
        <HeroVisual />
      </div>

      <button
        type="button"
        onClick={() => window.open(GITHUB, '_blank', 'noopener')}
        className="absolute left-5 top-6 z-10 border-0 bg-transparent px-0 py-0 text-left font-mono text-[11px] uppercase tracking-[0.32em] text-accent hover:text-ink"
      >
        arkhe-chain
      </button>

      <MotionIntro booted={booted} />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-end px-5 pb-14 pt-28 lg:max-w-xl lg:justify-center lg:pb-0 lg:pt-20">
        <BlurReveal delay={0.08}>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-ink-muted">
            Not homologated · A3 / A4 pending
          </p>
        </BlurReveal>
        <BlurReveal delay={0.14}>
          <h1 className="font-display text-[clamp(2.1rem,5vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-ink">
            A local node that extends a tip — and refuses what it cannot verify.
          </h1>
        </BlurReveal>
        <BlurReveal delay={0.22}>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">
            Admission is <span className="font-mono text-ink">ArkheNode::ingest</span> with canonical
            CBOR of <span className="font-mono text-ink">DecisionVerdict</span> in domain{' '}
            <span className="font-mono text-ink">AKG:VERDICT:v1</span>. No homologation claim; gates
            and logs are on the record.
          </p>
        </BlurReveal>
        <BlurReveal delay={0.3}>
          <div className="mt-8 flex flex-wrap gap-3">
            <MagneticButton href={GITHUB} target="_blank" rel="noopener noreferrer">
              View on GitHub
            </MagneticButton>
            <MagneticButton
              href={`${GITHUB}/blob/main/docs/homologacao.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-ink-muted/30 bg-transparent"
            >
              Gate record
            </MagneticButton>
            <MagneticButton
              href={HASHTREE}
              target="_blank"
              rel="noopener noreferrer"
              className="border-ink-muted/30 bg-transparent"
            >
              Hashtree mirror
            </MagneticButton>
          </div>
        </BlurReveal>
      </div>
    </header>

    <main className="mx-auto max-w-3xl px-5 py-20">
      <section className="border-t border-surface-line pt-16" aria-labelledby="gates-heading">
        <h2 id="gates-heading" className="font-display text-2xl font-semibold text-ink">
          Gate status
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
          Summary only. Latest A1 source of truth:{' '}
          <a
            className="font-mono text-accent underline-offset-2 hover:underline"
            href={`${GITHUB}/blob/main/docs/gate-2026-11-15-a1-tree.log`}
          >
            gate-2026-11-15-a1-tree.log
          </a>{' '}
          (236/0/0 at commit <span className="font-mono text-ink">076c9459</span>). The crate is{' '}
          <strong className="font-normal text-ink">not</strong> homologated.
        </p>
        <div className="mt-10">
          <GateStatusBars rows={GATE_ROWS} />
        </div>
      </section>

      <section className="mt-20 border-t border-surface-line pt-16" aria-labelledby="mirrors-heading">
        <h2 id="mirrors-heading" className="font-display text-2xl font-semibold text-ink">
          Publication mirrors
        </h2>
        <dl className="mt-8 space-y-5 font-mono text-sm">
          <div>
            <dt className="text-ink-muted">GitHub</dt>
            <dd>
              <a href={GITHUB} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                {GITHUB}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Hashtree (Iris)</dt>
            <dd>
              <a href={HASHTREE} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                git.iris.to mirror
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Radicle</dt>
            <dd className="break-all text-ink">
              <a href={RADICLE} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                rad:zC1r1HgkAcmHm8fLCqaNugjny8i1
              </a>
              <span className="mt-1 block text-xs text-ink-muted">
                Lean mirror; may lag monorepo and latest A1 artifacts.
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-20 border-t border-surface-line pt-16" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="font-display text-2xl font-semibold text-ink">
          What the code maintains
        </h2>
        <ul className="mt-6 list-none space-y-3 text-sm leading-relaxed text-ink-muted">
          <li>Every send requires Ed25519 and ML-DSA-65; bad signatures do not move balance.</li>
          <li>
            A sibling block from another proposer returns <span className="font-mono text-ink">Fork</span>{' '}
            and does not replace the tip.
          </li>
          <li>
            Live precommit uses <span className="font-mono text-ink">AKG:CHAIN:PRECOMMIT:v4</span>;{' '}
            <span className="font-mono text-ink">CanonicalVote</span> is exercised under test (C2), not
            the live wire.
          </li>
          <li>
            <span className="font-mono text-ink">broadcast</span> and{' '}
            <span className="font-mono text-ink">settled</span> remain false; verifier and bridge paths
            fail closed.
          </li>
        </ul>
      </section>

      <section className="mt-20 border-t border-surface-line pt-16 pb-24" aria-labelledby="docs-heading">
        <h2 id="docs-heading" className="font-display text-2xl font-semibold text-ink">
          Documentation
        </h2>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {DOCS.map((d) => (
            <li key={d.href}>
              <a
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {d.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>

    <footer className="border-t border-surface-line px-5 py-8 text-center font-mono text-[11px] text-ink-muted">
      arkhe-chain · MIT · accountable engineering, no homologation claim
    </footer>
  </div>
  )
}

function MotionIntro({ booted }: { booted: boolean }) {
  if (booted) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface">
      <PulseDots label="Loading site" />
    </div>
  )
}

export default App