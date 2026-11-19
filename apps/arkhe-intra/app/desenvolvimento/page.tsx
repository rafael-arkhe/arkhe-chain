'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, X } from 'lucide-react';
import { api, signLocally, signHexLocally } from '@/lib/client';
import type { User } from '@/lib/types';
import { PageTitle, Notice, LoadingCards, Digest } from '@/components/ui';

type Module = { id: string; path: string; boundary: string; criterion: string; test: string };
type Run = {
  id: string;
  moduleId: string;
  objective: string;
  state: string;
  createdAt: string;
  failure?: string;
  log?: string;
  proposalDigest?: string;
  evidenceDigest?: string;
  proposal?: { summary: string; files: { path: string; content: string }[] };
  baseline?: Record<string, string>;
};
type Overview = {
  modules: Module[];
  runs: Run[];
  busy: boolean;
  policy: { sandboxConfigured: boolean };
};
type Preview = {
  configured: boolean;
  requestAvailable?: boolean;
  operationId?: string;
  state: string;
  attempts?: number;
  fence?: number;
  result?: { reason?: string };
};
type NativeChallenge = {
  signing_payload_hex: string;
  operation_id: string;
  expires_at: number;
  spec: { image: string; artifact_digest: number[]; module: string };
};

const labels: Record<string, string> = {
  generating: 'Gerando proposta',
  testing: 'Testando em sandbox',
  passed: 'Aguardando governança',
  failed: 'Falhou',
  approved: 'Exportação aprovada',
  rejected: 'Rejeitada',
  interrupted: 'Interrompida',
};

const boundaryLabel: Record<string, string> = {
  reference: 'Implementação de referência',
  skeleton: 'Esqueleto sem efeito',
  'implemented-baseline': 'Baseline existente · evolução pendente',
};

export default function Development() {
  const client = useQueryClient();
  const user = useQuery({ queryKey: ['me'], queryFn: () => api<User>('me') });
  const owner = user.data?.role === 'owner';
  const overview = useQuery({
    queryKey: ['development'],
    queryFn: () => api<Overview>('development'),
    enabled: owner,
    refetchInterval: 5000,
  });

  const [moduleId, setModule] = useState('arkhe-agent');
  const [objective, setObjective] = useState('');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [governancePem, setGovernancePem] = useState('');
  const [reviewerPem, setReviewerPem] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('');
  const [boundaryFilter, setBoundaryFilter] = useState<'all' | 'reference' | 'implemented-baseline' | 'skeleton'>('all');

  const detail = useQuery({
    queryKey: ['development-run', selected],
    queryFn: () => api<Run>('development/runs/' + selected),
    enabled: owner && Boolean(selected),
    refetchInterval: 5000,
  });
  const preview = useQuery({
    queryKey: ['native-preview', selected],
    queryFn: () => api<Preview>('development/runs/' + selected + '/preview'),
    enabled: owner && Boolean(selected),
    refetchInterval: 5000,
  });
  const [nativeChallenge, setNativeChallenge] = useState<NativeChallenge | null>(null);

  const modules = overview.data?.modules ?? [];
  const module = modules.find(row => row.id === moduleId);
  const referenceModules = modules.filter(row => row.boundary === 'reference');
  const baselineModules = modules.filter(row => row.boundary === 'implemented-baseline');
  const filteredCatalog = modules.filter(
    row =>
      (boundaryFilter === 'all' || row.boundary === boundaryFilter) &&
      `${row.id} ${row.path} ${row.criterion}`
        .toLocaleLowerCase('pt-BR')
        .includes(catalogFilter.toLocaleLowerCase('pt-BR')),
  );

  async function operation(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
      await client.invalidateQueries({ queryKey: ['development'] });
      await client.invalidateQueries({ queryKey: ['development-run'] });
      await client.invalidateQueries({ queryKey: ['native-preview'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operação indisponível.');
    } finally {
      setBusy(false);
    }
  }

  function submitRun() {
    if (
      busy ||
      overview.data?.busy ||
      !overview.data?.policy.sandboxConfigured ||
      objective.trim().length < 10
    ) {
      return;
    }
    void operation(async () => {
      const run = await api<Run>('development/runs', { moduleId, objective });
      setSelected(run.id);
    });
  }

  const trimmedLength = objective.trim().length;

  return (
    <>
      <PageTitle eyebrow="EVOLUÇÃO VERIFICÁVEL" title="Bancada de desenvolvimento" />
      <p className="page-description">
        Arkhe gera uma proposta para um módulo e executa testes sem rede em uma sandbox. A
        governança revisa a evidência e assina a exportação para incorporação.
      </p>
      <Notice>
        Capacidade AGI ainda não demonstrada. Testes aprovados comprovam somente os casos
        executados. As alterações não são aplicadas ao aplicativo em execução.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      {!owner ? (
        <Notice>Esta bancada exige uma credencial de governança.</Notice>
      ) : overview.isPending ? (
        <LoadingCards />
      ) : overview.error ? (
        <Notice error>{overview.error.message}</Notice>
      ) : (
        <>
          <div className="development-grid">
            <section className="panel development-panel">
              <h2>Uma melhoria por execução</h2>
              <p>
                {overview.data?.policy.sandboxConfigured
                  ? 'Imagem configurada · disponibilidade verificada antes de cada execução.'
                  : 'Configure a imagem de desenvolvimento Podman para habilitar os testes.'}
              </p>
              <form
                onSubmit={event => {
                  event.preventDefault();
                  submitRun();
                }}
              >
                <label htmlFor="development-module">Módulo</label>
                <select
                  id="development-module"
                  value={moduleId}
                  onChange={event => setModule(event.target.value)}
                >
                  <optgroup label="Módulos cognitivos (referência)">
                    {referenceModules.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.id}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Baselines implementados">
                    {baselineModules.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.id}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <label htmlFor="development-objective">Objetivo verificável</label>
                <textarea
                  id="development-objective"
                  minLength={10}
                  maxLength={2000}
                  required
                  rows={5}
                  placeholder="Ex.: acrescentar teste de regressão para planos vazios, preservando o contrato existente."
                  value={objective}
                  onChange={event => setObjective(event.target.value)}
                  onKeyDown={event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      submitRun();
                    }
                  }}
                />
                <div className="field-help">
                  <span>Atalho: Ctrl+Enter · mínimo 10 caracteres</span>
                  <span data-short={trimmedLength > 0 && trimmedLength < 10 ? 'true' : 'false'}>
                    {trimmedLength} / 2000
                  </span>
                </div>
                <p>
                  <strong>Critério de evolução</strong>
                  <br />
                  {module?.criterion}
                </p>
                <code>{module?.test}</code>
                <button
                  className="button"
                  disabled={
                    busy ||
                    overview.data?.busy ||
                    !overview.data?.policy.sandboxConfigured ||
                    trimmedLength < 10
                  }
                >
                  Gerar e testar em sandbox
                </button>
              </form>
            </section>

            <section className="panel development-panel">
              <h2>Execuções e evidências</h2>
              {!overview.data?.runs.length ? (
                <p>
                  Nenhuma execução registrada. Comece por uma melhoria pequena com teste
                  reproduzível.
                </p>
              ) : (
                overview.data.runs.map(run => (
                  <button
                    type="button"
                    key={run.id}
                    className="development-run"
                    aria-pressed={selected === run.id}
                    onClick={() => {
                      setSelected(run.id);
                      setGovernancePem('');
                      setReviewerPem('');
                      setNativeChallenge(null);
                    }}
                  >
                    <div className="development-run-head">
                      <strong>{run.moduleId}</strong>
                      <span className="boundary-chip" data-state={run.state}>
                        {labels[run.state] || run.state}
                      </span>
                    </div>
                    <small>{run.objective}</small>
                  </button>
                ))
              )}
            </section>
          </div>

          {detail.data && (
            <section className="panel development-panel">
              <h2>
                {detail.data.moduleId} · {labels[detail.data.state] || detail.data.state}
              </h2>
              <p>
                {detail.data.proposal?.summary ||
                  detail.data.failure ||
                  'Aguardando resultado do trabalhador local.'}
              </p>
              {detail.data.proposal?.files.map(file => (
                <details key={file.path}>
                  <summary>{file.path}</summary>
                  <pre>{file.content}</pre>
                </details>
              ))}
              <details>
                <summary>Saída dos testes</summary>
                <pre>{detail.data.log || 'Nenhuma saída de teste disponível.'}</pre>
              </details>
              <div className="development-digests">
                <div>
                  <small>Proposta SHA256</small>
                  {detail.data.proposalDigest ? (
                    <Digest value={detail.data.proposalDigest} />
                  ) : (
                    <span>pendente</span>
                  )}
                </div>
                <div>
                  <small>Evidência SHA256</small>
                  {detail.data.evidenceDigest ? (
                    <Digest value={detail.data.evidenceDigest} />
                  ) : (
                    <span>pendente</span>
                  )}
                </div>
              </div>
              <a
                className="button secondary"
                href={'/api/development/runs/' + selected}
                download={'arkhe-development-' + selected + '.json'}
              >
                <Download size={15} />
                Exportar evidências
              </a>
              {detail.data.state === 'passed' && (
                <div>
                  <label htmlFor="development-key">
                    Chave privada de governança (uso local)
                  </label>
                  <input
                    key={selected}
                    id="development-key"
                    type="file"
                    accept=".pem"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file && file.size <= 2048) void file.text().then(setGovernancePem);
                      else {
                        setGovernancePem('');
                        setError('Selecione uma chave PEM de até 2 KiB.');
                      }
                    }}
                  />
                  <button
                    className="button"
                    type="button"
                    disabled={busy || !governancePem}
                    onClick={() =>
                      void operation(async () => {
                        const challenge = await api<{ statement: string }>(
                          'development/runs/' + selected + '/challenge',
                        );
                        await api('development/runs/' + selected + '/approve', {
                          signature: await signLocally(governancePem, challenge.statement),
                        });
                        setGovernancePem('');
                      })
                    }
                  >
                    Assinar aprovação de exportação
                  </button>
                </div>
              )}
              {['passed', 'failed'].includes(detail.data.state) && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void operation(async () => {
                      await api('development/runs/' + selected + '/reject', {});
                    })
                  }
                >
                  Rejeitar proposta
                </button>
              )}
            </section>
          )}

          {selected && (
            <section className="panel development-panel">
              <h2>Preview nativo protegido</h2>
              {preview.error ? (
                <Notice error>{preview.error.message}</Notice>
              ) : (
                <>
                  <p>
                    Estado: {preview.data?.state || 'Consultando'} · tentativas:{' '}
                    {preview.data?.attempts || 0}
                  </p>
                  {preview.data?.operationId && (
                    <p className="development-hash">
                      Operação: {preview.data.operationId} · fencing: {preview.data.fence}
                    </p>
                  )}
                  {preview.data?.result?.reason && <Notice>{preview.data.result.reason}</Notice>}
                  {!preview.data?.configured ? (
                    <p>Configure o supervisor e suas identidades para preparar um preview nativo.</p>
                  ) : (
                    preview.data.requestAvailable && (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void operation(async () =>
                            setNativeChallenge(
                              await api<NativeChallenge>(
                                'development/runs/' + selected + '/preview-challenge',
                              ),
                            ),
                          )
                        }
                      >
                        Revisar pedido nativo
                      </button>
                    )
                  )}
                  {nativeChallenge && (
                    <>
                      <p>
                        Módulo: {nativeChallenge.spec.module}
                        <br />
                        Imagem: {nativeChallenge.spec.image}
                        <br />
                        Artefato:{' '}
                        {nativeChallenge.spec.artifact_digest
                          .map(b => b.toString(16).padStart(2, '0'))
                          .join('')}
                        <br />
                        Validade: {new Date(nativeChallenge.expires_at * 1000).toLocaleString()}
                      </p>
                      <label htmlFor="native-preview-key">
                        Chave do revisor (assinatura no navegador)
                      </label>
                      <input
                        id="native-preview-key"
                        type="file"
                        accept=".pem"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file && file.size <= 2048) void file.text().then(setReviewerPem);
                          else setReviewerPem('');
                        }}
                      />
                      <button
                        className="button"
                        type="button"
                        disabled={busy || !reviewerPem}
                        onClick={() =>
                          void operation(async () => {
                            await api('development/runs/' + selected + '/preview-approve', {
                              signature: await signHexLocally(
                                reviewerPem,
                                nativeChallenge.signing_payload_hex,
                              ),
                            });
                            setReviewerPem('');
                            setNativeChallenge(null);
                          })
                        }
                      >
                        Assinar e enfileirar preview
                      </button>
                    </>
                  )}
                  <p>
                    A execução exige qualificação assinada do runtime. Resultado incerto exige
                    reconciliação e não é repetido automaticamente.
                  </p>
                </>
              )}
            </section>
          )}

          <section className="panel development-panel">
            <div className="catalog-toolbar">
              <h2>
                Mapa dos módulos · {filteredCatalog.length} de {modules.length}
              </h2>
              <div className="catalog-filters" role="group" aria-label="Filtrar por fronteira">
                {(
                  [
                    ['all', 'Todos'],
                    ['reference', 'Referência'],
                    ['implemented-baseline', 'Baseline'],
                    ['skeleton', 'Esqueleto'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="catalog-pill"
                    aria-pressed={boundaryFilter === id}
                    onClick={() => setBoundaryFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="filter catalog-search">
              <Search size={17} />
              <input
                aria-label="Filtrar catálogo de módulos"
                placeholder="Filtrar por crate, caminho ou critério…"
                value={catalogFilter}
                onChange={event => setCatalogFilter(event.target.value)}
              />
              {catalogFilter ? (
                <button
                  type="button"
                  className="clear-filter"
                  aria-label="Limpar filtro de módulos"
                  onClick={() => setCatalogFilter('')}
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>
            <div className="development-catalog">
              {filteredCatalog.map(row => (
                <article key={row.id} data-boundary={row.boundary}>
                  <div className="development-run-head">
                    <strong>{row.id}</strong>
                    <span className="boundary-chip" data-boundary={row.boundary}>
                      {boundaryLabel[row.boundary] || row.boundary}
                    </span>
                  </div>
                  <p>{row.criterion}</p>
                  <code>{row.path}</code>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
