'use client';

/**
 * Scenario Wizard — Wave H.3 (2026-05-23).
 *
 * "Modo Guiado" para a página Cenários: stepper de 4 passos que envelopa
 * os mesmos endpoints REST (Scenarios.preview / createBranch /
 * commitBranch / discardBranch) já usados pelo "Modo Avançado" 3-pane.
 *
 * ADD alongside, conforme memória `feedback_no_deprecation_of_existing_code`:
 * a página /scenarios oferece toggle Avançado/Guiado mas mantém ambos.
 *
 * Passos:
 *   1. Alvos     · multi-select de OntologyNodes (search picker)
 *   2. Mudanças  · forms por alvo + Template dropdown (4 presets)
 *   3. Preview   · diff side-by-side (reusa NodeDiffCard mental model
 *                  mas inline pra não acoplar)
 *   4. Aplicar   · ConfirmDialog requireConfirmText="aplicar" + status
 *
 * Templates (presets):
 *   - Elevar marcação RESTRITO
 *   - Marcar como OPERACIONAL
 *   - Reduzir confiança (confidence=0.5)
 *   - Limpar marcações (clear all)
 */
import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  GitCompare,
  GitBranch,
  AlertCircle,
} from 'lucide-react';

import { useConfirm } from '@/components/dialog/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  OntologyNodes,
  Scenarios,
  type NodeDiff,
  type NodePatch,
  type OntologyNodeSearchItem,
  type ScenarioPreview,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

export interface ScenarioTemplate {
  id: string;
  label: string;
  description: string;
  apply: (target: TargetEntry) => Partial<TargetEntry>;
}

const TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'elevar-restrito',
    label: 'Elevar marcação para RESTRITO',
    description: 'Substitui marcações por ["RESTRITO"]',
    apply: () => ({ markingsCsv: 'RESTRITO' }),
  },
  {
    id: 'marcar-operacional',
    label: 'Marcar como OPERACIONAL',
    description: 'Substitui marcações por ["OPERACIONAL"]',
    apply: () => ({ markingsCsv: 'OPERACIONAL' }),
  },
  {
    id: 'reduzir-confianca',
    label: 'Reduzir confiança (confidence=0.5)',
    description: 'Define prop confidence=0.5',
    apply: () => ({
      props: [{ key: 'confidence', value: '0.5' }],
    }),
  },
  {
    id: 'limpar-marcacoes',
    label: 'Limpar marcações',
    description: 'Substitui marcações por []',
    // Backend interpreta string vazia como []; mantemos espaço único pra
    // sinalizar intencional limpeza vs "não tocar".
    apply: () => ({ markingsCsv: '' }),
  },
];

export interface TargetEntry {
  uid: string;
  node: OntologyNodeSearchItem;
  name: string;
  markingsCsv: string;
  props: { key: string; value: string }[];
  templateId: string | null;
}

function newTarget(node: OntologyNodeSearchItem): TargetEntry {
  return {
    uid: `t-${Math.random().toString(36).slice(2, 10)}`,
    node,
    name: '',
    markingsCsv: '',
    props: [],
    templateId: null,
  };
}

function targetToPatch(t: TargetEntry): NodePatch | null {
  const node_id = t.node.id;
  if (!node_id) return null;
  const props: Record<string, unknown> = {};
  for (const pp of t.props) {
    if (!pp.key.trim()) continue;
    let v: unknown = pp.value;
    const raw = pp.value.trim();
    if (raw === 'true') v = true;
    else if (raw === 'false') v = false;
    else if (raw !== '' && !isNaN(Number(raw))) v = Number(raw);
    props[pp.key.trim()] = v;
  }
  const markingsRaw = t.markingsCsv;
  // Distinção:
  //  - null  = não toca em markings
  //  - []    = limpa (operador escolheu template Limpar)
  const markings = t.templateId === 'limpar-marcacoes'
    ? []
    : markingsRaw
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    node_id,
    props: Object.keys(props).length > 0 ? props : null,
    markings: t.templateId === 'limpar-marcacoes' || markings.length > 0 ? markings : null,
    name: t.name.trim() || null,
  };
}

type Step = 1 | 2 | 3 | 4;

export function ScenarioWizard() {
  const [step, setStep] = React.useState<Step>(1);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [targets, setTargets] = React.useState<TargetEntry[]>([]);
  const [preview, setPreview] = React.useState<ScenarioPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [appliedRunId, setAppliedRunId] = React.useState<string | null>(null);
  const askConfirm = useConfirm();

  function reset() {
    setStep(1);
    setName('');
    setDescription('');
    setTargets([]);
    setPreview(null);
    setErr(null);
    setAppliedRunId(null);
  }

  function go(next: Step) {
    setErr(null);
    setStep(next);
  }

  async function runPreview() {
    setErr(null);
    setPreview(null);
    const patches = targets.map(targetToPatch).filter((p): p is NodePatch => p !== null);
    if (patches.length === 0) {
      setErr('Selecione ao menos um alvo no passo 1 antes do preview.');
      return;
    }
    setPreviewing(true);
    try {
      const r = await Scenarios.preview({
        name: name.trim() || `Cenário ${new Date().toISOString().slice(0, 16)}`,
        description: description.trim(),
        patches,
      });
      setPreview(r);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function applyDefinitive() {
    if (!preview) return;
    const ok = await askConfirm({
      title: 'Aplicar cenário definitivo',
      description: (
        <>
          {preview.diffs.filter((d) => d.found).length} nós da ontologia serão
          alterados em definitivo. Cada nó emite LineageEvent{' '}
          <code className="ml-1 font-mono">scenario.branch.commit</code>.
        </>
      ),
      confirmLabel: 'Aplicar definitivo',
      tone: 'danger',
      requireConfirmText: 'aplicar',
    });
    if (!ok) return;
    setApplying(true);
    setErr(null);
    try {
      const patches = targets.map(targetToPatch).filter((p): p is NodePatch => p !== null);
      const br = await Scenarios.createBranch('draft', patches, {
        name: name.trim() || `Cenário ${new Date().toISOString().slice(0, 16)}`,
        description: description.trim(),
      });
      const out = await Scenarios.commitBranch(br.scenario_id, br.branch_id);
      setAppliedRunId(out.scenario_id);
      go(4);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div data-testid="scenario-wizard" className="bg-white border border-border-light">
      <Stepper current={step} />

      <div className="p-5">
        {err && (
          <div
            data-testid="wizard-error"
            className="mb-3 px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30 flex items-center gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            {err}
          </div>
        )}

        {step === 1 && (
          <StepTargets
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            targets={targets}
            setTargets={setTargets}
          />
        )}
        {step === 2 && (
          <StepChanges
            targets={targets}
            setTargets={setTargets}
          />
        )}
        {step === 3 && (
          <StepPreview
            preview={preview}
            previewing={previewing}
            onCompute={runPreview}
          />
        )}
        {step === 4 && (
          <StepApply
            applying={applying}
            appliedRunId={appliedRunId}
            preview={preview}
            onApply={applyDefinitive}
            onReset={reset}
          />
        )}
      </div>

      <footer className="px-5 py-3 border-t border-border-light bg-canvas-light flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => go(Math.max(1, (step - 1)) as Step)}
          disabled={step === 1 || applying}
          className="h-8 text-[12px]"
          data-testid="wizard-back"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Voltar
        </Button>
        <p className="text-[10.5px] font-mono text-muted-on-light">
          Passo {step} de 4
        </p>
        {step < 3 && (
          <Button
            onClick={() => go(Math.min(4, (step + 1)) as Step)}
            disabled={step === 1 && targets.length === 0}
            className="h-8 text-[12px]"
            data-testid="wizard-next"
          >
            Próximo
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>
        )}
        {step === 3 && (
          <Button
            onClick={() => go(4)}
            disabled={!preview}
            className="h-8 text-[12px]"
            data-testid="wizard-go-apply"
          >
            Aplicar
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>
        )}
        {step === 4 && !appliedRunId && (
          <Button
            onClick={applyDefinitive}
            disabled={applying || !preview}
            variant="destructive"
            className="h-8 text-[12px]"
            data-testid="wizard-confirm-apply"
          >
            {applying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                Aplicando…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                Confirmar aplicar
              </>
            )}
          </Button>
        )}
        {step === 4 && appliedRunId && (
          <Button
            onClick={reset}
            variant="outline"
            className="h-8 text-[12px]"
            data-testid="wizard-reset"
          >
            Novo cenário
          </Button>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Stepper({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Alvos' },
    { n: 2, label: 'Mudanças' },
    { n: 3, label: 'Preview' },
    { n: 4, label: 'Aplicar' },
  ];
  return (
    <ol
      className="grid grid-cols-4 border-b border-border-light"
      data-testid="wizard-stepper"
    >
      {steps.map((s) => {
        const active = s.n === current;
        const done = s.n < current;
        return (
          <li
            key={s.n}
            className={
              'px-4 py-3 border-r border-border-light flex items-center gap-2 ' +
              (active
                ? 'bg-primary/5'
                : done
                  ? 'bg-canvas-light'
                  : 'bg-white')
            }
            data-testid={`wizard-step-${s.n}-pill`}
            data-active={active ? 'true' : 'false'}
            data-done={done ? 'true' : 'false'}
          >
            <span
              className={
                'w-5 h-5 inline-flex items-center justify-center text-[10.5px] font-mono border ' +
                (active
                  ? 'border-primary text-primary'
                  : done
                    ? 'border-success text-success bg-success/5'
                    : 'border-border-light text-muted-on-light')
              }
            >
              {done ? <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> : s.n}
            </span>
            <span
              className={
                'text-[11.5px] uppercase tracking-wider font-semibold ' +
                (active ? 'text-primary' : done ? 'text-text-on-light' : 'text-muted-on-light')
              }
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
function StepTargets({
  name,
  setName,
  description,
  setDescription,
  targets,
  setTargets,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  targets: TargetEntry[];
  setTargets: React.Dispatch<React.SetStateAction<TargetEntry[]>>;
}) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<OntologyNodeSearchItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [searchErr, setSearchErr] = React.useState<string | null>(null);

  async function search() {
    setSearchErr(null);
    setLoading(true);
    try {
      const r = await OntologyNodes.search({ q: q.trim() || undefined, limit: 25 });
      setResults(r);
    } catch (e) {
      setSearchErr(humanise(e));
    } finally {
      setLoading(false);
    }
  }

  function addTarget(n: OntologyNodeSearchItem) {
    setTargets((cur) => {
      if (cur.some((t) => t.node.id === n.id)) return cur;
      return [...cur, newTarget(n)];
    });
  }
  function removeTarget(uid: string) {
    setTargets((cur) => cur.filter((t) => t.uid !== uid));
  }

  return (
    <div className="space-y-4" data-testid="wizard-step-targets">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Nome
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cenário-X · operação Aurora"
            className="bg-white h-8 text-[12px]"
            data-testid="wizard-name"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Descrição
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Motivo + impacto esperado"
            className="bg-white h-8 text-[12px]"
            data-testid="wizard-description"
          />
        </div>
      </div>

      <div className="border border-border-light bg-canvas-light p-3 space-y-2">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
          Buscar nós da ontologia (multi-select)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
            className="bg-white h-8 text-[12px] flex-1"
            data-testid="wizard-target-search"
          />
          <Button
            onClick={() => void search()}
            disabled={loading}
            variant="outline"
            className="h-8 text-[11.5px]"
            data-testid="wizard-target-search-btn"
          >
            <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
            Buscar
          </Button>
        </div>
        {searchErr && (
          <p className="text-[10.5px] font-mono text-danger">{searchErr}</p>
        )}
        {results && (
          <ul
            className="max-h-48 overflow-y-auto bg-white border border-border-light"
            data-testid="wizard-target-results"
          >
            {results.length === 0 && (
              <li className="px-2 py-1.5 text-[11px] text-muted-on-light">
                Sem resultados.
              </li>
            )}
            {results.map((n) => {
              const picked = targets.some((t) => t.node.id === n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => addTarget(n)}
                    disabled={picked}
                    className={
                      'w-full text-left px-2 py-1.5 hover:bg-canvas-light disabled:bg-canvas-light disabled:cursor-not-allowed ' +
                      (picked ? 'opacity-60' : '')
                    }
                    data-testid={`wizard-target-pick-${n.id}`}
                  >
                    <p className="text-[11.5px] font-semibold text-text-on-light truncate">
                      {n.name}
                    </p>
                    <p className="text-[10px] font-mono text-muted-on-light truncate">
                      {n.node_type} · {n.id.slice(0, 12)}…
                      {picked ? ' · adicionado' : ''}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
          Alvos selecionados ({targets.length})
        </h3>
        {targets.length === 0 ? (
          <p className="text-[11.5px] text-muted-on-light">
            Adicione um ou mais nós da ontologia acima. Os patches do
            próximo passo serão aplicados a cada um destes.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="wizard-target-list">
            {targets.map((t) => (
              <li
                key={t.uid}
                className="bg-white border border-border-light px-3 py-2 flex items-start justify-between gap-2"
                data-testid={`wizard-target-${t.node.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-text-on-light truncate">
                    {t.node.name}
                  </p>
                  <p className="text-[10px] font-mono text-muted-on-light truncate">
                    {t.node.node_type} · {t.node.id.slice(0, 12)}…
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeTarget(t.uid)}
                  className="text-muted-on-light hover:text-danger p-1"
                  aria-label="Remover alvo"
                  data-testid={`wizard-target-remove-${t.node.id}`}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function StepChanges({
  targets,
  setTargets,
}: {
  targets: TargetEntry[];
  setTargets: React.Dispatch<React.SetStateAction<TargetEntry[]>>;
}) {
  const [bulkTemplate, setBulkTemplate] = React.useState('');

  function updateTarget(uid: string, partial: Partial<TargetEntry>) {
    setTargets((cur) => cur.map((t) => (t.uid === uid ? { ...t, ...partial } : t)));
  }

  function applyTemplate(uid: string, templateId: string) {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setTargets((cur) =>
      cur.map((t) => {
        if (t.uid !== uid) return t;
        const patch = tpl.apply(t);
        return {
          ...t,
          markingsCsv: patch.markingsCsv ?? t.markingsCsv,
          props: patch.props ?? t.props,
          name: patch.name ?? t.name,
          templateId,
        };
      }),
    );
  }

  function applyBulk() {
    if (!bulkTemplate) return;
    for (const t of targets) applyTemplate(t.uid, bulkTemplate);
  }

  if (targets.length === 0) {
    return (
      <div className="p-4 bg-canvas-light border border-border-light text-center" data-testid="wizard-step-changes">
        <p className="text-[12px] text-muted-on-light">
          Volte ao passo 1 e selecione pelo menos um alvo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="wizard-step-changes">
      <div className="border border-border-light bg-canvas-light p-3 flex items-center gap-2">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light shrink-0">
          Bulk template
        </Label>
        <select
          value={bulkTemplate}
          onChange={(e) => setBulkTemplate(e.target.value)}
          className="h-8 bg-white border border-border-light px-2 text-[12px] flex-1 rounded-none focus:border-primary outline-none"
          data-testid="wizard-bulk-template"
        >
          <option value="">— escolher template —</option>
          {TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.label}
            </option>
          ))}
        </select>
        <Button
          onClick={applyBulk}
          disabled={!bulkTemplate}
          variant="outline"
          className="h-8 text-[11.5px]"
          data-testid="wizard-bulk-apply"
        >
          Aplicar a todos
        </Button>
      </div>

      <ul className="space-y-2.5" data-testid="wizard-change-list">
        {targets.map((t) => {
          return (
            <li
              key={t.uid}
              className="bg-white border border-border-light p-3 space-y-2"
              data-testid={`wizard-change-${t.node.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-text-on-light truncate flex-1">
                  {t.node.name}
                </p>
                <select
                  value={t.templateId ?? ''}
                  onChange={(e) => applyTemplate(t.uid, e.target.value)}
                  className="h-7 bg-white border border-border-light px-2 text-[11px] rounded-none focus:border-primary outline-none"
                  data-testid={`wizard-template-${t.node.id}`}
                >
                  <option value="">— template —</option>
                  {TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Nome (opcional)
                  </Label>
                  <Input
                    value={t.name}
                    onChange={(e) => updateTarget(t.uid, { name: e.target.value })}
                    placeholder="Mantém atual"
                    className="bg-white h-7 text-[11.5px]"
                    data-testid={`wizard-name-${t.node.id}`}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Marcações (csv)
                  </Label>
                  <Input
                    value={t.markingsCsv}
                    onChange={(e) => updateTarget(t.uid, { markingsCsv: e.target.value })}
                    placeholder="RESTRITO, OPERACIONAL"
                    className="bg-white h-7 text-[11.5px] font-mono"
                    data-testid={`wizard-markings-${t.node.id}`}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                    Properties
                  </Label>
                  <Button
                    onClick={() =>
                      updateTarget(t.uid, {
                        props: [...t.props, { key: '', value: '' }],
                      })
                    }
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10.5px]"
                    data-testid={`wizard-add-prop-${t.node.id}`}
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.5} />
                    Adicionar
                  </Button>
                </div>
                {t.props.length === 0 ? (
                  <p className="text-[10.5px] text-muted-on-light">Nenhuma alteração de prop.</p>
                ) : (
                  <ul className="space-y-1">
                    {t.props.map((pp, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <Input
                          value={pp.key}
                          onChange={(e) => {
                            const next = t.props.slice();
                            next[idx] = { ...next[idx], key: e.target.value };
                            updateTarget(t.uid, { props: next });
                          }}
                          placeholder="chave"
                          className="bg-white h-7 text-[11px] font-mono flex-1"
                          data-testid={`wizard-prop-key-${t.node.id}-${idx}`}
                        />
                        <Input
                          value={pp.value}
                          onChange={(e) => {
                            const next = t.props.slice();
                            next[idx] = { ...next[idx], value: e.target.value };
                            updateTarget(t.uid, { props: next });
                          }}
                          placeholder="valor"
                          className="bg-white h-7 text-[11px] font-mono flex-1"
                          data-testid={`wizard-prop-value-${t.node.id}-${idx}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = t.props.filter((_, i) => i !== idx);
                            updateTarget(t.uid, { props: next });
                          }}
                          className="text-muted-on-light hover:text-danger p-1"
                          aria-label="Remover prop"
                          data-testid={`wizard-prop-remove-${t.node.id}-${idx}`}
                        >
                          <X className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function StepPreview({
  preview,
  previewing,
  onCompute,
}: {
  preview: ScenarioPreview | null;
  previewing: boolean;
  onCompute: () => void;
}) {
  React.useEffect(() => {
    if (!preview && !previewing) onCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3" data-testid="wizard-step-preview">
      <div className="flex items-center gap-2">
        <Button
          onClick={onCompute}
          disabled={previewing}
          variant="outline"
          className="h-8 text-[11.5px]"
          data-testid="wizard-preview-compute"
        >
          {previewing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <GitCompare className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {previewing ? 'Computando…' : 'Recomputar preview'}
        </Button>
        <span className="text-[10.5px] font-mono text-muted-on-light">
          dry-run · zero side effects
        </span>
      </div>

      {!preview && !previewing && (
        <p className="text-[11.5px] text-muted-on-light">
          Sem preview ainda — clique para computar.
        </p>
      )}

      {preview && (
        <div className="space-y-3" data-testid="wizard-preview-list">
          <div className="bg-canvas-light border border-border-light px-3 py-2">
            <p className="text-[12px] font-semibold text-text-on-light">
              {preview.summary}
            </p>
            <p className="text-[10px] font-mono text-muted-on-light">
              found={preview.diffs.filter((d) => d.found).length}/{preview.diffs.length}{' '}
              · hash={preview.hash.slice(0, 16)}…
            </p>
          </div>
          {preview.diffs.map((d, i) => (
            <NodeDiffMini key={`${d.node_id}-${i}`} diff={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDiffMini({ diff }: { diff: NodeDiff }) {
  if (!diff.found) {
    return (
      <div
        className="bg-white border border-danger/30 p-2"
        data-testid={`wizard-diff-${diff.node_id}`}
      >
        <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-danger/10 text-danger border border-danger/40">
          não encontrado
        </span>
        <span className="text-[11px] font-mono text-muted-on-light ml-2">
          {diff.node_id.slice(0, 12)}…
        </span>
      </div>
    );
  }
  const nameChanged = diff.name_before !== diff.name_after;
  const markingsChanged =
    JSON.stringify(diff.markings_before) !== JSON.stringify(diff.markings_after);
  const propChanges = diff.props_diff.filter((p) => p.op !== 'noop');
  return (
    <div
      className="bg-white border border-border-light p-3"
      data-testid={`wizard-diff-${diff.node_id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold text-text-on-light truncate">
          {diff.current_name}
        </p>
        <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 border border-success/40 text-success bg-success/5">
          {propChanges.length + (markingsChanged ? 1 : 0) + (nameChanged ? 1 : 0)} alt.
        </span>
      </div>
      {markingsChanged && (
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-1.5">
          <span className="px-2 py-1 bg-danger/5 text-danger border border-danger/20">
            {diff.markings_before.join(', ') || '∅'}
          </span>
          <span className="px-2 py-1 bg-success/5 text-success border border-success/20">
            {diff.markings_after.join(', ') || '∅'}
          </span>
        </div>
      )}
      {propChanges.length > 0 && (
        <table className="w-full text-[11px] font-mono">
          <tbody>
            {propChanges.map((p) => (
              <tr key={p.key} className="align-top">
                <td className="py-0.5 pr-2 text-muted-on-light w-1/3">{p.key}</td>
                <td className="py-0.5 text-text-on-light break-all">
                  {JSON.stringify(p.before)} → {JSON.stringify(p.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function StepApply({
  applying,
  appliedRunId,
  preview,
  onApply,
  onReset,
}: {
  applying: boolean;
  appliedRunId: string | null;
  preview: ScenarioPreview | null;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="wizard-step-apply">
      {!appliedRunId ? (
        <>
          <p className="text-[12px] text-text-on-light">
            Revise o preview e clique em <span className="font-semibold">Confirmar aplicar</span>{' '}
            no rodapé. Você será solicitado a digitar{' '}
            <code className="font-mono">aplicar</code> para confirmar.
          </p>
          {preview && (
            <div className="bg-canvas-light border border-border-light px-3 py-2">
              <p className="text-[11px] font-mono text-muted-on-light">
                {preview.diffs.filter((d) => d.found).length} nós serão
                alterados · hash={preview.hash.slice(0, 16)}…
              </p>
            </div>
          )}
          <p className="text-[10.5px] text-muted-on-light leading-snug">
            Operação destrutiva. Cada nó alterado emite LineageEvent{' '}
            <code className="font-mono">scenario.branch.commit</code>. O cenário
            fica registrado no histórico como <code className="font-mono">merged</code>.
          </p>
        </>
      ) : (
        <div className="space-y-2" data-testid="wizard-applied-banner">
          <div className="bg-success/5 border border-success/30 px-3 py-2 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-text-on-light">
                Cenário aplicado com sucesso.
              </p>
              <p className="text-[10.5px] font-mono text-muted-on-light">
                scenario={appliedRunId.slice(0, 12)}…
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-on-light leading-snug">
            Clique <span className="font-semibold">Novo cenário</span> no rodapé
            para começar outro fluxo, ou alterne ao Modo Avançado para inspecionar
            o histórico persistido.
          </p>
        </div>
      )}
      {applying && (
        <div className="flex items-center gap-2 text-[12px] text-muted-on-light">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          Aplicando branch definitivo…
        </div>
      )}
      <GitBranch className="hidden" />
      <button type="button" onClick={onReset} className="hidden" data-testid="wizard-reset-hidden">
        reset
      </button>
    </div>
  );
}

export { TEMPLATES };
