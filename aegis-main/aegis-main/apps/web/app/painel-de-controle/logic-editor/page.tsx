'use client';

/**
 * Análises — Painel de Controle.
 *
 * Redesign visual (2026-05-24): a porta de entrada é uma FRASE montável +
 * um RESULTADO grande, não mais o editor de blocos de desenvolvedor.
 *
 *   Modo Simples (default) — "O que você quer saber?": o operador escolhe
 *   um resumo (Mostrar itens / Contar / Somar / Média / …) e zero+ filtros
 *   em linguagem natural, clica "Ver resultado" e vê um número/valor grande.
 *
 *   Modo Avançado — o editor 3-painéis completo (paleta de passos · canvas ·
 *   pré-visualização) para Map / Se… então… / múltiplos passos. Mesmo
 *   programa por baixo (`AIPLogicFunction.signature.blocks`), mesma engine
 *   (`lib/logic/blocks.ts`). ADD-alongside: nada de poder é removido, só
 *   deixa de ser a primeira tela.
 */
import * as React from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Filter as FilterIcon,
  GitBranch,
  GripVertical,
  Hash,
  Layers,
  Map as MapIcon,
  Play,
  Plus,
  Save,
  Sigma,
  SquareFunction,
  Trash2,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { ANALISE_TABS } from '@/components/control-panel/hub-tabs';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpErrorState } from '@/components/control-panel/cp-skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AIPLogicFunctions,
  type AIPLogicFunctionOut,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import {
  run,
  type AggregateBlock,
  type BranchBlock,
  type FilterBlock,
  type LogicBlock,
  type LogicProgram,
  type MapBlock,
  type RunResult,
  type TraceEntry,
} from '@/lib/logic/blocks';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

// ─── Linguagem do operador ───────────────────────────────────────────────────
const TYPE_LABEL: Record<LogicBlock['type'], string> = {
  filter: 'Manter apenas',
  map: 'Extrair campo',
  aggregate: 'Resumir',
  branch: 'Se… então…',
};

const OP_LABEL: Record<FilterBlock['op'], string> = {
  eq: 'é igual a',
  ne: 'é diferente de',
  gt: 'é maior que',
  lt: 'é menor que',
  contains: 'contém',
  in: 'está em',
  exists: 'existe',
};

const AGG_LABEL: Record<AggregateBlock['op'], string> = {
  count: 'Contar',
  sum: 'Somar',
  min: 'Menor valor',
  max: 'Maior valor',
  avg: 'Média',
  distinct: 'Valores distintos',
};

/** Primeiro seletor da frase: "Mostrar os itens" (sem resumo) ou um resumo. */
type SummaryMode = 'none' | AggregateBlock['op'];

const SUMMARY_LABEL: Record<SummaryMode, string> = {
  none: 'Mostrar os itens',
  count: 'Contar',
  sum: 'Somar',
  avg: 'Média',
  min: 'Menor valor',
  max: 'Maior valor',
  distinct: 'Valores distintos',
};

/** Resumos que precisam de um campo numérico/alvo (Contar e Mostrar não). */
const SUMMARY_NEEDS_FIELD: Record<SummaryMode, boolean> = {
  none: false,
  count: false,
  sum: true,
  avg: true,
  min: true,
  max: true,
  distinct: true,
};

function parseFilterValue(raw: string, op: FilterBlock['op']): unknown {
  if (op === 'in') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !isNaN(Number(raw))) return Number(raw);
  return raw;
}

/** Frase legível que descreve o que o passo faz (usado no canvas avançado). */
function describeBlock(b: LogicBlock): string {
  if (b.type === 'filter') {
    const campo = b.path?.trim() || 'um campo';
    if (b.op === 'exists') return `Manter apenas onde "${campo}" existe`;
    const val =
      b.value === undefined || b.value === '' ? '…' : String(b.value);
    return `Manter apenas onde "${campo}" ${OP_LABEL[b.op]} ${val}`;
  }
  if (b.type === 'map') {
    return `Extrair o campo "${b.path?.trim() || '…'}" de cada item`;
  }
  if (b.type === 'aggregate') {
    return `Resumir: ${AGG_LABEL[b.op]}${b.path ? ` de "${b.path}"` : ''}`;
  }
  return 'Se a condição for verdadeira, segue um caminho; senão, outro.';
}

// ─── Ponte frase ⇄ programa de blocos ────────────────────────────────────────
// Uma análise "simples" é [0+ filtros] seguidos de [0 ou 1 resumo]. Se o
// programa tiver map/branch, múltiplos resumos, ou um resumo fora do fim,
// não é representável na frase → o operador usa o Avançado.
function isSimpleRepresentable(program: LogicProgram): boolean {
  let seenAggregate = false;
  for (const b of program) {
    if (b.type === 'filter') {
      if (seenAggregate) return false; // filtro depois do resumo → avançado
    } else if (b.type === 'aggregate') {
      if (seenAggregate) return false; // mais de um resumo → avançado
      seenAggregate = true;
    } else {
      return false; // map / branch → avançado
    }
  }
  return true;
}

interface SimpleModel {
  summary: SummaryMode;
  field: string;
  filters: FilterBlock[];
}

function programToSimple(program: LogicProgram): SimpleModel {
  const filters = program.filter((b): b is FilterBlock => b.type === 'filter');
  const agg = program.find((b): b is AggregateBlock => b.type === 'aggregate');
  return {
    summary: agg ? agg.op : 'none',
    field: agg?.path ?? '',
    filters,
  };
}

function simpleToProgram(m: SimpleModel): LogicProgram {
  const out: LogicProgram = [...m.filters];
  if (m.summary !== 'none') {
    out.push({
      type: 'aggregate',
      op: m.summary,
      path:
        SUMMARY_NEEDS_FIELD[m.summary] && m.field.trim()
          ? m.field.trim()
          : undefined,
    });
  }
  return out;
}

const DEFAULT_INPUT_SAMPLE = `[
  {"x": 1, "kind": "alpha"},
  {"x": 2, "kind": "alpha"},
  {"x": 3, "kind": "beta"}
]`;

interface AnalysisTemplate {
  slug: string;
  label: string;
  model: SimpleModel;
}

const TEMPLATES: AnalysisTemplate[] = [
  {
    slug: 'contar-tudo',
    label: 'Contar tudo',
    model: { summary: 'count', field: '', filters: [] },
  },
  {
    slug: 'contar-por-condicao',
    label: 'Contar por condição',
    model: {
      summary: 'count',
      field: '',
      filters: [{ type: 'filter', path: '', op: 'eq', value: '' }],
    },
  },
  {
    slug: 'somar-campo',
    label: 'Somar um campo',
    model: { summary: 'sum', field: '', filters: [] },
  },
];

const PALETTE: PaletteSpec[] = [
  {
    type: 'filter',
    label: 'Manter apenas…',
    short: 'Manter',
    description: 'Mantém só os itens que atendem a uma condição.',
    example: 'ex.: manter onde "tipo" é igual a alerta',
    Icon: FilterIcon,
  },
  {
    type: 'map',
    label: 'Extrair campo',
    short: 'Extrair',
    description: 'Pega só um campo de cada item.',
    example: 'ex.: extrair "gravidade"',
    Icon: MapIcon,
  },
  {
    type: 'aggregate',
    label: 'Resumir',
    short: 'Resumir',
    description: 'Conta, soma ou tira a média dos itens.',
    example: 'ex.: contar quantos sobraram',
    Icon: Sigma,
  },
  {
    type: 'branch',
    label: 'Se… então…',
    short: 'Se…',
    description: 'Segue caminhos diferentes conforme uma condição.',
    example: 'avançado',
    Icon: GitBranch,
  },
];

function emptyBlockOfType(type: LogicBlock['type']): LogicBlock {
  if (type === 'filter') {
    return { type: 'filter', path: '', op: 'eq', value: '' };
  }
  if (type === 'map') {
    return { type: 'map', path: '' };
  }
  if (type === 'aggregate') {
    return { type: 'aggregate', op: 'count' };
  }
  return {
    type: 'branch',
    predicate: { type: 'filter', path: '', op: 'exists' },
    then: [],
    else: [],
  };
}

export default function LogicEditorPage() {
  return (
    <RequirePerm perm="ontology.actions.write">
      <LogicEditorInner />
    </RequirePerm>
  );
}

type Mode = 'simples' | 'avancado';

function LogicEditorInner() {
  const [fns, setFns] = React.useState<AIPLogicFunctionOut[] | null>(null);
  const [loadFnsErr, setLoadFnsErr] = React.useState<string | null>(null);
  const [selectedFnId, setSelectedFnId] = React.useState<string>('');
  const [program, setProgram] = React.useState<LogicProgram>([]);
  const [mode, setMode] = React.useState<Mode>('simples');
  const [inputSample, setInputSample] = React.useState(DEFAULT_INPUT_SAMPLE);
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [runErr, setRunErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [saveOk, setSaveOk] = React.useState(false);

  const refresh = React.useCallback(() => {
    setLoadFnsErr(null);
    AIPLogicFunctions.list()
      .then(setFns)
      .catch((e) => setLoadFnsErr(humanise(e)));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Ao trocar a análise selecionada, carrega os passos e escolhe o modo:
  // simples quando o programa é representável na frase, senão avançado.
  React.useEffect(() => {
    if (!selectedFnId) {
      setProgram([]);
      return;
    }
    AIPLogicFunctions.get(selectedFnId)
      .then((fn) => {
        const sig = fn.signature || {};
        const blocks = Array.isArray((sig as { blocks?: unknown }).blocks)
          ? ((sig as { blocks: LogicBlock[] }).blocks as LogicBlock[])
          : [];
        setProgram(blocks);
        setMode(isSimpleRepresentable(blocks) ? 'simples' : 'avancado');
        setResult(null);
        setSaveOk(false);
      })
      .catch((e) => setLoadFnsErr(humanise(e)));
  }, [selectedFnId]);

  const updateProgram = React.useCallback((next: LogicProgram) => {
    setProgram(next);
    setSaveOk(false);
  }, []);

  function executeLocal() {
    setRunErr(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputSample);
    } catch (e) {
      setRunErr(`Os dados de exemplo não são um JSON válido: ${humanise(e)}`);
      return;
    }
    try {
      setResult(run(parsed, program));
    } catch (e) {
      setRunErr(humanise(e));
    }
  }

  async function save() {
    if (!selectedFnId) {
      setSaveErr('Selecione uma análise antes de salvar.');
      return;
    }
    setSaving(true);
    setSaveErr(null);
    setSaveOk(false);
    try {
      const fn = await AIPLogicFunctions.get(selectedFnId);
      const sig = { ...(fn.signature || {}), blocks: program } as Record<
        string,
        unknown
      >;
      await AIPLogicFunctions.update(selectedFnId, { signature: sig });
      setSaveOk(true);
    } catch (e) {
      setSaveErr(humanise(e));
    } finally {
      setSaving(false);
    }
  }

  const representable = isSimpleRepresentable(program);

  return (
    <div data-testid="logic-editor-page">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <SquareFunction
              className="w-4 h-4 text-text-on-light"
              strokeWidth={1.5}
            />
            Funções
          </span>
        }
        subtitle="Descubra algo nos seus dados em uma frase — e veja o resultado na hora."
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Análise
            </Label>
            <select
              value={selectedFnId}
              onChange={(e) => setSelectedFnId(e.target.value)}
              className="h-8 px-2 text-[12px] bg-white border border-border-light"
              data-testid="logic-editor-fn-select"
            >
              <option value="">— Selecione uma análise —</option>
              {fns?.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.display_name}
                </option>
              ))}
            </select>
            <Button
              onClick={save}
              disabled={saving || !selectedFnId}
              className="h-8 text-[12px]"
              data-testid="logic-editor-save"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        }
      />
      <CpHubSubnav group="Análise" tabs={ANALISE_TABS} />

      {/* Alternância de modo — Simples (frase) lidera; Avançado é o editor completo. */}
      <div
        className="px-6 py-3 border-b border-border-light bg-white flex items-center gap-2"
        data-testid="analises-mode-toggle"
      >
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Modo
        </span>
        <div className="inline-flex border border-border-light bg-canvas-light">
          <button
            type="button"
            onClick={() => setMode('simples')}
            data-testid="analises-mode-simples"
            aria-pressed={mode === 'simples'}
            className={
              'px-3 py-1.5 text-[11.5px] font-semibold transition-colors ' +
              (mode === 'simples'
                ? 'bg-primary text-white'
                : 'text-muted-on-light hover:text-text-on-light')
            }
          >
            Simples
          </button>
          <button
            type="button"
            onClick={() => setMode('avancado')}
            data-testid="analises-mode-avancado"
            aria-pressed={mode === 'avancado'}
            className={
              'px-3 py-1.5 text-[11.5px] font-semibold border-l border-border-light transition-colors ' +
              (mode === 'avancado'
                ? 'bg-primary text-white'
                : 'text-muted-on-light hover:text-text-on-light')
            }
          >
            Avançado
          </button>
        </div>
        <span className="text-[10.5px] text-muted-on-light leading-snug ml-3">
          Simples: monte uma frase e veja o resultado. Avançado: passos
          encadeados (extrair campo, "se… então…", vários resumos).
        </span>
      </div>

      {loadFnsErr && (
        <div className="p-4">
          <CpErrorState
            title="Não foi possível carregar as análises"
            description={loadFnsErr}
            retry={refresh}
            diagnostic={{ path: '/platform/v23/aip-logic', message: loadFnsErr }}
          />
        </div>
      )}

      {(saveOk || saveErr) && (
        <div className="px-6 py-2 border-b border-border-light bg-white">
          {saveOk && (
            <p
              className="text-[11px] text-success"
              data-testid="logic-editor-save-ok"
            >
              Análise salva · {program.length}{' '}
              {program.length === 1 ? 'passo' : 'passos'}.
            </p>
          )}
          {saveErr && (
            <p
              className="text-[11px] text-danger"
              data-testid="logic-editor-save-err"
            >
              {saveErr}
            </p>
          )}
        </div>
      )}

      {mode === 'simples' ? (
        representable ? (
          <SimpleBuilder
            program={program}
            onChange={updateProgram}
            inputSample={inputSample}
            onSampleChange={(v) => {
              setInputSample(v);
              setSaveOk(false);
            }}
            onRun={executeLocal}
            result={result}
            runErr={runErr}
          />
        ) : (
          <div className="p-6">
            <CpEmptyState
              icon={Layers}
              title="Esta análise usa passos avançados"
              description="Ela tem passos que não cabem na frase simples (extrair campo, “se… então…” ou vários resumos). Abra o modo Avançado para editá-la."
            />
            <div className="flex justify-center mt-3">
              <Button
                onClick={() => setMode('avancado')}
                className="h-8 text-[12px]"
                data-testid="analises-open-advanced"
              >
                Abrir no Avançado
              </Button>
            </div>
          </div>
        )
      ) : (
        <AdvancedEditor
          program={program}
          onChange={updateProgram}
          inputSample={inputSample}
          onSampleChange={(v) => {
            setInputSample(v);
            setSaveOk(false);
          }}
          onRun={executeLocal}
          result={result}
          runErr={runErr}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODO SIMPLES — frase montável + resultado grande
// ═══════════════════════════════════════════════════════════════════════════
function SimpleBuilder({
  program,
  onChange,
  inputSample,
  onSampleChange,
  onRun,
  result,
  runErr,
}: {
  program: LogicProgram;
  onChange: (p: LogicProgram) => void;
  inputSample: string;
  onSampleChange: (v: string) => void;
  onRun: () => void;
  result: RunResult | null;
  runErr: string | null;
}) {
  const model = programToSimple(program);

  function commit(next: SimpleModel) {
    onChange(simpleToProgram(next));
  }

  function setSummary(summary: SummaryMode) {
    commit({ ...model, summary });
  }
  function setField(field: string) {
    commit({ ...model, field });
  }
  function addFilter() {
    commit({
      ...model,
      filters: [...model.filters, { type: 'filter', path: '', op: 'eq', value: '' }],
    });
  }
  function updateFilter(i: number, next: FilterBlock) {
    commit({
      ...model,
      filters: model.filters.map((f, idx) => (idx === i ? next : f)),
    });
  }
  function removeFilter(i: number) {
    commit({ ...model, filters: model.filters.filter((_, idx) => idx !== i) });
  }
  function applyTemplate(t: AnalysisTemplate) {
    commit({
      summary: t.model.summary,
      field: t.model.field,
      filters: t.model.filters.map((f) => ({ ...f })),
    });
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5" data-testid="analise-builder">
      {/* Modelos prontos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Comece por um modelo:
        </span>
        {TEMPLATES.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => applyTemplate(t)}
            className="text-[11.5px] px-2 py-1 border border-border-light bg-white text-text-on-light hover:border-primary"
            data-testid={`analise-template-${t.slug}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* A frase */}
      <div className="bg-white border border-border-light p-5 space-y-4">
        <h2 className="text-[15px] font-semibold text-text-on-light">
          O que você quer saber?
        </h2>

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-on-light">
          <select
            value={model.summary}
            onChange={(e) => setSummary(e.target.value as SummaryMode)}
            className="h-9 px-2 text-[13px] bg-canvas-light border border-border-light focus:border-primary outline-none"
            data-testid="analise-summary"
          >
            {(Object.keys(SUMMARY_LABEL) as SummaryMode[]).map((s) => (
              <option key={s} value={s}>
                {SUMMARY_LABEL[s]}
              </option>
            ))}
          </select>

          {SUMMARY_NEEDS_FIELD[model.summary] && (
            <>
              <span className="text-muted-on-light">do campo</span>
              <Input
                value={model.field}
                onChange={(e) => setField(e.target.value)}
                placeholder="ex.: x, gravidade"
                className="bg-canvas-light h-9 w-44 text-[12.5px] font-mono"
                data-testid="analise-field"
              />
            </>
          )}

          <span className="text-muted-on-light">
            {model.filters.length > 0 ? 'onde:' : 'de todos os registros'}
          </span>
        </div>

        {/* Filtros */}
        {model.filters.length > 0 && (
          <div className="space-y-2" data-testid="analise-filters">
            {model.filters.map((f, i) => (
              <FilterRow
                key={i}
                idx={i}
                filter={f}
                isFirst={i === 0}
                onChange={(next) => updateFilter(i, next)}
                onRemove={() => removeFilter(i)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addFilter}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
          data-testid="analise-add-filter"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          adicionar filtro
        </button>

        <div className="pt-1">
          <Button
            onClick={onRun}
            className="h-9 text-[12.5px]"
            data-testid="analise-run"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            Ver resultado
          </Button>
        </div>
      </div>

      {/* Resultado grande */}
      {runErr && (
        <div
          className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30"
          data-testid="analise-run-error"
        >
          {runErr}
        </div>
      )}
      {result && !runErr && (
        <ResultCard summary={model.summary} field={model.field} output={result.output} />
      )}

      {/* Dados de exemplo — secundário, recolhido */}
      <details className="bg-white border border-border-light">
        <summary className="px-4 py-2 text-[11px] uppercase tracking-wider text-muted-on-light font-semibold cursor-pointer select-none">
          Dados de exemplo (para testar)
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-1">
          <p className="text-[10.5px] text-muted-on-light leading-snug">
            Estes dados servem só para testar a análise. Edite-os para ver como
            ela se comporta.
          </p>
          <textarea
            value={inputSample}
            onChange={(e) => onSampleChange(e.target.value)}
            rows={6}
            className="w-full font-mono text-[11px] bg-canvas-light border border-border-light px-2 py-1.5 outline-none focus:border-primary"
            data-testid="analise-sample"
          />
        </div>
      </details>
    </div>
  );
}

function FilterRow({
  idx,
  filter,
  isFirst,
  onChange,
  onRemove,
}: {
  idx: number;
  filter: FilterBlock;
  isFirst: boolean;
  onChange: (f: FilterBlock) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-[12.5px]"
      data-testid={`analise-filter-${idx}`}
    >
      <span className="text-muted-on-light w-8 text-right">
        {isFirst ? '' : 'e'}
      </span>
      <Input
        value={filter.path}
        onChange={(e) => onChange({ ...filter, path: e.target.value })}
        placeholder="campo (ex.: tipo)"
        className="bg-canvas-light h-9 w-40 text-[12.5px] font-mono"
        data-testid={`analise-filter-${idx}-campo`}
      />
      <select
        value={filter.op}
        onChange={(e) =>
          onChange({ ...filter, op: e.target.value as FilterBlock['op'] })
        }
        className="h-9 px-2 text-[12.5px] bg-canvas-light border border-border-light focus:border-primary outline-none"
        data-testid={`analise-filter-${idx}-condicao`}
      >
        {(Object.keys(OP_LABEL) as FilterBlock['op'][]).map((op) => (
          <option key={op} value={op}>
            {OP_LABEL[op]}
          </option>
        ))}
      </select>
      {filter.op !== 'exists' && (
        <Input
          value={filter.value === undefined ? '' : String(filter.value)}
          onChange={(e) =>
            onChange({ ...filter, value: parseFilterValue(e.target.value, filter.op) })
          }
          placeholder={filter.op === 'in' ? 'ex.: ["a","b"]' : 'valor (ex.: alerta)'}
          className="bg-canvas-light h-9 w-44 text-[12.5px] font-mono"
          data-testid={`analise-filter-${idx}-valor`}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-on-light hover:text-danger p-1"
        aria-label="Remover filtro"
        data-testid={`analise-filter-${idx}-remove`}
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

function ResultCard({
  summary,
  field,
  output,
}: {
  summary: SummaryMode;
  field: string;
  output: unknown;
}) {
  // Decide o "número grande" + legenda conforme o tipo de resumo.
  let big: string;
  let caption: string;
  let chips: unknown[] | null = null;
  let itemsJson: string | null = null;

  if (summary === 'none') {
    const arr = Array.isArray(output) ? output : [output];
    big = String(arr.length);
    caption = arr.length === 1 ? 'item corresponde' : 'itens correspondem';
    itemsJson = JSON.stringify(output, null, 2);
  } else if (summary === 'count') {
    big = String(typeof output === 'number' ? output : 0);
    caption =
      output === 1 ? 'registro encontrado' : 'registros encontrados';
  } else if (summary === 'distinct') {
    const arr = Array.isArray(output) ? output : [];
    big = String(arr.length);
    caption = arr.length === 1 ? 'valor distinto' : 'valores distintos';
    chips = arr.slice(0, 24);
  } else {
    // sum / avg / min / max
    if (output === null || output === undefined) {
      big = '—';
      caption = `sem valores numéricos${field ? ` em "${field}"` : ''}`;
    } else {
      const n = typeof output === 'number' ? output : Number(output);
      big = Number.isInteger(n) ? String(n) : n.toFixed(2);
      caption = `${SUMMARY_LABEL[summary].toLowerCase()}${field ? ` de "${field}"` : ''}`;
    }
  }

  return (
    <div
      className="bg-white border border-border-light p-6 text-center"
      data-testid="analise-result"
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        <Hash className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Resultado
        </span>
      </div>
      <p
        className="text-[44px] leading-none font-semibold text-text-on-light"
        data-testid="analise-result-value"
      >
        {big}
      </p>
      <p className="text-[12px] text-muted-on-light mt-1">{caption}</p>

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {chips.map((v, i) => (
            <span
              key={i}
              className="text-[11px] font-mono px-2 py-0.5 border border-border-light bg-canvas-light text-text-on-light"
            >
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          ))}
        </div>
      )}

      {itemsJson && (
        <details className="mt-3 text-left">
          <summary className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold cursor-pointer select-none">
            Ver itens
          </summary>
          <pre className="bg-canvas-light border border-border-light p-2 text-[11px] font-mono whitespace-pre-wrap break-all text-text-on-light mt-1">
            {itemsJson}
          </pre>
        </details>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODO AVANÇADO — editor 3-painéis completo (poder total)
// ═══════════════════════════════════════════════════════════════════════════
function AdvancedEditor({
  program,
  onChange,
  inputSample,
  onSampleChange,
  onRun,
  result,
  runErr,
}: {
  program: LogicProgram;
  onChange: (p: LogicProgram) => void;
  inputSample: string;
  onSampleChange: (v: string) => void;
  onRun: () => void;
  result: RunResult | null;
  runErr: string | null;
}) {
  function addBlockToCanvas(type: LogicBlock['type']) {
    onChange([...program, emptyBlockOfType(type)]);
  }
  function updateBlock(idx: number, next: LogicBlock) {
    onChange(program.map((b, i) => (i === idx ? next : b)));
  }
  function removeBlock(idx: number) {
    onChange(program.filter((_, i) => i !== idx));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= program.length) return;
    const next = [...program];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  return (
    <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-260px)]">
      {/* ESQ — Paleta de passos */}
      <aside
        className="col-span-3 border-r border-border-light bg-white overflow-y-auto"
        data-testid="logic-editor-palette"
      >
        <div className="p-4 space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
            Adicione um passo
          </h3>
          {PALETTE.map((spec) => (
            <PaletteCard
              key={spec.type}
              spec={spec}
              onAdd={() => addBlockToCanvas(spec.type)}
            />
          ))}
          <p className="text-[10px] text-muted-on-light mt-3 leading-snug">
            Clique em "Adicionar passo" ou arraste o card para o centro. A
            ordem dos passos é a ordem em que são aplicados.
          </p>
        </div>
      </aside>

      {/* CENTRO — A análise */}
      <section
        className="col-span-5 bg-canvas-light overflow-y-auto"
        data-testid="logic-editor-canvas"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const t = e.dataTransfer.getData('application/x-logic-block-type');
          if (t === 'filter' || t === 'map' || t === 'aggregate' || t === 'branch') {
            addBlockToCanvas(t);
          }
        }}
      >
        <div className="p-4">
          {program.length === 0 ? (
            <CpEmptyState
              icon={Layers}
              title="Sua análise está vazia"
              description='Adicione um passo à esquerda. Um começo comum: "Manter apenas" para filtrar e depois "Resumir" para contar quantos itens sobraram.'
            />
          ) : (
            <div className="space-y-0" data-testid="logic-editor-blocks">
              {program.map((block, idx) => (
                <React.Fragment key={idx}>
                  <BlockCard
                    block={block}
                    idx={idx}
                    total={program.length}
                    onChange={(next) => updateBlock(idx, next)}
                    onRemove={() => removeBlock(idx)}
                    onMove={(dir) => moveBlock(idx, dir)}
                  />
                  {idx < program.length - 1 && <BlockArrow />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DIR — Pré-visualização */}
      <aside
        className="col-span-4 border-l border-border-light bg-white overflow-y-auto"
        data-testid="logic-editor-inspector"
      >
        <div className="p-4 border-b border-border-light space-y-2">
          <Label className="text-[11px] uppercase tracking-wider text-muted-on-light">
            Dados de exemplo
          </Label>
          <p className="text-[10px] text-muted-on-light leading-snug">
            Estes dados são só para testar — edite-os para ver como a análise
            se comporta.
          </p>
          <textarea
            value={inputSample}
            onChange={(e) => onSampleChange(e.target.value)}
            rows={6}
            className="w-full font-mono text-[11px] bg-canvas-light border border-border-light px-2 py-1.5 outline-none focus:border-primary"
            data-testid="logic-editor-input-sample"
          />
          <Button
            onClick={onRun}
            className="w-full h-8 text-[12px]"
            data-testid="logic-editor-run"
          >
            <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
            Ver resultado
          </Button>
        </div>

        <div className="p-4">
          {runErr && (
            <div
              className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30 mb-3"
              data-testid="logic-editor-run-error"
            >
              {runErr}
            </div>
          )}
          {!result && !runErr && (
            <p className="text-[11px] text-muted-on-light">
              Clique em "Ver resultado" para testar a análise com os dados de
              exemplo.
            </p>
          )}
          {result && (
            <div className="space-y-3">
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">
                  Resultado
                </h4>
                <pre
                  className="bg-canvas-light border border-border-light p-2 text-[11px] font-mono whitespace-pre-wrap break-all text-text-on-light"
                  data-testid="logic-editor-output"
                >
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              </div>
              {result.error && (
                <div className="text-[11px] font-mono text-danger bg-danger/5 border border-danger/30 px-3 py-2">
                  Erro: {result.error}
                </div>
              )}
              <details>
                <summary className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold cursor-pointer select-none">
                  Detalhes técnicos · como chegou nesse resultado (
                  {result.trace.length}{' '}
                  {result.trace.length === 1 ? 'passo' : 'passos'})
                </summary>
                <ul className="space-y-1 mt-2" data-testid="logic-editor-trace">
                  {result.trace.map((entry, i) => (
                    <TraceItem key={i} idx={i} entry={entry} />
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
interface PaletteSpec {
  type: LogicBlock['type'];
  label: string;
  short: string;
  description: string;
  example: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

function PaletteCard({ spec, onAdd }: { spec: PaletteSpec; onAdd: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-logic-block-type', spec.type);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="bg-canvas-light border border-border-light p-2.5 hover:border-primary cursor-grab active:cursor-grabbing"
      data-testid={`palette-${spec.type}`}
    >
      <div className="flex items-center gap-2">
        <spec.Icon className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">
          {spec.label}
        </span>
      </div>
      <p className="text-[10px] text-muted-on-light leading-snug mt-1">
        {spec.description}
      </p>
      <p className="text-[10px] text-muted-on-light/80 italic leading-snug mt-0.5">
        {spec.example}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
        data-testid={`palette-add-${spec.type}`}
      >
        Adicionar passo →
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function BlockArrow() {
  return (
    <div
      className="flex items-center justify-center py-1"
      aria-hidden="true"
      data-testid="block-arrow"
    >
      <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
        <line
          x1="7"
          y1="0"
          x2="7"
          y2="16"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <polyline
          points="3,14 7,20 11,14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function BlockCard({
  block,
  idx,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  block: LogicBlock;
  idx: number;
  total: number;
  onChange: (next: LogicBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const colorMap: Record<LogicBlock['type'], string> = {
    filter: 'border-primary/40 bg-primary/5',
    map: 'border-success/40 bg-success/5',
    aggregate: 'border-warning/40 bg-warning/5',
    branch: 'border-danger/40 bg-danger/5',
  };

  return (
    <div
      className={`border ${colorMap[block.type]} bg-white`}
      data-testid={`block-${idx}`}
    >
      <header className="px-3 py-2 border-b border-border-light flex items-center gap-2">
        <GripVertical
          className="w-3.5 h-3.5 text-muted-on-light"
          strokeWidth={1.5}
        />
        <span className="text-[11px] font-semibold text-text-on-light">
          Passo {idx + 1}
        </span>
        <span className="text-[11px] text-muted-on-light">
          {TYPE_LABEL[block.type]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            className="text-muted-on-light hover:text-text-on-light disabled:opacity-30"
            aria-label="Mover para cima"
            data-testid={`block-up-${idx}`}
          >
            <ChevronRight className="w-3.5 h-3.5 -rotate-90" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            className="text-muted-on-light hover:text-text-on-light disabled:opacity-30"
            aria-label="Mover para baixo"
            data-testid={`block-down-${idx}`}
          >
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-on-light hover:text-danger"
            aria-label="Remover passo"
            data-testid={`block-remove-${idx}`}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="p-3 space-y-2">
        <p className="text-[11px] text-text-on-light leading-snug">
          {describeBlock(block)}
        </p>
        {block.type === 'filter' && (
          <FilterInspector block={block} onChange={onChange} idx={idx} />
        )}
        {block.type === 'map' && (
          <MapInspector block={block} onChange={onChange} idx={idx} />
        )}
        {block.type === 'aggregate' && (
          <AggregateInspector block={block} onChange={onChange} idx={idx} />
        )}
        {block.type === 'branch' && (
          <BranchInspector block={block} onChange={onChange} idx={idx} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function FilterInspector({
  block,
  onChange,
  idx,
}: {
  block: FilterBlock;
  onChange: (b: FilterBlock) => void;
  idx: number;
}) {
  return (
    <div className="space-y-2">
      <Field label="Campo">
        <Input
          value={block.path}
          onChange={(e) => onChange({ ...block, path: e.target.value })}
          placeholder="ex.: tipo, gravidade, x"
          className="bg-white h-7 text-[11.5px] font-mono"
          data-testid={`block-${idx}-path`}
        />
      </Field>
      <Field label="Condição">
        <select
          value={block.op}
          onChange={(e) =>
            onChange({ ...block, op: e.target.value as FilterBlock['op'] })
          }
          className="w-full h-7 px-2 text-[11.5px] bg-white border border-border-light"
          data-testid={`block-${idx}-op`}
        >
          {(Object.keys(OP_LABEL) as FilterBlock['op'][]).map((op) => (
            <option key={op} value={op}>
              {OP_LABEL[op]}
            </option>
          ))}
        </select>
      </Field>
      {block.op !== 'exists' && (
        <Field label="Valor">
          <Input
            value={block.value === undefined ? '' : String(block.value)}
            onChange={(e) =>
              onChange({ ...block, value: parseFilterValue(e.target.value, block.op) })
            }
            placeholder={block.op === 'in' ? 'ex.: ["a","b"]' : 'ex.: alerta'}
            className="bg-white h-7 text-[11.5px] font-mono"
            data-testid={`block-${idx}-value`}
          />
        </Field>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function MapInspector({
  block,
  onChange,
  idx,
}: {
  block: MapBlock;
  onChange: (b: MapBlock) => void;
  idx: number;
}) {
  return (
    <Field label="Campo">
      <Input
        value={block.path}
        onChange={(e) => onChange({ ...block, path: e.target.value })}
        placeholder="ex.: gravidade, tipo"
        className="bg-white h-7 text-[11.5px] font-mono"
        data-testid={`block-${idx}-path`}
      />
    </Field>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function AggregateInspector({
  block,
  onChange,
  idx,
}: {
  block: AggregateBlock;
  onChange: (b: AggregateBlock) => void;
  idx: number;
}) {
  return (
    <div className="space-y-2">
      <Field label="Resumo">
        <select
          value={block.op}
          onChange={(e) =>
            onChange({ ...block, op: e.target.value as AggregateBlock['op'] })
          }
          className="w-full h-7 px-2 text-[11.5px] bg-white border border-border-light"
          data-testid={`block-${idx}-op`}
        >
          {(Object.keys(AGG_LABEL) as AggregateBlock['op'][]).map((op) => (
            <option key={op} value={op}>
              {AGG_LABEL[op]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Campo (opcional)">
        <Input
          value={block.path ?? ''}
          onChange={(e) =>
            onChange({ ...block, path: e.target.value || undefined })
          }
          placeholder="ex.: x, gravidade"
          className="bg-white h-7 text-[11.5px] font-mono"
          data-testid={`block-${idx}-path`}
        />
      </Field>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function BranchInspector({
  block,
  onChange,
  idx,
  depth = 0,
  testIdBase,
}: {
  block: BranchBlock;
  onChange: (b: BranchBlock) => void;
  idx: number;
  depth?: number;
  testIdBase?: string;
}) {
  const MAX_DEPTH = 3;
  const base = testIdBase ?? `block-${idx}`;
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Condição
      </p>
      <FilterInspector
        block={block.predicate}
        onChange={(p) => onChange({ ...block, predicate: p })}
        idx={idx}
      />
      <BranchArm
        label="then"
        arm={block.then}
        onChange={(next) => onChange({ ...block, then: next })}
        depth={depth}
        maxDepth={MAX_DEPTH}
        idx={idx}
        testIdPrefix={`${base}-then`}
      />
      <BranchArm
        label="else"
        arm={block.else}
        onChange={(next) => onChange({ ...block, else: next })}
        depth={depth}
        maxDepth={MAX_DEPTH}
        idx={idx}
        testIdPrefix={`${base}-else`}
      />
      {depth >= MAX_DEPTH && (
        <p className="text-[10px] text-muted-on-light italic">
          Limite de profundidade atingido ({MAX_DEPTH} níveis). Para algo mais
          complexo, crie outra análise.
        </p>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function BranchArm({
  label,
  arm,
  onChange,
  depth,
  maxDepth,
  idx,
  testIdPrefix,
}: {
  label: 'then' | 'else';
  arm: LogicBlock[];
  onChange: (next: LogicBlock[]) => void;
  depth: number;
  maxDepth: number;
  idx: number;
  testIdPrefix: string;
}) {
  const canNestBranch = depth + 1 < maxDepth;
  const armPalette: PaletteSpec[] = canNestBranch
    ? PALETTE
    : PALETTE.filter((p) => p.type !== 'branch');
  const armName = label === 'then' ? 'Se verdadeiro' : 'Se falso';

  function addToArm(t: LogicBlock['type']) {
    if (t === 'branch' && !canNestBranch) return;
    onChange([...arm, emptyBlockOfType(t)]);
  }
  function updateArmBlock(armIdx: number, next: LogicBlock) {
    onChange(arm.map((b, i) => (i === armIdx ? next : b)));
  }
  function removeArmBlock(armIdx: number) {
    onChange(arm.filter((_, i) => i !== armIdx));
  }
  function moveArmBlock(armIdx: number, dir: -1 | 1) {
    const j = armIdx + dir;
    if (j < 0 || j >= arm.length) return;
    const next = [...arm];
    const tmp = next[armIdx];
    next[armIdx] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  const accentClass =
    label === 'then'
      ? 'border-success/40 bg-success/5'
      : 'border-danger/40 bg-danger/5';

  return (
    <div className={`mt-2 border ${accentClass}`} data-testid={testIdPrefix}>
      <header className="px-2 py-1 flex items-center gap-2 border-b border-border-light">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-on-light">
          {armName}
        </span>
        <span className="text-[10px] text-muted-on-light">
          ({arm.length} {arm.length === 1 ? 'passo' : 'passos'})
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {armPalette.map((spec) => (
            <button
              key={spec.type}
              type="button"
              onClick={() => addToArm(spec.type)}
              className="text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
              data-testid={`${testIdPrefix}-add-${spec.type}`}
              title={`Adicionar "${spec.label}" em ${armName}`}
            >
              + {spec.short}
            </button>
          ))}
        </div>
      </header>
      <div
        className="p-2 min-h-[44px] space-y-1.5"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const t = e.dataTransfer.getData('application/x-logic-block-type');
          if (t === 'filter' || t === 'map' || t === 'aggregate') {
            addToArm(t);
          } else if (t === 'branch' && canNestBranch) {
            addToArm(t);
          }
        }}
        data-testid={`${testIdPrefix}-drop`}
      >
        {arm.length === 0 ? (
          <p className="text-[10px] text-muted-on-light italic">
            Adicione um passo para o caminho "{armName}".
          </p>
        ) : (
          arm.map((block, armIdx) => (
            <NestedBlockCard
              key={armIdx}
              block={block}
              idx={armIdx}
              total={arm.length}
              depth={depth + 1}
              maxDepth={maxDepth}
              parentTestId={testIdPrefix}
              onChange={(next) => updateArmBlock(armIdx, next)}
              onRemove={() => removeArmBlock(armIdx)}
              onMove={(dir) => moveArmBlock(armIdx, dir)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function NestedBlockCard({
  block,
  idx,
  total,
  depth,
  maxDepth,
  parentTestId,
  onChange,
  onRemove,
  onMove,
}: {
  block: LogicBlock;
  idx: number;
  total: number;
  depth: number;
  maxDepth: number;
  parentTestId: string;
  onChange: (next: LogicBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const colorMap: Record<LogicBlock['type'], string> = {
    filter: 'border-primary/40',
    map: 'border-success/40',
    aggregate: 'border-warning/40',
    branch: 'border-danger/40',
  };
  const tid = `${parentTestId}-block-${idx}`;
  return (
    <div className={`border ${colorMap[block.type]} bg-white`} data-testid={tid}>
      <header className="px-2 py-1 flex items-center gap-2 border-b border-border-light">
        <span className="text-[10px] font-semibold text-text-on-light">
          Passo {idx + 1}
        </span>
        <span className="text-[10px] text-muted-on-light">
          {TYPE_LABEL[block.type]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            className="text-muted-on-light hover:text-text-on-light disabled:opacity-30"
            aria-label="Mover para cima"
            data-testid={`${tid}-up`}
          >
            <ChevronRight className="w-3 h-3 -rotate-90" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            className="text-muted-on-light hover:text-text-on-light disabled:opacity-30"
            aria-label="Mover para baixo"
            data-testid={`${tid}-down`}
          >
            <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-on-light hover:text-danger"
            aria-label="Remover passo"
            data-testid={`${tid}-remove`}
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="p-2 space-y-1.5">
        <p className="text-[10.5px] text-text-on-light leading-snug">
          {describeBlock(block)}
        </p>
        {block.type === 'filter' && (
          <FilterInspector block={block} onChange={onChange} idx={idx} />
        )}
        {block.type === 'map' && (
          <MapInspector block={block} onChange={onChange} idx={idx} />
        )}
        {block.type === 'aggregate' && (
          <AggregateInspector block={block} onChange={onChange} idx={idx} />
        )}
        {block.type === 'branch' && (
          <BranchInspector
            block={block}
            onChange={onChange}
            idx={idx}
            depth={depth}
            testIdBase={tid}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function TraceItem({ idx, entry }: { idx: number; entry: TraceEntry }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li
      className="bg-canvas-light border border-border-light"
      data-testid={`trace-${idx}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        )}
        <Activity className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        <span className="text-[10.5px] text-text-on-light">
          Passo {idx + 1} · {TYPE_LABEL[entry.block.type]}
        </span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1 text-[10.5px] font-mono">
          <div>
            <span className="text-muted-on-light">antes:</span>{' '}
            <span className="text-text-on-light break-all">
              {JSON.stringify(entry.before)}
            </span>
          </div>
          <div>
            <span className="text-muted-on-light">depois:</span>{' '}
            <span className="text-text-on-light break-all">
              {JSON.stringify(entry.after)}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
