'use client';

/**
 * MaterializeDialog — "Salvar e Construir" (Sprint L17, 2026-05-24).
 *
 * Lê o `blueprint` do diagrama gerado (proposed Operação/Agentes/Fluxos +
 * tipos de objeto / funções de IA / ações / painel) e deixa o operador
 * escolher, com checkboxes (tudo marcado por padrão), o que materializar de
 * verdade na plataforma. "Construir" chama `Solutions.materialize(blueprint,
 * accept)`, que cria os recursos REAIS e emite o LineageEvent de auditoria.
 *
 * Quando o diagrama veio do histórico e não traz `blueprint` embutido, o
 * componente o reconstrói via `Solutions.design(problem, domain)` usando o
 * título/wizard do diagrama — assim "Construir" funciona mesmo sem ter
 * acabado de gerar.
 *
 * Regras honradas: rótulos humanos (nunca slug/type cru como único rótulo),
 * UI sharp (sem rounded), sem emoji, sem nomes internos de runtime, pt-BR
 * default + en-US peer via useT(). A auditoria já é emitida por /materialize.
 */
import * as React from 'react';
import { Loader2, Hammer, CheckCircle2, AlertTriangle, ArrowRight, Power } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/provider';
import { InfoTip } from '@/components/ui/info-tip';
import { readLinkedSources } from '@/components/solution-designer/ConnectDataSection';
import { readColetaSkills } from '@/components/solution-designer/coleta-skills';
import { humanizeKind } from '@/components/solution-designer/nodeMeta';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ApiError } from '@/lib/api/client';
import {
  Solutions,
  Spaces,
  Skills,
  type ProposedAgent,
  type Space,
  type SolutionBlueprint,
  type SolutionDiagram,
  type SolutionMaterializeAccept,
  type SolutionMaterializeResult,
} from '@/lib/api';
function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Converte a InferenceVariable declarada na UI (name/kind/object_type/property) no
 * shape Variable que o ``/evaluate`` do app consome — assim a variável aparece no
 * painel do app e o {{name}} do prompt resolve. ``objectSet`` liga à ONTOLOGIA.
 */
function toAppVariable(v: Record<string, unknown>): Record<string, unknown>[] | null {
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  if (!name) return null;
  const label = typeof v.description === 'string' && v.description ? v.description : name;
  const base = { external_id: name, label, recompute_mode: 'auto' };
  if (v.kind === 'objectSet' && typeof v.object_type === 'string' && v.object_type) {
    const objType = v.object_type;
    const aggOp = typeof v.agg_op === 'string' ? v.agg_op : '';
    const field = typeof v.property === 'string' && v.property ? v.property : '';
    if (aggOp) {
      // AGREGAÇÃO (object-set aggregation, first-class Foundry): emite o ObjectSet
      // de entrada + a variável objectAggregation que o referencia. ``inputs``
      // declara a dependência p/ o topo-sort do evaluate resolver o set ANTES do
      // count/sum/avg (senão UnresolvedReference / 422).
      const setId = `${name}__set`;
      return [
        {
          external_id: setId,
          label: `Conjunto · ${objType}`,
          recompute_mode: 'auto',
          type: 'ObjectSet',
          kind: 'objectSet',
          spec: { object_type: objType },
        },
        {
          ...base,
          type: 'Numeric',
          kind: 'objectAggregation',
          inputs: [setId],
          spec: {
            object_set: setId,
            aggregation:
              aggOp === 'count' ? { op: 'count' } : { op: aggOp, ...(field ? { field } : {}) },
          },
        },
      ];
    }
    return [
      {
        ...base,
        type: 'ObjectSet',
        kind: 'objectSet',
        spec: { object_type: objType, ...(field ? { property: field } : {}) },
      },
    ];
  }
  if (v.kind === 'expression') {
    return [{ ...base, type: 'String', kind: 'transformation', spec: { expression: '' } }];
  }
  return [{ ...base, type: 'String', kind: 'static', default: '' }];
}

/**
 * Human label for a workspace widget ``type`` — never surface the raw type as
 * the sole label (memory rule `feedback_widget_type_never_raw_in_ui`). Mirrors
 * the pt-BR labels the backend uses when filling the Construção phase items.
 * Unknown types fall back to a neutral "Componente do painel".
 */
const WIDGET_LABELS: Record<string, string> = {
  counter: 'Indicador (KPI)',
  object_list: 'Lista de objetos',
  map: 'Mapa',
  timeline: 'Linha do tempo',
  chart: 'Gráfico',
  table: 'Tabela',
  filter: 'Filtro',
  text: 'Texto',
};

function widgetLabel(type: string): string {
  return WIDGET_LABELS[type] ?? 'Componente do painel';
}

/**
 * B (#1) — rótulo humano do status de uma fonte materializada (o backend devolve
 * action = scheduled | typed-ingest:N | bound | registered). Nunca mostra o
 * código cru ao operador.
 */
function sourceActionLabel(t: (k: string) => string, action: string): string {
  if (action.startsWith('typed-ingest:')) {
    return t('solutions.srcActionTyped').replace('{n}', action.split(':')[1] || '0');
  }
  const map: Record<string, string> = {
    scheduled: 'solutions.srcActionScheduled',
    bound: 'solutions.srcActionBound',
    registered: 'solutions.srcActionProvenance',
  };
  return map[action] ? t(map[action]) : action;
}

/**
 * Rótulo humano da fonte (skill) de um agente. NUNCA expõe a chave de runtime
 * crua como rótulo único (`feedback_widget_type_never_raw_in_ui`) nem o prefixo
 * interno `openclaw:` (`feedback_ui_aip_not_openclaw`). Sem `skill_label`,
 * humaniza o slug derivado da chave.
 */
function agentSourceLabel(label: string | undefined, key: string): string {
  if (label && label.trim()) return label.trim();
  const bare = key.replace(/^openclaw:/, '');
  const slug = bare.split(/[.:]/).pop() || bare;
  const human = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return human || bare;
}

/**
 * Secondary hint summarising how many widgets an App/Página carries, using
 * human widget labels (never the raw type as the sole label). Returns an empty
 * string when there are no widgets so the caller can fall back to a rationale.
 */
function widgetCountHint(
  t: (k: string) => string,
  widgets?: { type: string }[],
): string {
  const list = widgets ?? [];
  if (list.length === 0) return '';
  const labels = list.map((w) => widgetLabel(w.type)).join(' · ');
  return `${list.length} ${t('solutions.grpWidgets')} — ${labels}`;
}

/** A single selectable proposed entity row. */
interface Selectable {
  id: string; // accept identifier (kind/slug/name)
  label: string; // human label (NEVER a raw slug/type as the only label)
  hint?: string; // optional secondary text (rationale / slug)
  badge?: { text: string; tone: 'ok' | 'muted' }; // ex.: indicador "executável"
}

function Row({
  item,
  checked,
  onToggle,
  testid,
}: {
  item: Selectable;
  checked: boolean;
  onToggle: () => void;
  testid: string;
}) {
  return (
    <label
      className="flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-panel-light"
      data-testid={testid}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
        data-testid={`${testid}-cb`}
      />
      <span className="min-w-0">
        <span className="block text-[12px] text-text-on-light leading-tight">
          {item.label}
          {item.badge && (
            <span
              className={
                'ml-1.5 align-middle text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border ' +
                (item.badge.tone === 'ok'
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-panel-light text-muted-on-light border-border-light')
              }
              data-testid={`${testid}-badge`}
            >
              {item.badge.text}
            </span>
          )}
        </span>
        {item.hint && (
          <span className="block text-[10.5px] text-muted-on-light leading-tight truncate">
            {item.hint}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * #2 — linha de Agente proposto com a SKILL REAL casada pelo Arquiteto.
 *
 * Mostra a fonte real (label da skill) + badges de plataforma + uma pílula de
 * status honesta: "pronta" (skill registrada, roda hoje) ou "requer ativação"
 * (skill openclaw curada ainda não registrada no worker). Quando requer ativação,
 * oferece o botão "Ativar skill" — instala a skill no gateway via o endpoint real
 * de governança (sem shell, sem restart). Agentes de IA puros (kind=aip, sem skill)
 * caem no render simples (só nome + descrição).
 */
function AgentRow({
  agent,
  checked,
  onToggle,
  testid,
  t,
}: {
  agent: ProposedAgent;
  checked: boolean;
  // undefined = travado (marcado, não-desmarcável) — worker de skill escolhida
  // no nó de Coleta.
  onToggle?: () => void;
  testid: string;
  t: (k: string) => string;
}) {
  const [activated, setActivated] = React.useState(false);
  const [activating, setActivating] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const skillKey = agent.skill_key || '';
  const isOpenclaw = skillKey.startsWith('openclaw:');
  const ready = (agent.skill_ready ?? true) || activated;
  const needsActivation = !!skillKey && isOpenclaw && !ready;
  const platforms = agent.skill_platforms || [];

  const activate = React.useCallback(async () => {
    if (activating) return;
    setActivating(true);
    setErr(null);
    try {
      const r = await Skills.installOpenclaw(skillKey);
      const slug = skillKey.replace(/^openclaw:/, '');
      if (r.installed || (r.discovered || []).includes(slug)) {
        setActivated(true);
      } else {
        setErr(t('solutions.activateFailed'));
      }
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setActivating(false);
    }
  }, [activating, skillKey, t]);

  return (
    <label
      className="flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-panel-light"
      data-testid={testid}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle ?? (() => {})}
        disabled={!onToggle}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary disabled:opacity-60"
        data-testid={`${testid}-cb`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-text-on-light leading-tight">
          {agent.display_name}
        </span>
        {skillKey ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="text-[10.5px] text-muted-on-light">
              {t('solutions.agentSource')}: {agentSourceLabel(agent.skill_label, skillKey)}
            </span>
            {platforms.map((p) => (
              <span
                key={p}
                className="text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-panel-light text-muted-on-light border-border-light"
                data-testid={`${testid}-plat-${p}`}
              >
                {p}
              </span>
            ))}
            {ready ? (
              <span
                className="text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-success/10 text-success border-success/30"
                data-testid={`${testid}-status-ready`}
              >
                {t('solutions.skillReady')}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-warning/10 text-warning border-warning/30"
                data-testid={`${testid}-status-pending`}
              >
                <AlertTriangle className="w-2.5 h-2.5" strokeWidth={1.5} />
                {t('solutions.skillNeedsActivation')}
              </span>
            )}
            {needsActivation && (
              <>
                <button
                  type="button"
                  // não togglar o checkbox ao clicar no botão dentro do <label>
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void activate();
                  }}
                  disabled={activating}
                  data-testid={`${testid}-activate`}
                  className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide px-1.5 py-0.5 border border-border-light text-text-on-light hover:border-primary disabled:opacity-40"
                >
                  {activating ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Power className="w-2.5 h-2.5" strokeWidth={1.5} />
                  )}
                  {t('solutions.activateSkill')}
                </button>
                <InfoTip text={t('solutions.activateSkillHint')} />
              </>
            )}
          </span>
        ) : null}
        {/* #7 (fix do operador) — SEMPRE mostra o que o agente FAZ (descrição),
            tenha skill/params ou não. Sem isto, agente sem param parecia inútil. */}
        {agent.description && (
          <span className="block text-[10.5px] text-muted-on-light leading-snug mt-0.5">
            {agent.description}
          </span>
        )}
        {err && (
          <span
            className="block text-[10px] font-mono text-danger leading-tight"
            data-testid={`${testid}-activate-err`}
          >
            {err}
          </span>
        )}
      </span>
    </label>
  );
}

function Group({
  title,
  testid,
  children,
}: {
  title: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border-light" data-testid={testid}>
      <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-on-light bg-canvas-light border-b border-border-light">
        {title}
      </div>
      <div className="divide-y divide-border-light/60">{children}</div>
    </div>
  );
}

export function MaterializeDialog({
  open,
  onOpenChange,
  diagram,
  diagramId,
  appId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The generated/loaded diagram whose blueprint drives the build. */
  diagram: SolutionDiagram | null;
  /** F1 — id do diagrama de origem (gravado no app p/ reabrir no AIP). */
  diagramId?: string | null;
  /** F3 — app-alvo: quando presente, ATUALIZA o mesmo app (não cria novo). */
  appId?: string | null;
}) {
  const t = useT();
  const [blueprint, setBlueprint] = React.useState<SolutionBlueprint | null>(null);
  const [loadingBp, setLoadingBp] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const [result, setResult] = React.useState<SolutionMaterializeResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Accept selections (default: everything checked).
  const [acceptProject, setAcceptProject] = React.useState(true);
  const [acceptAgents, setAcceptAgents] = React.useState<Set<string>>(new Set());
  const [acceptFlows, setAcceptFlows] = React.useState<Set<string>>(new Set());
  const [acceptOnto, setAcceptOnto] = React.useState<Set<string>>(new Set());
  const [acceptLogic, setAcceptLogic] = React.useState<Set<string>>(new Set());
  const [acceptActions, setAcceptActions] = React.useState<Set<string>>(new Set());
  const [acceptWorkspace, setAcceptWorkspace] = React.useState(true);
  // Sprint L18 — Workshop App (single) + Páginas (by slug).
  const [acceptApp, setAcceptApp] = React.useState(true);
  const [acceptPages, setAcceptPages] = React.useState<Set<string>>(new Set());
  // Sprint L19 — link types (relações), accept-by-key "source|relation|target".
  const [acceptLinks, setAcceptLinks] = React.useState<Set<string>>(new Set());
  // Sprint L20 — Espaço (fronteira de implantação) + publicar/disponibilizar.
  const [spaceMode, setSpaceMode] =
    React.useState<'new' | 'existing' | 'current' | 'none'>('new');
  const [spaceName, setSpaceName] = React.useState('');
  const [spaceId, setSpaceId] = React.useState('');
  const [spaces, setSpaces] = React.useState<Space[]>([]);
  const [publishAndSurface, setPublishAndSurface] = React.useState(true);

  // N-skills (2026-06-08) — cada skill escolhida nos nós de Coleta vira um
  // worker. Sintetiza um ProposedAgent por skill_key que o blueprint NÃO já
  // propôs (o backend cria N Agents iterando proposed_agents). Slugs únicos.
  const synthesizedAgents = React.useMemo(() => {
    const proposedKeys = new Set(
      (blueprint?.proposed_agents || []).map((a) => a.skill_key).filter(Boolean),
    );
    const usedSlugs = new Set((blueprint?.proposed_agents || []).map((a) => a.slug));
    const seenKey = new Set<string>();
    const out: ProposedAgent[] = [];
    for (const n of diagram?.nodes ?? []) {
      if (n.phase !== 'coleta') continue;
      for (const s of readColetaSkills(n.config)) {
        const sk = s.skill_key;
        if (!sk || proposedKeys.has(sk) || seenKey.has(sk)) continue;
        seenKey.add(sk);
        let slug = `coleta-${sk.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
        while (usedSlugs.has(slug)) slug = `${slug}-2`;
        usedSlugs.add(slug);
        out.push({
          slug,
          display_name: agentSourceLabel(undefined, sk),
          kind: 'worker',
          skill_key: sk,
          skill_ready: !sk.startsWith('openclaw:'),
          phase: 'coleta',
        });
      }
    }
    return out;
  }, [diagram, blueprint]);
  const synthSlugs = React.useMemo(
    () => new Set(synthesizedAgents.map((a) => a.slug)),
    [synthesizedAgents],
  );
  const allProposedAgents = React.useMemo(
    () => [...(blueprint?.proposed_agents || []), ...synthesizedAgents],
    [blueprint, synthesizedAgents],
  );

  // Seed the selection sets from a blueprint (all checked by default).
  const seedSelections = React.useCallback((bp: SolutionBlueprint) => {
    setAcceptProject(!!bp.proposed_project);
    setAcceptAgents(new Set((bp.proposed_agents || []).map((a) => a.slug)));
    setAcceptFlows(new Set((bp.proposed_flows || []).map((f) => f.slug)));
    setAcceptOnto(new Set((bp.ontology_types || []).map((o) => o.kind)));
    setAcceptLogic(new Set((bp.logic_functions || []).map((l) => l.slug)));
    setAcceptActions(new Set((bp.action_types || []).map((a) => a.name)));
    setAcceptWorkspace((bp.workspace_layout || []).length > 0);
    setAcceptApp(!!bp.proposed_app);
    setAcceptPages(new Set((bp.proposed_pages || []).map((p) => p.slug)));
    setAcceptLinks(
      new Set(
        (bp.proposed_links || []).map(
          (l) => `${l.source_kind}|${l.relation}|${l.target_kind}`,
        ),
      ),
    );
    setSpaceName(bp.proposed_space?.display_name || '');
    setSpaceMode('new');
  }, []);

  // On open: take the diagram's embedded blueprint, or fetch one via /design.
  // Espaços existentes para o seletor "usar existente" (ex.: 2º condomínio).
  React.useEffect(() => {
    if (open) Spaces.list().then(setSpaces).catch(() => setSpaces([]));
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setResult(null);
    const embedded = diagram?.blueprint ?? null;
    if (embedded) {
      setBlueprint(embedded);
      seedSelections(embedded);
      return;
    }
    // Loaded-from-history diagram without an embedded blueprint: rebuild it.
    const problem =
      (diagram?.wizard?.requirements as string) ||
      diagram?.title ||
      'Operação';
    const domain = (diagram?.wizard?.domain as string) || diagram?.domain;
    setBlueprint(null);
    setLoadingBp(true);
    Solutions.design(problem, domain)
      .then((bp) => {
        setBlueprint(bp);
        seedSelections(bp);
      })
      .catch((e) => setErr(humanise(e)))
      .finally(() => setLoadingBp(false));
  }, [open, diagram, seedSelections]);

  function toggleIn(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalSelected =
    (acceptProject ? 1 : 0) +
    acceptAgents.size +
    acceptFlows.size +
    acceptOnto.size +
    acceptLogic.size +
    acceptActions.size +
    (acceptWorkspace ? 1 : 0) +
    (acceptApp ? 1 : 0) +
    acceptPages.size +
    acceptLinks.size;

  async function build() {
    if (!blueprint || building) return;
    setErr(null);
    setBuilding(true);
    const accept: SolutionMaterializeAccept = {
      ontology_types: Array.from(acceptOnto),
      logic_functions: Array.from(acceptLogic),
      action_types: Array.from(acceptActions),
      workspace_layout: acceptWorkspace,
      project: acceptProject && !!blueprint.proposed_project,
      // Sintetizados (workers das skills escolhidas no nó) são SEMPRE aceitos —
      // o operador escolheu a skill, então o worker dela roda.
      agents: Array.from(new Set([...acceptAgents, ...synthSlugs])),
      flows: Array.from(acceptFlows),
      app: acceptApp && !!blueprint.proposed_app,
      pages: Array.from(acceptPages),
      links: Array.from(acceptLinks),
      project_id: diagram?.project_id ?? null,
      space_mode: spaceMode,
      space_id: spaceMode === 'existing' ? spaceId || null : null,
      space_name:
        spaceMode === 'new'
          ? spaceName || blueprint.proposed_space?.display_name || null
          : null,
      publish_and_surface: publishAndSurface,
    };
    // P2 — fontes vinculadas nos nós de Coleta do diagrama: o backend as
    // CONSOME (conector → amarra à Operação + enfileira ingestão; fonte/
    // dataset → proveniência). B (#1, #3 do review): a chave de dedupe inclui a
    // ROTA — a MESMA fonte pode alimentar Tipos DIFERENTES em nós diferentes;
    // colapsar por kind:id perderia a 2ª rota. Só duplicatas idênticas colapsam.
    const seen = new Set<string>();
    const linkedSources = (diagram?.nodes ?? [])
      .filter((n) => n.phase === 'coleta')
      .flatMap((n) => readLinkedSources(n.config))
      // 'manual' = rota desenhada no canvas mas SEM fonte real escolhida ainda
      // (placeholder do connectNodes). O backend (LinkedSourceIn) só aceita
      // fonte/conector/dataset — não enviamos placeholders; o operador resolve a
      // fonte real no inspetor antes de virarem ingestão.
      // _validSource já dropa kinds fora de fonte/conector/dataset, mas mantemos
      // a guarda defensiva explícita (cast: 'manual' não está no union tipado).
      .filter((s) => (s.kind as string) !== 'manual')
      .filter((s) => {
        const k = `${s.kind}:${s.id}:${s.target_node_type ?? ''}:${s.id_field ?? ''}:${s.name_field ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    // Parâmetros das skills preenchidas nos nós de Coleta (config.coleta_skills[]
    // — N skills por nó, retrocompat ao singular) → mapeados por skill_key p/ o
    // binding. Cada skill_key vira um worker (proposed_agent) na materialização.
    const agentParams: Record<string, Record<string, unknown>> = {};
    for (const n of diagram?.nodes ?? []) {
      if (n.phase !== 'coleta') continue;
      for (const s of readColetaSkills(n.config)) {
        if (s.skill_key && s.params && Object.keys(s.params).length) {
          agentParams[s.skill_key] = { ...(agentParams[s.skill_key] || {}), ...s.params };
        }
      }
    }
    // INFERÊNCIA — modelo + prompt + variáveis declaradas + transformador do nó de
    // Processamento. As variáveis viram o shape Variable (objectSet liga à ontologia)
    // p/ o painel do app; o transformer (Code Function) vai p/ a config do agente.
    let inference:
      | {
          model?: string;
          system_prompt?: string;
          transformer_function?: string;
          variables?: Record<string, unknown>[];
          // #1 — forma CRUA das variáveis do nó (name/object_type/agg_op/filter/limit) p/ o
          // enrich resolver no runtime e injetar como {{nome}}. Paralela ao `variables`
          // (transformado p/ o motor de App via toAppVariable).
          inference_variables?: Record<string, unknown>[];
        }
      | undefined;
    for (const n of diagram?.nodes ?? []) {
      if (n.phase !== 'processamento') continue;
      const c = (n.config || {}) as Record<string, unknown>;
      // #6 — respeita o modo de processamento escolhido no inspetor:
      //  transformer → nunca envia model/prompt/variáveis (só o Code Function);
      //  inference   → nunca envia o transformador;
      //  both/default → envia tudo que estiver preenchido.
      const mode = typeof c.processing_mode === 'string' ? c.processing_mode : 'both';
      const useInfer = mode !== 'transformer';
      const useTransform = mode !== 'inference';
      const model = useInfer && typeof c.inference_model === 'string' ? c.inference_model : '';
      const sysp = useInfer && typeof c.inference_prompt === 'string' ? c.inference_prompt : '';
      const tf = useTransform && typeof c.transformer_function === 'string' ? c.transformer_function : '';
      const rawVars = useInfer && Array.isArray(c.inference_variables) ? c.inference_variables : [];
      const seenVar = new Set<string>();
      const variables = rawVars
        .flatMap((v) => toAppVariable(v as Record<string, unknown>) || [])
        // dedupe por external_id (o ObjectSet __set companheiro pode repetir).
        .filter((vd) => {
          const eid = String(vd.external_id);
          if (seenVar.has(eid)) return false;
          seenVar.add(eid);
          return true;
        });
      if (model || sysp || tf || variables.length || rawVars.length) {
        inference = {
          ...(model ? { model } : {}),
          ...(sysp ? { system_prompt: sysp } : {}),
          ...(tf ? { transformer_function: tf } : {}),
          ...(variables.length ? { variables } : {}),
          ...(rawVars.length ? { inference_variables: rawVars as Record<string, unknown>[] } : {}),
        };
        break;
      }
    }
    try {
      // Envia o blueprint com os proposed_agents SINTETIZADOS mesclados, p/ o
      // backend criar um worker por skill escolhida no nó de Coleta.
      const effectiveBlueprint =
        synthesizedAgents.length > 0
          ? { ...blueprint, proposed_agents: allProposedAgents }
          : blueprint;
      const r = await Solutions.materialize(
        effectiveBlueprint, accept, diagramId ?? undefined, appId ?? undefined,
        linkedSources, agentParams, inference,
      );
      setResult(r);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setBuilding(false);
    }
  }

  const bp = blueprint;
  const hasFailures = (result?.failures?.length ?? 0) > 0;
  // B (#6/#7 do review) — rótulo humano de um Tipo de objeto pelo kind (nunca o
  // kind cru como rótulo único). Usa o display_name do blueprint.
  const typeLabel = (kind: string): string =>
    bp?.ontology_types?.find((o) => o.kind === kind)?.display_name || humanizeKind(kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl h-[78vh] flex flex-col"
        data-testid="solutions-materialize"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="w-4 h-4 text-primary" strokeWidth={1.5} />
            {t('solutions.materializeTitle')}
          </DialogTitle>
        </DialogHeader>

        {!result && (
          <p className="text-[11px] text-muted-on-light -mt-1">
            {t('solutions.materializeSubtitle')}
          </p>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loadingBp && (
            <div
              className="flex items-center gap-2 text-[11px] text-muted-on-light px-1 py-3"
              data-testid="materialize-loading"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              {t('solutions.loadingBlueprint')}
            </div>
          )}

          {!loadingBp && !bp && !err && (
            <p className="text-[12px] text-muted-on-light px-1 py-3" data-testid="materialize-no-blueprint">
              {t('solutions.noBlueprint')}
            </p>
          )}

          {/* Selection (hidden once a result is shown) */}
          {!result && bp && (
            <div className="space-y-2.5">
              {/* L20 — Espaço (fronteira de implantação) + publicar/disponibilizar */}
              <div
                className="border border-border-light p-2 space-y-2"
                data-testid="materialize-space"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono">
                  {t('solutions.grpSpace')}
                </p>
                <SearchableSelect
                  data-testid="materialize-space-mode"
                  value={spaceMode}
                  onChange={(v) => setSpaceMode(v as typeof spaceMode)}
                  options={[
                    { value: 'new', label: t('solutions.spaceNew'), hint: t('solutions.spaceNewHint') },
                    { value: 'existing', label: t('solutions.spaceExisting'), hint: t('solutions.spaceExistingHint') },
                    { value: 'current', label: t('solutions.spaceCurrent'), hint: t('solutions.spaceCurrentHint') },
                    { value: 'none', label: t('solutions.spaceNone'), hint: t('solutions.spaceNoneHint') },
                  ]}
                  searchPlaceholder={t('solutions.searchOption')}
                />
                {spaceMode === 'new' && (
                  <input
                    data-testid="materialize-space-name"
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    placeholder={bp.proposed_space?.display_name || ''}
                    className="w-full h-7 px-2 text-[11px] border border-border-light bg-panel-light text-text-on-light"
                  />
                )}
                {spaceMode === 'existing' && (
                  <SearchableSelect
                    data-testid="materialize-space-existing"
                    value={spaceId}
                    onChange={setSpaceId}
                    options={spaces.map((s) => ({ value: s.id, label: s.display_name }))}
                    placeholder="—"
                    searchPlaceholder={t('solutions.searchOption')}
                  />
                )}
                <label className="flex items-center gap-2 text-[11px] text-text-on-light cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="materialize-publish"
                    checked={publishAndSurface}
                    onChange={(e) => setPublishAndSurface(e.target.checked)}
                  />
                  {t('solutions.publishAndSurface')}
                </label>
              </div>
              {bp.proposed_project && (
                <Group title={t('solutions.grpOperation')} testid="materialize-grp-operation">
                  <Row
                    testid="materialize-op-row"
                    checked={acceptProject}
                    onToggle={() => setAcceptProject((v) => !v)}
                    item={{
                      id: bp.proposed_project.slug,
                      label: bp.proposed_project.display_name,
                      hint: bp.proposed_project.description || bp.proposed_project.rationale,
                    }}
                  />
                </Group>
              )}

              {allProposedAgents.length > 0 && (
                <Group title={t('solutions.grpAgents')} testid="materialize-grp-agents">
                  {allProposedAgents.map((a) => {
                    // Sintetizado = worker de uma skill escolhida no nó de Coleta:
                    // sempre marcado e travado (remover-se no nó de Coleta).
                    const synth = synthSlugs.has(a.slug);
                    return (
                      <AgentRow
                        key={a.slug}
                        testid={`materialize-agent-${a.slug}`}
                        checked={synth ? true : acceptAgents.has(a.slug)}
                        onToggle={synth ? undefined : () => toggleIn(setAcceptAgents, a.slug)}
                        agent={a}
                        t={t}
                      />
                    );
                  })}
                </Group>
              )}

              {(bp.proposed_flows?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpFlows')} testid="materialize-grp-flows">
                  {bp.proposed_flows!.map((f) => (
                    <Row
                      key={f.slug}
                      testid={`materialize-flow-${f.slug}`}
                      checked={acceptFlows.has(f.slug)}
                      onToggle={() => toggleIn(setAcceptFlows, f.slug)}
                      item={{ id: f.slug, label: f.name, hint: f.description }}
                    />
                  ))}
                </Group>
              )}

              {(bp.ontology_types?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpObjectTypes')} testid="materialize-grp-onto">
                  {bp.ontology_types.map((o) => (
                    <Row
                      key={o.kind}
                      testid={`materialize-onto-${o.kind}`}
                      checked={acceptOnto.has(o.kind)}
                      onToggle={() => toggleIn(setAcceptOnto, o.kind)}
                      item={{ id: o.kind, label: o.display_name || o.kind, hint: o.rationale }}
                    />
                  ))}
                </Group>
              )}

              {(bp.proposed_links?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpLinks')} testid="materialize-grp-links">
                  {bp.proposed_links!.map((l) => {
                    const key = `${l.source_kind}|${l.relation}|${l.target_kind}`;
                    return (
                      <Row
                        key={key}
                        testid={`materialize-link-${key}`}
                        checked={acceptLinks.has(key)}
                        onToggle={() => toggleIn(setAcceptLinks, key)}
                        item={{
                          id: key,
                          label: `${typeLabel(l.source_kind)} · ${l.relation.replace(/_/g, ' ')} · ${typeLabel(l.target_kind)}`,
                          hint: l.rationale,
                        }}
                      />
                    );
                  })}
                </Group>
              )}

              {(bp.logic_functions?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpAiFunctions')} testid="materialize-grp-logic">
                  {bp.logic_functions.map((l) => (
                    <Row
                      key={l.slug}
                      testid={`materialize-logic-${l.slug}`}
                      checked={acceptLogic.has(l.slug)}
                      onToggle={() => toggleIn(setAcceptLogic, l.slug)}
                      item={{ id: l.slug, label: l.display_name, hint: l.description }}
                    />
                  ))}
                </Group>
              )}

              {(bp.action_types?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpActions')} testid="materialize-grp-actions">
                  {bp.action_types.map((a) => {
                    const runnable = /^(aegis\.|service:|https?:\/\/)/.test(
                      (a.code_ref || '').trim(),
                    );
                    return (
                      <Row
                        key={a.name}
                        testid={`materialize-action-${a.name}`}
                        checked={acceptActions.has(a.name)}
                        onToggle={() => toggleIn(setAcceptActions, a.name)}
                        item={{
                          id: a.name,
                          label: a.name,
                          hint: a.description,
                          badge: {
                            text: runnable
                              ? t('solutions.actionRunnable')
                              : t('solutions.actionCustom'),
                            tone: runnable ? 'ok' : 'muted',
                          },
                        }}
                      />
                    );
                  })}
                </Group>
              )}

              {(bp.workspace_layout?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpWorkspace')} testid="materialize-grp-workspace">
                  <Row
                    testid="materialize-workspace-row"
                    checked={acceptWorkspace}
                    onToggle={() => setAcceptWorkspace((v) => !v)}
                    item={{
                      id: 'workspace',
                      label: t('solutions.workspaceRowLabel'),
                      hint: bp.workspace_layout
                        .map((w) => widgetLabel(w.type))
                        .join(' · '),
                    }}
                  />
                </Group>
              )}

              {bp.proposed_app && (
                <Group title={t('solutions.grpApp')} testid="materialize-grp-app">
                  <Row
                    testid="materialize-app-row"
                    checked={acceptApp}
                    onToggle={() => setAcceptApp((v) => !v)}
                    item={{
                      id: bp.proposed_app.slug,
                      label: bp.proposed_app.title,
                      hint:
                        widgetCountHint(t, bp.proposed_app.widgets) ||
                        bp.proposed_app.description ||
                        bp.proposed_app.rationale,
                    }}
                  />
                </Group>
              )}

              {(bp.proposed_pages?.length ?? 0) > 0 && (
                <Group title={t('solutions.grpPages')} testid="materialize-grp-pages">
                  {bp.proposed_pages!.map((p) => (
                    <Row
                      key={p.slug}
                      testid={`materialize-page-${p.slug}`}
                      checked={acceptPages.has(p.slug)}
                      onToggle={() => toggleIn(setAcceptPages, p.slug)}
                      item={{
                        id: p.slug,
                        label: p.title,
                        hint: widgetCountHint(t, p.widgets) || p.rationale,
                      }}
                    />
                  ))}
                </Group>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3" data-testid="materialize-result">
              <div
                className={
                  'flex items-center gap-2 text-[12px] ' +
                  (hasFailures ? 'text-warning' : 'text-success')
                }
              >
                {hasFailures ? (
                  <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
                )}
                {hasFailures
                  ? t('solutions.buildPartial')
                  : t('solutions.buildSuccess')}
              </div>

              <div className="border border-border-light">
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-on-light bg-canvas-light border-b border-border-light">
                  {t('solutions.createdCounts')}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-2 py-2 text-[11.5px]">
                  <CountRow label={t('solutions.grpSpace')} value={result.materialized.spaces ?? 0} />
                  <CountRow label={t('solutions.grpOperation')} value={result.materialized.projects} />
                  <CountRow label={t('solutions.grpAgents')} value={result.materialized.agents} />
                  <CountRow label={t('solutions.grpFlows')} value={result.materialized.flows} />
                  <CountRow label={t('solutions.grpObjectTypes')} value={result.materialized.ontology_types} />
                  <CountRow label={t('solutions.grpLinks')} value={result.materialized.links ?? 0} />
                  <CountRow label={t('solutions.grpAiFunctions')} value={result.materialized.logic_functions} />
                  <CountRow label={t('solutions.grpActions')} value={result.materialized.action_types} />
                  <CountRow label={t('solutions.grpWorkspace')} value={result.materialized.workspaces} />
                  <CountRow label={t('solutions.grpApp')} value={result.materialized.apps} />
                  <CountRow label={t('solutions.grpPages')} value={result.materialized.pages} />
                  <CountRow label={t('solutions.grpWidgets')} value={result.materialized.widgets} />
                  <CountRow label={t('solutions.grpSources')} value={result.materialized.sources ?? 0} />
                </dl>
              </div>

              {/* B (#1) — a ROTA de cada fonte: Fonte → Tipo de objeto · status.
                  Substitui o contador agregado por algo legível e honesto. */}
              {(result.source_results?.length ?? 0) > 0 && (
                <div className="border border-border-light" data-testid="materialize-source-routes">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-on-light bg-canvas-light border-b border-border-light">
                    {t('solutions.grpSources')}
                  </div>
                  <ul className="px-2 py-2 space-y-1">
                    {result.source_results!.map((s, i) => (
                      <li
                        key={`${s.label}-${i}`}
                        className="flex items-center gap-1.5 text-[11px] text-text-on-light flex-wrap"
                        data-testid="materialize-source-route"
                      >
                        <span className="truncate max-w-[140px]">{s.label}</span>
                        {s.target_node_type ? (
                          <>
                            <ArrowRight className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
                            <span className="font-mono">{typeLabel(s.target_node_type)}</span>
                          </>
                        ) : null}
                        <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light">
                          {sourceActionLabel(t, s.action)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* T2 — avisos de clamp: parâmetros fora dos limites declarados
                  foram AJUSTADOS na construção (não-fatal). Aviso discreto e
                  honesto: cita o recurso + a mensagem do ajuste (valor pedido,
                  limite e valor aplicado). Nunca vira "falha". */}
              {(result.warnings?.length ?? 0) > 0 && (
                <div className="border border-border-light" data-testid="materialize-warnings">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-on-light bg-canvas-light border-b border-border-light">
                    {t('solutions.warnings')}
                  </div>
                  <p className="px-2 pt-1.5 text-[10.5px] text-muted-on-light leading-snug">
                    {t('solutions.warningsHint')}
                  </p>
                  <ul className="px-2 py-2 space-y-1">
                    {result.warnings!.map((w, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-muted-on-light"
                        data-testid="materialize-warning"
                      >
                        <span className="font-mono">{w.name}</span>
                        {' — '}
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasFailures && (
                <div className="border border-warning/40" data-testid="materialize-failures">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-warning bg-warning/5 border-b border-warning/30">
                    {t('solutions.failures')}
                  </div>
                  <ul className="px-2 py-2 space-y-1">
                    {result.failures.map((f, i) => (
                      <li key={i} className="text-[11px] text-text-on-light">
                        <span className="font-mono text-muted-on-light">{f.name}</span>
                        {' — '}
                        {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {result.materialized.projects > 0 && (
                  <a
                    href="/painel-de-controle/operacoes"
                    className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                    data-testid="materialize-view-operations"
                  >
                    {t('solutions.viewOperations')}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </a>
                )}
                {result.materialized.apps > 0 && (
                  <a
                    href="/workshop"
                    className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                    data-testid="materialize-view-apps"
                  >
                    {t('solutions.viewApps')}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </a>
                )}
                {result.materialized.pages > 0 && (
                  <a
                    href="/painel-de-controle/paginas"
                    className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                    data-testid="materialize-view-pages"
                  >
                    {t('solutions.viewPages')}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {err && (
          <div
            className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30"
            data-testid="materialize-error"
          >
            {err}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-light">
          <div className="text-[10.5px] text-muted-on-light">
            {!result && bp && totalSelected === 0 && t('solutions.nothingSelected')}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => onOpenChange(false)}
              data-testid="materialize-close"
            >
              {t('common.close')}
            </Button>
            {!result && (
              <Button
                variant="success"
                className="h-8 text-[11px]"
                onClick={() => void build()}
                disabled={building || !bp || totalSelected === 0}
                data-testid="materialize-build"
              >
                {building ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Hammer className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {building ? t('solutions.building') : t('solutions.build')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-on-light">{label}</dt>
      <dd className="font-mono text-text-on-light">{value}</dd>
    </div>
  );
}
