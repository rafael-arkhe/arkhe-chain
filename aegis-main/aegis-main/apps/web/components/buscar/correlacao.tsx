'use client';

/**
 * BuscarCorrelacao — cadeia de correlação no detalhe do /buscar (P3 Onda 3).
 *
 * ADD-alongside: pendura no painel detalhe (components/buscar/detalhe.tsx) sem
 * tocar nos fluxos existentes. HÍBRIDO auto-leve + aprofundar, PREVIEW + salvar:
 *
 *  1) AUTO-LEVE — ao abrir um resultado que resolve num SELETOR
 *     (cpf/cnpj/handle/email/placa) ou numa entidade local, chama
 *     `Correlation.quickLinks` (1-hop SÍNCRONO, barato) e lista os VÍNCULOS
 *     IMEDIATOS com rótulo da relação. Loading discreto, não bloqueia a UI.
 *
 *  2) APROFUNDAR — "Expandir em cadeia" (perm correlation.run) roda o BFS
 *     multi-salto ASSÍNCRONO via `runChainToCompletion` (start + poll + SSE de
 *     steps). Profundidade/orçamento ajustáveis num popover (defaults 2 / 40).
 *     A rede CRESCE numa PRÉVIA (reusa o grafo do /rede via RedeCanvas).
 *
 *  3) PREVIEW + SALVAR — o resultado é PRÉVIA: não persiste na ontologia
 *     (memória: não poluir). "Salvar na rede" (perm correlation.save) confirma
 *     via confirmModal (NUNCA diálogo nativo) e materializa via
 *     `Correlation.saveChain` (idempotente). Sucesso → link pra /rede (nova aba).
 *
 * DOMÍNIO-AGNÓSTICO: o seletor é inferido pelo FORMATO (inferDossierKind, espelho
 * exato do backend infer_query_kind) — zero hardcode de vertical.
 */
import * as React from 'react';
import {
  Share2,
  Settings2,
  Loader2,
  ExternalLink,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useCan } from '@/lib/auth/useAuth';
import { objectKindLabel } from '@/lib/i18n/kind-labels';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { humaniseSearchError } from '@/lib/buscar/humanise';
import { inferDossierKind } from '@/lib/buscar/classify';
import {
  Correlation,
  type CorrelationGraph,
  type CorrelationNode,
  type CorrelationStep,
} from '@/lib/api/correlation';
import { normalizeRedeGraph, nsId } from '@/lib/rede/graph';
import { RedeCanvas } from '@/components/rede/RedeCanvas';
import type { NormalizedResult } from '@/lib/buscar/types';

/* -------------------------------------------------------------------------- */
/* Seed (seletor) — derivado por FORMATO, multidomínio                        */
/* -------------------------------------------------------------------------- */
export interface CorrelationSeed {
  value: string;
  /** kind ∈ {cnpj,cpf,email,phone,username,person} — espelho de infer_query_kind. */
  kind: string;
  /** É um seletor forte (não nome livre)? Gate do AUTO-LEVE. */
  isSelector: boolean;
}

/** Placa Mercosul (ABC1D23) ou antiga (ABC1234) — inferDossierKind não cobre. */
const PLACA_RE = /^[A-Za-z]{3}-?\d[A-Za-z0-9]\d{2}$/;

/** Seletores FORTES que justificam pivô sozinhos (sem precisar de entidade). */
const STRONG_KINDS = new Set(['cnpj', 'cpf', 'email', 'phone']);

/** Chaves cujo NOME já identifica um seletor — fontes CONFIÁVEIS (sem ambiguidade). */
const SELECTOR_KEYS = new Set([
  'cnpj', 'cnpj_raiz', 'cpf', 'cpf_cnpj', 'cpf_cnpj_socio', 'cnpj_cpf_socio',
  'documento', 'document', 'doc', 'email', 'e_mail', 'mail', 'telefone',
  'phone', 'celular', 'handle', 'username', 'screen_name', 'placa',
]);
const onlyDigits = (s: string) => s.replace(/\D/g, '');
const tryPlaca = (s: string): CorrelationSeed | null => {
  const v = s.replace(/\s/g, '');
  return PLACA_RE.test(v) ? { value: v.toUpperCase(), kind: 'placa', isSelector: true } : null;
};

/** Valores vindos de chaves que NOMEIAM um seletor (raw + 1 nível aninhado). */
function trustedSeeds(result: NormalizedResult): string[] {
  const out: string[] = [];
  const scan = (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) {
      if ((typeof v === 'string' || typeof v === 'number') && SELECTOR_KEYS.has(k.toLowerCase())) {
        out.push(String(v));
      }
    }
  };
  const raw = result.raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    scan(raw as Record<string, unknown>);
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) scan(v as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * Deriva o seletor de correlação de um resultado, por FORMATO (multidomínio).
 * (1) CONFIÁVEL: chaves que NOMEIAM o seletor (cnpj/cpf/email/…) no raw + o valor
 *     extraído — aceita o kind inferido direto (sem ambiguidade);
 * (2) NÃO-CONFIÁVEL: nome/facts/fields/escalares do raw — só aceita seletor com
 *     formato ESTRITO (email; cnpj 14 díg; cpf 11 díg). NUNCA telefone aqui
 *     (frouxo demais — evita pegar capital/data/ID como seletor);
 * (3) sem seletor forte: só dispara se resolve numa entidade local (`entityId`).
 */
export function deriveCorrelationSeed(result: NormalizedResult): CorrelationSeed | null {
  // (1) CONFIÁVEL
  for (const c of [...trustedSeeds(result), result.action?.value ?? '']) {
    const s = String(c).trim();
    if (!s) continue;
    const placa = tryPlaca(s);
    if (placa) return placa;
    const { kind, value } = inferDossierKind(s);
    if (STRONG_KINDS.has(kind)) return { value, kind, isSelector: true };
  }
  // (2) NÃO-CONFIÁVEL — formato estrito
  const untrusted: string[] = [];
  if (result.name) untrusted.push(result.name);
  for (const f of result.facts ?? []) if (f?.value) untrusted.push(String(f.value));
  for (const f of result.fields ?? []) if (f?.value) untrusted.push(String(f.value));
  const raw = result.raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') untrusted.push(String(v));
    }
  }
  for (const c of untrusted) {
    const s = c.trim();
    if (!s || s.length > 200) continue;
    const placa = tryPlaca(s);
    if (placa) return placa;
    const { kind, value } = inferDossierKind(s);
    const dig = onlyDigits(value);
    if (kind === 'email') return { value, kind, isSelector: true };
    if (kind === 'cnpj' && dig.length === 14) return { value, kind, isSelector: true };
    if (kind === 'cpf' && dig.length === 11) return { value, kind, isSelector: true };
  }
  // (3) entidade local
  const candidate = (result.action?.value ?? '').trim() || (result.name ?? '').trim();
  if (!candidate || !result.entityId) return null;
  const { kind, value } = inferDossierKind(candidate);
  return { value, kind, isSelector: false };
}

/** Vínculo imediato (1 hop): a relação + o nó vizinho + score. */
interface ImmediateLink {
  rel: string;
  node: CorrelationNode;
  score: number;
}

/** Extrai os vizinhos diretos do nó-semente (depth 0) do grafo quick-links. */
function immediateLinks(graph: CorrelationGraph): ImmediateLink[] {
  const seed = graph.nodes.find((n) => n.depth === 0) ?? null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: ImmediateLink[] = [];
  const seen = new Set<string>();
  for (const e of graph.edges) {
    let neighborId: string | null = null;
    if (seed) {
      if (e.src === seed.id) neighborId = e.dst;
      else if (e.dst === seed.id) neighborId = e.src;
      else continue;
    } else {
      neighborId = e.dst;
    }
    const node = neighborId ? byId.get(neighborId) ?? null : null;
    if (!node || node.depth === 0 || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push({ rel: e.rel, node, score: e.score });
  }
  // Defensivo: nós de profundidade>0 sem aresta detectada ainda aparecem.
  if (out.length === 0) {
    for (const n of graph.nodes) {
      if (n.depth === 0) continue;
      out.push({ rel: '', node: n, score: n.confidence });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Medição de container (RedeCanvas exige width/height numéricos)             */
/* -------------------------------------------------------------------------- */
function useElementSize(): [
  (el: HTMLDivElement | null) => void,
  { w: number; h: number },
] {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const roRef = React.useRef<ResizeObserver | null>(null);
  const cb = React.useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w > 0 && h > 0) setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      roRef.current = ro;
    }
  }, []);
  return [cb, size];
}

/* -------------------------------------------------------------------------- */
/* Componente principal                                                        */
/* -------------------------------------------------------------------------- */
export function BuscarCorrelacao({ result }: { result: NormalizedResult }) {
  const t = useT();
  const canRun = useCan('correlation.run');
  const canSave = useCan('correlation.save');
  const seed = React.useMemo(() => deriveCorrelationSeed(result), [result]);

  // AUTO-LEVE (quick-links 1-hop)
  const [vinculos, setVinculos] = React.useState<ImmediateLink[]>([]);
  const [vinculosLoading, setVinculosLoading] = React.useState(false);
  const [vinculosErro, setVinculosErro] = React.useState<string | null>(null);

  // APROFUNDAR (chain)
  const [open, setOpen] = React.useState(false);
  const [showConfig, setShowConfig] = React.useState(false);
  const [depth, setDepth] = React.useState(2);
  const [budget, setBudget] = React.useState(40);
  const [running, setRunning] = React.useState(false);
  const [steps, setSteps] = React.useState<CorrelationStep[]>([]);
  const [chainGraph, setChainGraph] = React.useState<CorrelationGraph | null>(null);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [chainErro, setChainErro] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // SALVAR
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<{ created_nodes: number; created_edges: number } | null>(
    null,
  );

  const seedKey = seed ? `${seed.kind}:${seed.value}` : '';

  // AUTO-LEVE: dispara quando muda o seletor (e há perm). Loading discreto.
  React.useEffect(() => {
    if (!seed || !canRun) {
      setVinculos([]);
      setVinculosErro(null);
      return;
    }
    let cancelled = false;
    setVinculosLoading(true);
    setVinculosErro(null);
    Correlation.quickLinks({ value: seed.value, kind: seed.kind })
      .then(({ graph }) => {
        if (cancelled) return;
        setVinculos(immediateLinks(graph));
      })
      .catch((e) => {
        if (cancelled) return;
        setVinculos([]);
        setVinculosErro(humaniseSearchError(e) || t('buscar.correlacao.erro'));
      })
      .finally(() => {
        if (!cancelled) setVinculosLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // seedKey é a identidade estável do seletor (kind+value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, canRun]);

  const handleExpand = React.useCallback(async () => {
    if (!seed) return;
    setShowConfig(false);
    setOpen(true);
    setRunning(true);
    setChainErro(null);
    setChainGraph(null);
    setSteps([]);
    setTaskId(null);
    setSaved(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const status = await Correlation.runChainToCompletion(
        { value: seed.value, kind: seed.kind, max_depth: depth, budget_nodes: budget },
        { onProgress: setSteps, signal: ctrl.signal },
      );
      if (ctrl.signal.aborted) return;
      setTaskId(status.task_id);
      setChainGraph(status.graph ?? null);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setChainErro(humaniseSearchError(e) || t('buscar.correlacao.erro'));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [seed, depth, budget, t]);

  const handleClose = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setOpen(false);
    setRunning(false);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!taskId || !chainGraph || !chainGraph.nodes.length) return;
    const ok = await confirmModal({
      title: t('buscar.correlacao.salvarConfirmTitulo'),
      description: t('buscar.correlacao.salvarConfirmDesc'),
      confirmLabel: t('buscar.correlacao.salvarConfirmar'),
    });
    if (!ok) return;
    setSaving(true);
    setChainErro(null);
    try {
      const res = await Correlation.saveChain(taskId);
      setSaved(res);
    } catch (e) {
      setChainErro(humaniseSearchError(e) || t('buscar.correlacao.salvarErro'));
    } finally {
      setSaving(false);
    }
  }, [taskId, chainGraph, t]);

  // Sem perm de rodar ou sem seletor: nada a oferecer (gate de UI).
  if (!canRun || !seed) return null;

  return (
    <section
      data-testid="buscar-correlacao"
      className="p-3 border-b border-border-light"
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-1.5 flex items-center gap-1.5">
        <Share2 className="w-3 h-3" strokeWidth={1.5} />
        {t('buscar.correlacao.titulo')}
      </p>

      {/* AUTO-LEVE: vínculos imediatos (1 hop) */}
      {vinculosLoading && (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5 py-1">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          {t('buscar.correlacao.carregando')}
        </p>
      )}
      {!vinculosLoading && vinculosErro && (
        <p className="text-[11px] text-danger flex items-center gap-1.5 py-1">
          <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
          {vinculosErro}
        </p>
      )}
      {!vinculosLoading && !vinculosErro && vinculos.length === 0 && (
        <p className="text-[11px] text-muted-on-light py-1">
          {t('buscar.correlacao.vazio')}
        </p>
      )}
      {vinculos.length > 0 && (
        <ul data-testid="buscar-correlacao-vinculos" className="space-y-1">
          {vinculos.map((l, i) => (
            <li
              key={`${l.node.id}-${i}`}
              data-testid={`buscar-correlacao-vinculo-${i}`}
              className="flex items-center gap-2 text-[11px] border border-border-light bg-canvas-light px-2 py-1"
            >
              {l.rel && (
                <span className="text-[9px] font-mono uppercase tracking-wide text-muted-on-light shrink-0">
                  {l.rel}
                </span>
              )}
              <ArrowRight className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
              <span className="flex-1 min-w-0 truncate text-text-on-light" title={l.node.display}>
                {l.node.display || l.node.value}
              </span>
              {l.node.kind && (
                <span className="px-1 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-border-light text-muted-on-light shrink-0">
                  {objectKindLabel(t, l.node.kind)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* APROFUNDAR: expandir em cadeia + popover de profundidade/orçamento */}
      <div className="mt-2 relative flex items-center gap-1.5">
        <button
          type="button"
          data-testid="buscar-correlacao-expandir"
          onClick={handleExpand}
          title={t('buscar.correlacao.expandirHint')}
          className="flex-1 h-8 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center justify-center gap-2"
        >
          <Share2 className="w-3 h-3" strokeWidth={1.5} />
          {t('buscar.correlacao.expandir')}
        </button>
        <button
          type="button"
          data-testid="buscar-correlacao-config"
          aria-label={t('buscar.correlacao.config')}
          title={t('buscar.correlacao.config')}
          onClick={() => setShowConfig((v) => !v)}
          className={cn(
            'h-8 w-8 shrink-0 border flex items-center justify-center',
            showConfig
              ? 'border-primary text-primary bg-primary/10'
              : 'border-border-light text-muted-on-light hover:border-primary',
          )}
        >
          <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>

        {showConfig && (
          <div
            data-testid="buscar-correlacao-popover"
            className="absolute right-0 top-9 z-20 w-56 bg-white border border-border-light shadow-xl p-3 space-y-3"
          >
            <NumberControl
              label={t('buscar.correlacao.profundidade')}
              testid="buscar-correlacao-depth"
              value={depth}
              min={1}
              max={4}
              onChange={setDepth}
            />
            <NumberControl
              label={t('buscar.correlacao.orcamento')}
              testid="buscar-correlacao-budget"
              value={budget}
              min={1}
              max={200}
              onChange={setBudget}
            />
          </div>
        )}
      </div>

      {open && (
        <CorrelacaoPreviewModal
          running={running}
          steps={steps}
          graph={chainGraph}
          erro={chainErro}
          saving={saving}
          saved={saved}
          canSave={canSave}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Controle numérico (profundidade/orçamento)                                  */
/* -------------------------------------------------------------------------- */
function NumberControl({
  label,
  testid,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  testid: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-on-light font-semibold font-mono block mb-1">
        {label}
      </span>
      <input
        type="number"
        data-testid={testid}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
        className="w-full h-7 px-2 text-[12px] font-mono bg-white border border-border-light outline-none focus:border-primary"
      />
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal de PRÉVIA — rede crescendo + salvar                                   */
/* -------------------------------------------------------------------------- */
function CorrelacaoPreviewModal({
  running,
  steps,
  graph,
  erro,
  saving,
  saved,
  canSave,
  onSave,
  onClose,
}: {
  running: boolean;
  steps: CorrelationStep[];
  graph: CorrelationGraph | null;
  erro: string | null;
  saving: boolean;
  saved: { created_nodes: number; created_edges: number } | null;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [canvasRef, size] = useElementSize();

  // Reusa o normalizador do /rede (espelho exato do shape do run_chain).
  const rede = React.useMemo(
    () => (graph ? normalizeRedeGraph(graph, 'node') : { nodes: [], links: [] }),
    [graph],
  );
  const rootId = React.useMemo(() => {
    const root = graph?.nodes.find((n) => n.depth === 0);
    return root ? nsId('node', root.id) : null;
  }, [graph]);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correlacao-preview-title"
      data-testid="buscar-correlacao-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center p-6 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1100px] h-[80vh] bg-white border border-border-light shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2 shrink-0">
          <Share2 className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <h2
            id="correlacao-preview-title"
            className="text-[13px] font-semibold flex-1 text-text-on-light"
          >
            {t('buscar.correlacao.previewTitulo')}
          </h2>
          <span className="text-[11px] font-mono text-muted-on-light">
            {nodeCount} {t('buscar.correlacao.nos')} · {edgeCount} {t('buscar.correlacao.vinculos')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('buscar.correlacao.fechar')}
            data-testid="buscar-correlacao-fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        {/* Aviso de PRÉVIA — claro até salvar */}
        <div className="px-4 py-2 border-b border-border-light bg-warning/5 text-[11px] text-text-on-light flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" strokeWidth={1.5} />
          {t('buscar.correlacao.previewAviso')}
        </div>

        {/* Corpo: grafo + lista de nós */}
        <div
          data-testid="buscar-correlacao-grafo"
          className="flex-1 min-h-0 flex overflow-hidden"
        >
          {/* Canvas (reusa RedeCanvas do /rede) */}
          <div
            ref={canvasRef}
            className="flex-1 min-w-0 min-h-0 relative bg-canvas-light"
          >
            {running && (
              <div
                data-testid="buscar-correlacao-crescendo"
                className="absolute top-3 left-3 z-10 bg-white border border-border-light px-2 py-1 text-[10px] font-mono text-muted-on-light flex items-center gap-1.5"
              >
                <Loader2 className="w-3 h-3 animate-spin text-primary" strokeWidth={1.5} />
                {t('buscar.correlacao.crescendo')}
              </div>
            )}
            {graph && graph.nodes.length > 0 && (
              <RedeCanvas
                nodes={rede.nodes}
                links={rede.links}
                selectedId={null}
                rootId={rootId}
                onNodeClick={() => {}}
                width={size.w || 760}
                height={size.h || 480}
              />
            )}
            {!running && graph && graph.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-[11px] text-muted-on-light">
                  {t('buscar.correlacao.semNos')}
                </p>
              </div>
            )}
          </div>

          {/* Lateral: progresso + lista de nós (acessível/testável) */}
          <aside className="w-[280px] shrink-0 border-l border-border-light bg-panel-light flex flex-col overflow-hidden">
            {steps.length > 0 && (
              <div className="border-b border-border-light p-2 max-h-40 overflow-y-auto scrollbar-hide">
                <ul className="space-y-0.5">
                  {steps.map((s, i) => (
                    <li
                      key={`${s.label}-${i}`}
                      className="text-[10px] font-mono flex items-center gap-1.5"
                    >
                      <span className="text-text-on-light truncate">{s.label}</span>
                      {s.detail && (
                        <span className="text-muted-on-light truncate">· {s.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-2">
              {graph && graph.nodes.length > 0 ? (
                <ul className="space-y-1">
                  {graph.nodes.map((n, i) => (
                    <li
                      key={n.id}
                      data-testid={`buscar-correlacao-no-${i}`}
                      className="flex items-center gap-2 text-[11px] border border-border-light bg-white px-2 py-1"
                    >
                      <span className="flex-1 min-w-0 truncate text-text-on-light" title={n.display}>
                        {n.display || n.value}
                      </span>
                      <span className="px-1 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-border-light text-muted-on-light shrink-0">
                        {objectKindLabel(t, n.kind)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                !running && (
                  <p className="text-[11px] text-muted-on-light p-1">
                    {erro ?? t('buscar.correlacao.semNos')}
                  </p>
                )
              )}
            </div>
          </aside>
        </div>

        {/* Footer: erro + salvar / ver na rede */}
        <footer className="px-4 py-3 border-t border-border-light flex items-center gap-3 shrink-0">
          {erro && (
            <span className="text-[11px] text-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
              {erro}
            </span>
          )}
          {saved && (
            <span
              data-testid="buscar-correlacao-salvo"
              className="text-[11px] text-primary flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              {t('buscar.correlacao.salvoOk')} {saved.created_nodes} {t('buscar.correlacao.nos')} ·{' '}
              {saved.created_edges} {t('buscar.correlacao.vinculos')}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {saved ? (
              <a
                href="/rede"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="buscar-correlacao-ver-rede"
                className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-2"
              >
                {t('buscar.correlacao.verNaRede')}
                <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              </a>
            ) : (
              canSave && (
                <button
                  type="button"
                  data-testid="buscar-correlacao-salvar"
                  onClick={onSave}
                  disabled={saving || running || !graph || graph.nodes.length === 0}
                  className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Save className="w-3 h-3" strokeWidth={1.5} />
                  )}
                  {saving ? t('buscar.correlacao.salvando') : t('buscar.correlacao.salvarNaRede')}
                </button>
              )
            )}
          </div>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
