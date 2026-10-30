'use client';
import { useState } from 'react';
import { FailClosedGate, LayerStack, ProofStepTree, TauBadge, TriadGauge } from '@/components/cockpit';
import { PageTitle } from '@/components/ui';

// Component catalogue for the cockpit design system (phase A). Every value below
// is an illustrative fixture, not system state; real screens bind to verifiers.
export default function CockpitCatalogue() {
  const [ran, setRan] = useState(0);
  return (
    <div className="e02-page">
      <PageTitle eyebrow="DESIGN SYSTEM · FASE A" title="Componentes do cockpit" />
      <div className="cockpit flex flex-col gap-8 p-6">
        <p role="note" className="m-0 rounded border border-ck-conjecture/40 bg-ck-conjecture/10 px-3 py-2 font-ck-mono text-ck-label text-ck-conjecture">
          Exemplos ilustrativos com dados fictícios. Nada nesta página reflete o estado do sistema.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-ck-title text-ck-text">TauBadge</h2>
          <div className="flex flex-wrap gap-2">
            <TauBadge tau="LEMMA" /><TauBadge tau="CONJECTURE" /><TauBadge tau="REFUTED" /><TauBadge tau="PENDING">D4</TauBadge>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-ck-title text-ck-text">TriadGauge</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <TriadGauge kind="integrity" have={108} need={108} tau="LEMMA" detail="Ficheiros reconstruídos iguais aos digests esperados." />
            <TriadGauge kind="authority" have={2} need={3} tau="LEMMA" detail="Afirmado LEMMA com 2/3: o componente rebaixa para CONJECTURE." />
            <TriadGauge kind="availability" have={1} need={3} tau="PENDING" detail="Um operador de disponibilidade observado." />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-ck-title text-ck-text">LayerStack</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <LayerStack states={{ L0: 'LEMMA', L1: 'LEMMA', L2: 'LEMMA', L3: 'CONJECTURE', L4: 'LEMMA', L5: 'LEMMA', L8: 'CONJECTURE' }} />
            <LayerStack states={{ L0: 'REFUTED', L1: 'LEMMA', L2: 'LEMMA' }} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-ck-title text-ck-text">ProofStepTree</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ProofStepTree steps={[
              { id: 'manifest', title: 'ReleaseManifest canônico e digest esperado', status: 'pass' },
              { id: 'mmr', title: 'Inclusão MMR offline', status: 'pass' },
              { id: 'threshold', title: 'Assinaturas k-de-n do keyset', status: 'pending', detail: 'Envelope de assinaturas ainda não especificado' },
              { id: 'nix', title: 'Rebuild Nix', status: 'skipped', optional: true },
            ]} />
            <ProofStepTree steps={[
              { id: 'manifest', title: 'ReleaseManifest canônico e digest esperado', status: 'pass' },
              { id: 'blake3', title: 'BLAKE3 dos bytes lógicos', status: 'fail', detail: 'esperado e846…10ce, obtido 0000…0000' },
            ]} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-ck-title text-ck-text">FailClosedGate</h2>
          <FailClosedGate label="Exportar prova" evidence={{ ok: true }} onAction={() => setRan((n) => n + 1)} />
          <FailClosedGate label="Ancorar checkpoint" evidence={{ ok: false, kind: 'Incomplete', detail: 'witnesses:1/3' }} onAction={() => setRan((n) => n + 1)} />
          <FailClosedGate label="Publicar release" evidence={undefined} onAction={() => setRan((n) => n + 1)} />
          <p className="m-0 font-ck-mono text-ck-meta text-ck-muted" aria-live="polite">Ações executadas: {ran}</p>
        </section>
      </div>
    </div>
  );
}
