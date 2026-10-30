'use client';

/**
 * NodePlayModal — o ▶ "play" de um nó do canvas.
 *
 * Valida/roda UM nó e mostra o resultado, pra o operador assegurar que cada nó
 * está 100% ANTES de "Construir" (confiança + zero surpresa na materialização):
 *  - Coleta: roda a AMOSTRA REAL da skill (Solutions.skillSample) → registros reais.
 *  - Processamento: valida a config (modelo+prompt+saída OU transformador) → o que falta.
 *  - Ontologia: valida que há tipos de objeto propostos bem-formados.
 *  - Construção da aplicação: abre um PREVIEW FULLSCREEN de tudo que será gerado
 *    (páginas, widgets, tipos, ações, agentes, fluxos) — "isto é o que vai ser construído".
 *
 * Reporta o status (running/ok/error) ao pai p/ o badge no ▶ do canvas.
 */
import * as React from 'react';
import { Play, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Solutions, type SolutionGraph } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { PHASE_META, humanizeKind, type Phase } from './nodeMeta';
import { MiniWidgetPreview } from '@/components/workshop/widget-mini-preview';
import { useSetSample, useSampleFor } from './sample-context';

export type PlayStatus = 'idle' | 'running' | 'ok' | 'error';

type Check = { label: string; ok: boolean; fix?: string };
type GraphNode = SolutionGraph['nodes'][number];

const WIDGET_LABELS: Record<string, string> = {
  object_table: 'Tabela de objetos',
  object_list: 'Lista de objetos',
  object_card: 'Ficha de objeto',
  form: 'Formulário (CRUD)',
  metric: 'Indicador (KPI)',
  time_series: 'Série temporal',
  heatmap: 'Mapa de calor',
  map: 'Mapa',
  map_live: 'Mapa ao vivo',
  network_graph: 'Grafo de rede',
  vega_chart: 'Gráfico',
  pivot_table: 'Tabela dinâmica',
  image: 'Imagem',
  button_group: 'Botões de ação',
  text: 'Texto',
};
const widgetLabel = (w: { type?: string; title?: string }) =>
  w.title || WIDGET_LABELS[String(w.type || '')] || humanizeKind(String(w.type || 'widget'));

interface Blueprint {
  proposed_app?: { title?: string; description?: string; widgets?: { type?: string; title?: string }[] };
  proposed_pages?: { slug?: string; title?: string; widgets?: { type?: string; title?: string }[] }[];
  workspace_layout?: { type?: string; title?: string }[];
  ontology_types?: { kind?: string; display_name?: string; properties?: unknown[] }[];
  proposed_links?: { display_name?: string; slug?: string }[];
  logic_functions?: { display_name?: string; slug?: string }[];
  action_types?: { display_name?: string; slug?: string }[];
  proposed_agents?: { display_name?: string; phase?: string; skill_key?: string }[];
  proposed_flows?: { display_name?: string }[];
}

export function NodePlayModal({
  open,
  node,
  blueprint,
  graph,
  playStatus,
  onClose,
  onStatus,
}: {
  open: boolean;
  node: GraphNode | null;
  blueprint: Blueprint | null;
  /** Grafo + status de play por nó — p/ gatear o preview da Construção nos outros nós verdes. */
  graph?: SolutionGraph | null;
  playStatus?: Record<string, PlayStatus>;
  onClose: () => void;
  onStatus: (id: string, s: PlayStatus) => void;
}) {
  const t = useT();
  const setSample = useSetSample(); // #3 — alimenta a ponte da amostra (Coleta → Variáveis)
  const sampleRecs = useSampleFor('*'); // #5 dry-run — última amostra real da Coleta
  const [dryRun, setDryRun] = React.useState<{
    inference?: { ok: boolean; output?: string; rendered_prompt?: string; model?: string; error?: string };
    transformer?: { ok: boolean; output?: unknown; error?: string };
  } | null>(null);
  const [status, setStatus] = React.useState<PlayStatus>('idle');
  const [checks, setChecks] = React.useState<Check[]>([]);
  const [records, setRecords] = React.useState<Record<string, unknown>[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const cancelRef = React.useRef(false);

  const phase = String(node?.phase || '') as Phase;
  const isApp = phase === 'aplicacao';

  // dispara a validação/run ao abrir um nó
  React.useEffect(() => {
    if (!open || !node) return;
    cancelRef.current = false;
    setChecks([]);
    setRecords([]);
    setDryRun(null);
    setError(null);
    setElapsed(0);
    void runNode(node);
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, node?.id]);

  React.useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const finish = React.useCallback(
    (id: string, s: PlayStatus, c: Check[], err?: string | null) => {
      if (cancelRef.current) return;
      setChecks(c);
      setError(err || null);
      setStatus(s);
      onStatus(id, s);
    },
    [onStatus],
  );

  const runNode = React.useCallback(
    async (n: GraphNode) => {
      setStatus('running');
      onStatus(n.id, 'running');
      const cfg = (n.config || {}) as Record<string, unknown>;
      const ph = String(n.phase || '');

      // ── Construção da aplicação → preview (sem run; o preview é o resultado) ──
      if (ph === 'aplicacao') {
        // GATING — o preview materializa os widgets com os DADOS dos outros nós; exige que
        // Coleta/Processamento/Ontologia tenham passado o play (verde) primeiro.
        const others = (graph?.nodes || []).filter((nn) => nn.id !== n.id && nn.phase !== 'aplicacao');
        const pending = others.filter((nn) => (playStatus?.[nn.id] || 'idle') !== 'ok');
        if (others.length > 0 && pending.length > 0) {
          finish(n.id, 'error', [
            { label: t('solutions.playCheckGate'), ok: false, fix: t('solutions.playFixGate') },
          ], t('solutions.playFixGate'));
          return;
        }
        const pages = blueprint?.proposed_pages?.length || 0;
        const widgets =
          (blueprint?.proposed_app?.widgets?.length || 0) +
          (blueprint?.proposed_pages || []).reduce((a, p) => a + (p.widgets?.length || 0), 0);
        const ok = pages > 0 || widgets > 0 || (blueprint?.workspace_layout?.length || 0) > 0;
        finish(
          n.id,
          ok ? 'ok' : 'error',
          [
            { label: t('solutions.playCheckApp'), ok, fix: ok ? undefined : t('solutions.playFixApp') },
          ],
          ok ? null : t('solutions.playFixApp'),
        );
        return;
      }

      // ── Coleta → roda a AMOSTRA REAL da skill ──
      if (ph === 'coleta') {
        const skills = Array.isArray(cfg.coleta_skills) ? (cfg.coleta_skills as { skill_key?: string; params?: Record<string, unknown> }[]) : [];
        const focus = skills[0];
        let skillKey = (focus?.skill_key || (cfg.coleta_skill_key as string) || '').trim();
        const params: Record<string, unknown> = focus?.params || (cfg.coleta_params as Record<string, unknown>) || {};
        if (!skillKey) {
          // O AIP PROPÔS a fonte mas o operador ainda não a adicionou ao nó → ela vive no
          // blueprint (proposed_agents, fase coleta), não em coleta_skills. Usa a proposta.
          const proposed = (blueprint?.proposed_agents || []).find((a) => a.phase === 'coleta' && a.skill_key);
          if (proposed?.skill_key) skillKey = proposed.skill_key.trim();
        }
        if (!skillKey) {
          finish(n.id, 'error', [
            { label: t('solutions.playCheckSource'), ok: false, fix: t('solutions.playFixSource') },
          ], t('solutions.playFixSource'));
          return;
        }
        try {
          const { sample_id } = await Solutions.skillSample(skillKey, params);
          const t0 = Date.now();
          // poll até done/erro (teto de segurança)
          while ((Date.now() - t0) / 1000 < 15 * 60) {
            await new Promise((r) => setTimeout(r, 4000));
            if (cancelRef.current) return;
            const st = await Solutions.skillSampleStatus(sample_id);
            if (st.status === 'done') {
              const recs = st.output?.records || [];
              setRecords(recs);
              // #3 — publica a amostra no contexto p/ as Variáveis do Processamento a usarem
              // (campos viram `{{campo}}` reconhecidos, sem o aviso "sem variável declarada").
              if (recs.length) {
                const nt = String(st.output?.node_type || '').trim();
                if (nt) setSample(nt, recs);
                setSample('*', recs);
              }
              finish(n.id, 'ok', [
                { label: t('solutions.playCheckSource'), ok: true },
                { label: t('solutions.playCheckRecords').replace('{n}', String(recs.length)), ok: recs.length > 0, fix: recs.length === 0 ? t('solutions.playFixRecords') : undefined },
              ]);
              return;
            }
            if (st.status === 'error' || st.status === 'unsupported') {
              finish(n.id, 'error', [
                { label: t('solutions.playCheckSource'), ok: true },
                { label: t('solutions.playCheckRun'), ok: false, fix: st.error || t('solutions.playFixRun') },
              ], st.error || t('solutions.playFixRun'));
              return;
            }
          }
          finish(n.id, 'error', [{ label: t('solutions.playCheckRun'), ok: false }], t('solutions.coletaSampleCap'));
        } catch (e) {
          finish(n.id, 'error', [{ label: t('solutions.playCheckRun'), ok: false }], e instanceof Error ? e.message : String(e));
        }
        return;
      }

      // ── Processamento → valida a config (inferência OU transformador) ──
      if (ph === 'processamento') {
        // Chaves REAIS gravadas pelo inspetor (FLAT em node.config; o materialize depois
        // mapeia p/ o dict `inference`). Antes eu lia cfg.inference.* (inexistente) → nó
        // configurado continuava ✗. Corrigido p/ as chaves que o inspetor grava.
        const hasType = !!String(cfg.node_type || '').trim();
        const hasOut = !!String(cfg.output_property || '').trim();
        const hasPrompt = !!String(cfg.inference_prompt || '').trim();
        const hasTransformer = !!String(cfg.transformer_function || '').trim();
        // Fase 3c: o nó não escolhe modelo — usa o padrão de "Agentes" (Dados › Modelos).
        // O dry-run resolve esse default no backend; não exigimos mais modelo no nó.
        const inferenceOk = hasPrompt && hasOut && hasType;
        const ok = inferenceOk || (hasType && hasTransformer);
        const c: Check[] = [
          { label: t('solutions.playCheckProcType'), ok: hasType, fix: hasType ? undefined : t('solutions.playFixProcType') },
        ];
        if (hasTransformer) {
          c.push({ label: t('solutions.playCheckProcTransformer'), ok: hasType && hasTransformer });
        } else {
          c.push({ label: t('solutions.playCheckProcPrompt'), ok: hasPrompt, fix: hasPrompt ? undefined : t('solutions.playFixProcPrompt') });
          c.push({ label: t('solutions.playCheckProcOut'), ok: hasOut, fix: hasOut ? undefined : t('solutions.playFixProcOut') });
        }
        if (!ok) {
          finish(n.id, 'error', c, t('solutions.playFixProc'));
          return;
        }
        // config OK → DRY-RUN REAL sobre 1 linha de amostra (output de verdade, auditado).
        const sample = sampleRecs[0];
        if (!sample) {
          finish(n.id, 'ok', [...c, { label: t('solutions.playDryNoSample'), ok: true }]);
          return;
        }
        try {
          const dr = await Solutions.nodeDryRun({
            model: String(cfg.inference_model || '') || undefined,
            prompt_template: String(cfg.inference_prompt || '') || undefined,
            transformer_function: String(cfg.transformer_function || '') || undefined,
            sample_row: sample,
          });
          setDryRun(dr);
          const drOk = (dr.inference?.ok ?? true) && (dr.transformer?.ok ?? true);
          finish(n.id, drOk ? 'ok' : 'error', c, drOk ? null : dr.inference?.error || dr.transformer?.error || null);
        } catch (e) {
          setDryRun({ inference: { ok: false, error: e instanceof Error ? e.message : String(e) } });
          finish(n.id, 'ok', c); // config válida mesmo se o dry-run falhar na rede
        }
        return;
      }

      // ── Ontologia → valida que há tipos propostos bem-formados ──
      if (ph === 'ontologia') {
        const types = blueprint?.ontology_types || [];
        const named = types.filter((o) => String(o.kind || '').trim());
        const ok = named.length > 0;
        finish(n.id, ok ? 'ok' : 'error', [
          { label: t('solutions.playCheckOntoTypes').replace('{n}', String(named.length)), ok, fix: ok ? undefined : t('solutions.playFixOnto') },
        ], ok ? null : t('solutions.playFixOnto'));
        return;
      }

      // fase desconhecida → ok trivial
      finish(n.id, 'ok', [{ label: t('solutions.playCheckGeneric'), ok: true }]);
    },
    [blueprint, graph, playStatus, finish, onStatus, setSample, sampleRecs, t],
  );

  if (!open || !node) return null;
  const phaseMeta = PHASE_META[phase] ?? PHASE_META.coleta;
  const title = node.title || humanizeKind(String(node.kind));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { cancelRef.current = true; onClose(); } }}>
      <DialogContent
        className={
          (isApp ? 'max-w-[96vw] w-[96vw] h-[92vh]' : 'max-w-xl') +
          ' flex flex-col p-0 gap-0 border border-border-light bg-canvas-light'
        }
        data-testid="node-play-modal"
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-light">
          <div className="flex items-center gap-2 min-w-0">
            {status === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" strokeWidth={1.5} />
            ) : status === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={1.5} />
            ) : status === 'error' ? (
              <XCircle className="w-4 h-4 text-danger shrink-0" strokeWidth={1.5} />
            ) : (
              <Play className="w-4 h-4 text-muted-on-light shrink-0" strokeWidth={1.5} />
            )}
            <div className="min-w-0">
              <p className={`text-[10px] uppercase tracking-widest ${phaseMeta.tone}`}>{phaseMeta.label}</p>
              <p className="text-[13px] font-semibold text-text-on-light truncate" data-testid="node-play-title">{title}</p>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-auto p-4 space-y-3 scrollbar-hide">
          {status === 'running' && (
            <p className="text-[12px] text-primary inline-flex items-center gap-2" data-testid="node-play-running">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              {t('solutions.playRunning')} <span className="font-mono tabular-nums">{elapsed}s</span>
            </p>
          )}

          {/* checks (todas as fases) */}
          {checks.length > 0 && (
            <ul className="space-y-1.5" data-testid="node-play-checks">
              {checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]">
                  {c.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" strokeWidth={1.5} />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" strokeWidth={1.5} />
                  )}
                  <div className="min-w-0">
                    <span className="text-text-on-light">{c.label}</span>
                    {!c.ok && c.fix && (
                      <p className="text-[11px] text-danger leading-snug">{c.fix}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* #5 dry-run — output REAL da inferência/transformador sobre 1 linha de amostra. */}
          {dryRun && (
            <div className="space-y-2 border-t border-border-light pt-2" data-testid="node-play-dryrun">
              {dryRun.inference && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    {t('solutions.playDryInference')}{dryRun.inference.model ? ` · ${dryRun.inference.model}` : ''}
                  </p>
                  {dryRun.inference.ok ? (
                    <div className="border border-success/40 bg-success/5 px-2 py-1.5 text-[11px] text-text-on-light whitespace-pre-wrap" data-testid="node-play-dry-output">
                      {dryRun.inference.output || '—'}
                    </div>
                  ) : (
                    <p className="text-[11px] text-danger" data-testid="node-play-dry-error">{dryRun.inference.error}</p>
                  )}
                </div>
              )}
              {dryRun.transformer && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('solutions.playDryTransformer')}</p>
                  {dryRun.transformer.ok ? (
                    <pre className="border border-border-light bg-white px-2 py-1.5 text-[10.5px] overflow-auto max-h-32 scrollbar-hide" data-testid="node-play-dry-transformer">{JSON.stringify(dryRun.transformer.output, null, 2)}</pre>
                  ) : (
                    <p className="text-[11px] text-danger">{dryRun.transformer.error}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Coleta: registros reais coletados */}
          {records.length > 0 && (
            <div className="space-y-1.5" data-testid="node-play-records">
              <p className="text-[10px] uppercase tracking-wider text-success">
                {t('solutions.coletaSampleDone').replace('{n}', String(records.length))}
              </p>
              {records.slice(0, 5).map((rec, i) => (
                <div key={i} className="border border-border-light bg-white px-2 py-1.5 space-y-0.5" data-testid="node-play-record">
                  {Object.entries(rec).filter(([k]) => !k.startsWith('_')).slice(0, 8).map(([k, v]) => (
                    <p key={k} className="text-[11px] leading-tight truncate">
                      <span className="font-mono text-muted-on-light">{k}:</span>{' '}
                      <span className="text-text-on-light">{Array.isArray(v) ? `[${v.length}] ${v.slice(0, 2).map(String).join(' · ').slice(0, 80)}` : String(v ?? '').slice(0, 90)}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Construção da aplicação: PREVIEW fullscreen do que será gerado — SÓ quando
              verde (ok). Gateado (error) mostra só o aviso "valide os outros nós primeiro". */}
          {isApp && status === 'ok' && (
            <AppPreview blueprint={blueprint} t={t} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppPreview({ blueprint, t }: { blueprint: Blueprint | null; t: (k: string) => string }) {
  const app = blueprint?.proposed_app;
  const pages = blueprint?.proposed_pages || [];
  const appWidgets = app?.widgets || blueprint?.workspace_layout || [];
  const types = blueprint?.ontology_types || [];
  const actions = blueprint?.action_types || [];
  const fns = blueprint?.logic_functions || [];
  const agents = blueprint?.proposed_agents || [];
  const flows = blueprint?.proposed_flows || [];

  // Renderiza o widget REAL (com mockVariables/mockConfig) — a paleta de verdade que
  // será materializada, não um cartão genérico. Sem componente registrado → MiniWidgetPreview
  // cai no placeholder discreto.
  const WidgetCard = ({ w }: { w: { type?: string; title?: string } }) => (
    <div className="border border-border-light bg-white overflow-hidden" data-testid="preview-widget">
      <div className="px-2 py-1 border-b border-border-light">
        <p className="text-[10px] text-text-on-light truncate">{widgetLabel(w)}</p>
      </div>
      <div className="h-44 overflow-hidden bg-canvas-light" data-testid="preview-widget-render">
        <MiniWidgetPreview type={String(w.type || '')} fit="both" height={176} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="node-play-preview">
      <div className="border-l-4 border-l-warning bg-white px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-warning">{t('solutions.previewApp')}</p>
        <p className="text-[16px] font-semibold text-text-on-light">{app?.title || t('solutions.previewAppUntitled')}</p>
        {app?.description && <p className="text-[12px] text-muted-on-light mt-0.5">{app.description}</p>}
      </div>

      {/* página principal / workspace */}
      {appWidgets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-on-light">{t('solutions.previewHome')}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {appWidgets.map((w, i) => <WidgetCard key={i} w={w} />)}
          </div>
        </div>
      )}

      {/* páginas adicionais */}
      {pages.map((p, i) => (
        <div key={i} className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-on-light">{p.title || p.slug}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(p.widgets || []).map((w, j) => <WidgetCard key={j} w={w} />)}
          </div>
        </div>
      ))}

      {/* plano de materialização: tipos / ações / agentes / fluxos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border-light">
        <PreviewList title={t('solutions.previewTypes')} items={types.map((o) => o.display_name || o.kind || '')} />
        <PreviewList title={t('solutions.previewActions')} items={[...actions.map((a) => a.display_name || a.slug || ''), ...fns.map((f) => f.display_name || f.slug || '')]} />
        <PreviewList title={t('solutions.previewAgents')} items={agents.map((a) => a.display_name || '')} />
        <PreviewList title={t('solutions.previewFlows')} items={flows.map((f) => f.display_name || '')} />
      </div>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  const clean = items.filter(Boolean);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">{title} ({clean.length})</p>
      <ul className="space-y-0.5">
        {clean.slice(0, 8).map((s, i) => (
          <li key={i} className="text-[11px] text-text-on-light truncate">{s}</li>
        ))}
        {clean.length === 0 && <li className="text-[11px] text-muted-on-light italic">—</li>}
      </ul>
    </div>
  );
}
