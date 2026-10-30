'use client';

/**
 * Dataset Browser — estado + slots compartilhados do browser de datasets
 * (Onda 2 · I3, espelha pipeline-board.tsx do I2).
 *
 * Extraído de datasets-workspace.tsx para a casca da Tela de Dados poder COMPOR o
 * detalhe do dataset em panes próprios: a **lista** vai no Acervo (LEFT) · a
 * **grade/schema + branches + transações** ocupam o CENTER (leitura calma) · a
 * **Classificação&Marcações + ações** (transação/branch/merge) ocupam o RIGHT
 * (inspetor). O `DatasetsWorkspace` standalone (usado pelo teste `datasets-page`)
 * compõe os MESMOS slots no 3-pane — zero mudança de comportamento. O estado vive
 * num contexto (`DatasetBrowserProvider`); o fetch da lista é gated por `enabled`
 * (só carrega quando a seção Datasets está ativa). i18n via useT().
 */
import * as React from 'react';
import Link from 'next/link';
import {
  GitBranch, GitMerge, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Database, Play, X, Shield, ShieldCheck, Search, Workflow, Link2,
} from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { PropertyMarkingPill } from '@/components/markings/property-marking-pill';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import {
  Datasets, Markings,
  type DatasetListItem, type DatasetBranchOut, type DatasetTransactionOut,
  type DatasetMergeConflict, type DatasetMergeResult, type DatasetClassification,
  type DatasetMarking, type Marking, type DatasetEmbedRun, type DatasetUsage,
} from '@/lib/api';
import {
  CLASSIFICATION_LABEL, CLASSIFICATION_BG, CLASSIFICATION_TEXT, validateInvariant,
  type ClassificationLevel,
} from '@/lib/classification';

const CLS_LEVELS: ClassificationLevel[] = ['publico', 'restrito', 'confidencial', 'sigiloso'];
const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
const TX_KINDS = ['SNAPSHOT', 'APPEND', 'UPDATE', 'DELETE'] as const;
// Template de input_payload por tipo de transação (o operador edita o conteúdo).
const TX_TEMPLATE: Record<string, string> = {
  SNAPSHOT: '{\n  "payload": { "rows": [] }\n}',
  APPEND: '{\n  "rows": []\n}',
  UPDATE: '{\n  "patch": {}\n}',
  DELETE: '{\n  "drop_keys": []\n}',
};
type Panel = 'tx' | 'merge' | 'branch' | null;
type Msg = { ok: boolean; text: string } | null;

/* -------------------------------------------------------------------------- */
/* Estado do Browser — hook + contexto (compartilhado pelos slots)            */
/* -------------------------------------------------------------------------- */
function useDatasetBrowserState(enabled: boolean) {
  const t = useT();
  const [list, setList] = React.useState<DatasetListItem[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [branches, setBranches] = React.useState<DatasetBranchOut[]>([]);
  const [txs, setTxs] = React.useState<DatasetTransactionOut[]>([]);
  const [cls, setCls] = React.useState<DatasetClassification | null>(null);
  // Marcações need-to-know (eixo de elegibilidade) aplicadas ao head do dataset.
  const [markings, setMarkings] = React.useState<DatasetMarking[]>([]);
  // SF4 — amostra de linhas (grade) + schema (payload_keys) p/ leitura ≤2 cliques,
  // sem tocar o DAG. ABAC: sample 403 (sem clearance) → grade vazia honesta.
  const [sample, setSample] = React.useState<{ rows: Record<string, unknown>[]; row_count: number } | null>(null);
  const [schemaKeys, setSchemaKeys] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  // painel direito: 'tx' (autoria) | 'merge' (mesclagem) | 'branch' (novo branch) | null
  const [panel, setPanel] = React.useState<Panel>(null);
  // form inline de novo dataset (substitui window.prompt — proibido).
  const [creatingDataset, setCreatingDataset] = React.useState(false);
  const [newDatasetName, setNewDatasetName] = React.useState('');

  const reloadList = React.useCallback(() => { Datasets.list().then(setList).catch(() => setList([])); }, []);
  // Gated por `enabled` (só carrega quando a seção Datasets está ativa).
  React.useEffect(() => { if (enabled) reloadList(); }, [enabled, reloadList]);

  const reloadMarkings = React.useCallback(() => {
    if (!sel) return;
    Datasets.listMarkings(sel).then(setMarkings).catch(() => setMarkings([]));
  }, [sel]);

  const loadDataset = React.useCallback((name: string) => {
    setSel(name); setPanel(null); setMsg(null); setCls(null); setMarkings([]);
    setSample(null); setSchemaKeys([]);
    Datasets.listBranches(name).then(setBranches).catch(() => setBranches([]));
    Datasets.listTransactions(name).then(setTxs).catch(() => setTxs([]));
    Datasets.getClassification(name).then(setCls).catch(() => setCls(null));
    Datasets.listMarkings(name).then(setMarkings).catch(() => setMarkings([]));
    // SF4 — grade + schema (defensivo p/ mock/ABAC: erro → vazio honesto).
    Promise.resolve().then(() => Datasets.sample(name, 20))
      .then((s) => setSample(s as { rows: Record<string, unknown>[]; row_count: number }))
      .catch(() => setSample(null));
    Promise.resolve().then(() => Datasets.get(name))
      .then((d) => setSchemaKeys(((d as { head?: { payload_keys?: string[] } }).head?.payload_keys) ?? []))
      .catch(() => setSchemaKeys([]));
  }, []);

  const refresh = React.useCallback(() => {
    if (!sel) return;
    Datasets.listBranches(sel).then(setBranches).catch(() => {});
    Datasets.listTransactions(sel).then(setTxs).catch(() => {});
    Datasets.getClassification(sel).then(setCls).catch(() => {});
    Datasets.listMarkings(sel).then(setMarkings).catch(() => {});
    reloadList();
  }, [sel, reloadList]);

  // onDone das ações (classificação/tx/merge): reporta msg + recarrega.
  const applyResult = React.useCallback((m: { ok: boolean; text: string }) => {
    setMsg(m); refresh();
  }, [refresh]);

  const submitBranch = React.useCallback(async (name: string, from: string) => {
    if (!sel || !name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await Datasets.createBranch(sel, { name: name.trim(), from_branch: from || 'main' });
      setMsg({ ok: true, text: `${t('dsw.branchPrefix')} '${name.trim()}' ${t('dsw.created')}` }); setPanel(null); refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : t('dsw.failure') }); }
    finally { setBusy(false); }
  }, [sel, t, refresh]);

  const deleteBranch = React.useCallback(async (branch: string) => {
    if (!sel || branch === 'main') return;
    setBusy(true); setMsg(null);
    try {
      await Datasets.deactivateBranch(sel, branch);
      setMsg({ ok: true, text: `${t('dsw.branchPrefix')} '${branch}' ${t('dsw.deactivated')}` }); refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : t('dsw.failure') }); }
    finally { setBusy(false); }
  }, [sel, t, refresh]);

  // Inicia um dataset a partir do form inline (substitui window.prompt).
  // Um dataset nasce de uma transação SNAPSHOT no main; abrimos o painel de tx.
  const submitNewDataset = React.useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const name = newDatasetName.trim();
    if (!name) return;
    setSel(name); setBranches([]); setTxs([]); setCls(null); setSample(null); setSchemaKeys([]); setPanel('tx');
    setCreatingDataset(false); setNewDatasetName('');
    setMsg({ ok: true, text: `${t('dsw.startDatasetPre')} '${name}' ${t('dsw.startDatasetPost')}` });
  }, [newDatasetName, t]);

  return {
    t, list, sel, branches, txs, cls, markings, sample, schemaKeys, busy, msg, panel, creatingDataset, newDatasetName,
    setCreatingDataset, setNewDatasetName, setPanel, loadDataset, refresh, reloadMarkings, applyResult,
    submitBranch, deleteBranch, submitNewDataset,
  };
}

type DatasetBrowserCtxValue = ReturnType<typeof useDatasetBrowserState>;
const DatasetBrowserCtx = React.createContext<DatasetBrowserCtxValue | null>(null);

export function DatasetBrowserProvider({ enabled = true, initialDs, children }: { enabled?: boolean; initialDs?: string | null; children: React.ReactNode }) {
  const value = useDatasetBrowserState(enabled);
  // F7.2b — deep-link ?ds=<name> (cross-links "Datasets gerados" do conector):
  // abre o dataset da URL UMA vez; nunca briga com a navegação do operador.
  const appliedRef = React.useRef(false);
  const { sel, loadDataset } = value;
  React.useEffect(() => {
    if (!enabled || appliedRef.current || !initialDs || sel) return;
    appliedRef.current = true;
    loadDataset(initialDs);
  }, [enabled, initialDs, sel, loadDataset]);
  return <DatasetBrowserCtx.Provider value={value}>{children}</DatasetBrowserCtx.Provider>;
}

export function useDatasetBrowser(): DatasetBrowserCtxValue {
  const v = React.useContext(DatasetBrowserCtx);
  if (!v) throw new Error('useDatasetBrowser fora do DatasetBrowserProvider');
  return v;
}

/* -------------------------------------------------------------------------- */
/* Slot: DatasetsList — busca + criar + lista (vai no Acervo na casca)         */
/* -------------------------------------------------------------------------- */
export function DatasetsList() {
  const { t, list, sel, creatingDataset, newDatasetName, loadDataset, setCreatingDataset, setNewDatasetName, submitNewDataset } = useDatasetBrowser();
  const [q, setQ] = React.useState('');
  // Filtros de governança (Onda 2 follow-on b) — chips que filtram a lista DE VERDADE.
  const [clsFilter, setClsFilter] = React.useState<string | null>(null);
  const [marksOnly, setMarksOnly] = React.useState(false);
  const query = q.trim().toLowerCase();
  const filtered = list.filter((d) =>
    (!query || d.name.toLowerCase().includes(query)) &&
    (!clsFilter || d.classification_level === clsFilter) &&
    (!marksOnly || (d.marking_count ?? 0) > 0),
  );
  // Só os níveis presentes viram chip (sem filtro morto); contagem de marcadas.
  const levelsPresent = CLS_LEVELS.filter((l) => list.some((d) => d.classification_level === l));
  const markedCount = list.filter((d) => (d.marking_count ?? 0) > 0).length;
  return (
    <>
      <div className="h-9 px-3 border-b border-border-light flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('dsw.datasets')}</span>
        <RequirePerm perm="data.datasets.write" fallback={null}>
          <button type="button" onClick={() => { setCreatingDataset(!creatingDataset); setNewDatasetName(''); }} data-testid="ds-new" aria-label={t('dsw.newDataset')} className="text-muted-on-light hover:text-primary">{creatingDataset ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</button>
        </RequirePerm>
      </div>
      {/* Busca (I3) — filtra a lista por nome. */}
      <div className="p-2 border-b border-border-light shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dsw.searchPlaceholder')}
            data-testid="ds-search" className="w-full h-7 pl-7 pr-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary" />
        </div>
      </div>
      {/* Chips de governança (b) — filtram a lista por classificação / marcadas. */}
      {(levelsPresent.length > 0 || markedCount > 0) && (
        <div className="px-2 py-1.5 border-b border-border-light flex flex-wrap gap-1 shrink-0" data-testid="ds-gov-filters">
          {levelsPresent.map((l) => (
            <button key={l} type="button" data-testid={`ds-gov-chip-${l}`} onClick={() => setClsFilter(clsFilter === l ? null : l)}
              className={'h-5 px-1.5 text-[10px] uppercase tracking-wider border ' + (clsFilter === l ? 'border-primary text-primary bg-primary/5' : 'border-border-light text-muted-on-light hover:border-primary')}>
              {CLASSIFICATION_LABEL[l]}
            </button>
          ))}
          {markedCount > 0 && (
            <button type="button" data-testid="ds-gov-chip-marcadas" onClick={() => setMarksOnly(!marksOnly)}
              className={'h-5 px-1.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider border ' + (marksOnly ? 'border-primary text-primary bg-primary/5' : 'border-border-light text-muted-on-light hover:border-primary')}>
              <ShieldCheck className="w-3 h-3" strokeWidth={1.5} /> {t('dsw.marcadasFilter')} ({markedCount})
            </button>
          )}
        </div>
      )}
      {creatingDataset && (
        <form onSubmit={submitNewDataset} data-testid="ds-new-form" className="px-3 py-2.5 border-b border-border-light bg-canvas-light space-y-2 shrink-0">
          <input autoFocus value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} placeholder={t('dsw.datasetNamePlaceholder')} data-testid="ds-new-name" className={INP} />
          <button type="submit" disabled={!newDatasetName.trim()} data-testid="ds-new-confirm"
            className="h-7 w-full text-[11px] bg-primary text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> {t('dsw.startDataset')}</button>
        </form>
      )}
      <ul className="flex-1 overflow-y-auto scrollbar-hide" data-testid="ds-list">
        {list.length === 0 && !creatingDataset && <li className="px-3 py-3 text-[11px] text-muted-on-light italic">{t('dsw.noDatasets')}</li>}
        {list.length > 0 && filtered.length === 0 && <li data-testid="ds-search-empty" className="px-3 py-3 text-[11px] text-muted-on-light italic">{t('dsw.searchEmpty')}</li>}
        {filtered.map((d) => (
          <li key={d.name}>
            <button type="button" onClick={() => loadDataset(d.name)} data-testid={`ds-item-${d.name}`}
              className={'w-full text-left px-3 py-2 border-b border-border-light/60 ' + (sel === d.name ? 'bg-primary/5 text-primary' : 'hover:bg-canvas-light')}>
              <span className="block truncate text-[11px] font-medium">{d.name}</span>
              <span className="block text-[10px] text-muted-on-light">v{d.head_version ?? '—'} · {d.asset_count} {d.asset_count === 1 ? t('dsw.commit') : t('dsw.commits')} · {d.branches.length} {d.branches.length === 1 ? t('dsw.branch') : t('dsw.branches')}</span>
              {(d.classification_level || (d.marking_count ?? 0) > 0) && (
                <span className="flex items-center gap-1 mt-1">
                  {d.classification_level && <span data-testid={`ds-item-cls-${d.name}`}><ClsBadge level={d.classification_level} /></span>}
                  {(d.marking_count ?? 0) > 0 && (
                    <span data-testid={`ds-item-marks-${d.name}`} title={t('dsw.marcacoesTitle')}
                      className="h-4 px-1 inline-flex items-center gap-0.5 text-[9px] font-mono border border-border-light text-muted-on-light">
                      <ShieldCheck className="w-2.5 h-2.5" strokeWidth={1.5} />{d.marking_count}
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Slot: DatasetContent — grade/schema + branches + transações (vai no CENTER) */
/* -------------------------------------------------------------------------- */
export function DatasetContent() {
  const { t, sel, branches, txs, cls, sample, schemaKeys, busy, msg, setPanel, deleteBranch } = useDatasetBrowser();
  if (!sel) {
    return <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">{t('dsw.selectDataset')}</div>;
  }
  // SF4 — Conteúdo: grade (amostra) + schema, leitura calma sem DAG.
  const gridCols = schemaKeys.length ? schemaKeys : (sample?.rows?.[0] ? Object.keys(sample.rows[0]) : []);
  return (
    <div className="h-full overflow-y-auto scrollbar-hide p-4">
      {msg && (
        <div className={'mb-3 flex items-center gap-1.5 text-[11px] ' + (msg.ok ? 'text-success' : 'text-danger')} role="status" data-testid="ds-msg">
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{msg.text}
        </div>
      )}
      <div className="max-w-3xl space-y-5" data-testid="ds-detail">
        <section data-testid="ds-content">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-3.5 h-3.5 text-muted-on-light" />
            <h2 className="text-[12px] font-semibold text-text-on-light flex-1">{t('dsw.contentOf')} {sel}</h2>
            {sample && <span className="text-[10px] text-muted-on-light font-mono">{sample.row_count} {t('dsw.rowsLabel')} · {gridCols.length} {t('dsw.colsLabel')}</span>}
          </div>
          {gridCols.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic">{t('dsw.noDataYet')}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 mb-1.5" data-testid="ds-content-schema">
                {gridCols.map((c) => (
                  <span key={c} className="h-5 px-1.5 inline-flex items-center text-[10px] font-mono bg-raised-light border border-border-light text-muted-on-light">{c}</span>
                ))}
              </div>
              <div className="overflow-auto border border-border-light max-h-72" data-testid="ds-content-grid">
                <table className="text-[10px] font-mono w-full">
                  <thead className="bg-canvas-light sticky top-0">
                    <tr>{gridCols.map((c) => <th key={c} className="px-1.5 py-1 text-left text-muted-on-light font-medium whitespace-nowrap">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(sample?.rows ?? []).map((row, i) => (
                      <tr key={i} className="border-t border-border-light/60">
                        {gridCols.map((c) => (
                          <td key={c} className="px-1.5 py-1 text-text-on-light whitespace-nowrap max-w-[160px] truncate">
                            {(row as Record<string, unknown>)[c] == null ? '—' : String((row as Record<string, unknown>)[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {(sample?.rows ?? []).length === 0 && (
                      <tr><td colSpan={gridCols.length} className="px-1.5 py-2 text-muted-on-light italic">{t('dsw.noSampleRows')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-3.5 h-3.5 text-muted-on-light" />
            <h2 className="text-[12px] font-semibold text-text-on-light flex-1">{t('dsw.branchesOf')} {sel}</h2>
            <RequirePerm perm="data.datasets.write" fallback={null}>
              <button type="button" onClick={() => setPanel('tx')} data-testid="ds-new-tx" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><Plus className="w-3 h-3" /> {t('dsw.transaction')}</button>
              <button type="button" onClick={() => setPanel('branch')} disabled={busy} data-testid="ds-new-branch" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><GitBranch className="w-3 h-3" /> {t('dsw.colBranch')}</button>
              <button type="button" onClick={() => setPanel('merge')} data-testid="ds-merge-open" className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary flex items-center gap-1"><GitMerge className="w-3 h-3" /> {t('dsw.merge')}</button>
            </RequirePerm>
          </div>
          <table className="w-full text-[11px] border border-border-light">
            <thead><tr className="bg-canvas-light text-muted-on-light text-left">
              <th className="px-2 py-1 font-medium">{t('dsw.colBranch')}</th><th className="px-2 py-1 font-medium">{t('dsw.colHead')}</th><th className="px-2 py-1 font-medium">{t('dsw.colOrigin')}</th><th className="px-2 py-1 font-medium"></th>
            </tr></thead>
            <tbody>
              {branches.length === 0 && <tr><td colSpan={4} className="px-2 py-2 text-muted-on-light italic">{t('dsw.noBranches')}</td></tr>}
              {branches.map((b) => (
                <tr key={b.id} data-testid={`ds-branch-${b.name}`} className={'border-t border-border-light/60 ' + (b.active ? '' : 'opacity-50')}>
                  <td className="px-2 py-1 font-medium">{b.name}{b.name === 'main' && <span className="ml-1 text-[9px] text-muted-on-light">{t('dsw.mainTag')}</span>}{!b.active && <span className="ml-1 text-[9px] text-danger">{t('dsw.archivedTag')}</span>}</td>
                  <td className="px-2 py-1 font-mono">v{b.head_version ?? '—'}</td>
                  <td className="px-2 py-1 text-muted-on-light">{branches.find((x) => x.id === b.parent_branch_id)?.name || (b.name === 'main' ? '—' : '?')}</td>
                  <td className="px-2 py-1 text-right">
                    {b.active && b.name !== 'main' && (
                      <RequirePerm perm="data.datasets.write" fallback={null}>
                        <button type="button" onClick={() => deleteBranch(b.name)} aria-label={t('dsw.archiveBranch')} data-testid={`ds-branch-del-${b.name}`} className="text-muted-on-light hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                      </RequirePerm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-[12px] font-semibold text-text-on-light mb-2">{t('dsw.transactionsCommits')}</h2>
          <table className="w-full text-[11px] border border-border-light" data-testid="ds-tx-list">
            <thead><tr className="bg-canvas-light text-muted-on-light text-left">
              <th className="px-2 py-1 font-medium">{t('dsw.typeLabel')}</th><th className="px-2 py-1 font-medium">{t('dsw.statusLabel')}</th><th className="px-2 py-1 font-medium">{t('dsw.authorLabel')}</th><th className="px-2 py-1 font-medium">{t('dsw.whenLabel')}</th>
            </tr></thead>
            <tbody>
              {txs.length === 0 && <tr><td colSpan={4} className="px-2 py-2 text-muted-on-light italic">{t('dsw.noTransactions')}</td></tr>}
              {txs.map((tx) => (
                <tr key={tx.id} className="border-t border-border-light/60">
                  <td className="px-2 py-1 font-mono">{tx.kind}</td>
                  <td className="px-2 py-1"><span className={tx.status === 'COMMITTED' ? 'text-success' : tx.status === 'ABORTED' ? 'text-danger' : 'text-muted-on-light'}>{tx.status}</span>{tx.error && <span className="block text-[9px] text-danger truncate max-w-[200px]">{tx.error}</span>}</td>
                  <td className="px-2 py-1 text-muted-on-light">{tx.actor || '—'}</td>
                  <td className="px-2 py-1 text-muted-on-light font-mono">{tx.started_at?.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Slot: DatasetInspector — Classificação&Marcações + ações (vai no RIGHT)      */
/* -------------------------------------------------------------------------- */
export function DatasetInspector() {
  const { t, sel, cls, markings, branches, busy, panel, setPanel, applyResult, reloadMarkings, submitBranch } = useDatasetBrowser();
  if (!sel) return <p className="p-3 text-[11px] text-muted-on-light italic">{t('dsw.selectDataset')}</p>;
  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide" data-testid="ds-inspector">
      <div className="p-3 space-y-3">
        <UsageSection dataset={sel} />
        <ClassificationSection dataset={sel} cls={cls} onDone={applyResult} />
        <MarcacoesSection dataset={sel} markings={markings} onDone={applyResult} reload={reloadMarkings} />
        <EmbedSection dataset={sel} />
      </div>
      {panel && (
        <div className="border-t border-border-light">
          <div className="h-9 px-3 border-b border-border-light flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{panel === 'tx' ? t('dsw.newTx') : panel === 'branch' ? t('dsw.newBranch') : t('dsw.mergeBranches')}</span>
            <button type="button" onClick={() => setPanel(null)} aria-label={t('dsw.close')} className="text-muted-on-light hover:text-danger"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-3">
            {panel === 'tx'
              ? <TxAuthor dataset={sel} branches={branches} onDone={applyResult} />
              : panel === 'branch'
              ? <BranchForm branches={branches} busy={busy} onSubmit={submitBranch} />
              : <MergePanel dataset={sel} branches={branches} onDone={applyResult} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* F7.2 — "Conexões deste dataset" (padrão Foundry "Used in N"): quem PRODUZ,    */
/* quem CONSOME (boards, com deep-link ?aba=pipelines&board=) e onde é           */
/* PESQUISÁVEL (coleção ds_*). Mata a ilha: o dado sabe quem o usa.              */
/* -------------------------------------------------------------------------- */
export function UsageSection({ dataset }: { dataset: string }) {
  const t = useT();
  const [usage, setUsage] = React.useState<DatasetUsage | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    setUsage(null); setFailed(false);
    Datasets.usage(dataset)
      .then((u) => { if (alive) setUsage(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [dataset]);
  const boardHref = (id: string) => `/painel-de-controle/dados?aba=pipelines&board=${encodeURIComponent(id)}`;
  return (
    <section data-testid="ds-usage">
      <h3 className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1.5 flex items-center gap-1">
        <Link2 className="w-3 h-3" strokeWidth={1.5} /> {t('dsw.usageTitle')}
      </h3>
      {failed && <p className="text-[11px] text-muted-on-light italic">{t('dsw.usageUnavailable')}</p>}
      {!failed && !usage && <p className="text-[11px] text-muted-on-light italic">{t('dsw.loading')}</p>}
      {usage && (
        <div className="space-y-2 text-[11px]">
          <div>
            <p className="text-[10px] text-muted-on-light">{t('dsw.usageProducedBy')}</p>
            {usage.produced_by?.kind === 'board' ? (
              <Link href={boardHref(usage.produced_by.id)} data-testid="ds-usage-producer-board"
                className="flex items-center gap-1 text-primary hover:underline">
                <Workflow className="w-3 h-3" strokeWidth={1.5} /> {usage.produced_by.display_name}
              </Link>
            ) : usage.produced_by?.kind === 'connector' ? (
              <Link href="/painel-de-controle/dados?aba=conexoes" data-testid="ds-usage-producer-connector"
                className="flex items-center gap-1 text-primary hover:underline">
                <Database className="w-3 h-3" strokeWidth={1.5} /> {usage.produced_by.agent_slug || usage.produced_by.skill_key}
              </Link>
            ) : (
              <p className="text-muted-on-light" data-testid="ds-usage-producer-none">{t('dsw.usageManual')}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted-on-light">
              {t('dsw.usageUsedBy')} ({usage.used_by_boards.length})
            </p>
            {usage.used_by_boards.length === 0 ? (
              <p className="text-muted-on-light italic" data-testid="ds-usage-none">{t('dsw.usageUsedByNone')}</p>
            ) : (
              <ul className="space-y-0.5">
                {usage.used_by_boards.map((b) => (
                  <li key={b.id}>
                    <Link href={boardHref(b.id)} data-testid={`ds-usage-board-${b.id}`}
                      className="flex items-center gap-1 text-primary hover:underline">
                      <Workflow className="w-3 h-3" strokeWidth={1.5} />
                      <span className="truncate">{b.display_name}</span>
                      {b.last_run_status && (
                        <span className="text-[9px] uppercase text-muted-on-light">· {b.last_run_status}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {usage.searchable_in && (
            <div data-testid="ds-usage-searchable">
              <p className="text-[10px] text-muted-on-light">{t('dsw.usageSearchable')}</p>
              <p className="font-mono text-[10px] truncate">{usage.searchable_in.collection}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Onda 4b — "Tornar pesquisável": embeda o dataset (bge-m3) → índice vetorial   */
/* p/ busca semântica REAL no painel RAG. Assíncrono: dispara + poll de status   */
/* honesto (nunca embeddado / pesquisável N docs / processando / falhou). O teto  */
/* de custo é aplicado no backend (aborta antes se passar). Sem input técnico.    */
export function EmbedSection({ dataset }: { dataset: string }) {
  const t = useT();
  // undefined = carregando o estado; null = nunca embeddado.
  const [run, setRun] = React.useState<DatasetEmbedRun | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try { setRun(await Datasets.getEmbedStatus(dataset)); }
    catch { setRun(null); }
  }, [dataset]);

  React.useEffect(() => { setRun(undefined); void load(); }, [dataset, load]);

  const running = run?.status === 'queued' || run?.status === 'running';
  // Poll de progresso honesto enquanto o job roda (queued/running).
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(id);
  }, [running, load]);

  const trigger = React.useCallback(async () => {
    const ok = await confirmModal({
      title: t('dsw.embedConfirmTitle'),
      description: t('dsw.embedConfirmBody'),
      confirmLabel: t('dsw.embedTrigger'),
    });
    if (!ok) return;
    setBusy(true); setErr(null);
    try {
      setRun(await Datasets.embedDataset(dataset)); // queued → o poll assume
    } catch (e) { setErr(e instanceof Error ? e.message : t('dsw.failure')); }
    finally { setBusy(false); }
  }, [dataset, t]);

  return (
    <section className="border border-border-light p-3" data-testid="ds-embed">
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-3.5 h-3.5 text-muted-on-light" />
        <h2 className="text-[12px] font-semibold text-text-on-light">{t('dsw.embedTitle')}</h2>
      </div>
      <p className="text-[10px] text-muted-on-light mb-2">{t('dsw.embedHint')}</p>

      {run === undefined ? (
        <p className="text-[11px] text-muted-on-light italic" data-testid="ds-embed-loading">{t('common.loading')}</p>
      ) : run === null ? (
        <p className="text-[11px] text-muted-on-light" data-testid="ds-embed-none">{t('dsw.embedNever')}</p>
      ) : run.status === 'succeeded' ? (
        <p className="text-[11px] text-success flex items-center gap-1.5" data-testid="ds-embed-ok">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t('dsw.embedSearchable').replace('{n}', String(run.rows))}
        </p>
      ) : running ? (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5" data-testid="ds-embed-running">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('dsw.embedRunning')}
        </p>
      ) : (
        <p className="text-[11px] text-danger flex items-start gap-1.5" data-testid="ds-embed-failed">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {run.error || t('dsw.failure')}
        </p>
      )}

      <RequirePerm perm="data.datasets.embed" fallback={null}>
        <button type="button" onClick={trigger} disabled={busy || running} data-testid="ds-embed-trigger"
          className="mt-2 h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50">
          {busy || running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {run?.status === 'succeeded' ? t('dsw.embedReindex') : t('dsw.embedTrigger')}
        </button>
      </RequirePerm>
      {err && <p className="text-[11px] text-danger mt-1" data-testid="ds-embed-err">{err}</p>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* F7.3b — painel de marcações AUTO-CONTIDO p/ o canvas (NodeConfigOverlay):    */
/* busca as marcações do dataset do nó e reusa a MarcacoesSection (mesmos       */
/* gates markings.apply/expand_access + confirmModal). Governança NO fluxo.     */
/* -------------------------------------------------------------------------- */
export function NodeMarkingsPanel({ dataset }: { dataset: string }) {
  const t = useT();
  const [markings, setMarkings] = React.useState<DatasetMarking[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const reload = React.useCallback(() => {
    Datasets.listMarkings(dataset)
      .then((rows) => { setMarkings(rows); setFailed(false); })
      .catch(() => setFailed(true));
  }, [dataset]);
  React.useEffect(() => { setMarkings(null); setMsg(null); reload(); }, [reload]);
  return (
    <div data-testid="pb-node-markings">
      {failed && <p className="text-[11px] text-muted-on-light italic">{t('dsw.usageUnavailable')}</p>}
      {!failed && markings === null && <p className="text-[11px] text-muted-on-light italic">{t('dsw.loading')}</p>}
      {!failed && markings !== null && (
        <>
          <MarcacoesSection dataset={dataset} markings={markings} onDone={setMsg} reload={reload} />
          {msg && (
            <p className={'text-[11px] mt-1 ' + (msg.ok ? 'text-success' : 'text-danger')} data-testid="pb-node-markings-msg">
              {msg.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Classificação (CBAC/LAI) do head do dataset — Fase D ativada.                */
function ClsBadge({ level }: { level: string | null }) {
  const t = useT();
  if (!level) return <span className="text-[11px] text-muted-on-light italic">{t('dsw.notClassified')}</span>;
  const lv = level as ClassificationLevel;
  return (
    <span className={'inline-block px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ' + (CLASSIFICATION_BG[lv] || 'bg-muted') + ' ' + (CLASSIFICATION_TEXT[lv] || 'text-white')}>
      {CLASSIFICATION_LABEL[lv] || level}
    </span>
  );
}

function ClassificationSection({ dataset, cls, onDone }: {
  dataset: string; cls: DatasetClassification | null; onDone: (m: { ok: boolean; text: string }) => void;
}) {
  const t = useT();
  const [dataCls, setDataCls] = React.useState('');
  const [fileCls, setFileCls] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    setDataCls(cls?.data_classification || '');
    setFileCls(cls?.file_classification || '');
  }, [cls]);

  const invariantErr = validateInvariant(
    (fileCls || null) as ClassificationLevel | null,
    (dataCls || null) as ClassificationLevel | null,
    [],
  );

  async function apply() {
    if (invariantErr) return;
    setBusy(true);
    try {
      await Datasets.setClassification(dataset, {
        data_classification: dataCls || null,
        file_classification: fileCls || null,
      });
      onDone({ ok: true, text: t('dsw.classificationApplied') });
    } catch (e) { onDone({ ok: false, text: e instanceof Error ? e.message : t('dsw.failure') }); }
    finally { setBusy(false); }
  }

  return (
    <section className="border border-border-light p-3" data-testid="ds-classification">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <Shield className="w-3.5 h-3.5 text-muted-on-light" />
        <h2 className="text-[12px] font-semibold text-text-on-light">{t('dsw.classificationLai')}</h2>
        <span className="text-[10px] text-muted-on-light uppercase tracking-wider">{t('dsw.dataWord')}</span> <ClsBadge level={cls?.data_classification ?? null} />
        <span className="text-[10px] text-muted-on-light uppercase tracking-wider">{t('dsw.fileWord')}</span> <ClsBadge level={cls?.file_classification ?? null} />
      </div>
      <p className="text-[10px] text-muted-on-light mb-2">{t('dsw.classificationFloorHint')}</p>
      <RequirePerm perm="classification.set" fallback={<p className="text-[10px] text-muted-on-light italic">{t('dsw.noClassificationPerm')}</p>}>
        <div className="space-y-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{t('dsw.dataContent')}</label>
            <select value={dataCls} data-testid="ds-cls-data" onChange={(e) => setDataCls(e.target.value)} className={INP}>
              <option value="">{t('dsw.levelPlaceholder')}</option>
              {CLS_LEVELS.map((l) => <option key={l} value={l}>{CLASSIFICATION_LABEL[l]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{t('dsw.fileDiscovery')}</label>
            <select value={fileCls} data-testid="ds-cls-file" onChange={(e) => setFileCls(e.target.value)} className={INP}>
              <option value="">{t('dsw.levelPlaceholder')}</option>
              {CLS_LEVELS.map((l) => <option key={l} value={l}>{CLASSIFICATION_LABEL[l]}</option>)}
            </select>
          </div>
          <button type="button" onClick={apply} disabled={busy || !!invariantErr} data-testid="ds-cls-apply"
            className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {t('dsw.apply')}
          </button>
          {invariantErr && <p className="text-[11px] text-danger mt-1 flex items-center gap-1" data-testid="ds-cls-invariant"><AlertCircle className="w-3.5 h-3.5" />{invariantErr}</p>}
        </div>
      </RequirePerm>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Marcações (need-to-know · eixo de elegibilidade) do head do dataset.         */
/* Aplicar = dropdown do vocabulário (nunca slug digitado). Remover = ação      */
/* SENSÍVEL (baixa o floor) → perm markings.expand_access + confirmModal.        */
export function MarcacoesSection({ dataset, markings, onDone, reload }: {
  dataset: string; markings: DatasetMarking[];
  onDone: (m: { ok: boolean; text: string }) => void; reload: () => void;
}) {
  const t = useT();
  const [vocab, setVocab] = React.useState<Marking[]>([]);
  const [pick, setPick] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { Markings.list().then(setVocab).catch(() => setVocab([])); }, []);

  const appliedIds = new Set(markings.map((m) => m.marking_id));
  const options = vocab.filter((v) => v.active && !appliedIds.has(v.id));

  async function apply() {
    if (!pick) return;
    setBusy(true);
    try {
      await Datasets.applyMarking(dataset, pick);
      setPick(''); reload();
      onDone({ ok: true, text: t('dsw.marcacaoApplied') });
    } catch (e) { onDone({ ok: false, text: e instanceof Error ? e.message : t('dsw.failure') }); }
    finally { setBusy(false); }
  }

  async function remove(m: DatasetMarking) {
    const ok = await confirmModal({
      title: t('dsw.marcacaoRemoveTitle'),
      description: `${t('dsw.marcacaoRemoveMsg')} "${m.marking_display_name}"?`,
      confirmLabel: t('dsw.marcacaoRemoveConfirm'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await Datasets.removeMarking(dataset, m.marking_id);
      reload();
      onDone({ ok: true, text: t('dsw.marcacaoRemoved') });
    } catch (e) { onDone({ ok: false, text: e instanceof Error ? e.message : t('dsw.failure') }); }
    finally { setBusy(false); }
  }

  return (
    <section className="border border-border-light p-3" data-testid="ds-marcacoes">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <h2 className="text-[12px] font-semibold text-text-on-light">{t('dsw.marcacoesTitle')}</h2>
      </div>
      <p className="text-[10px] text-muted-on-light mb-2">{t('dsw.marcacoesHint')}</p>
      {markings.length === 0 ? (
        <p className="text-[11px] text-muted-on-light italic mb-2" data-testid="ds-marcacoes-empty">{t('dsw.marcacoesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-2" data-testid="ds-marcacoes-list">
          {markings.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <PropertyMarkingPill display="full" marking={{ marking_id: m.marking_id, marking_slug: m.marking_slug, marking_display_name: m.marking_display_name }} />
              <RequirePerm perm="markings.expand_access" fallback={null}>
                <button type="button" onClick={() => remove(m)} disabled={busy} data-testid={`ds-marcacoes-remove-${m.marking_slug}`}
                  aria-label={`${t('dsw.marcacaoRemoveConfirm')} ${m.marking_display_name}`} className="text-muted-on-light hover:text-danger shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </RequirePerm>
            </li>
          ))}
        </ul>
      )}
      <RequirePerm perm="markings.apply" fallback={null}>
        <div className="flex items-center gap-1.5">
          <select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="ds-marcacoes-pick" className={INP}>
            <option value="">{t('dsw.marcacaoPickPlaceholder')}</option>
            {options.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
          </select>
          <button type="button" onClick={apply} disabled={busy || !pick} data-testid="ds-marcacoes-apply"
            className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50 shrink-0">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {t('dsw.apply')}
          </button>
        </div>
      </RequirePerm>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* BranchForm — novo branch via form inline.                                   */
function BranchForm({ branches, busy, onSubmit }: {
  branches: DatasetBranchOut[]; busy: boolean; onSubmit: (name: string, from: string) => void;
}) {
  const t = useT();
  const active = branches.filter((b) => b.active).map((b) => b.name);
  const [name, setName] = React.useState('');
  const [from, setFrom] = React.useState(active.includes('main') ? 'main' : active[0] || 'main');
  return (
    <form className="space-y-2" data-testid="ds-branch-form" onSubmit={(e) => { e.preventDefault(); onSubmit(name, from); }}>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.branchName')}</label>
      <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('dsw.branchNamePlaceholder')} data-testid="ds-branch-name" className={INP} />
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.fromLabel')}</label>
      <select value={from} onChange={(e) => setFrom(e.target.value)} data-testid="ds-branch-from" className={INP}>
        {(active.length ? active : ['main']).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button type="submit" disabled={busy || !name.trim()} data-testid="ds-branch-confirm"
        className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />} {t('dsw.createBranch')}
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
// SF3 (Onda 1) — kinds de INSERIR DADO usam um row-builder (sem JSON cru);
// UPDATE/DELETE (estruturais) seguem no editor JSON avançado.
const ROW_KINDS = new Set(['SNAPSHOT', 'APPEND']);

function TxAuthor({ dataset, branches, onDone }: {
  dataset: string; branches: DatasetBranchOut[]; onDone: (m: { ok: boolean; text: string }) => void;
}) {
  const t = useT();
  const [kind, setKind] = React.useState<string>('SNAPSHOT');
  const [branch, setBranch] = React.useState('main');
  const [payload, setPayload] = React.useState(TX_TEMPLATE.SNAPSHOT);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // SF3 — colunas do HEAD (payload_keys) p/ dirigir o row-builder; row-builder state.
  const [payloadKeys, setPayloadKeys] = React.useState<string[]>([]);
  const [extraCols, setExtraCols] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Array<Record<string, string>>>([{}]);
  const [newCol, setNewCol] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => Datasets.get(dataset))
      .then((d) => { if (!cancelled) setPayloadKeys(((d as { head?: { payload_keys?: string[] } }).head?.payload_keys) ?? []); })
      .catch(() => { if (!cancelled) setPayloadKeys([]); });
    return () => { cancelled = true; };
  }, [dataset]);
  const columns = React.useMemo(() => {
    const all = [...payloadKeys];
    extraCols.forEach((c) => { if (c && !all.includes(c)) all.push(c); });
    return all;
  }, [payloadKeys, extraCols]);
  const isRowKind = ROW_KINDS.has(kind);

  function changeKind(k: string) { setKind(k); setPayload(TX_TEMPLATE[k] ?? '{}'); }
  function setCell(i: number, col: string, val: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [col]: val } : r)));
  }
  function addColumn() {
    const c = newCol.trim();
    if (!c || columns.includes(c)) return;
    setExtraCols((xs) => [...xs, c]); setNewCol('');
  }
  // Monta as linhas omitindo células vazias (schema limpo; sem '' espúrios).
  function buildRows(): Array<Record<string, string>> {
    return rows
      .map((r) => { const o: Record<string, string> = {}; columns.forEach((c) => { if (c && (r[c] ?? '') !== '') o[c] = r[c]!; }); return o; })
      .filter((o) => Object.keys(o).length > 0);
  }

  async function run() {
    setErr(null);
    let parsed: Record<string, unknown>;
    if (isRowKind) {
      const built = buildRows();
      if (built.length === 0) { setErr(t('dsw.addOneRow')); return; }
      parsed = kind === 'SNAPSHOT' ? { payload: { rows: built } } : { rows: built };
    } else {
      try { parsed = JSON.parse(payload); } catch { setErr(t('dsw.payloadInvalid')); return; }
    }
    setBusy(true);
    try {
      const tx = await Datasets.beginTransaction(dataset, kind, branch);
      const committed = await Datasets.commitTransaction(dataset, tx.id, parsed);
      if (committed.status === 'COMMITTED') onDone({ ok: true, text: `${t('dsw.txPrefix')} ${kind} ${t('dsw.committedIn')} '${branch}'.` });
      else onDone({ ok: false, text: `${t('dsw.txPrefix')} ${committed.status}: ${committed.error || t('dsw.errorWord')}` });
    } catch (e) { setErr(e instanceof Error ? e.message : t('dsw.failure')); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.typeLabel')}</label>
      <select value={kind} data-testid="ds-tx-kind" onChange={(e) => changeKind(e.target.value)} className={INP}>
        {TX_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.colBranch')}</label>
      <select value={branch} data-testid="ds-tx-branch" onChange={(e) => setBranch(e.target.value)} className={INP}>
        {(branches.length ? branches.filter((b) => b.active).map((b) => b.name) : ['main']).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {isRowKind ? (
        <div className="space-y-1.5" data-testid="ds-tx-rowbuilder">
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            {t('dsw.rowsHeading')} {kind === 'SNAPSHOT' ? t('dsw.rowsReplace') : t('dsw.rowsAppend')}
          </label>
          {columns.length === 0 ? (
            <p className="text-[11px] text-muted-on-light italic">{t('dsw.addOneColumn')}</p>
          ) : (
            <div className="overflow-auto border border-border-light">
              <table className="text-[11px] w-full">
                <thead className="bg-raised-light">
                  <tr>
                    {columns.map((c) => <th key={c} className="px-1.5 py-1 text-left font-mono text-muted-on-light font-medium whitespace-nowrap">{c}</th>)}
                    <th className="w-7" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border-light/60">
                      {columns.map((c) => (
                        <td key={c} className="p-0.5">
                          <input type="text" data-testid={`ds-rb-cell-${i}-${c}`} value={r[c] ?? ''}
                            onChange={(e) => setCell(i, c, e.target.value)}
                            className="w-full h-7 px-1.5 text-[11px] font-mono bg-white border border-border-light outline-none focus:border-primary" />
                        </td>
                      ))}
                      <td className="text-center">
                        <button type="button" aria-label={t('dsw.removeRow')} data-testid={`ds-rb-rmrow-${i}`}
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}
                          className="text-muted-on-light hover:text-danger"><X className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <button type="button" data-testid="ds-rb-addrow" onClick={() => setRows((rs) => [...rs, {}])}
              disabled={columns.length === 0}
              className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary disabled:opacity-50">{t('dsw.addRow')}</button>
            <input type="text" data-testid="ds-rb-newcol" value={newCol} placeholder={t('dsw.newColumnPlaceholder')}
              onChange={(e) => setNewCol(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColumn(); } }}
              className="w-32 h-6 px-1.5 text-[10px] bg-white border border-border-light outline-none focus:border-primary" />
            <button type="button" data-testid="ds-rb-addcol" onClick={addColumn}
              className="h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary">{t('dsw.addColumn')}</button>
          </div>
        </div>
      ) : (
        <>
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.advancedPayload')}</label>
          <textarea value={payload} data-testid="ds-tx-payload" onChange={(e) => setPayload(e.target.value)}
            className="w-full h-40 p-2 text-[11px] font-mono bg-canvas-light border border-border-light outline-none focus:border-primary resize-none" spellCheck={false} />
        </>
      )}
      {err && <p className="text-[11px] text-danger flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{err}</p>}
      <button type="button" onClick={run} disabled={busy} data-testid="ds-tx-commit"
        className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} {t('dsw.commitBtn')}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function MergePanel({ dataset, branches, onDone }: {
  dataset: string; branches: DatasetBranchOut[]; onDone: (m: { ok: boolean; text: string }) => void;
}) {
  const t = useT();
  const active = branches.filter((b) => b.active).map((b) => b.name);
  const [source, setSource] = React.useState(active.find((n) => n !== 'main') || '');
  const [into, setInto] = React.useState('main');
  const [busy, setBusy] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<DatasetMergeConflict[] | null>(null);
  const [resolutions, setResolutions] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);

  const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  function describe(side: { op: string; value?: unknown; from?: unknown; to?: unknown }): string {
    if (side.op === 'remove') return t('dsw.remove');
    const v = side.op === 'replace' ? side.to : side.value;
    return clip(`${side.op} → ${JSON.stringify(v)}`);
  }

  async function tryMerge(res: Record<string, string> = {}) {
    if (!source || !into || source === into) { setErr(t('dsw.distinctBranches')); return; }
    setErr(null); setBusy(true);
    try {
      const out: DatasetMergeResult = await Datasets.mergeThreeWay(dataset, source, into, res);
      if (out.status === 'conflict') {
        setConflicts(out.conflicts);
        setResolutions(Object.fromEntries(out.conflicts.map((c) => [c.path, res[c.path] || 'source'])));
      } else {
        setConflicts(null);
        onDone({ ok: true, text: `${t('dsw.merged')} '${source}' → '${into}' (${out.status}).` });
      }
    } catch (e) { setErr(e instanceof Error ? e.message : t('dsw.failure')); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.sourceLabel')}</label>
      <select value={source} data-testid="ds-merge-source" onChange={(e) => { setSource(e.target.value); setConflicts(null); setResolutions({}); }} className={INP}>
        <option value="">{t('dsw.branchPlaceholder')}</option>
        {active.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{t('dsw.destLabel')}</label>
      <select value={into} data-testid="ds-merge-into" onChange={(e) => { setInto(e.target.value); setConflicts(null); setResolutions({}); }} className={INP}>
        {active.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {err && <p className="text-[11px] text-danger flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{err}</p>}
      <button type="button" onClick={() => tryMerge({})} disabled={busy} data-testid="ds-merge-run"
        className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-border-light bg-white hover:border-primary disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />} {t('dsw.mergeThreeWay')}
      </button>

      {conflicts && conflicts.length > 0 && (
        <div className="mt-3 border-t border-border-light pt-2 space-y-2" data-testid="ds-conflicts">
          <p className="text-[11px] text-warning flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{conflicts.length} {t('dsw.conflictsLabel')} — {t('dsw.chooseVersion')}</p>
          {conflicts.map((c, i) => (
            <div key={c.path} className="border border-border-light p-2 space-y-1" data-testid={`ds-conflict-${i}`}>
              <p className="text-[10px] font-mono text-text-on-light truncate">{c.path}</p>
              <div className="grid grid-cols-3 gap-1">
                {(['source', 'target', 'base'] as const).map((side) => (
                  <button key={side} type="button" data-testid={`ds-conflict-${i}-${side}`}
                    onClick={() => setResolutions((r) => ({ ...r, [c.path]: side }))}
                    aria-pressed={resolutions[c.path] === side}
                    className={cn('px-1.5 py-1 text-[9px] border text-left', resolutions[c.path] === side ? 'border-primary text-primary bg-primary/5' : 'border-border-light bg-white hover:border-primary')}>
                    <span className="block uppercase tracking-wider text-[8px] text-muted-on-light">{side === 'source' ? t('dsw.sideSource') : side === 'target' ? t('dsw.sideTarget') : t('dsw.sideBase')}</span>
                    {side === 'base' ? clip(JSON.stringify(c.base)) : describe(side === 'source' ? c.source : c.target)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => tryMerge(resolutions)} disabled={busy} data-testid="ds-merge-resolve"
            className="h-7 px-3 text-[11px] flex items-center gap-1.5 border border-primary text-primary bg-primary/5 hover:bg-primary/10 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {t('dsw.resolveAndMerge')}
          </button>
        </div>
      )}
    </div>
  );
}
