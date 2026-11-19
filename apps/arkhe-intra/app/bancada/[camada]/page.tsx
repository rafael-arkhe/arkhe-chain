'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PageTitle, Notice } from '@/components/ui';
import { BenchModal } from '@/components/bench-modal';
import { BenchResult, boundaryTone } from '@/components/bench-result';
import { groupOf, runScreen, screenByPath, screens } from '@/lib/bench.mjs';

export default function BenchLayer() {
  const params = useParams();
  const path = typeof params.camada === 'string' ? params.camada : '';
  const screen = screenByPath(path);
  const [stopped, setStopped] = useState(false);
  const [open, setOpen] = useState(false);
  if (!screen) return <Notice error>Esta camada não está na bancada.</Notice>;
  const view = runScreen(screen.id, stopped);
  const group = groupOf(screen.id);
  const index = screens.findIndex(item => item.id === screen.id);
  const previous = index > 0 ? screens[index - 1] : null;
  const next = index >= 0 && index < screens.length - 1 ? screens[index + 1] : null;

  return (
    <>
      <PageTitle eyebrow="BANCADA" title={screen.title}>
        <Link className="button secondary" href="/bancada">
          Voltar à proposta
        </Link>
      </PageTitle>
      <Notice>
        Capacidade AGI ainda não demonstrada. Esta tela mostra o resultado local da função. Não
        autoriza, não grava evidência e não solta efeito.
      </Notice>
      <section className="panel bench-layer" aria-label={screen.title}>
        <div className="bench-col-head">
          <p className="bench-pin" style={{ margin: 0 }}>
            {group?.title} · Camada {index + 1} de {screens.length}
          </p>
          {view ? (
            <span className="bench-status" data-tone={boundaryTone(view.line)} role="status">
              {view.line}
            </span>
          ) : null}
        </div>
        <BenchResult id={screen.id} stopped={stopped} />
        <div className="bench-compose-bar">
          {screen.id === 'gate' ? (
            <button
              className={'button ' + (stopped ? '' : 'secondary')}
              type="button"
              aria-pressed={stopped}
              onClick={() => setStopped(value => !value)}
            >
              {stopped ? 'Retomar decisão' : 'Parar decisão'}
            </button>
          ) : (
            <span />
          )}
          <button className="button" type="button" onClick={() => setOpen(true)}>
            Abrir função
          </button>
        </div>
      </section>
      <nav className="bench-step-nav" aria-label="Navegação entre camadas da bancada">
        {previous ? (
          <Link className="button secondary" href={`/bancada/${previous.path}`}>
            ← {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="button secondary" href={`/bancada/${next.path}`}>
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
      {open ? (
        <BenchModal title={screen.title} onClose={() => setOpen(false)}>
          <BenchResult id={screen.id} stopped={stopped} />
        </BenchModal>
      ) : null}
    </>
  );
}
