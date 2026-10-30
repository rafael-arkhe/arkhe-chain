'use client';

/**
 * Cenários what-if — Painel de Controle (Sprint L12 · 2026-05-23).
 *
 * Operador descreve patches sobre OntologyNode reais (mudar props,
 * markings, name) e o backend devolve um diff estruturado. Após preview,
 * pode aplicar via Merge — cada nó alterado emite LineageEvent
 * `scenario.merge`.
 *
 * Layout 3-col Palantir-style:
 *   ESQ  · Builder: nó-alvo + form de patch
 *   CENTRO · Diff renderizado side-by-side por NodeDiff
 *   DIR  · Resumo + Aplicar (Confirm danger) + histórico em memória
 *
 * Persistência: scenarios NÃO ficam guardados (backend é stateless por
 * design). Histórico de scenario_ids dos últimos merges fica em
 * `React.useState` apenas — declarado como follow-up se virar quente.
 */
import * as React from 'react';
import {
  Gavel,
  GitBranch,
  GitCompare,
  Plus,
  Search,
  Trash2,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { OPERACIONAL_CENARIOS_TABS } from '@/components/control-panel/hub-tabs';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { CpErrorState } from '@/components/control-panel/cp-skeleton';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScenarioWizard } from '@/components/wave-h3/scenario-wizard';
import {
  OntologyNodes,
  Scenarios,
  type NodeDiff,
  type NodePatch,
  type OntologyNodeSearchItem,
  type ScenarioBranchOntologyOut,
  type ScenarioBranchOut,
  type ScenarioListItem,
  type ScenarioMergeOut,
  type ScenarioPreview,
} from '@/lib/api';
import { ApiError } from '@/lib/api/client';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

interface PropPair {
  key: string;
  value: string;
}

interface PatchDraft {
  uid: string;
  node?: OntologyNodeSearchItem;
  nodeIdManual: string;
  name: string;
  markingsCsv: string;
  props: PropPair[];
  showPicker: boolean;
}

function emptyPatch(): PatchDraft {
  return {
    uid: `p-${Math.random().toString(36).slice(2, 10)}`,
    nodeIdManual: '',
    name: '',
    markingsCsv: '',
    props: [],
    showPicker: false,
  };
}

function patchToNodePatch(p: PatchDraft): NodePatch | null {
  const node_id = p.node?.id || p.nodeIdManual.trim();
  if (!node_id) return null;
  const props: Record<string, unknown> = {};
  for (const pp of p.props) {
    if (!pp.key.trim()) continue;
    let v: unknown = pp.value;
    const raw = pp.value.trim();
    if (raw === 'true') v = true;
    else if (raw === 'false') v = false;
    else if (raw !== '' && !isNaN(Number(raw))) v = Number(raw);
    props[pp.key.trim()] = v;
  }
  const markings = p.markingsCsv
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    node_id,
    props: Object.keys(props).length > 0 ? props : null,
    markings: markings.length > 0 ? markings : null,
    name: p.name.trim() || null,
  };
}

export default function ScenariosPage() {
  return (
    <RequirePerm perm="ontology.objects.write">
      <ScenariosInner />
    </RequirePerm>
  );
}

type ViewMode = 'wizard' | 'advanced';

function ScenariosInner() {
  // Wave H.3 — toggle entre Modo Guiado (wizard 4-passos) e Modo
  // Avançado (3-pane Builder/Diff/Resumo). ADD alongside; nada do
  // fluxo original muda. Default = advanced (compat com toda a suite
  // de Sprint L12/Wave D.1 + golden-path).
  const [viewMode, setViewMode] = React.useState<ViewMode>('advanced');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [patches, setPatches] = React.useState<PatchDraft[]>([emptyPatch()]);
  const [preview, setPreview] = React.useState<ScenarioPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [merging, setMerging] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<ScenarioMergeOut[]>([]);
  /**
   * Wave D.1 — branch ativa (sandbox). Operador cria branch via
   * "Criar branch", inspeciona via getBranchOntology, e então commit
   * (aplica definitivo) ou discard (cancela). Apenas 1 branch ativa
   * por sessão da UI — operador deve resolver antes de criar outra.
   */
  const [activeBranch, setActiveBranch] = React.useState<ScenarioBranchOut | null>(
    null,
  );
  const [branchOntology, setBranchOntology] =
    React.useState<ScenarioBranchOntologyOut | null>(null);
  const [branchLoading, setBranchLoading] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);
  /**
   * Wave C.1 — histórico persistido. Vem do GET /platform/v23/scenarios
   * e contém cenários aplicados (status=merged) ou em rascunho
   * (status=draft/discarded) pelo usuário corrente, mesmo após reload.
   */
  const [archive, setArchive] = React.useState<ScenarioListItem[] | null>(null);
  const [archiveErr, setArchiveErr] = React.useState<string | null>(null);
  const askConfirm = useConfirm();

  const refreshArchive = React.useCallback(() => {
    setArchiveErr(null);
    Scenarios.listMine(50)
      .then(setArchive)
      .catch((e) => setArchiveErr(humanise(e)));
  }, []);

  React.useEffect(() => {
    refreshArchive();
  }, [refreshArchive]);

  const updatePatch = (uid: string, partial: Partial<PatchDraft>) =>
    setPatches((arr) =>
      arr.map((p) => (p.uid === uid ? { ...p, ...partial } : p)),
    );

  function addPatch() {
    setPatches((arr) => [...arr, emptyPatch()]);
  }

  function removePatch(uid: string) {
    setPatches((arr) => (arr.length <= 1 ? arr : arr.filter((p) => p.uid !== uid)));
  }

  function addProp(uid: string) {
    setPatches((arr) =>
      arr.map((p) =>
        p.uid === uid
          ? { ...p, props: [...p.props, { key: '', value: '' }] }
          : p,
      ),
    );
  }

  function updateProp(uid: string, idx: number, partial: Partial<PropPair>) {
    setPatches((arr) =>
      arr.map((p) =>
        p.uid === uid
          ? {
              ...p,
              props: p.props.map((pp, i) =>
                i === idx ? { ...pp, ...partial } : pp,
              ),
            }
          : p,
      ),
    );
  }

  function removeProp(uid: string, idx: number) {
    setPatches((arr) =>
      arr.map((p) =>
        p.uid === uid
          ? { ...p, props: p.props.filter((_, i) => i !== idx) }
          : p,
      ),
    );
  }

  function buildBody() {
    const items = patches
      .map(patchToNodePatch)
      .filter((p): p is NodePatch => p !== null);
    return {
      name: name.trim() || `Cenário ${new Date().toISOString().slice(0, 16)}`,
      description: description.trim(),
      patches: items,
    };
  }

  async function runPreview() {
    setErr(null);
    setPreview(null);
    const body = buildBody();
    if (body.patches.length === 0) {
      setErr('Adicione ao menos um patch com node_id selecionado.');
      return;
    }
    setPreviewing(true);
    try {
      const r = await Scenarios.preview(body);
      setPreview(r);
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setPreviewing(false);
    }
  }

  /**
   * Wave D.1 — substitui "Aplicar (Merge)" direto pelo fluxo de branch
   * isolation:
   *   1. createBranch(scenario_id='draft')  → cria ScenarioRun draft + branch ativa
   *   2. getBranchOntology                   → painel direito mostra estado simulado
   *   3. commit ou discard                   → finaliza o sandbox
   *
   * Enquanto status=active, OntologyNodes não são tocados — patches
   * vivem somente em ``ghost_patches`` da branch.
   */
  async function runCreateBranch() {
    if (!preview) {
      setErr('Gere o preview antes de criar branch.');
      return;
    }
    setMerging(true);
    setErr(null);
    try {
      const body = buildBody();
      const br = await Scenarios.createBranch('draft', body.patches, {
        name: body.name,
        description: body.description,
      });
      setActiveBranch(br);
      setBranchLoading(true);
      try {
        const view = await Scenarios.getBranchOntology(
          br.scenario_id,
          br.branch_id,
        );
        setBranchOntology(view);
      } finally {
        setBranchLoading(false);
      }
      setPreview(null);
      refreshArchive();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setMerging(false);
    }
  }

  async function commitActiveBranch() {
    if (!activeBranch) return;
    const ok = await askConfirm({
      title: 'Aplicar branch definitivo',
      description: (
        <>
          Os {branchOntology?.nodes.filter((n) => n.found).length ?? 0} nós da
          ontologia simulada serão consolidados (cada um emite LineageEvent{' '}
          <code className="ml-1 font-mono">scenario.branch.commit</code>). A
          branch fica registrada como <code className="font-mono">merged</code>.
        </>
      ),
      confirmLabel: 'Aplicar definitivo',
      tone: 'danger',
      requireConfirmText: 'aplicar',
    });
    if (!ok) return;
    setCommitting(true);
    setErr(null);
    try {
      await Scenarios.commitBranch(
        activeBranch.scenario_id,
        activeBranch.branch_id,
      );
      setActiveBranch(null);
      setBranchOntology(null);
      refreshArchive();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setCommitting(false);
    }
  }

  async function discardActiveBranch() {
    if (!activeBranch) return;
    setDiscarding(true);
    setErr(null);
    try {
      await Scenarios.discardBranch(
        activeBranch.scenario_id,
        activeBranch.branch_id,
      );
      setActiveBranch(null);
      setBranchOntology(null);
      refreshArchive();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setDiscarding(false);
    }
  }

  const totalChanges = preview
    ? preview.diffs.reduce(
        (acc, d) =>
          acc +
          d.props_diff.filter((p) => p.op !== 'noop').length +
          (JSON.stringify(d.markings_before) !== JSON.stringify(d.markings_after) ? 1 : 0) +
          (d.name_before !== d.name_after ? 1 : 0),
        0,
      )
    : 0;
  const foundCount = preview
    ? preview.diffs.filter((d) => d.found).length
    : 0;

  return (
    <div data-testid="scenarios-page">
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <Gavel className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            Cenários
          </span>
        }
        subtitle="What-if sobre a ontologia: propõe patches em nós existentes, vê o diff, aplica como Merge auditado. Cada nó alterado vira LineageEvent scenario.merge."
      />
      <CpHubSubnav group="Cenários" tabs={OPERACIONAL_CENARIOS_TABS} />

      <div
        className="px-6 py-3 border-b border-border-light bg-white flex items-center gap-2"
        data-testid="scenarios-mode-toggle"
      >
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Modo
        </span>
        <div
          role="tablist"
          aria-label="Modo de uso dos Cenários"
          className="inline-flex border border-border-light bg-canvas-light"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'wizard'}
            onClick={() => setViewMode('wizard')}
            data-testid="scenarios-mode-wizard"
            data-active={viewMode === 'wizard' ? 'true' : 'false'}
            className={
              'px-3 py-1.5 text-[11.5px] uppercase tracking-wider font-semibold transition-colors ' +
              (viewMode === 'wizard'
                ? 'bg-primary text-white'
                : 'text-muted-on-light hover:text-text-on-light')
            }
          >
            Guiado (wizard)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'advanced'}
            onClick={() => setViewMode('advanced')}
            data-testid="scenarios-mode-advanced"
            data-active={viewMode === 'advanced' ? 'true' : 'false'}
            className={
              'px-3 py-1.5 text-[11.5px] uppercase tracking-wider font-semibold border-l border-border-light transition-colors ' +
              (viewMode === 'advanced'
                ? 'bg-primary text-white'
                : 'text-muted-on-light hover:text-text-on-light')
            }
          >
            Avançado (3-pane)
          </button>
        </div>
        <span className="text-[10.5px] text-muted-on-light leading-snug ml-3">
          Mesmos endpoints REST nos dois modos · histórico abaixo é o
          persistido (compartilhado entre os modos).
        </span>
      </div>

      {viewMode === 'wizard' && (
        <div className="p-6 bg-canvas-light min-h-[calc(100vh-260px)]" data-testid="scenarios-wizard-pane">
          <ScenarioWizard />
          <section
            className="mt-6 bg-white border border-border-light p-4"
            data-testid="scenarios-wizard-archive"
          >
            <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
              Histórico persistido
            </h3>
            {archiveErr && (
              <p
                className="text-[10.5px] font-mono text-danger"
                data-testid="scenarios-wizard-archive-error"
              >
                {archiveErr}
              </p>
            )}
            {archive !== null && archive.length === 0 ? (
              <p className="text-[11px] text-muted-on-light">
                Nenhum cenário aplicado ainda. Após o primeiro merge, o
                histórico persistido aparece aqui mesmo após reload.
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="scenarios-wizard-history">
                {(archive ?? []).slice(0, 10).map((a) => (
                  <li
                    key={a.scenario_id}
                    className="bg-canvas-light border border-border-light px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-text-on-light truncate flex-1 min-w-0">
                        {a.name}
                      </p>
                      <span
                        className={
                          'text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 border ' +
                          (a.status === 'merged'
                            ? 'border-success/40 text-success bg-success/5'
                            : a.status === 'discarded'
                              ? 'border-danger/40 text-danger bg-danger/5'
                              : 'border-border-light text-muted-on-light bg-canvas-light')
                        }
                      >
                        {a.status}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-on-light">
                      merged={a.merged_count} · skipped={a.skipped_count} ·{' '}
                      {a.created_by}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {viewMode === 'advanced' && (
      <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-180px)]">
        {/* ESQ — Builder */}
        <section
          className="col-span-4 border-r border-border-light bg-white overflow-y-auto"
          data-testid="scenarios-builder"
        >
          <div className="p-4 space-y-3 border-b border-border-light">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                Nome do cenário
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cenário-X · operação Aurora"
                className="bg-white h-8 text-[12px]"
                data-testid="scenarios-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
                Descrição
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Motivo + impacto esperado"
                className="bg-white h-8 text-[12px]"
                data-testid="scenarios-description"
              />
            </div>
          </div>

          <div className="p-4 space-y-3" data-testid="scenarios-patches">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
                Patches ({patches.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={addPatch}
                className="h-7 text-[11px]"
                data-testid="scenarios-add-patch"
              >
                <Plus className="w-3 h-3" strokeWidth={1.5} />
                Adicionar nó
              </Button>
            </div>

            {patches.map((p) => (
              <PatchCard
                key={p.uid}
                draft={p}
                onChange={(partial) => updatePatch(p.uid, partial)}
                onRemove={() => removePatch(p.uid)}
                onAddProp={() => addProp(p.uid)}
                onUpdateProp={(idx, partial) => updateProp(p.uid, idx, partial)}
                onRemoveProp={(idx) => removeProp(p.uid, idx)}
                canRemove={patches.length > 1}
              />
            ))}
          </div>
        </section>

        {/* CENTRO — Diff ou Ontologia simulada (branch ativa) */}
        <section
          className="col-span-5 overflow-y-auto bg-canvas-light"
          data-testid="scenarios-diff"
        >
          <div className="p-4 border-b border-border-light bg-white flex items-center gap-3">
            {activeBranch ? (
              <>
                <GitBranch className="w-4 h-4 text-primary" strokeWidth={1.5} />
                <span
                  className="text-[12px] font-semibold text-text-on-light"
                  data-testid="branch-header-label"
                >
                  Ontologia simulada (branch sandbox)
                </span>
                <span
                  className="text-[10px] font-mono text-muted-on-light"
                  data-testid="branch-header-id"
                >
                  branch={activeBranch.branch_id.slice(0, 8)}… · scenario=
                  {activeBranch.scenario_id.slice(0, 8)}…
                </span>
              </>
            ) : (
              <>
                <Button
                  onClick={runPreview}
                  disabled={previewing}
                  className="h-8 text-[12px]"
                  data-testid="scenarios-preview-btn"
                >
                  <GitCompare className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {previewing ? 'Computando…' : 'Preview do diff'}
                </Button>
                <span className="text-[10.5px] font-mono text-muted-on-light">
                  dry-run · zero side effects
                </span>
              </>
            )}
          </div>

          <div className="p-4 space-y-3">
            {err && (
              <CpErrorState
                title="Erro"
                description={err}
                retry={runPreview}
                diagnostic={{
                  path: activeBranch
                    ? '/platform/v23/scenarios/.../branches'
                    : '/platform/v23/scenarios/preview',
                  message: err,
                }}
              />
            )}

            {/* Ontologia simulada — visível quando há branch ativa */}
            {activeBranch && (
              <div className="space-y-3" data-testid="branch-ontology">
                {branchLoading ? (
                  <p className="text-[11px] font-mono text-muted-on-light flex items-center gap-2">
                    <Loader2
                      className="w-3 h-3 animate-spin"
                      strokeWidth={1.5}
                    />
                    Carregando ontologia simulada…
                  </p>
                ) : branchOntology ? (
                  branchOntology.nodes.length === 0 ? (
                    <p className="text-[11.5px] text-muted-on-light">
                      Branch sem nós válidos.
                    </p>
                  ) : (
                    branchOntology.nodes.map((n) => (
                      <BranchNodeCard key={n.node_id} node={n} />
                    ))
                  )
                ) : (
                  <p className="text-[11.5px] text-muted-on-light">
                    Estado simulado indisponível.
                  </p>
                )}
              </div>
            )}

            {!activeBranch && !preview && !err && (
              <CpEmptyState
                icon={GitCompare}
                title="Sem preview ainda"
                description="Configure os patches à esquerda e clique em Preview do diff."
              />
            )}

            {!activeBranch && preview && (
              <div className="space-y-3" data-testid="scenarios-diff-list">
                {preview.diffs.map((d, i) => (
                  <NodeDiffCard key={`${d.node_id}-${i}`} diff={d} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* DIR — Resumo + Branch actions */}
        <aside
          className="col-span-3 border-l border-border-light bg-white overflow-y-auto"
          data-testid="scenarios-summary"
        >
          <div className="p-4 border-b border-border-light">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
              Resumo
            </h3>
            {activeBranch ? (
              <div
                className="space-y-1 text-[12px] text-text-on-light"
                data-testid="branch-summary"
              >
                <p className="font-semibold flex items-center gap-1.5">
                  <GitBranch
                    className="w-3.5 h-3.5 text-primary"
                    strokeWidth={1.5}
                  />
                  Branch ativa
                </p>
                <p className="text-[10.5px] font-mono text-muted-on-light">
                  status={activeBranch.status} · nodes=
                  {branchOntology?.nodes.length ?? '…'} · found=
                  {branchOntology
                    ? branchOntology.nodes.filter((n) => n.found).length
                    : '…'}
                </p>
                <p className="text-[10px] font-mono text-muted-on-light truncate">
                  scenario={activeBranch.scenario_id.slice(0, 12)}…
                </p>
              </div>
            ) : preview ? (
              <div className="space-y-1 text-[12px] text-text-on-light">
                <p data-testid="scenarios-summary-text">{preview.summary}</p>
                <p className="text-[10.5px] font-mono text-muted-on-light">
                  found={foundCount}/{preview.diffs.length} · changes={totalChanges}
                </p>
                <p className="text-[10px] font-mono text-muted-on-light truncate">
                  hash={preview.hash.slice(0, 16)}…
                </p>
              </div>
            ) : (
              <p className="text-[11.5px] text-muted-on-light">
                Sem preview ainda.
              </p>
            )}
          </div>

          <div className="p-4 border-b border-border-light space-y-2">
            {activeBranch ? (
              <>
                <Button
                  onClick={commitActiveBranch}
                  disabled={committing || discarding}
                  variant="destructive"
                  className="w-full h-9 text-[12px]"
                  data-testid="branch-commit-btn"
                >
                  {committing ? (
                    <>
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin"
                        strokeWidth={1.5}
                      />
                      Aplicando…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Commit (aplicar definitivo)
                    </>
                  )}
                </Button>
                <Button
                  onClick={discardActiveBranch}
                  disabled={committing || discarding}
                  variant="outline"
                  className="w-full h-9 text-[12px]"
                  data-testid="branch-discard-btn"
                >
                  {discarding ? (
                    <>
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin"
                        strokeWidth={1.5}
                      />
                      Descartando…
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Descartar branch
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={runCreateBranch}
                  disabled={!preview || merging}
                  className="w-full h-9 text-[12px]"
                  data-testid="scenarios-create-branch-btn"
                >
                  {merging ? (
                    <>
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin"
                        strokeWidth={1.5}
                      />
                      Criando branch…
                    </>
                  ) : (
                    <>
                      <GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Criar branch
                    </>
                  )}
                </Button>
                {!preview && (
                  <p className="text-[10px] text-muted-on-light leading-snug">
                    Habilita após preview com pelo menos um diff válido.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="p-4">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
              Histórico
            </h3>
            {archiveErr && (
              <p
                className="text-[10.5px] font-mono text-danger"
                data-testid="scenarios-archive-error"
              >
                {archiveErr}
              </p>
            )}
            {archive !== null && archive.length === 0 ? (
              <p className="text-[11px] text-muted-on-light">
                Nenhum cenário aplicado ainda. Após o primeiro merge, o
                histórico persistido aparece aqui mesmo após reload.
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="scenarios-history">
                {/* Wave C.1 — mostra archive persistido (todos os runs) */}
                {(archive ?? []).map((a) => (
                  <li
                    key={a.scenario_id}
                    className="bg-canvas-light border border-border-light px-2.5 py-1.5 text-[11px]"
                    data-testid={`scenarios-history-${a.scenario_id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-text-on-light truncate flex-1 min-w-0">
                        {a.name}
                      </p>
                      <span
                        className={`text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 border ${
                          a.status === 'merged'
                            ? 'border-success/40 text-success bg-success/5'
                            : a.status === 'discarded'
                            ? 'border-danger/40 text-danger bg-danger/5'
                            : 'border-border-light text-muted-on-light bg-canvas-light'
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-on-light">
                      merged={a.merged_count} · skipped={a.skipped_count} ·{' '}
                      {a.created_by}
                    </p>
                    <p className="text-[9.5px] font-mono text-muted-on-light truncate">
                      {a.scenario_id.slice(0, 12)}… · hash=
                      {a.scenario_hash.slice(0, 8)}…
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function PatchCard({
  draft,
  onChange,
  onRemove,
  onAddProp,
  onUpdateProp,
  onRemoveProp,
  canRemove,
}: {
  draft: PatchDraft;
  onChange: (partial: Partial<PatchDraft>) => void;
  onRemove: () => void;
  onAddProp: () => void;
  onUpdateProp: (idx: number, partial: Partial<PropPair>) => void;
  onRemoveProp: (idx: number) => void;
  canRemove: boolean;
}) {
  return (
    <div
      className="border border-border-light bg-canvas-light"
      data-testid={`patch-${draft.uid}`}
    >
      <header className="px-3 py-2 flex items-center justify-between border-b border-border-light bg-white">
        <span className="text-[11px] uppercase tracking-wider text-muted-on-light font-semibold">
          Nó-alvo
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-on-light hover:text-danger"
            aria-label="Remover patch"
            data-testid={`patch-remove-${draft.uid}`}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
      </header>

      <div className="p-3 space-y-2.5">
        {draft.node ? (
          <div className="bg-white border border-border-light px-2.5 py-2 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-text-on-light truncate">
                {draft.node.name}
              </p>
              <p className="text-[10px] font-mono text-muted-on-light truncate">
                {draft.node.node_type} · {draft.node.id.slice(0, 8)}…
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ node: undefined, showPicker: false })}
              className="text-muted-on-light hover:text-text-on-light"
              aria-label="Trocar nó"
              data-testid={`patch-clear-${draft.uid}`}
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <NodePicker
            uid={draft.uid}
            manualId={draft.nodeIdManual}
            onManualChange={(v) => onChange({ nodeIdManual: v })}
            onSelect={(n) => onChange({ node: n, nodeIdManual: n.id, showPicker: false })}
            open={draft.showPicker}
            setOpen={(v) => onChange({ showPicker: v })}
          />
        )}

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Nome (override opcional)
          </Label>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Deixe em branco para manter"
            className="bg-white h-7 text-[11.5px]"
            data-testid={`patch-name-${draft.uid}`}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
            Marcações (csv) — substitui a lista
          </Label>
          <Input
            value={draft.markingsCsv}
            onChange={(e) => onChange({ markingsCsv: e.target.value })}
            placeholder="OPERACIONAL, RESTRITO"
            className="bg-white h-7 text-[11.5px] font-mono"
            data-testid={`patch-markings-${draft.uid}`}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
              Properties (merge)
            </Label>
            <Button
              size="sm"
              variant="ghost"
              onClick={onAddProp}
              className="h-6 px-1.5 text-[10.5px]"
              data-testid={`patch-add-prop-${draft.uid}`}
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} />
              Adicionar
            </Button>
          </div>
          {draft.props.length === 0 ? (
            <p className="text-[10.5px] text-muted-on-light">
              Nenhuma alteração de prop neste patch.
            </p>
          ) : (
            <ul className="space-y-1">
              {draft.props.map((pp, idx) => (
                <li key={idx} className="flex items-center gap-1">
                  <Input
                    value={pp.key}
                    onChange={(e) => onUpdateProp(idx, { key: e.target.value })}
                    placeholder="chave"
                    className="bg-white h-7 text-[11px] font-mono flex-1"
                    data-testid={`patch-prop-key-${draft.uid}-${idx}`}
                  />
                  <Input
                    value={pp.value}
                    onChange={(e) => onUpdateProp(idx, { value: e.target.value })}
                    placeholder="valor"
                    className="bg-white h-7 text-[11px] font-mono flex-1"
                    data-testid={`patch-prop-value-${draft.uid}-${idx}`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveProp(idx)}
                    className="text-muted-on-light hover:text-danger p-1"
                    aria-label="Remover prop"
                    data-testid={`patch-prop-remove-${draft.uid}-${idx}`}
                  >
                    <X className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function NodePicker({
  uid,
  manualId,
  onManualChange,
  onSelect,
  open,
  setOpen,
}: {
  uid: string;
  manualId: string;
  onManualChange: (v: string) => void;
  onSelect: (n: OntologyNodeSearchItem) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [q, setQ] = React.useState('');
  const [items, setItems] = React.useState<OntologyNodeSearchItem[] | null>(null);
  const [searchErr, setSearchErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function search() {
    setSearchErr(null);
    setLoading(true);
    try {
      const r = await OntologyNodes.search({ q: q.trim() || undefined, limit: 25 });
      setItems(r);
    } catch (e) {
      setSearchErr(humanise(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (open && items === null) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
        Selecione um nó da ontologia
      </Label>
      <div className="flex items-center gap-1">
        <Input
          value={manualId}
          onChange={(e) => onManualChange(e.target.value)}
          placeholder="UUID do nó (ou use Buscar)"
          className="bg-white h-7 text-[11px] font-mono flex-1"
          data-testid={`patch-node-id-${uid}`}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(!open)}
          className="h-7 text-[11px]"
          data-testid={`patch-node-picker-${uid}`}
        >
          <Search className="w-3 h-3" strokeWidth={1.5} />
          {open ? 'Fechar' : 'Buscar'}
        </Button>
      </div>

      {open && (
        <div className="bg-white border border-border-light p-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome…"
              className="bg-white h-7 text-[11px] flex-1"
              data-testid={`patch-search-q-${uid}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search();
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void search()}
              className="h-7 text-[11px]"
              disabled={loading}
            >
              {loading ? '…' : 'OK'}
            </Button>
          </div>
          {searchErr && (
            <p className="text-[10.5px] text-danger font-mono">{searchErr}</p>
          )}
          {items && items.length === 0 && (
            <p className="text-[10.5px] text-muted-on-light">Sem resultados.</p>
          )}
          {items && items.length > 0 && (
            <ul className="max-h-48 overflow-y-auto" data-testid={`patch-search-results-${uid}`}>
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(it)}
                    className="w-full text-left px-2 py-1 hover:bg-canvas-light"
                    data-testid={`patch-search-pick-${uid}-${it.id}`}
                  >
                    <p className="text-[11.5px] font-semibold text-text-on-light truncate">
                      {it.name}
                    </p>
                    <p className="text-[9.5px] font-mono text-muted-on-light truncate">
                      {it.node_type} · {it.id.slice(0, 12)}…
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function NodeDiffCard({ diff }: { diff: NodeDiff }) {
  if (!diff.found) {
    return (
      <div
        className="bg-white border border-danger/30 p-3"
        data-testid={`diff-${diff.node_id}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-danger/10 text-danger border border-danger/40">
            não encontrado
          </span>
          <span className="text-[11px] font-mono text-muted-on-light truncate">
            {diff.node_id}
          </span>
        </div>
        {diff.deny_reason && (
          <p className="text-[11px] text-text-on-light mt-1">{diff.deny_reason}</p>
        )}
      </div>
    );
  }

  const nameChanged = diff.name_before !== diff.name_after;
  const markingsChanged =
    JSON.stringify(diff.markings_before) !== JSON.stringify(diff.markings_after);
  const propChanges = diff.props_diff.filter((p) => p.op !== 'noop');

  return (
    <div
      className="bg-white border border-border-light"
      data-testid={`diff-${diff.node_id}`}
    >
      <header className="px-3 py-2 border-b border-border-light flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-text-on-light truncate">
            {diff.current_name}
          </p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {diff.current_kind} · {diff.node_id.slice(0, 12)}…
          </p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 border border-success/40 text-success bg-success/5">
          {propChanges.length + (markingsChanged ? 1 : 0) + (nameChanged ? 1 : 0)} alterações
        </span>
      </header>

      <div className="p-3 space-y-3">
        {nameChanged && (
          <div data-testid={`diff-name-${diff.node_id}`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
              Nome
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 bg-danger/5 text-danger border border-danger/20 line-through">
                {diff.name_before ?? '(vazio)'}
              </span>
              <span className="px-2 py-1 bg-success/5 text-success border border-success/20">
                {diff.name_after ?? '(vazio)'}
              </span>
            </div>
          </div>
        )}

        {markingsChanged && (
          <div data-testid={`diff-markings-${diff.node_id}`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
              Marcações
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 bg-danger/5 text-danger border border-danger/20">
                {diff.markings_before.join(', ') || '∅'}
              </span>
              <span className="px-2 py-1 bg-success/5 text-success border border-success/20">
                {diff.markings_after.join(', ') || '∅'}
              </span>
            </div>
          </div>
        )}

        {propChanges.length > 0 && (
          <div data-testid={`diff-props-${diff.node_id}`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
              Properties
            </p>
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-left text-muted-on-light">
                  <th className="py-1 pr-2 font-semibold">Key</th>
                  <th className="py-1 pr-2 font-semibold">Before</th>
                  <th className="py-1 font-semibold">After</th>
                </tr>
              </thead>
              <tbody>
                {propChanges.map((p) => {
                  const opStyle =
                    p.op === 'add'
                      ? 'border-success/30 bg-success/5 text-success'
                      : p.op === 'update'
                      ? 'border-warning/30 bg-warning/5 text-warning'
                      : 'border-border-light text-muted-on-light';
                  return (
                    <tr key={p.key} className="align-top">
                      <td className="py-1 pr-2">
                        <span
                          className={`px-1.5 py-0.5 border ${opStyle}`}
                        >
                          {p.key}
                        </span>
                      </td>
                      <td className="py-1 pr-2 text-text-on-light">
                        {p.before === undefined || p.before === null ? (
                          <span className="text-muted-on-light">∅</span>
                        ) : (
                          JSON.stringify(p.before)
                        )}
                      </td>
                      <td className="py-1 text-text-on-light">
                        {JSON.stringify(p.after)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!nameChanged && !markingsChanged && propChanges.length === 0 && (
          <p className="text-[11px] text-muted-on-light">
            Nenhuma alteração efetiva — patch é noop.
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
/**
 * Wave D.1 — render de 1 nó na "ontologia simulada" do branch
 * (read-only). Mostra o estado after-patches, sem before/after diff
 * (operador já viu o diff durante a etapa de preview).
 */
function BranchNodeCard({
  node,
}: {
  node: import('@/lib/api').ScenarioBranchNodeView;
}) {
  if (!node.found) {
    return (
      <div
        className="bg-white border border-danger/30 p-3"
        data-testid={`branch-node-${node.node_id}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 bg-danger/10 text-danger border border-danger/40">
            não encontrado
          </span>
          <span className="text-[11px] font-mono text-muted-on-light truncate">
            {node.node_id}
          </span>
        </div>
        {node.deny_reason && (
          <p className="text-[11px] text-text-on-light mt-1">
            {node.deny_reason}
          </p>
        )}
      </div>
    );
  }

  const propEntries = Object.entries(node.properties || {});
  return (
    <div
      className="bg-white border border-border-light"
      data-testid={`branch-node-${node.node_id}`}
    >
      <header className="px-3 py-2 border-b border-border-light flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-text-on-light truncate">
            {node.name}
          </p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {node.node_type} · {node.node_id.slice(0, 12)}…
          </p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 border border-primary/30 text-primary bg-primary/5">
          simulado
        </span>
      </header>

      <div className="p-3 space-y-2.5">
        {node.markings.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
              Marcações
            </p>
            <div className="flex flex-wrap gap-1">
              {node.markings.map((m) => (
                <span
                  key={m}
                  className="text-[10.5px] font-mono px-1.5 py-0.5 border border-border-light bg-canvas-light text-text-on-light"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {propEntries.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1">
              Properties ({propEntries.length})
            </p>
            <table className="w-full text-[11px] font-mono">
              <tbody>
                {propEntries.map(([k, v]) => (
                  <tr key={k} className="align-top">
                    <td className="py-0.5 pr-2 text-muted-on-light w-1/3">
                      {k}
                    </td>
                    <td className="py-0.5 text-text-on-light break-all">
                      {JSON.stringify(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
