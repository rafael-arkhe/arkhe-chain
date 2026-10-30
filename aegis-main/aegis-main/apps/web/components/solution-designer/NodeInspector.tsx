'use client';

/**
 * NodeInspector — right pane of the Desenho da Operação 3-pane shell (M4 #9).
 *
 * Shows the selected node's config and the AIP Architect affordances:
 *  - Concept node (except Ontologia): "Selecionar implementação" → list of
 *    AI-generated plans → "Inserir no grafo" expands the concept into
 *    concrete nodes.
 *  - Ontology node: "Gerar modelo de dados" editable prompt → object types.
 *  - "Perguntar à IA" contextual helper (reuses the chat infra).
 *  - Title/description editing + delete node.
 *
 * 3-tab layout (Foundry canonical inspector):
 *  1. Configuração — phase-specific config sections.
 *  2. Metadados — title/description + Sobre/Documentação/Exemplo + raw JSON.
 *  3. Exibição — phase/kind info; styling arrives with Variables engine.
 */
import * as React from 'react';
import { Loader2, Trash2, Boxes, Info, ChevronRight, Settings2 } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InfoTip } from '@/components/ui/info-tip';
import {
  Solutions,
  Skills,
  type SkillCatalogRow,
  type SkillParam,
  type SolutionGraph,
  type SolutionNode,
  type SolutionImplementationPlan,
  type SolutionDataModel,
  type SolutionWizard,
} from '@/lib/api';
import { PHASE_META, kindLabel, componentInfo, type Phase } from './nodeMeta';
import { ConnectDataSection } from './ConnectDataSection';
import { CompatibilityPanel } from './CompatibilityPanel';
import { InferenceConfigSection } from './InferenceConfigSection';
import { ModalityAgentsSection, TransformerConfigSection, type ProposedModalityAgent } from './ModalityAgentsSection';
import { ProcessingModeSelector, type ProcessingMode } from './ProcessingModeSelector';
import { PanelHeader } from './PanelHeader';

/** Active tab in the 3-tab inspector layout. */
type InspectorTab = 'config' | 'metadata' | 'display';

/**
 * Proposed item carried by a concept node (``config.items``) — the AIP
 * Architect's per-phase proposal (label + short detail). Mirrors
 * ``solution_diagram_service._blueprint_phase_items`` on the backend.
 */
interface ProposedItem {
  label: string;
  detail?: string;
}

/** Reads ``config.items`` as a typed list of proposed items (or ``[]``). */
function readItems(config: Record<string, unknown> | undefined): ProposedItem[] {
  const raw = config?.items;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((it) => {
    if (!it || typeof it !== 'object') return [];
    const o = it as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label : '';
    if (!label) return [];
    return [{ label, detail: typeof o.detail === 'string' ? o.detail : undefined }];
  });
}

/**
 * Node-aware concrete settings (#4b): surfaces the node's real ``config``
 * keys (source/layer/schedule/widget count/…) as ``label → value`` rows so
 * the operator sees what the SELECTED node actually carries — never a raw
 * ``kind``/widget ``type`` (always go through ``kindLabel``).
 */
function readSettings(
  config: Record<string, unknown> | undefined,
  t: (k: string) => string,
): Array<{ key: string; value: string }> {
  if (!config) return [];
  const rows: Array<{ key: string; value: string }> = [];
  const push = (key: string, value: unknown) => {
    if (value == null || value === '') return;
    rows.push({ key, value: String(value) });
  };
  push('source', config.source);
  push('schedule', config.schedule);
  push('layer', config.layer);
  push('domain', config.domain);
  push('build', config.build);
  if (Array.isArray(config.widgets) && config.widgets.length) {
    push(t('solutions.histWidgets'), config.widgets.length);
  }
  return rows;
}

/**
 * Formats a skill's param_schema into a readable documentation string.
 * Each param is rendered as a bullet line with key info; the connective text
 * uses translated labels passed in to keep this helper testable without
 * depending on useT() directly.
 */
export function formatParamSchemaDoc(
  params: SkillParam[],
  labels: { required: string },
): string {
  if (!params.length) return '';
  return params
    .map((p) => {
      const req = p.required ? `, ${labels.required}` : '';
      const desc = p.description ? `: ${p.description}` : '';
      return `• ${p.label} (${p.param_type}${req})${desc}`;
    })
    .join('\n');
}

export function NodeInspector({
  node,
  graph,
  wizard,
  onGraphChange,
  onDeleteNode,
  onPatchNode,
  onClose,
}: {
  node: SolutionNode | null;
  graph: SolutionGraph;
  wizard: SolutionWizard;
  onGraphChange: (g: SolutionGraph) => void;
  onDeleteNode: (id: string) => void;
  onPatchNode: (id: string, patch: Partial<SolutionNode>) => void;
  /** Deselect/collapse the inspector (#7 — close button in the header). */
  onClose?: () => void;
}) {
  // TASK 3: panel sizing — min 280px, max 420px, content-driven via auto.
  // Applied on the root div via inline style so parent grid can still track
  // the actual rendered width. No hard 300px column any more.
  const t = useT();
  const [activeTab, setActiveTab] = React.useState<InspectorTab>('config');
  const [plans, setPlans] = React.useState<SolutionImplementationPlan[] | null>(null);
  const [loadingPlans, setLoadingPlans] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<string>('');
  const [inserting, setInserting] = React.useState(false);
  const [modelPrompt, setModelPrompt] = React.useState('');
  const [model, setModel] = React.useState<SolutionDataModel | null>(null);
  const [loadingModel, setLoadingModel] = React.useState(false);
  const [infoTab, setInfoTab] = React.useState<'about' | 'documentation' | 'example' | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // B (#1) — Tipos de objeto disponíveis p/ a Saída do nó de Coleta. Fonte da
  // verdade = o blueprint embutido (casa exatamente o node_type que o materialize
  // cria); fallback = nós ontology_type do diagrama. Sempre dropdown, nunca livre.
  const objectTypes = React.useMemo(() => {
    const out: { kind: string; label: string }[] = [];
    const seen = new Set<string>();
    const push = (kind: string, label: string) => {
      const k = (kind || '').trim();
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push({ kind: k, label: (label || k).trim() });
      }
    };
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = wiz?._blueprint as
      | { ontology_types?: { kind?: string; display_name?: string }[] }
      | undefined;
    for (const o of bp?.ontology_types ?? []) push(String(o.kind || ''), String(o.display_name || o.kind || ''));
    for (const n of graph.nodes) {
      if (n.kind === 'ontology_type') {
        const cfg = n.config as Record<string, unknown> | undefined;
        push(String((cfg?.object_kind as string) || (cfg?.kind as string) || n.title || ''), n.title);
      }
    }
    return out;
  }, [graph]);

  // A skill que o AIP propôs p/ a COLETA — do blueprint embutido. O nó de Coleta
  // lidera por ela (some o "agente invisível") + mostra os parâmetros dela.
  const proposedSkill = React.useMemo(() => {
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = wiz?._blueprint as
      | { proposed_agents?: { phase?: string; kind?: string; skill_key?: string; skill_label?: string; skill_platforms?: string[]; skill_ready?: boolean }[] }
      | undefined;
    const ag = (bp?.proposed_agents || []).find(
      (a) => a.phase === 'coleta' && a.skill_key,
    );
    if (!ag?.skill_key) return null;
    return {
      skill_key: ag.skill_key,
      label: ag.skill_label || ag.skill_key,
      platforms: ag.skill_platforms || [],
      ready: ag.skill_ready ?? true,
    };
  }, [graph]);

  // Prompt que o AIP propôs p/ a INFERÊNCIA (do blueprint logic_functions) — vira
  // o default editável no nó de Processamento. Pega a função "consolidada"/última.
  const proposedInferencePrompt = React.useMemo(() => {
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = wiz?._blueprint as { logic_functions?: { prompt?: string }[] } | undefined;
    const fns = bp?.logic_functions || [];
    const withPrompt = fns.filter((f) => (f.prompt || '').trim());
    return withPrompt.length ? String(withPrompt[withPrompt.length - 1].prompt || '') : '';
  }, [graph]);

  // A logic_function completa proposta p/ o Processamento — usada para popular as
  // abas do inspector (Sobre/Documentação/Exemplo) com dados reais.
  const proposedInference = React.useMemo(() => {
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = wiz?._blueprint as
      | { logic_functions?: { slug?: string; display_name?: string; description?: string; prompt?: string; inputs?: string[] }[] }
      | undefined;
    const fns = bp?.logic_functions || [];
    const withPrompt = fns.filter((f) => (f.prompt || '').trim());
    if (!withPrompt.length) return null;
    const last = withPrompt[withPrompt.length - 1];
    return {
      slug: String(last.slug || ''),
      display_name: String(last.display_name || ''),
      description: String(last.description || ''),
      prompt: String(last.prompt || ''),
      inputs: Array.isArray(last.inputs) ? (last.inputs as string[]) : [],
    };
  }, [graph]);

  // Agentes de modalidade (aegis.*) propostos p/ o Processamento — renderizados
  // abaixo da InferenceConfigSection.
  const proposedModalityAgents = React.useMemo((): ProposedModalityAgent[] => {
    const wiz = graph.wizard as Record<string, unknown> | undefined;
    const bp = wiz?._blueprint as
      | { proposed_agents?: { phase?: string; kind?: string; skill_key?: string; skill_label?: string; skill_platforms?: string[]; skill_ready?: boolean }[] }
      | undefined;
    return (bp?.proposed_agents || [])
      .filter(
        (a) =>
          a.phase === 'processamento' &&
          a.kind === 'worker' &&
          typeof a.skill_key === 'string' &&
          a.skill_key.startsWith('aegis.'),
      )
      .map((a) => ({
        slug: a.skill_key as string,
        label: a.skill_label || (a.skill_key as string),
        platforms: a.skill_platforms || [],
        ready: a.skill_ready ?? true,
      }));
  }, [graph]);

  // Skill metadata do catálogo — buscado lazy quando proposedSkill.skill_key muda.
  // Cache: se skill_key não mudou, não re-fetch.
  const [skillMeta, setSkillMeta] = React.useState<SkillCatalogRow | null>(null);
  const lastFetchedSkillKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    const key = proposedSkill?.skill_key ?? null;
    if (!key || key === lastFetchedSkillKey.current) return;
    lastFetchedSkillKey.current = key;
    void Skills.catalog()
      .then((cat) => {
        const row = cat.find((s) => s.skill_key === key) ?? null;
        setSkillMeta(row);
      })
      .catch(() => {
        /* fail-soft: abas caem no fallback estático */
      });
  }, [proposedSkill?.skill_key]);

  // Reset transient state when the selected node changes.
  React.useEffect(() => {
    setPlans(null);
    setSelectedPlan('');
    setModel(null);
    setErr(null);
    setInfoTab(null);
    setActiveTab('config');
    setModelPrompt(
      typeof node?.config?.prompt === 'string' ? (node.config.prompt as string) : '',
    );
  }, [node?.id]);

  if (!node) {
    return (
      <div
        className="h-full border-l border-border-light bg-canvas-light p-4"
        style={{ minWidth: 280, maxWidth: 420 }}
        data-testid="solutions-inspector"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('solutions.inspector')}
        </p>
        <p className="text-[12px] text-muted-on-light mt-3">
          {t('solutions.inspectorEmpty')}
        </p>
      </div>
    );
  }

  const phase = node.phase as Phase;
  const phaseMeta = PHASE_META[phase] ?? PHASE_META.coleta;
  const isConcept = node.kind === 'concept';
  const isOntology = phase === 'ontologia';
  // #6 — modo de processamento (IA / transformador / ambos). Default 'both'
  // p/ retrocompat: nós antigos sem o campo continuam mostrando tudo.
  const procMode = (((node.config || {}) as Record<string, unknown>).processing_mode as ProcessingMode) || 'both';
  // F4 — blueprint embutido p/ o painel de compatibilidade (diff vs ontologia existente).
  const compatBlueprint = React.useMemo(
    () => ((graph.wizard as Record<string, unknown> | undefined)?._blueprint as
      | import('@/lib/api').SolutionBlueprint
      | undefined) ?? null,
    [graph.wizard],
  );
  // F6 — propriedades do tipo PROPOSTO casado com o node_type do nó de Processamento,
  // p/ a IDE montar o esqueleto contextual mesmo antes de materializar (objectTypeSchema 404).
  const procInputProps = React.useMemo(() => {
    const nt = ((node?.config || {}) as Record<string, unknown>).node_type as string | undefined;
    if (!nt || !compatBlueprint) return undefined;
    const ot = (compatBlueprint.ontology_types || []).find((o) => o.kind === nt);
    return ot?.properties?.map((pp) => ({ key: pp.key, type: pp.type, label: pp.label }));
  }, [node, compatBlueprint]);

  // #4b — node-aware "Sobre o componente": real data carried by THIS node.
  const meta = componentInfo(node.kind);
  const items = readItems(node.config);
  const settings = readSettings(node.config, t);
  const promptHint =
    typeof node.config?.prompt === 'string' ? (node.config.prompt as string) : '';
  // cfg: typed shorthand for node.config used in Metadados/Exibição structured facts.
  const cfg = (node.config ?? {}) as Record<string, unknown>;

  // Feature 1 — effectiveMeta overrides the static componentInfo when real data
  // is available: skill catalog row (coleta) or logic_function (processamento).
  // Plain const (not useMemo) because it depends on node-derived values computed
  // after the early-return guard above.
  const effectiveMeta = (() => {
    // Processamento phase: use logic_function data.
    if (phase === 'processamento' && proposedInference) {
      const inf = proposedInference;
      const docInputs =
        inf.inputs.length
          ? `${t('solutions.inferenceDocInputs')}: ${inf.inputs.join(', ')}`
          : t('solutions.inferenceDocNoInputs');
      const example = t('solutions.inferenceExampleConfigure').replace('{name}', inf.display_name || inf.slug);
      return {
        about: inf.description || meta.about,
        documentation: docInputs,
        example,
      };
    }
    // Coleta phase: use skill catalog row.
    if (skillMeta) {
      const requiredLabel = t('solutions.skillDocParamRequired');
      const paramDoc = formatParamSchemaDoc(skillMeta.param_schema, { required: requiredLabel });
      const documentation = paramDoc || t('solutions.skillDocNoParams');
      const firstRequired = skillMeta.param_schema.find((p) => p.required);
      const example = firstRequired
        ? t('solutions.skillExampleConfigure')
            .replace('{label}', skillMeta.label)
            .replace('{param}', firstRequired.label)
        : t('solutions.skillExampleNoParam').replace('{label}', skillMeta.label);
      return {
        about: skillMeta.description || meta.about,
        documentation,
        example,
      };
    }
    // Fallback: static componentInfo.
    return meta;
  })();

  async function loadImplementations() {
    if (!node) return;
    setErr(null);
    setLoadingPlans(true);
    try {
      const r = await Solutions.implementations(graph, node.id, wizard.requirements || '', wizard);
      setPlans(r);
      if (r.length) setSelectedPlan(r[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPlans(false);
    }
  }

  async function insertIntoGraph() {
    if (!node || !selectedPlan) return;
    setErr(null);
    setInserting(true);
    try {
      const g = await Solutions.expandNode(graph, node.id, selectedPlan, wizard);
      onGraphChange(g);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setInserting(false);
    }
  }

  async function generateModel() {
    setErr(null);
    setLoadingModel(true);
    try {
      const m = await Solutions.ontologyModel(modelPrompt || 'tipos de objeto da operação');
      setModel(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModel(false);
    }
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────
  const TABS: { id: InspectorTab; labelKey: string; testId: string }[] = [
    { id: 'config',   labelKey: 'nodeTabs.config',   testId: 'node-tab-config' },
    { id: 'metadata', labelKey: 'nodeTabs.metadata', testId: 'node-tab-metadata' },
    { id: 'display',  labelKey: 'nodeTabs.display',  testId: 'node-tab-display' },
  ];

  return (
    <div
      className="h-full border-l border-border-light bg-canvas-light flex flex-col"
      style={{ minWidth: 280, maxWidth: 420 }}
      data-testid="solutions-inspector"
    >
      {/* ── Header de painel consistente (#11) — título + excluir/fechar ──── */}
      <PanelHeader
        icon={Settings2}
        title={t('solutions.inspector')}
        titleTestId="inspector-panel-title"
        onClose={onClose}
        closeTestId="inspector-close"
        closeLabel={t('solutions.closeInspector')}
        actions={
          <button
            type="button"
            onClick={() => onDeleteNode(node.id)}
            aria-label={t('solutions.deleteNode')}
            data-testid="inspector-delete"
            className="text-muted-on-light hover:text-danger"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        }
      />

      {/* Fase + tipo do nó (faixa abaixo do header) */}
      <div className="flex-none px-3 py-2 space-y-1 border-b border-border-light">
        <div className={`text-[9px] uppercase tracking-widest ${phaseMeta.tone}`}>
          {phaseMeta.label}
        </div>
        {!isConcept && (
          <p className="text-[10.5px] text-muted-on-light">
            {kindLabel(node.kind)}
          </p>
        )}
      </div>

      {/* ── Tab bar — sticky so it stays visible when content scrolls ───── */}
      <div className="flex-none flex border-b border-border-light" role="tablist" aria-label={t('solutions.inspector')}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`node-tabpanel-${tab.id}`}
              id={`node-tab-${tab.id}`}
              data-testid={tab.testId}
              onClick={() => setActiveTab(tab.id)}
              className={
                'flex-1 px-2 py-2 text-[10px] uppercase tracking-wider border-b-2 transition-colors ' +
                (active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-on-light hover:text-text-on-light')
              }
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* ── Tab panels — flex-1+overflow-auto so they scroll inside the panel ─ */}

      {/* ── 1. Configuração ─────────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <div
          id="node-tabpanel-config"
          role="tabpanel"
          aria-labelledby="node-tab-config"
          data-testid="node-tabpanel-config"
          className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3"
        >
          {err && (
            <div className="px-2 py-1.5 text-[10.5px] font-mono text-danger bg-danger/5 border border-danger/30">
              {err}
            </div>
          )}

          {/* #1 — nós de COLETA: vincular fonte/conector/dataset existente. */}
          {phase === 'coleta' && (
            <ConnectDataSection node={node} onPatchNode={onPatchNode} objectTypes={objectTypes} proposedSkill={proposedSkill} />
          )}

          {/* #6 — modo de processamento: IA, transformador (código) ou ambos.
              Transformers são primeira-classe; o operador não é forçado a usar
              LLM. Default 'both' p/ retrocompat com diagramas antigos. */}
          {phase === 'processamento' && (
            <ProcessingModeSelector
              mode={procMode}
              onModeChange={(m) =>
                onPatchNode(node.id, {
                  config: { ...((node.config || {}) as Record<string, unknown>), processing_mode: m },
                })
              }
            />
          )}

          {phase === 'processamento' && procMode !== 'transformer' && (
            <InferenceConfigSection node={node} onPatchNode={onPatchNode} proposedPrompt={proposedInferencePrompt} inputProps={procInputProps} />
          )}

          {phase === 'processamento' && procMode !== 'transformer' && proposedModalityAgents.length > 0 && (
            <ModalityAgentsSection
              agents={proposedModalityAgents}
              // #7 — persiste os params dos agentes de modalidade (antes caíam num no-op e
              // NÃO salvavam). Guardados em node.config.modality_agent_params[slug]. Os
              // campos de texto aceitam `{{campo}}` (mesmas variáveis da amostra/objeto).
              agentParamValues={
                (((node.config || {}) as Record<string, unknown>)
                  .modality_agent_params as Record<string, Record<string, unknown>>) || {}
              }
              onAgentParamChange={(slug, key, value) => {
                const cfg = (node.config || {}) as Record<string, unknown>;
                const all = (cfg.modality_agent_params as Record<string, Record<string, unknown>>) || {};
                onPatchNode(node.id, {
                  config: {
                    ...cfg,
                    modality_agent_params: { ...all, [slug]: { ...(all[slug] || {}), [key]: value } },
                  },
                });
              }}
            />
          )}

          {phase === 'processamento' && procMode !== 'inference' && (
            <TransformerConfigSection
              transformerFunction={(((node.config || {}) as Record<string, unknown>).transformer_function as string) || ''}
              nodeType={(((node.config || {}) as Record<string, unknown>).node_type as string) || undefined}
              outputProperty={(((node.config || {}) as Record<string, unknown>).output_property as string) || undefined}
              onChangeTransformerFunction={(slug) =>
                onPatchNode(node.id, {
                  config: { ...((node.config || {}) as Record<string, unknown>), transformer_function: slug },
                })
              }
              onChangeNodeType={(kind) =>
                onPatchNode(node.id, {
                  config: { ...((node.config || {}) as Record<string, unknown>), node_type: kind },
                })
              }
              onChangeOutputProperty={(prop) =>
                onPatchNode(node.id, {
                  config: { ...((node.config || {}) as Record<string, unknown>), output_property: prop },
                })
              }
              inputProps={procInputProps}
            />
          )}

          {/* F4 — Ontology node: compatibilidade da operação com a ontologia existente. */}
          {isOntology && <CompatibilityPanel blueprint={compatBlueprint} />}

          {/* Ontology node — Generate data model */}
          {isOntology && (
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
                {t('solutions.generateDataModel')}
                <InfoTip text={t('solutions.generateDataModelHint')} />
              </Label>
              {/* #16 — explica o que o botão FAZ (era ambíguo "pra que serve?"). */}
              <p className="text-[10px] text-muted-on-light leading-snug" data-testid="inspector-model-intro">
                {t('solutions.generateDataModelIntro')}
              </p>
              <textarea
                value={modelPrompt}
                onChange={(e) => setModelPrompt(e.target.value)}
                rows={3}
                placeholder={t('solutions.generateDataModelPlaceholder')}
                className="w-full text-[11.5px] bg-white border border-border-light px-2 py-1.5 focus:border-primary outline-none"
                data-testid="inspector-model-prompt"
              />
              <Button
                variant="default"
                className="h-8 w-full text-[11px]"
                onClick={generateModel}
                disabled={loadingModel}
                data-testid="inspector-generate-model"
              >
                {loadingModel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Boxes className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {t('solutions.generateDataModel')}
              </Button>
              {model && (
                <div className="space-y-1.5" data-testid="inspector-model-result">
                  {model.object_types.map((o) => (
                    <div key={o.kind} className="bg-white border border-border-light p-1.5">
                      <p className="text-[11.5px] font-semibold text-text-on-light">
                        {o.kind}
                      </p>
                      <p className="text-[10px] font-mono text-muted-on-light">
                        {o.properties.map((p) => p.key).join(', ')}
                      </p>
                    </div>
                  ))}
                  {model.link_types.length > 0 && (
                    <p className="text-[10px] text-muted-on-light">
                      Vínculos: {model.link_types.map((l) => l.label).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* #18 — nó de aplicação: a aba parecia "vazia". Explica que esses nós
              são ESTRUTURAIS (entregam a interface) — a config real (widgets,
              páginas, ações) vem na materialização; aqui só o desdobramento + IA. */}
          {phase === 'aplicacao' && !isConcept && (
            <div className="border border-border-light bg-canvas-light p-2" data-testid="inspector-aplicacao-info">
              <p className="text-[10px] text-muted-on-light leading-snug">
                {t('solutions.aplicacaoConfigInfo')}
              </p>
            </div>
          )}

          {/* Concept node (non-ontology) — Select implementation */}
          {isConcept && !isOntology && (
            <div className="space-y-2">
              {/* #5 — explica o que faz (era totalmente ambíguo p/ o operador). */}
              <p className="text-[10px] text-muted-on-light leading-snug" data-testid="inspector-select-impl-intro">
                {t('solutions.selectImplementationIntro')}
              </p>
              <Button
                variant="outline"
                className="h-8 w-full text-[11px]"
                onClick={loadImplementations}
                disabled={loadingPlans}
                data-testid="inspector-select-implementation"
              >
                {loadingPlans ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : null}
                {t('solutions.selectImplementation')}
              </Button>
              {plans && plans.length > 0 && (
                <div className="space-y-1.5" data-testid="inspector-plans">
                  {plans.map((p) => (
                    <label
                      key={p.id}
                      className={
                        'block bg-white border p-1.5 cursor-pointer ' +
                        (selectedPlan === p.id ? 'border-primary' : 'border-border-light')
                      }
                      data-testid={`plan-${p.id}`}
                    >
                      <div className="flex items-start gap-1.5">
                        <input
                          type="radio"
                          name="impl-plan"
                          checked={selectedPlan === p.id}
                          onChange={() => setSelectedPlan(p.id)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-[11.5px] font-semibold text-text-on-light">
                            {p.title}
                          </p>
                          <p className="text-[10px] text-muted-on-light">{p.summary}</p>
                          <p className="text-[9px] font-mono text-muted-on-light mt-0.5">
                            {p.nodes.map((n) => kindLabel(n.kind)).join(' → ')}
                          </p>
                        </div>
                      </div>
                    </label>
                  ))}
                  <Button
                    variant="success"
                    className="h-8 w-full text-[11px]"
                    onClick={insertIntoGraph}
                    disabled={inserting || !selectedPlan}
                    data-testid="inspector-insert-graph"
                  >
                    {inserting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    ) : null}
                    {t('solutions.insertIntoGraph')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Ask AI — feeds the docked AIP Arquiteto chat with THIS node as
              context (kind + label + phase + the proposed content it carries),
              so the operator can ask about the selected node (#4a). The page
              listens for ``aegis:aip-assist`` to open + seed the chat composer. */}
          <div className="border-t border-border-light pt-3 space-y-1.5">
            <p className="text-[10px] text-muted-on-light leading-relaxed">
              {t('solutions.askAipAbout')}
            </p>
            <Button
              variant="outline"
              className="h-8 w-full text-[11px] justify-start"
              data-testid="inspector-ask-aip"
              onClick={() => {
                // Compose a ready-to-send question grounded in the node's data.
                const lines: string[] = [
                  `Sobre o nó "${node.title}" (${kindLabel(node.kind)}) na fase ${phaseMeta.label}:`,
                ];
                const purpose = node.description?.trim() || meta.about;
                if (purpose) lines.push(`Função pretendida: ${purpose}`);
                if (items.length) {
                  lines.push(
                    `O que ele carrega: ${items.map((i) => i.label).join(', ')}.`,
                  );
                } else if (promptHint) {
                  lines.push(`Modelo proposto: ${promptHint}`);
                }
                lines.push(
                  'Explique o que esse nó faz, como configurá-lo e como ele se conecta ao restante da operação.',
                );
                const prompt = lines.join('\n');
                window.dispatchEvent(
                  new CustomEvent('aegis:aip-assist', {
                    detail: {
                      nodeId: node.id,
                      kind: node.kind,
                      label: kindLabel(node.kind),
                      phase: phaseMeta.label,
                      title: node.title,
                      // Short summary kept for any listener that wants a label…
                      context: `Nó "${node.title}" (${kindLabel(node.kind)}) na fase ${phaseMeta.label} do Desenho da Operação.`,
                      // …and the full, ready-to-send question for the composer.
                      prompt,
                    },
                  }),
                );
              }}
            >
              {t('solutions.askAip')}
            </Button>
          </div>
        </div>
      )}

      {/* ── 2. Metadados ─────────────────────────────────────────────────── */}
      {activeTab === 'metadata' && (
        <div
          id="node-tabpanel-metadata"
          role="tabpanel"
          aria-labelledby="node-tab-metadata"
          data-testid="node-tabpanel-metadata"
          className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3"
        >
          {/* Title — editable */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              {t('solutions.nodeTitle')}
            </Label>
            <input
              value={node.title}
              onChange={(e) => onPatchNode(node.id, { title: e.target.value })}
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none"
              data-testid="inspector-title"
            />
          </div>

          {/* Description — editable */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              {t('solutions.nodeDescription')}
            </Label>
            <textarea
              value={node.description || ''}
              onChange={(e) => onPatchNode(node.id, { description: e.target.value })}
              rows={2}
              className="w-full text-[11.5px] bg-white border border-border-light px-2 py-1.5 focus:border-primary outline-none"
              data-testid="inspector-description"
            />
          </div>

          {/* TASK 2: Structured facts — what this node will actually do. */}
          <div className="border-t border-border-light pt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1.5">
              {t('nodeTabs.metaFacts')}
            </p>
            <dl
              className="border border-border-light divide-y divide-border-light"
              data-testid="inspector-meta-facts"
            >
              {/* Phase */}
              <div className="flex items-start gap-2 px-2 py-1.5">
                <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                  {t('nodeTabs.metaFactPhase')}
                </dt>
                <dd className={`text-[11px] ${phaseMeta.tone}`}>
                  {phaseMeta.label}
                </dd>
              </div>
              {/* Kind */}
              <div className="flex items-start gap-2 px-2 py-1.5">
                <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                  {t('nodeTabs.metaFactKind')}
                </dt>
                <dd className="text-[11px] text-text-on-light">
                  {kindLabel(node.kind)}
                </dd>
              </div>
              {/* Skill — shown only when a skill is bound */}
              {proposedSkill && (
                <div className="flex items-start gap-2 px-2 py-1.5" data-testid="meta-fact-skill">
                  <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                    {t('nodeTabs.metaFactSkill')}
                  </dt>
                  <dd className="text-[11px] text-text-on-light">
                    {proposedSkill.label}
                  </dd>
                </div>
              )}
              {/* Inference model */}
              {(cfg?.inference_model as string | undefined) && (
                <div className="flex items-start gap-2 px-2 py-1.5" data-testid="meta-fact-model">
                  <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                    {t('nodeTabs.metaFactModel')}
                  </dt>
                  <dd className="text-[11px] text-text-on-light font-mono">
                    {String(cfg?.inference_model)}
                  </dd>
                </div>
              )}
              {/* Output object type */}
              {(cfg?.output_object_type as string | undefined) && (
                <div className="flex items-start gap-2 px-2 py-1.5" data-testid="meta-fact-object-type">
                  <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                    {t('nodeTabs.metaFactObjectType')}
                  </dt>
                  <dd className="text-[11px] text-text-on-light">
                    {String(cfg?.output_object_type)}
                  </dd>
                </div>
              )}
              {/* Transformer function slug */}
              {(cfg?.transformer_function as string | undefined) && (
                <div className="flex items-start gap-2 px-2 py-1.5" data-testid="meta-fact-transformer">
                  <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                    {t('nodeTabs.metaFactTransformer')}
                  </dt>
                  <dd className="text-[11px] text-text-on-light font-mono">
                    {String(cfg?.transformer_function)}
                  </dd>
                </div>
              )}
              {/* Variables count */}
              {Array.isArray(cfg?.inference_variables) && (cfg!.inference_variables as unknown[]).length > 0 && (
                <div className="flex items-start gap-2 px-2 py-1.5" data-testid="meta-fact-variables">
                  <dt className="text-[9px] uppercase tracking-wider text-muted-on-light w-28 shrink-0 pt-0.5">
                    {t('nodeTabs.metaFactVariables')}
                  </dt>
                  <dd className="text-[11px] text-text-on-light">
                    {(cfg!.inference_variables as unknown[]).length}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Component information — About / Documentation / Example (control #3). */}
          <div className="border-t border-border-light pt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
              <Info className="w-3 h-3" strokeWidth={1.5} />
              {t('solutions.componentInfo')}
            </p>
            <div className="mt-1.5 border border-border-light" data-testid="inspector-component-info">
              {(
                [
                  ['about', 'solutions.about'],
                  ['documentation', 'solutions.documentation'],
                  ['example', 'solutions.example'],
                ] as const
              ).map(([key, labelKey]) => {
                const open = infoTab === key;
                return (
                  <div key={key} className="border-b border-border-light last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setInfoTab(open ? null : key)}
                      aria-expanded={open}
                      data-testid={`info-${key}`}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-text-on-light hover:bg-white"
                    >
                      <ChevronRight
                        className={'w-3 h-3 transition-transform ' + (open ? 'rotate-90' : '')}
                        strokeWidth={1.5}
                      />
                      {t(labelKey)}
                    </button>
                    {open && key === 'about' ? (
                      <div
                        className="px-2 pb-2 space-y-2"
                        data-testid="info-body-about"
                      >
                        {/* Kind + phase + title of THIS node (never a raw kind). */}
                        <dl className="space-y-1">
                          <div>
                            <dt className="text-[9px] uppercase tracking-wider text-muted-on-light">
                              {t('solutions.aboutNodeKind')}
                            </dt>
                            <dd className="text-[11px] text-text-on-light">
                              {kindLabel(node.kind)} · {node.title}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[9px] uppercase tracking-wider text-muted-on-light">
                              {t('solutions.aboutNodePhase')}
                            </dt>
                            <dd className={`text-[11px] ${phaseMeta.tone}`}>
                              {phaseMeta.label}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[9px] uppercase tracking-wider text-muted-on-light">
                              {t('solutions.aboutNodePurpose')}
                            </dt>
                            <dd className="text-[10.5px] text-muted-on-light leading-relaxed">
                              {node.description?.trim() || effectiveMeta.about}
                            </dd>
                          </div>
                        </dl>

                        {/* Proposed content carried from the blueprint. */}
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-muted-on-light">
                            {t('solutions.aboutNodeProposes')}
                          </p>
                          {items.length > 0 ? (
                            <ul
                              className="mt-1 space-y-1"
                              data-testid="info-node-items"
                            >
                              {items.map((it, i) => (
                                <li
                                  key={`${it.label}-${i}`}
                                  className="bg-white border border-border-light px-1.5 py-1"
                                >
                                  <p className="text-[11px] text-text-on-light">
                                    {it.label}
                                  </p>
                                  {it.detail && (
                                    <p className="text-[10px] text-muted-on-light leading-relaxed">
                                      {it.detail}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : promptHint ? (
                            <p className="mt-1 text-[10.5px] text-muted-on-light leading-relaxed">
                              {promptHint}
                            </p>
                          ) : (
                            <p className="mt-1 text-[10px] text-muted-on-light italic">
                              {t('solutions.aboutNodeProposesEmpty')}
                            </p>
                          )}
                        </div>

                        {/* Concrete settings the node carries (source/layer/…). */}
                        {settings.length > 0 && (
                          <div data-testid="info-node-settings">
                            <p className="text-[9px] uppercase tracking-wider text-muted-on-light">
                              {t('solutions.aboutNodeSettings')}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {settings.map((s) => (
                                <li
                                  key={s.key}
                                  className="text-[10px] font-mono text-muted-on-light"
                                >
                                  <span className="text-text-on-light">{s.key}</span>
                                  {' · '}
                                  {s.value}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : open ? (
                      <p
                        className="px-2 pb-2 text-[10.5px] text-muted-on-light leading-relaxed whitespace-pre-line"
                        data-testid={`info-body-${key}`}
                      >
                        {effectiveMeta[key]}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* #8 — Raw JSON é detalhe AVANÇADO: colapsado por default (não polui o
              inspetor do operador comum; quem quer, clica e abre). */}
          <details className="border-t border-border-light pt-3 group" data-testid="inspector-raw-json-details">
            <summary className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-on-light cursor-pointer list-none hover:text-text-on-light">
              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" strokeWidth={1.5} />
              {t('nodeTabs.rawJson')}
            </summary>
            <pre
              className="mt-1.5 text-[9.5px] font-mono text-muted-on-light bg-white border border-border-light p-2 overflow-auto max-h-48 whitespace-pre-wrap break-all"
              data-testid="inspector-raw-json"
            >
              {JSON.stringify(node.config ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* ── 3. Exibição ──────────────────────────────────────────────────── */}
      {activeTab === 'display' && (
        <div
          id="node-tabpanel-display"
          role="tabpanel"
          aria-labelledby="node-tab-display"
          data-testid="node-tabpanel-display"
          className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3"
        >
          {/* Phase + kind — read-only identifiers for this node. */}
          <dl className="space-y-2">
            <div>
              <dt className="text-[9px] uppercase tracking-wider text-muted-on-light">
                {t('nodeTabs.displayPhase')}
              </dt>
              <dd className={`text-[11px] ${phaseMeta.tone}`}>
                {phaseMeta.label}
              </dd>
            </div>
            <div>
              <dt className="text-[9px] uppercase tracking-wider text-muted-on-light">
                {t('nodeTabs.displayKind')}
              </dt>
              <dd className="text-[11px] text-text-on-light">
                {kindLabel(node.kind)}
              </dd>
            </div>
          </dl>

          {/* TASK 2: Real graph connectivity — inbound/outbound edges. */}
          {(() => {
            const inboundEdges = graph.edges.filter((e) => e.target === node.id);
            const outboundEdges = graph.edges.filter((e) => e.source === node.id);
            const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

            if (inboundEdges.length === 0 && outboundEdges.length === 0) {
              return (
                <p
                  className="text-[10.5px] text-muted-on-light italic border-t border-border-light pt-3"
                  data-testid="inspector-display-isolated"
                >
                  {t('nodeTabs.displayIsolated')}
                </p>
              );
            }

            return (
              <div className="border-t border-border-light pt-3 space-y-2" data-testid="inspector-display-connectivity">
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
                  {t('nodeTabs.displayConnectivity')}
                </p>

                {inboundEdges.length > 0 && (
                  <div data-testid="inspector-display-inbound">
                    <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                      {t('nodeTabs.displayConsumes')} ({inboundEdges.length})
                    </p>
                    <ul className="space-y-0.5">
                      {inboundEdges.map((e) => {
                        const src = nodesById.get(e.source);
                        return (
                          <li key={e.id} className="flex items-center gap-1.5 text-[10.5px] border border-border-light/60 px-1.5 py-1 bg-canvas-light">
                            <span className="text-text-on-light truncate">{src?.title ?? e.source}</span>
                            {src && (
                              <span className={`text-[9px] font-mono ${(PHASE_META[src.phase as Phase] ?? PHASE_META.coleta).tone} shrink-0`}>
                                {(PHASE_META[src.phase as Phase] ?? PHASE_META.coleta).label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {outboundEdges.length > 0 && (
                  <div data-testid="inspector-display-outbound">
                    <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-1">
                      {t('nodeTabs.displayProduces')} ({outboundEdges.length})
                    </p>
                    <ul className="space-y-0.5">
                      {outboundEdges.map((e) => {
                        const tgt = nodesById.get(e.target);
                        return (
                          <li key={e.id} className="flex items-center gap-1.5 text-[10.5px] border border-border-light/60 px-1.5 py-1 bg-canvas-light">
                            <span className="text-text-on-light truncate">{tgt?.title ?? e.target}</span>
                            {tgt && (
                              <span className={`text-[9px] font-mono ${(PHASE_META[tgt.phase as Phase] ?? PHASE_META.coleta).tone} shrink-0`}>
                                {(PHASE_META[tgt.phase as Phase] ?? PHASE_META.coleta).label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Note about styling — remains as a compact footer note. */}
          <p
            className="text-[10px] text-muted-on-light leading-relaxed border-t border-border-light pt-3"
            data-testid="inspector-display-note"
          >
            {t('nodeTabs.displayNote')}
          </p>
        </div>
      )}
    </div>
  );
}
