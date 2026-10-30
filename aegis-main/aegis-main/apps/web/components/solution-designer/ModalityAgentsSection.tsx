'use client';

/**
 * ModalityAgentsSection — agentes de modalidade (aegis.*) no nó Processamento.
 *
 * Task 4 additions per agent:
 *   - Expandable "Como usar" description from per-modality help map.
 *   - "Configurar" reveals skill params via SchemaForm (dynamic dropdowns from Task 1).
 *   - "Transformador (código)" section: picks an existing Code Function or opens an
 *     INLINE editor (Dialog) — never navigates away from the panel.
 *
 * Invariants: sharp, sem emoji, sem rounded-*, strings via useT().
 */
import * as React from 'react';
import {
  Cpu,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Settings,
  Code2,
  Pencil,
  Plus,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import type { DictKey } from '@/lib/i18n/dict';
import { Skills, Functions, type SkillCatalogRow } from '@/lib/api';
import { SchemaForm } from '@/components/ui/schema-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SandboxIDE } from '@/components/dev/sandbox-ide';
import { DynamicRefSelect } from '@/components/ui/param-ref-select';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { InfoTip } from '@/components/ui/info-tip';

/** Um agente de modalidade proposto pelo AIP (aegis.*). */
export interface ProposedModalityAgent {
  slug: string;
  label: string;
  platforms: string[];
  ready: boolean;
}

// ─── Per-modality help content ────────────────────────────────────────────────

// Conteúdo de ajuda por modalidade — agora via i18n (useT), não strings
// _pt/_en hardcoded (o render só usava _pt → en-US mostrava português).
type ModalityHelpKeys = { use: DictKey; edits: DictKey };

const MODALITY_HELP_KEYS: Record<string, ModalityHelpKeys> = {
  vision: { use: 'solutions.modalityHelpVisionUse', edits: 'solutions.modalityHelpVisionEdits' },
  audio: { use: 'solutions.modalityHelpAudioUse', edits: 'solutions.modalityHelpAudioEdits' },
  image: { use: 'solutions.modalityHelpImageUse', edits: 'solutions.modalityHelpImageEdits' },
};

function getModalityHelp(slug: string): ModalityHelpKeys {
  // Deriva a modalidade do sufixo do slug (aegis.vision, aegis.audio, …).
  const key = slug.split('.').pop() ?? '';
  return (
    MODALITY_HELP_KEYS[key] ?? {
      use: 'solutions.modalityHelpGenericUse',
      edits: 'solutions.modalityHelpGenericEdits',
    }
  );
}

// ─── Single agent row ─────────────────────────────────────────────────────────

function ModalityAgentRow({
  agent,
  skillCatalog,
  paramValues,
  onParamChange,
}: {
  agent: ProposedModalityAgent;
  skillCatalog: SkillCatalogRow | null;
  paramValues: Record<string, unknown>;
  onParamChange: (slug: string, key: string, value: unknown) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = React.useState(false);
  const [configOpen, setConfigOpen] = React.useState(false);

  const help = getModalityHelp(agent.slug);

  return (
    <div
      className="border border-border-light bg-canvas-light"
      data-testid={`modality-agent-${agent.slug}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 flex-wrap p-2">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          data-testid={`modality-agent-${agent.slug}-expand`}
          className="flex items-center gap-1 text-[11px] font-semibold text-text-on-light hover:text-primary"
        >
          <ChevronRight
            className={'w-3 h-3 transition-transform ' + (expanded ? 'rotate-90' : '')}
            strokeWidth={1.5}
          />
          {agent.label}
        </button>
        {(agent.platforms || []).map((p) => (
          <span
            key={p}
            className="text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-panel-light text-muted-on-light border-border-light"
          >
            {p}
          </span>
        ))}
        {agent.ready ? (
          <span
            className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-success/10 text-success border-success/30"
            data-testid={`modality-agent-${agent.slug}-ready`}
          >
            <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.5} />
            {t('solutions.skillReady')}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-warning/10 text-warning border-warning/30"
            data-testid={`modality-agent-${agent.slug}-pending`}
          >
            <AlertTriangle className="w-2.5 h-2.5" strokeWidth={1.5} />
            {t('solutions.skillNeedsActivation')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setConfigOpen((o) => !o)}
          data-testid={`modality-agent-${agent.slug}-configure`}
          className="ml-auto flex items-center gap-1 h-6 px-2 text-[10px] border border-border-light hover:border-primary hover:text-primary"
        >
          <Settings className="w-3 h-3" strokeWidth={1.5} />
          {configOpen ? t('solutions.modalityAgentCollapseConfig') : t('solutions.modalityAgentConfigure')}
        </button>
      </div>

      {/* "Como usar" expanded section */}
      {expanded && (
        <div className="border-t border-border-light px-2 py-2 space-y-1.5 bg-raised-light/20">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-0.5">
              {t('solutions.modalityAgentHowToUse')}
            </p>
            <p className="text-[10.5px] text-text-on-light leading-relaxed">
              {t(help.use)}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-on-light font-mono mb-0.5">
              {t('solutions.modalityAgentWhereEdits')}
            </p>
            <p className="text-[10px] text-muted-on-light leading-relaxed">
              {t(help.edits)}
            </p>
          </div>
        </div>
      )}

      {/* Params config section */}
      {configOpen && (
        <div
          className="border-t border-border-light px-2 py-2"
          data-testid={`modality-agent-${agent.slug}-params`}
        >
          {skillCatalog === null ? (
            <p className="text-[10px] text-muted-on-light italic">
              {t('solutions.modalityAgentLoadingParams')}
            </p>
          ) : skillCatalog.param_schema.length === 0 ? (
            <p className="text-[10px] text-muted-on-light italic">
              {t('solutions.modalityAgentNoParams')}
            </p>
          ) : (
            <SchemaForm
              params={skillCatalog.param_schema}
              values={paramValues}
              onChange={(key, value) => onParamChange(agent.slug, key, value)}
              testidPrefix={`modality-agent-${agent.slug}`}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function ModalityAgentsSection({
  agents,
  agentParamValues = {},
  onAgentParamChange,
}: {
  agents: ProposedModalityAgent[];
  /** slug → Record<paramKey, value> */
  agentParamValues?: Record<string, Record<string, unknown>>;
  onAgentParamChange?: (slug: string, key: string, value: unknown) => void;
}) {
  const t = useT();
  const [catalog, setCatalog] = React.useState<SkillCatalogRow[]>([]);

  React.useEffect(() => {
    if (agents.length === 0) return;
    void Skills.catalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, [agents.length]);

  if (agents.length === 0) return null;

  return (
    <div
      className="border-t border-border-light pt-3 space-y-2"
      data-testid="modality-agents"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
        <Cpu className="w-3 h-3" strokeWidth={1.5} />
        {t('solutions.modalityAgents')}
      </p>

      {agents.map((agent) => {
        const skillRow = catalog.find((s) => s.skill_key === agent.slug) ?? null;
        return (
          <ModalityAgentRow
            key={agent.slug}
            agent={agent}
            skillCatalog={skillRow}
            paramValues={agentParamValues[agent.slug] ?? {}}
            onParamChange={onAgentParamChange ?? (() => {})}
          />
        );
      })}
    </div>
  );
}

// ─── TransformerConfigSection (Task 4.3 + Task 1 inline IDE) ────────────────

/**
 * Transformer (código) — permite ao operador vincular uma Code Function ao nó
 * de Processamento. A função roda antes da inferência para pré-processar dados.
 *
 * Task 1: "Editar transformador" / "Novo transformador" abre o SandboxIDE
 * em um Dialog inline — o operador edita + salva SEM sair do painel.
 * Após salvar, o dropdown é atualizado e a função é selecionada automaticamente.
 *
 * Usa Functions.list() da lib/api para o dropdown.
 */
export function TransformerConfigSection({
  transformerFunction,
  onChangeTransformerFunction,
  nodeType,
  outputProperty,
  onChangeNodeType,
  onChangeOutputProperty,
  inputProps,
}: {
  transformerFunction: string;
  onChangeTransformerFunction: (slug: string) => void;
  /** F1 — kind do tipo de objeto do nó: alimenta o esquema de entrada da IDE. */
  nodeType?: string;
  /** F1 — propriedade de saída do nó (destacada no esquema de entrada). */
  outputProperty?: string;
  /** F6 — operador declara o tipo processado / propriedade de saída → contexto da IDE. */
  onChangeNodeType?: (kind: string) => void;
  onChangeOutputProperty?: (prop: string) => void;
  /** F6 — propriedades do tipo PROPOSTO (do blueprint) p/ o esqueleto da IDE. */
  inputProps?: { key: string; type?: string; label?: string }[];
}) {
  const t = useT();
  const [functions, setFunctions] = React.useState<Array<{ slug: string; display_name: string }> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [ideOpen, setIdeOpen] = React.useState(false);
  // #3 — IDE em tela cheia (maximiza o modal p/ editar transformers complexos).
  const [ideFull, setIdeFull] = React.useState(false);
  // F6 — código atual da IDE (surfaciado via onCodeChange) + estado do salvar.
  const codeRef = React.useRef<string>('');
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);

  const loadFunctions = React.useCallback(() => {
    setLoading(true);
    void Functions.list()
      .then(setFunctions)
      .catch(() => setFunctions([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadFunctions();
  }, [loadFunctions]);

  const selectedFn = functions?.find((f) => f.slug === transformerFunction) ?? null;

  // After IDE is closed (saved), refresh functions list and re-select if needed.
  const handleIdeClose = React.useCallback(() => {
    setIdeOpen(false);
    setIdeFull(false); // #3 — reseta tela cheia ao fechar
    // Refresh list in case a new function was created.
    loadFunctions();
  }, [loadFunctions]);

  // F6 — SALVAR E VINCULAR: persiste o código da IDE como Code Function e o vincula
  // ao nó (transformer_function). Antes, este botão só fechava o modal → o código
  // se perdia. Slug estável derivado do tipo processado (re-salvar atualiza o source).
  const handleSaveAndLink = React.useCallback(async () => {
    const src = (codeRef.current || '').trim();
    if (!src) { setIdeOpen(false); return; }
    setSaving(true); setSaveErr(null);
    try {
      const base =
        (nodeType || 'operacao').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') ||
        'op';
      const slug = transformerFunction || `transform_${base}`;
      await Functions.create({
        slug,
        display_name: `Transformador de ${nodeType || 'operação'}`,
        source: src,
      });
      onChangeTransformerFunction(slug); // vincula ao nó
      setIdeOpen(false);
      loadFunctions(); // o select passa a listar a função salva (já selecionada)
    } catch {
      setSaveErr(t('solutions.transformerSaveErr'));
    } finally {
      setSaving(false);
    }
  }, [nodeType, transformerFunction, onChangeTransformerFunction, loadFunctions, t]);

  return (
    <div
      className="border-t border-border-light pt-3 space-y-2"
      data-testid="transformer-config"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
        <Code2 className="w-3 h-3" strokeWidth={1.5} />
        {t('solutions.transformer')}
      </p>
      {/* #1 (fix do operador) — explica O QUE É a seção (os campos eram jargão
          cru sem contexto). Opcional, com exemplo concreto. */}
      <p className="text-[10px] text-muted-on-light leading-snug" data-testid="transformer-intro">
        {t('solutions.transformerIntro')}
      </p>

      {/* F6 — o operador declara o que o transformer PROCESSA (tipo) e ONDE grava
          (propriedade). Dropdowns (object_types já mescla os PROPOSTOS via F1;
          properties depende do tipo) — nunca texto livre. Alimenta o esqueleto
          contextual da IDE. */}
      {(onChangeNodeType || onChangeOutputProperty) && (
        <div className="grid grid-cols-2 gap-2" data-testid="transformer-io">
          <label className="block space-y-0.5">
            <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
              {t('solutions.transformerInputType')}
              <InfoTip text={t('solutions.transformerInputTypeHint')} />
            </span>
            <DynamicRefSelect
              source="object_types"
              value={nodeType || ''}
              onChange={(v) => onChangeNodeType?.(v)}
              testid="transformer-node-type"
              rich
            />
          </label>
          <label className="block space-y-0.5">
            <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
              {t('solutions.transformerOutputProp')}
              <InfoTip text={t('solutions.transformerOutputPropHint')} />
            </span>
            <DynamicRefSelect
              source="properties"
              dependsOnValue={nodeType}
              value={outputProperty || ''}
              onChange={(v) => onChangeOutputProperty?.(v)}
              testid="transformer-output-prop"
              rich
            />
          </label>
        </div>
      )}

      <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
        {t('solutions.transformerFunctionLabel')}
        <InfoTip text={t('solutions.transformerFunctionHint')} />
      </span>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchableSelect
            value={transformerFunction}
            onChange={(v) => onChangeTransformerFunction(v)}
            options={(functions ?? []).map((fn): SelectOption => ({
              value: fn.slug,
              label: fn.display_name || fn.slug,
              hint: fn.slug, // slug técnico como contexto secundário (buscável)
            }))}
            placeholder={
              loading
                ? t('solutions.transformerLoading')
                : functions !== null && functions.length === 0
                  ? t('solutions.transformerNoFunctions')
                  : t('solutions.transformerNone')
            }
            searchPlaceholder={t('solutions.searchOption')}
            disabled={loading}
            data-testid="transformer-function-select"
          />
        </div>

        {/* TASK 1: inline IDE button — replaces the external link */}
        <button
          type="button"
          onClick={() => setIdeOpen(true)}
          data-testid="transformer-open-ide"
          className="h-7 px-2 text-[10px] border border-border-light hover:border-primary hover:text-primary flex items-center gap-1 whitespace-nowrap"
        >
          {selectedFn ? (
            <>
              <Pencil className="w-3 h-3" strokeWidth={1.5} />
              {t('solutions.transformerEditFn')}
            </>
          ) : (
            <>
              <Plus className="w-3 h-3" strokeWidth={1.5} />
              {t('solutions.transformerNewFn')}
            </>
          )}
        </button>
      </div>

      {/* TASK 1: Inline IDE Dialog — opens SandboxIDE without leaving the panel */}
      <Dialog open={ideOpen} onOpenChange={(open) => { if (!open) handleIdeClose(); }}>
        <DialogContent
          className={
            (ideFull
              ? 'max-w-none w-screen h-screen'
              : 'max-w-7xl w-[94vw] h-[88vh]') +
            ' flex flex-col p-0 gap-0 border border-border-light bg-canvas-light'
          }
          data-testid="transformer-ide-drawer"
        >
          {/* #3/#10 — toggle tela cheia ALINHADO ao X de fechar: ambos são filhos
              DIRETOS do DialogContent (mesmo contexto), absolute top-4. O X
              embutido fica em right-4; o fullscreen logo à esquerda (right-11). */}
          <button
            type="button"
            onClick={() => setIdeFull((v) => !v)}
            title={t(ideFull ? 'solutions.exitFullscreen' : 'solutions.toggleFullscreen')}
            aria-pressed={ideFull}
            data-testid="transformer-ide-fullscreen-toggle"
            className="absolute right-11 top-4 z-10 flex items-center justify-center opacity-70 hover:opacity-100 text-muted-on-light hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {ideFull ? (
              <Minimize2 className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <Maximize2 className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          <DialogHeader className="flex-none flex flex-row items-center gap-2 px-4 py-2 pr-20 border-b border-border-light">
            <Code2 className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[12px] font-semibold text-text-on-light">
                {t('solutions.transformerDrawerTitle')}
                {selectedFn && (
                  <span className="ml-1.5 text-[10px] font-mono text-muted-on-light">
                    — {selectedFn.display_name || selectedFn.slug}
                  </span>
                )}
              </DialogTitle>
              <p className="text-[10px] text-muted-on-light leading-snug mt-0.5">
                {t('solutions.transformerDrawerHint')}
              </p>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <SandboxIDE
              nodeType={nodeType}
              transformerSlug={transformerFunction || undefined}
              outputProperty={outputProperty}
              onCodeChange={(c) => { codeRef.current = c; }}
              inputProps={inputProps}
            />
          </div>
          <div className="flex-none flex items-center justify-end gap-2 px-4 py-2 border-t border-border-light bg-canvas-light">
            <button
              type="button"
              onClick={handleIdeClose}
              data-testid="transformer-ide-close"
              className="h-7 px-3 text-[11px] border border-border-light hover:border-danger hover:text-danger"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAndLink()}
              disabled={saving}
              data-testid="transformer-ide-save"
              className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? t('common.loading') : t('solutions.transformerSaveFn')}
            </button>
          </div>
          {saveErr && (
            <p className="px-4 pb-2 text-[10px] text-danger" data-testid="transformer-save-err">
              {saveErr}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
