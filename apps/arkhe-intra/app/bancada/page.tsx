'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageTitle, Notice } from '@/components/ui';
import { BenchModal } from '@/components/bench-modal';
import { BenchResult, boundaryTone } from '@/components/bench-result';
import { groups, proposalError, runScreen, screens } from '@/lib/bench.mjs';

type Proposal = { id: number; text: string; createdAt: string };

const presets = [
  'Acrescentar um teste de plano vazio em arkhe-agent.',
  'Validar rejeição de fonte sem digest em arkhe-rag.',
  'Exigir quórum distinto em procedimento de emergência.',
];

export default function Bench() {
  const [draft, setDraft] = useState(presets[0]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState(0);
  const [pane, setPane] = useState('policy');
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const current = proposals.find(item => item.id === selected);
  const view = runScreen(pane, stopped);
  const count = draft.trim().length;

  function submitProposal() {
    const problem = proposalError(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const id = Date.now();
    const createdAt = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setProposals(items => [{ id, text: draft.trim(), createdAt }, ...items]);
    setSelected(id);
    setPane('policy');
    setError('');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    submitProposal();
  }

  return (
    <>
      <PageTitle eyebrow="BANCADA" title="Propor, decidir, segurar">
        <button
          className={'button ' + (stopped ? '' : 'secondary')}
          type="button"
          aria-pressed={stopped}
          onClick={() => setStopped(value => !value)}
        >
          {stopped ? 'Retomar decisão' : 'Parar decisão'}
        </button>
      </PageTitle>
      <Notice>
        Capacidade AGI ainda não demonstrada. Esta bancada regista uma proposta local. Não
        autoriza, não emite recibo e não solta efeito.
      </Notice>
      <p className="bench-sources">
        Padrão reunido de <a href="https://opencode.ai/terminal">OpenCode</a>,{' '}
        <a href="https://cursor.com/changelog/0-43-x">Cursor Composer</a>,{' '}
        <a href="https://learn.chatgpt.com/docs/codex/ide.md">Codex</a> e{' '}
        <a href="https://cursor.com/blog/canvas">Canvas</a>: a proposta fica no centro e a camada
        escolhida abre à direita.
      </p>
      {error ? <Notice error>{error}</Notice> : null}
      <div className="bench-grid">
        <section className="panel bench-column" aria-label="Propostas">
          <div className="bench-col-head">
            <h2>Propostas</h2>
            <span className="pill">{proposals.length}</span>
          </div>
          {proposals.length ? (
            <div className="bench-thread-list">
              {proposals.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="bench-thread"
                  aria-pressed={item.id === selected}
                  onClick={() => setSelected(item.id)}
                >
                  <span>{item.text}</span>
                  <small>{item.createdAt} · local</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="bench-empty">
              <p>A proposta que enviar aparece neste fio.</p>
              <div className="bench-presets">
                {presets.map(sample => (
                  <button
                    key={sample}
                    type="button"
                    className="bench-preset"
                    onClick={() => {
                      setDraft(sample);
                      setError('');
                    }}
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel bench-column" aria-label="Artefacto">
          <div className="bench-col-head">
            <h2>Proposta</h2>
            <span className="bench-status" data-tone="pending">
              Sem autoridade
            </span>
          </div>
          {current ? (
            <>
              <p className="bench-pin">
                Registada às {current.createdAt} · {current.text.length} caracteres · não aplicada
                ao workspace
              </p>
              <pre className="bench-artifact">{current.text}</pre>
            </>
          ) : (
            <div className="bench-empty">
              <p>
                Escreva a proposta em baixo e prima <strong>Propor</strong> (ou{' '}
                <kbd>Ctrl+Enter</kbd>). O centro mostra o texto proposto, sem o aplicar ao código.
              </p>
              <pre className="bench-artifact bench-preview-draft">{draft}</pre>
            </div>
          )}
        </section>

        <section className="panel bench-column" aria-label="Camadas">
          <div className="bench-col-head">
            <h2>Camadas</h2>
            <span className="pill">{screens.length} limites</span>
          </div>
          <div className="bench-groups-scroll">
            {groups.map(group => (
              <div key={group.id} className="bench-group">
                <h3>{group.title}</h3>
                {group.ids.map(id => {
                  const item = screens.find(screen => screen.id === id);
                  const line = runScreen(id, stopped)?.line ?? '';
                  return (
                    <button
                      key={id}
                      type="button"
                      className="bench-row"
                      aria-pressed={pane === id}
                      onClick={() => setPane(id)}
                    >
                      <span className="bench-row-head">
                        <span>{item?.title}</span>
                        <span className="bench-dot" data-tone={boundaryTone(line)} aria-hidden="true" />
                      </span>
                      <small>{line}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {view ? (
            <div className="bench-layer" aria-label={view.title}>
              <div className="bench-layer-status">
                <span className="bench-status" data-tone={boundaryTone(view.line)} role="status">
                  {view.line}
                </span>
              </div>
              <BenchResult id={view.id} stopped={stopped} />
              <div className="bench-compose-bar">
                <Link className="button secondary" href={`/bancada/${view.path}`}>
                  Abrir tela
                </Link>
                <button className="button" type="button" onClick={() => setModal(true)}>
                  Ver função
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <form className="bench-compose panel" onSubmit={submit}>
        <label htmlFor="bench-proposal">Proposta</label>
        <textarea
          id="bench-proposal"
          value={draft}
          aria-describedby="bench-count"
          onChange={event => {
            setDraft(event.target.value);
            setError('');
          }}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              submitProposal();
            }
          }}
          maxLength={2000}
          rows={3}
        />
        <div className="bench-compose-bar">
          <span id="bench-count" data-short={count < 10 ? 'true' : 'false'}>
            {count} / 2000 · mínimo 10 caracteres (Ctrl+Enter)
          </span>
          <div className="page-actions">
            {draft ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setDraft('');
                  setError('');
                }}
              >
                Limpar
              </button>
            ) : null}
            <button className="button" type="submit">
              Propor
            </button>
          </div>
        </div>
      </form>
      {modal && view ? (
        <BenchModal title={view.title} onClose={() => setModal(false)}>
          <BenchResult id={view.id} stopped={stopped} />
        </BenchModal>
      ) : null}
    </>
  );
}
