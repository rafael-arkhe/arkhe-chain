'use client';

/**
 * MergeOntologia — "Mesclar na ontologia" no detalhe do /buscar (P4 ELO 2).
 *
 * Projeta o resultado de QUALQUER conector num objeto CANÔNICO da ontologia
 * (OntologyNode) pelo pipeline GOVERNADO de merge (ontology-module
 * /ontology/merge). Fluxo PRÉVIA→confirmar, com os TRÊS caminhos de resolução
 * de alvo (decisão do usuário): AUTO-SUGERIR o melhor match · PICKER manual ·
 * CRIAR NOVO se não achar.
 *
 *   (a) auto → /merge/preview com {node_type, canonical} mostra o objeto
 *       SUGERIDO ("É este? / Buscar outro / Criar novo") + alternativas;
 *   (b) ObjectPicker manual + criar novo;
 *   (c) PREVIEW: tabela campo-a-campo (propriedade | atual | novo | situação),
 *       resolução por-conflito (manter/substituir/anexar); erro-de-formato
 *       BLOQUEIA o aplicar;
 *   (d) Aplicar → /merge/apply com field_resolutions → sucesso → link pra
 *       /ficha do objeto (NOVA ABA).
 *
 * Também cria VÍNCULOS (relação objeto↔objeto): relação por dropdown vinda do
 * schema de link types do object-type + ObjectPicker do alvo → /merge/apply com
 * link (confirmModal, NUNCA diálogo nativo).
 *
 * DOMÍNIO-AGNÓSTICO: opera por SHAPE/format. O node_type, as propriedades
 * tipadas e as relações vêm do DADO (ontologia) — ZERO vertical hardcoded.
 * ADD-alongside: pendura no detalhe sem tocar nos fluxos existentes.
 *
 * data-testids: buscar-merge-abrir, buscar-merge-sugestao, buscar-merge-picker,
 *   buscar-merge-diff, buscar-merge-conflito-<campo>, buscar-merge-aplicar,
 *   buscar-merge-vinculo, buscar-merge-verficha.
 */
import * as React from 'react';
import {
  GitMerge,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Box,
  Plus,
  Search,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { RequirePerm } from '@/components/auth/require-perm';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { objectKindLabel } from '@/lib/i18n/kind-labels';
import { humaniseSearchError } from '@/lib/buscar/humanise';
import { Ontology, type OntologyNodeType, type ObjectTypeSchema } from '@/lib/api';
import type { OntologyNode } from '@/lib/api/types';
import {
  Merge,
  type MergePreviewResult,
  type MergeApplyResult,
  type MergeTarget,
  type MergeFormatError,
  type FieldResolution,
} from '@/lib/api/merge';
import { ObjectPicker } from '@/components/ontology/object-picker';
import { SelectField } from '@/components/buscar/select-field';
import type { NormalizedResult } from '@/lib/buscar/types';

/* -------------------------------------------------------------------------- */
/* Helpers (puros — domínio-agnósticos)                                        */
/* -------------------------------------------------------------------------- */

type MergeInput = { result_payload?: Record<string, unknown>; properties?: Record<string, unknown> };

/** Corpo de merge: result_payload CRU (projetado no servidor por NOME+SHAPE)
 *  quando o raw é um objeto; senão properties de fallback (fields/facts). */
export function buildMergeInput(result: NormalizedResult): MergeInput {
  const raw = result.raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { result_payload: raw as Record<string, unknown> };
  }
  const properties: Record<string, unknown> = {};
  for (const f of result.fields ?? []) if (f?.value) properties[f.label] = f.value;
  for (const f of result.facts ?? []) if (f?.value && !(f.label in properties)) properties[f.label] = f.value;
  if (result.name && !('name' in properties)) properties.name = result.name;
  return { properties };
}

/** Valor canônico p/ auto-sugerir/buscar: seletor extraído > nome. */
export function deriveCanonical(result: NormalizedResult): string {
  return (result.action?.value || result.name || '').trim();
}

/** node_type default: casa result.kind com um tipo existente; senão o kind cru. */
export function defaultNodeType(result: NormalizedResult, types: OntologyNodeType[]): string {
  const kind = (result.kind || '').trim().toLowerCase();
  if (kind) {
    const match = types.find((tp) => tp.name.toLowerCase() === kind);
    if (match) return match.name;
  }
  return (result.kind || '').trim() || types[0]?.name || '';
}

export function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

type FieldStatus = 'novo' | 'igual' | 'conflito' | 'erro';
export interface DiffRow {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  status: FieldStatus;
  formatError?: MergeFormatError;
}

/** Tabela campo-a-campo a partir da prévia (atual → novo + situação). */
export function buildDiffRows(preview: MergePreviewResult): DiffRow[] {
  const conflicts = new Map(preview.conflicts.map((c) => [c.field, c]));
  const fmtErrors = new Map(preview.format_errors.map((f) => [f.field, f]));
  const changed = new Set(preview.updates?.changed_fields ?? []);
  const isCreate = preview.resolved_target === 'create';
  const props = preview.projected_properties ?? {};
  const fields = Object.keys(props);
  for (const c of preview.conflicts) if (!fields.includes(c.field)) fields.push(c.field);
  for (const f of preview.format_errors) if (!fields.includes(f.field)) fields.push(f.field);
  return fields.map((field): DiffRow => {
    const fe = fmtErrors.get(field);
    const conflict = conflicts.get(field);
    const newValue = field in props ? props[field] : conflict?.new;
    if (fe) return { field, oldValue: conflict?.old, newValue, status: 'erro', formatError: fe };
    if (conflict) return { field, oldValue: conflict.old, newValue: conflict.new, status: 'conflito' };
    if (isCreate || changed.has(field)) return { field, oldValue: undefined, newValue, status: 'novo' };
    return { field, oldValue: newValue, newValue, status: 'igual' };
  });
}

/** Texto do erro de formato: chave i18n estável (code) com fallback pt-BR. */
function formatErrorText(t: (k: string) => string, fe: MergeFormatError): string {
  const key = `buscar.merge.fmt.${fe.code}`;
  const tr = t(key);
  return tr !== key ? tr : fe.error;
}

/* -------------------------------------------------------------------------- */
/* Trigger (gate de perm)                                                      */
/* -------------------------------------------------------------------------- */
export function MergeOntologia({ result }: { result: NormalizedResult }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <RequirePerm perm="ontology.merge" fallback={<></>}>
      <button
        type="button"
        data-testid="buscar-merge-abrir"
        onClick={() => setOpen(true)}
        className="w-full h-8 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary text-text-on-light flex items-center justify-center gap-2"
      >
        <GitMerge className="w-3 h-3" strokeWidth={1.5} />
        {t('buscar.merge.abrir')}
      </button>
      {open && <MergeModal result={result} onClose={() => setOpen(false)} />}
    </RequirePerm>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal — PRÉVIA → confirmar                                                  */
/* -------------------------------------------------------------------------- */
function MergeModal({ result, onClose }: { result: NormalizedResult; onClose: () => void }) {
  const t = useT();
  const input = React.useMemo(() => buildMergeInput(result), [result]);
  const canonical = React.useMemo(() => deriveCanonical(result), [result]);

  const [nodeTypes, setNodeTypes] = React.useState<OntologyNodeType[]>([]);
  const [nodeType, setNodeType] = React.useState('');
  const [typesLoaded, setTypesLoaded] = React.useState(false);

  // Resolução do alvo (os três caminhos).
  const [targetMode, setTargetMode] = React.useState<'auto' | 'existing' | 'create'>('auto');
  const [chosenObjectId, setChosenObjectId] = React.useState<string | null>(null);
  const [chosenName, setChosenName] = React.useState<string>('');
  const [showPicker, setShowPicker] = React.useState(false);

  // Prévia.
  const [preview, setPreview] = React.useState<MergePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [resolutions, setResolutions] = React.useState<Record<string, FieldResolution>>({});

  // Aplicar.
  const [applying, setApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState<MergeApplyResult | null>(null);

  // Vínculo.
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkSchema, setLinkSchema] = React.useState<ObjectTypeSchema | null>(null);
  const [linkRelation, setLinkRelation] = React.useState('');
  const [linkTarget, setLinkTarget] = React.useState<OntologyNode | null>(null);
  const [linkPicker, setLinkPicker] = React.useState(false);
  const [linkBusy, setLinkBusy] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [linkDone, setLinkDone] = React.useState(false);

  // Carrega os tipos de objeto uma vez (dropdown + default).
  React.useEffect(() => {
    let cancelled = false;
    Ontology.listNodeTypes()
      .then((types) => {
        if (cancelled) return;
        setNodeTypes(types);
        setNodeType(defaultNodeType(result, types));
      })
      .catch(() => {
        if (!cancelled) setNodeType((result.kind || '').trim());
      })
      .finally(() => {
        if (!cancelled) setTypesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const buildTarget = React.useCallback((): MergeTarget => {
    if (targetMode === 'existing' && chosenObjectId) return { object_id: chosenObjectId };
    if (targetMode === 'create') return { create: nodeType };
    return { node_type: nodeType, canonical };
  }, [targetMode, chosenObjectId, nodeType, canonical]);

  const runPreview = React.useCallback(async () => {
    if (!nodeType) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await Merge.preview({ ...input, target: buildTarget() });
      setPreview(res);
      const defs: Record<string, FieldResolution> = {};
      for (const c of res.conflicts) defs[c.field] = 'keep'; // default seguro
      setResolutions(defs);
    } catch (e) {
      setPreview(null);
      setPreviewError(humaniseSearchError(e));
    } finally {
      setPreviewLoading(false);
    }
  }, [nodeType, input, buildTarget]);

  // (re)prévia sempre que a resolução do alvo muda.
  React.useEffect(() => {
    if (nodeType) void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeType, targetMode, chosenObjectId]);

  // Schema de link types do tipo escolhido (relações disponíveis no vínculo).
  React.useEffect(() => {
    if (!linkOpen || !nodeType) return;
    let cancelled = false;
    Ontology.objectTypeSchema(nodeType)
      .then((s) => {
        if (!cancelled) setLinkSchema(s);
      })
      .catch(() => {
        if (!cancelled) setLinkSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkOpen, nodeType]);

  /* ---- handlers de resolução do alvo ---- */
  const resetApply = () => {
    setApplied(null);
    setApplyError(null);
    setLinkDone(false);
    setLinkError(null);
  };
  const onChangeNodeType = (nt: string) => {
    resetApply();
    setTargetMode('auto');
    setChosenObjectId(null);
    setChosenName('');
    setShowPicker(false);
    setLinkSchema(null);
    setLinkRelation('');
    setLinkTarget(null);
    setNodeType(nt);
  };
  const chooseExisting = (id: string, name: string) => {
    resetApply();
    setChosenObjectId(id);
    setChosenName(name);
    setTargetMode('existing');
    setShowPicker(false);
  };
  const createNew = () => {
    resetApply();
    setTargetMode('create');
    setChosenObjectId(null);
    setChosenName('');
    setShowPicker(false);
  };
  const onPickManual = (node: OntologyNode) => chooseExisting(node.id, node.name || node.id);

  /* ---- aplicar (merge dos campos) ---- */
  const diffRows = preview ? buildDiffRows(preview) : [];
  const hasFormatError = (preview?.format_errors.length ?? 0) > 0;
  const actionable = diffRows.filter((r) => r.status === 'novo' || r.status === 'conflito').length;

  const handleApply = async () => {
    if (!preview || hasFormatError) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await Merge.apply({
        ...input,
        target: buildTarget(),
        field_resolutions: Object.keys(resolutions).length ? resolutions : undefined,
      });
      setApplied(res);
      // Reaponta o alvo p/ o objeto materializado — vínculo posterior reusa o id
      // (idempotente; não recria). Não limpa o banner de sucesso.
      setChosenObjectId(res.object_id);
      setChosenName(preview.creates?.name ?? preview.updates?.name ?? chosenName);
      setTargetMode('existing');
    } catch (e) {
      setApplyError(humaniseSearchError(e));
    } finally {
      setApplying(false);
    }
  };

  /* ---- criar vínculo (relação objeto↔objeto) ---- */
  const relations = linkSchema?.links ?? [];
  const selectedRelation = relations.find((l) => l.relation === linkRelation) ?? null;

  const handleCreateLink = async () => {
    if (!linkRelation || !linkTarget) return;
    const ok = await confirmModal({
      title: t('buscar.merge.vinculo.confirmTitulo'),
      description: t('buscar.merge.vinculo.confirmDesc'),
      confirmLabel: t('buscar.merge.vinculo.confirmar'),
    });
    if (!ok) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const res = await Merge.apply({
        ...input,
        target: buildTarget(),
        field_resolutions: Object.keys(resolutions).length ? resolutions : undefined,
        link: { target_object_id: linkTarget.id, relation_type: linkRelation },
      });
      setApplied(res);
      setLinkDone(true);
      setChosenObjectId(res.object_id);
      setTargetMode('existing');
    } catch (e) {
      setLinkError(humaniseSearchError(e));
    } finally {
      setLinkBusy(false);
    }
  };

  const nodeTypeOptions = React.useMemo(() => {
    const names = new Set<string>();
    if (nodeType) names.add(nodeType);
    for (const nt of nodeTypes) names.add(nt.name);
    return [...names].filter(Boolean);
  }, [nodeType, nodeTypes]);

  const fichaHref = applied ? `/ficha/${applied.object_id}` : '#';

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="buscar-merge-title"
      data-testid="buscar-merge-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center p-6 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[860px] max-h-[88vh] bg-white border border-border-light shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2 shrink-0">
          <GitMerge className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <h2 id="buscar-merge-title" className="text-[13px] font-semibold flex-1 text-text-on-light">
            {t('buscar.merge.titulo')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('buscar.merge.fechar')}
            data-testid="buscar-merge-fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <p className="px-4 py-2 text-[11px] text-muted-on-light border-b border-border-light bg-canvas-light leading-relaxed">
            {t('buscar.merge.descricao')}
          </p>

          {!typesLoaded ? (
            <div className="p-6 flex items-center justify-center gap-2 text-[11px] text-muted-on-light">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              {t('buscar.merge.carregando')}
            </div>
          ) : (
            <>
              {/* Tipo de objeto */}
              <section className="p-4 border-b border-border-light space-y-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono block mb-1">
                    {t('buscar.merge.tipoObjeto')}
                  </span>
                  {nodeTypeOptions.length > 0 ? (
                    <SelectField
                      name="merge-nodetype"
                      testId="buscar-merge-nodetype"
                      clearable={false}
                      value={nodeType}
                      onChange={onChangeNodeType}
                      options={nodeTypeOptions.map((name) => ({
                        value: name,
                        label: objectKindLabel(
                          t,
                          name,
                          nodeTypes.find((nt) => nt.name === name)?.label,
                        ),
                      }))}
                    />
                  ) : (
                    <p className="text-[11px] text-muted-on-light italic">
                      {t('buscar.merge.nenhumTipo')}
                    </p>
                  )}
                </label>

                {/* Resolução do alvo: sugestão + escolha */}
                <TargetResolver
                  preview={preview}
                  previewLoading={previewLoading}
                  targetMode={targetMode}
                  chosenName={chosenName}
                  nodeType={nodeType}
                  onAccept={chooseExisting}
                  onSearchOther={() => setShowPicker(true)}
                  onCreateNew={createNew}
                />

                {showPicker && (
                  <div data-testid="buscar-merge-picker" className="pt-1">
                    <ObjectPicker
                      node_type={nodeType}
                      seed={{ value: canonical }}
                      onPick={onPickManual}
                      onCreateNew={createNew}
                      allowCreate
                    />
                  </div>
                )}
              </section>

              {/* Prévia campo-a-campo */}
              <section className="p-4 border-b border-border-light">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-2">
                  {t('buscar.merge.previaTitulo')}
                </p>
                {previewLoading && (
                  <p className="text-[11px] text-muted-on-light flex items-center gap-1.5 py-2">
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    {t('buscar.merge.carregando')}
                  </p>
                )}
                {!previewLoading && previewError && (
                  <p className="text-[11px] text-danger flex items-center gap-1.5 py-2">
                    <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                    {previewError}
                  </p>
                )}
                {!previewLoading && !previewError && preview && (
                  <DiffTable
                    rows={diffRows}
                    resolutions={resolutions}
                    onResolve={(field, res) =>
                      setResolutions((prev) => ({ ...prev, [field]: res }))
                    }
                  />
                )}
              </section>

              {/* Vínculo */}
              <section className="p-4">
                <button
                  type="button"
                  data-testid="buscar-merge-vinculo"
                  onClick={() => setLinkOpen((v) => !v)}
                  className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono flex items-center gap-1.5 hover:text-text-on-light"
                >
                  <Link2 className="w-3 h-3" strokeWidth={1.5} />
                  {t('buscar.merge.vinculo.titulo')}
                  <span className="text-muted-on-light/70">{linkOpen ? '↑' : '↓'}</span>
                </button>
                {linkOpen && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-muted-on-light leading-relaxed">
                      {t('buscar.merge.vinculo.descricao')}
                    </p>
                    {relations.length === 0 ? (
                      <p className="text-[11px] text-muted-on-light italic">
                        {t('buscar.merge.vinculo.semRelacoes')}
                      </p>
                    ) : (
                      <>
                        <label className="block">
                          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-on-light font-semibold font-mono block mb-1">
                            {t('buscar.merge.vinculo.relacao')}
                          </span>
                          <SelectField
                            name="merge-vinculo-relacao"
                            testId="buscar-merge-vinculo-relacao"
                            value={linkRelation}
                            onChange={(v) => {
                              setLinkRelation(v);
                              setLinkTarget(null);
                            }}
                            emptyLabel={t('buscar.merge.vinculo.relacaoPlaceholder')}
                            options={relations.map((l) => ({
                              value: l.relation,
                              label: `${l.relation} → ${objectKindLabel(t, l.target_kind, l.target_label)}`,
                            }))}
                          />
                        </label>

                        {linkRelation && (
                          <div>
                            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-on-light font-semibold font-mono block mb-1">
                              {t('buscar.merge.vinculo.objeto')}
                            </span>
                            {linkTarget ? (
                              <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/5 border border-primary/30">
                                <Box className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                                <span className="flex-1 min-w-0 truncate text-[11px] text-text-on-light">
                                  {linkTarget.name || linkTarget.id}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinkTarget(null);
                                    setLinkPicker(true);
                                  }}
                                  className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary"
                                >
                                  {t('buscar.merge.buscarOutro')}
                                </button>
                              </div>
                            ) : linkPicker ? (
                              <ObjectPicker
                                node_type={selectedRelation?.target_kind}
                                onPick={(n) => {
                                  setLinkTarget(n);
                                  setLinkPicker(false);
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                data-testid="buscar-merge-vinculo-buscar"
                                onClick={() => setLinkPicker(true)}
                                className="h-8 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary text-text-on-light flex items-center gap-1.5"
                              >
                                <Search className="w-3 h-3" strokeWidth={1.5} />
                                {t('buscar.merge.picker.placeholder')}
                              </button>
                            )}
                          </div>
                        )}

                        {linkError && (
                          <p className="text-[11px] text-danger flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                            {linkError}
                          </p>
                        )}
                        {linkDone && (
                          <p className="text-[11px] text-primary flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                            {t('buscar.merge.vinculo.criado')}
                          </p>
                        )}

                        <button
                          type="button"
                          data-testid="buscar-merge-vinculo-criar"
                          onClick={handleCreateLink}
                          disabled={!linkRelation || !linkTarget || linkBusy}
                          className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {linkBusy ? (
                            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                          ) : (
                            <Link2 className="w-3 h-3" strokeWidth={1.5} />
                          )}
                          {t('buscar.merge.vinculo.criar')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer: erro/sucesso + Aplicar / ver ficha */}
        <footer className="px-4 py-3 border-t border-border-light flex items-center gap-3 shrink-0">
          {hasFormatError && !applied && (
            <span className="text-[11px] text-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
              {t('buscar.merge.formatoBloqueia')}
            </span>
          )}
          {applyError && (
            <span className="text-[11px] text-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
              {applyError}
            </span>
          )}
          {applied && (
            <span
              data-testid="buscar-merge-sucesso"
              className="text-[11px] text-primary flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              {applied.created
                ? t('buscar.merge.sucessoCriado')
                : t('buscar.merge.sucessoAtualizado')}{' '}
              {applied.applied_fields.length} {t('buscar.merge.campos')}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {applied ? (
              <a
                href={fichaHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="buscar-merge-verficha"
                className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-2"
              >
                {t('buscar.merge.verFicha')}
                <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              </a>
            ) : (
              <button
                type="button"
                data-testid="buscar-merge-aplicar"
                onClick={handleApply}
                disabled={applying || previewLoading || !preview || hasFormatError || actionable === 0}
                className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applying ? (
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                ) : (
                  <GitMerge className="w-3 h-3" strokeWidth={1.5} />
                )}
                {applying ? t('buscar.merge.aplicando') : t('buscar.merge.aplicar')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}

/* -------------------------------------------------------------------------- */
/* Resolução do alvo — sugestão (É este? / Buscar outro / Criar novo)          */
/* -------------------------------------------------------------------------- */
function TargetResolver({
  preview,
  previewLoading,
  targetMode,
  chosenName,
  nodeType,
  onAccept,
  onSearchOther,
  onCreateNew,
}: {
  preview: MergePreviewResult | null;
  previewLoading: boolean;
  targetMode: 'auto' | 'existing' | 'create';
  chosenName: string;
  nodeType: string;
  onAccept: (id: string, name: string) => void;
  onSearchOther: () => void;
  onCreateNew: () => void;
}) {
  const t = useT();
  const suggestion = preview?.target_suggestion ?? null;
  const alternatives = preview?.target_alternatives ?? [];

  return (
    <div data-testid="buscar-merge-sugestao" className="bg-canvas-light border border-border-light p-2.5 space-y-2">
      {/* Estado escolhido explicitamente */}
      {targetMode === 'create' && (
        <p className="text-[11px] text-text-on-light flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          {t('buscar.merge.criarNovoDe')} · {objectKindLabel(t, nodeType)}
        </p>
      )}
      {targetMode === 'existing' && (
        <p className="text-[11px] text-text-on-light flex items-center gap-1.5">
          <Box className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          {t('buscar.merge.atualizarExistente')}: <strong className="truncate">{chosenName}</strong>
        </p>
      )}

      {/* Modo auto: mostra a sugestão */}
      {targetMode === 'auto' && (
        <>
          {previewLoading && !preview ? (
            <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              {t('buscar.merge.carregando')}
            </p>
          ) : suggestion ? (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-on-light font-semibold font-mono">
                {t('buscar.merge.sugestaoTitulo')} · {t('buscar.merge.sugestaoPergunta')}
              </p>
              <div className="flex items-center gap-2">
                <Box className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
                <span className="flex-1 min-w-0 truncate text-[12px] text-text-on-light" title={suggestion.name ?? ''}>
                  {suggestion.name || suggestion.object_id}
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono border border-border-light text-muted-on-light shrink-0">
                  {Math.round((suggestion.score ?? 0) * 100)}% {t('buscar.merge.compatibilidade')}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-on-light">{t('buscar.merge.semSugestao')}</p>
          )}
        </>
      )}

      {/* Botões de escolha (sempre disponíveis) */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        {targetMode === 'auto' && suggestion && (
          <button
            type="button"
            data-testid="buscar-merge-sugestao-aceitar"
            onClick={() => onAccept(suggestion.object_id, suggestion.name || suggestion.object_id)}
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
            {t('buscar.merge.ehEste')}
          </button>
        )}
        <button
          type="button"
          data-testid="buscar-merge-buscar-outro"
          onClick={onSearchOther}
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
        >
          <Search className="w-3 h-3" strokeWidth={1.5} />
          {t('buscar.merge.buscarOutro')}
        </button>
        <button
          type="button"
          data-testid="buscar-merge-criar-novo"
          onClick={onCreateNew}
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" strokeWidth={1.5} />
          {t('buscar.merge.criarNovo')}
        </button>
      </div>

      {/* Alternativas */}
      {targetMode === 'auto' && alternatives.length > 0 && (
        <div className="pt-1 border-t border-border-light/60">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-on-light font-semibold font-mono mb-1">
            {t('buscar.merge.alternativas')}
          </p>
          <ul className="space-y-0.5">
            {alternatives.map((a) => (
              <li key={a.object_id}>
                <button
                  type="button"
                  data-testid={`buscar-merge-alternativa-${a.object_id}`}
                  onClick={() => onAccept(a.object_id, a.name || a.object_id)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1 text-[11px] border border-border-light bg-white hover:border-primary"
                >
                  <Box className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 min-w-0 truncate text-text-on-light">
                    {a.name || a.object_id}
                  </span>
                  <span className="text-[9px] font-mono text-muted-on-light shrink-0">
                    {Math.round((a.score ?? 0) * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabela campo-a-campo (atual | novo | situação + resolução de conflito)      */
/* -------------------------------------------------------------------------- */
function DiffTable({
  rows,
  resolutions,
  onResolve,
}: {
  rows: DiffRow[];
  resolutions: Record<string, FieldResolution>;
  onResolve: (field: string, res: FieldResolution) => void;
}) {
  const t = useT();
  if (rows.length === 0) {
    return <p className="text-[11px] text-muted-on-light italic">{t('buscar.merge.vazio')}</p>;
  }
  return (
    <div data-testid="buscar-merge-diff" className="border border-border-light">
      <div className="grid grid-cols-[1.1fr_1.2fr_1.2fr_auto] gap-px bg-border-light text-[10px] uppercase tracking-[0.1em] font-semibold font-mono text-muted-on-light">
        <div className="bg-raised-light px-2 py-1">{t('buscar.merge.col.propriedade')}</div>
        <div className="bg-raised-light px-2 py-1">{t('buscar.merge.col.atual')}</div>
        <div className="bg-raised-light px-2 py-1">{t('buscar.merge.col.novo')}</div>
        <div className="bg-raised-light px-2 py-1">{t('buscar.merge.col.situacao')}</div>
      </div>
      <div className="divide-y divide-border-light/60">
        {rows.map((row) => (
          <DiffRowView
            key={row.field}
            row={row}
            resolution={resolutions[row.field] ?? 'keep'}
            onResolve={(res) => onResolve(row.field, res)}
          />
        ))}
      </div>
    </div>
  );
}

function DiffRowView({
  row,
  resolution,
  onResolve,
}: {
  row: DiffRow;
  resolution: FieldResolution;
  onResolve: (res: FieldResolution) => void;
}) {
  const t = useT();
  const statusLabel: Record<FieldStatus, string> = {
    novo: t('buscar.merge.status.novo'),
    igual: t('buscar.merge.status.igual'),
    conflito: t('buscar.merge.status.conflito'),
    erro: t('buscar.merge.status.erro'),
  };
  const statusClass: Record<FieldStatus, string> = {
    novo: 'border-primary text-primary bg-primary/10',
    igual: 'border-border-light text-muted-on-light',
    conflito: 'border-warning text-warning bg-warning/10',
    erro: 'border-danger text-danger bg-danger/10',
  };
  return (
    <div className="text-[11px]">
      <div className="grid grid-cols-[1.1fr_1.2fr_1.2fr_auto] gap-px items-start">
        <div className="px-2 py-1.5 font-mono text-text-on-light break-words">{row.field}</div>
        <div className="px-2 py-1.5 font-mono text-muted-on-light break-words">
          {displayValue(row.oldValue)}
        </div>
        <div className="px-2 py-1.5 font-mono text-text-on-light break-words">
          {displayValue(row.newValue)}
        </div>
        <div className="px-2 py-1.5">
          <span
            className={cn(
              'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
              statusClass[row.status],
            )}
          >
            {statusLabel[row.status]}
          </span>
        </div>
      </div>

      {/* Erro de formato BLOQUEIA — mensagem inline */}
      {row.status === 'erro' && row.formatError && (
        <p className="px-2 pb-1.5 text-[10.5px] text-danger">{formatErrorText(t, row.formatError)}</p>
      )}

      {/* Resolução por-conflito (manter / substituir / anexar) */}
      {row.status === 'conflito' && (
        <div
          data-testid={`buscar-merge-conflito-${row.field}`}
          className="px-2 pb-2 flex items-center gap-1"
        >
          {(['keep', 'replace', 'append'] as FieldResolution[]).map((res) => (
            <button
              key={res}
              type="button"
              data-testid={`buscar-merge-conflito-${row.field}-${res}`}
              onClick={() => onResolve(res)}
              className={cn(
                'h-6 px-2 text-[10px] border',
                resolution === res
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border-light text-muted-on-light hover:border-primary',
              )}
            >
              {res === 'keep'
                ? t('buscar.merge.resolver.manter')
                : res === 'replace'
                ? t('buscar.merge.resolver.substituir')
                : t('buscar.merge.resolver.anexar')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
