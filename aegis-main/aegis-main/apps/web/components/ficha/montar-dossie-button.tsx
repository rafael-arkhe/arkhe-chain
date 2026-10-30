'use client';

/**
 * MontarDossieButton — "Montar dossiê do objeto" na toolbar da /ficha (P5 Onda 2).
 *
 * MULTIDOMÍNIO: vale para QUALQUER OntologyNode canônico (carro, país, empresa,
 * organização, evento, operação…). A derivação de fontes é por CAMPO/FORMA das
 * properties (régua "mineração herdaria?") — nunca por node_type/keyword. É
 * OPORTUNISTA: um objeto sem identificador pessoal (um 'carro' só com placa) NÃO
 * dispara fan-out OSINT vazio; volta só o grafo 1-hop da ontologia + as seções.
 *
 * Dois gestos (dropdown), ambos ASSÍNCRONOS com PROGRESSO ao vivo (poll + SSE de
 * steps — espelha a correlação P3):
 *   - "Montar dossiê do objeto"     → generic_dossier (1 objeto).
 *   - "Dossiê composto (conjunto)"  → composite_dossier (anchor = este objeto):
 *     roster 1-hop + sub-dossiês por membro + correlação + cena + linha do tempo.
 *
 * ADD-alongside: não toca a ficha de pessoa nem o dossiê OSINT-BR existentes.
 * Gate: só renderiza para nó CANÔNICO + perm correlation.run. Finalidade LGPD
 * coletada via promptModal (NUNCA diálogo nativo) — obrigatória só se houver PII.
 */
import * as React from 'react';
import {
  FileSearch,
  ChevronDown,
  Loader2,
  X,
  AlertTriangle,
  Users,
  Boxes,
} from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
import { useCan } from '@/lib/auth/useAuth';
import { objectKindLabel } from '@/lib/i18n/kind-labels';
import { promptModal } from '@/components/dialog/confirm-dialog';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { gotoFichaTab } from '@/lib/ficha/type-actions';
import { humaniseSearchError } from '@/lib/buscar/humanise';
import {
  OntologyDossier,
  type DossierStep,
  type GenericDossierResult,
  type CompositeDossierResult,
} from '@/lib/api/ontology-dossier';

type Mode = 'generic' | 'composite';

export function MontarDossieButton({
  nodeId,
  nodeName,
  canonical,
}: {
  nodeId: string;
  nodeName: string;
  /** Só objeto CANÔNICO (OntologyNode) tem dossiê genérico — Entity usa o fluxo OSINT-BR. */
  canonical?: boolean;
}) {
  const t = useT();
  const canRun = useCan('correlation.run');
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const [running, setRunning] = React.useState<Mode | null>(null);
  const [steps, setSteps] = React.useState<DossierStep[]>([]);
  const [generic, setGeneric] = React.useState<GenericDossierResult | null>(null);
  const [composite, setComposite] = React.useState<CompositeDossierResult | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [showModal, setShowModal] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const run = React.useCallback(
    async (mode: Mode) => {
      setOpen(false);
      // Finalidade LGPD — obrigatória só se o objeto tiver PII; o operador pode
      // deixar em branco p/ objeto sem dado pessoal (o backend decide).
      const purpose = await promptModal({
        title: t('ficha.dossie.purposeTitulo'),
        description: t('ficha.dossie.purposeDesc'),
        placeholder: t('ficha.dossie.purposePlaceholder'),
        confirmLabel: t('ficha.dossie.purposeOk'),
        multiline: true,
        required: false,
      });
      if (purpose === null) return; // cancelado
      setShowModal(true);
      setRunning(mode);
      setErro(null);
      setSteps([]);
      setGeneric(null);
      setComposite(null);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        if (mode === 'generic') {
          const st = await OntologyDossier.runGenericToCompletion(
            nodeId,
            { purpose },
            { onProgress: setSteps, signal: ctrl.signal },
          );
          if (ctrl.signal.aborted) return;
          setGeneric(st.result ?? null);
        } else {
          const st = await OntologyDossier.runCompositeToCompletion(
            { anchor_node_id: nodeId, purpose },
            { onProgress: setSteps, signal: ctrl.signal },
          );
          if (ctrl.signal.aborted) return;
          setComposite(st.result ?? null);
        }
        // O fan-out PII escreve a camada de trabalho (Entity/EntityLink) — leva o
        // operador à seção Vínculos da ficha, onde os novos elos aparecem.
        gotoFichaTab('vinculos');
      } catch (e) {
        if (!ctrl.signal.aborted) setErro(humaniseSearchError(e) || t('ficha.dossie.erro'));
      } finally {
        setRunning(null);
        abortRef.current = null;
      }
    },
    [nodeId, t],
  );

  const close = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setShowModal(false);
    setRunning(null);
  }, []);

  // Gate de UI: só nó canônico + perm. (Entity/CCTV usam o dossiê OSINT-BR do /buscar.)
  if (!canonical || !canRun) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid="ficha-dossie-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={running !== null}
        className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light flex items-center gap-1.5 hover:border-primary disabled:opacity-50"
      >
        {running ? (
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
        ) : (
          <FileSearch className="w-3 h-3" strokeWidth={1.5} />
        )}
        {t('ficha.dossie.botao')}
        <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          data-testid="ficha-dossie-menu"
          className="absolute right-0 top-[calc(100%+2px)] z-20 min-w-[260px] bg-white border border-border-light shadow-md"
        >
          <button
            type="button"
            data-testid="ficha-dossie-generico"
            onClick={() => run('generic')}
            title={t('ficha.dossie.objetoHint')}
            className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-canvas-light"
          >
            <Boxes className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
            <span>
              <span className="block text-[11px] text-text-on-light">{t('ficha.dossie.objeto')}</span>
              <span className="block text-[10px] text-muted-on-light">{t('ficha.dossie.objetoHint')}</span>
            </span>
          </button>
          <button
            type="button"
            data-testid="ficha-dossie-composto"
            onClick={() => run('composite')}
            title={t('ficha.dossie.compostoHint')}
            className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-canvas-light border-t border-border-light"
          >
            <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
            <span>
              <span className="block text-[11px] text-text-on-light">{t('ficha.dossie.composto')}</span>
              <span className="block text-[10px] text-muted-on-light">{t('ficha.dossie.compostoHint')}</span>
            </span>
          </button>
        </div>
      )}

      {showModal && (
        <DossieResultModal
          title={
            composite || running === 'composite'
              ? t('ficha.dossie.tituloModalComposto')
              : t('ficha.dossie.tituloModal')
          }
          subjectName={nodeName}
          running={running !== null}
          steps={steps}
          generic={generic}
          composite={composite}
          erro={erro}
          onClose={close}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal de resultado — SEÇÕES por shape (identificação/vínculos/mídia/…)      */
/* -------------------------------------------------------------------------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border-light bg-white">
      <h3 className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold font-mono text-muted-on-light border-b border-border-light">
        {title}
      </h3>
      <div className="p-3 text-[11px] text-text-on-light">{children}</div>
    </section>
  );
}

function DossieResultModal({
  title,
  subjectName,
  running,
  steps,
  generic,
  composite,
  erro,
  onClose,
}: {
  title: string;
  subjectName: string;
  running: boolean;
  steps: DossierStep[];
  generic: GenericDossierResult | null;
  composite: CompositeDossierResult | null;
  erro: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const sections = (generic?.sections ?? {}) as Record<string, any>;
  const ident = sections.identificacao ?? {};
  const vinc = sections.vinculos ?? {};
  const midia: any[] = sections.midia ?? [];
  const graph = generic?.graph ?? { nodes: [], edges: [] };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ficha-dossie-title"
      data-testid="ficha-dossie-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center p-6 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[960px] h-[82vh] bg-canvas-light border border-border-light shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light bg-white flex items-center gap-2 shrink-0">
          <FileSearch className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <h2 id="ficha-dossie-title" className="text-[13px] font-semibold flex-1 text-text-on-light">
            {title} · {subjectName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ficha.dossie.fechar')}
            data-testid="ficha-dossie-fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        {running && (
          <div className="px-4 py-2 border-b border-border-light bg-white text-[11px] text-muted-on-light flex items-center gap-1.5 shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" strokeWidth={1.5} />
            {t('ficha.dossie.montando')}
            {steps.length > 0 && (
              <span className="font-mono text-[10px] truncate">
                · {steps[steps.length - 1].label}
                {steps[steps.length - 1].detail ? ` (${steps[steps.length - 1].detail})` : ''}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-3">
          {erro && (
            <p className="text-[11px] text-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} /> {erro}
            </p>
          )}

          {/* -------- GENÉRICO -------- */}
          {generic && (
            <>
              <Section title={t('ficha.dossie.secIdentificacao')}>
                <p className="font-mono text-[10px] text-muted-on-light mb-1">
                  {String(ident.node_type ?? '')} · {String(ident.name ?? subjectName)}
                </p>
                {!generic.pii_touched && (
                  <p className="text-[10px] text-muted-on-light italic mb-1">{t('ficha.dossie.semPii')}</p>
                )}
                {Array.isArray(ident.identificadores) && ident.identificadores.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {ident.identificadores.map((i: any, k: number) => (
                      <li
                        key={k}
                        className="px-1.5 py-0.5 border border-border-light bg-canvas-light font-mono text-[10px]"
                      >
                        {objectKindLabel(t, i.kind)}: {i.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <KeyVals obj={ident.properties as Record<string, unknown>} />
                )}
              </Section>

              <Section title={t('ficha.dossie.secVinculos')}>
                <p className="font-mono text-[10px] text-muted-on-light mb-1">
                  {graph.nodes.length} {t('ficha.dossie.nos')} · {graph.edges.length}{' '}
                  {t('ficha.dossie.vinculosN')}
                </p>
                {Array.isArray(vinc.vizinhos) && vinc.vizinhos.length > 0 ? (
                  <ul className="space-y-1">
                    {vinc.vizinhos.map((v: any, k: number) => (
                      <li
                        key={k}
                        data-testid="ficha-dossie-vinculo"
                        className="flex items-center gap-2 border border-border-light bg-white px-2 py-1"
                      >
                        <span className="flex-1 truncate" title={v.name}>{v.name}</span>
                        <span className="px-1 py-0.5 text-[9px] font-mono uppercase border border-border-light text-muted-on-light shrink-0">
                          {objectKindLabel(t, v.node_type)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-muted-on-light italic">{t('ficha.dossie.vazio')}</p>
                )}
              </Section>

              {midia.length > 0 && (
                <Section title={t('ficha.dossie.secMidia')}>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {midia.map((m: any, k: number) => (
                      <li key={k} className="border border-border-light bg-white px-2 py-1 font-mono text-[10px] truncate">
                        {String(m.source_tool ?? '')} · {String(m.video_url || m.image_url || m.media_url || m.thumbnail || '')}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {generic.sources_used.length > 0 && (
                <Section title={t('ficha.dossie.fontes')}>
                  <div className="flex flex-wrap gap-1.5">
                    {generic.sources_used.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 border border-border-light bg-canvas-light font-mono text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* -------- COMPOSTO -------- */}
          {composite && (
            <>
              <Section title={t('ficha.dossie.secRoster')}>
                {composite.roster.length > 0 ? (
                  <ul className="space-y-1">
                    {composite.roster.map((r: any, k: number) => (
                      <li
                        key={k}
                        data-testid="ficha-dossie-roster-item"
                        className="flex items-center gap-2 border border-border-light bg-white px-2 py-1"
                      >
                        {r.relation && (
                          <span className="text-[9px] font-mono uppercase text-muted-on-light shrink-0">{r.relation}</span>
                        )}
                        <span className="flex-1 truncate" title={r.name}>{r.name}</span>
                        <span className="px-1 py-0.5 text-[9px] font-mono uppercase border border-border-light text-muted-on-light shrink-0">
                          {objectKindLabel(t, r.node_type)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-muted-on-light italic">{t('ficha.dossie.vazio')}</p>
                )}
              </Section>

              {composite.correlation && composite.correlation.nodes.length > 0 && (
                <Section title={t('ficha.dossie.secCorrelacao')}>
                  <p className="font-mono text-[10px] text-muted-on-light">
                    {composite.correlation.nodes.length} {t('ficha.dossie.nos')} ·{' '}
                    {composite.correlation.edges.length} {t('ficha.dossie.vinculosN')}
                  </p>
                </Section>
              )}

              {composite.scene.length > 0 && (
                <Section title={t('ficha.dossie.secCena')}>
                  <ul className="space-y-1">
                    {composite.scene.map((s: any, k: number) => (
                      <li key={k} className="border border-border-light bg-white px-2 py-1">
                        <span className="truncate">{s.name}</span>{' '}
                        <span className="font-mono text-[10px] text-muted-on-light">
                          ({(s.neighbors ?? []).length})
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {composite.timeline.length > 0 && (
                <Section title={t('ficha.dossie.secLinhaTempo')}>
                  <ul className="space-y-1">
                    {composite.timeline.map((it: any, k: number) => (
                      <li key={k} className="flex items-center gap-2 border border-border-light bg-white px-2 py-1">
                        <span className="font-mono text-[10px] text-muted-on-light shrink-0">{String(it.when)}</span>
                        <span className="flex-1 truncate">{it.name}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function KeyVals({ obj }: { obj?: Record<string, unknown> }) {
  const t = useT();
  const entries = Object.entries(obj ?? {}).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  if (entries.length === 0) return <p className="text-[10px] text-muted-on-light italic">{t('ficha.dossie.vazio')}</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {entries.slice(0, 24).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="font-mono text-[10px] text-muted-on-light">{k}</dt>
          <dd className="truncate" title={String(v)}>{String(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
