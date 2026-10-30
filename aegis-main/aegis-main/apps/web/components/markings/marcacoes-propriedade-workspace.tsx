'use client';

/**
 * MarcacoesPropriedadeWorkspace — "Por propriedade" (Wave H.2 · 2026-05-23;
 * extraído da page no LOTE1 ELO PAGES · 2026-06-28).
 *
 * Workspace 3-pane com navegação à esquerda (por Marcação / por Tipo de
 * Objeto / por Operação), lista filtrável central com bulk select, e
 * detalhe + auditoria à direita. Substitui o input + select cru que
 * existia (operador: "raso e desproporcional").
 *
 * LOTE1 ELO PAGES (#7): o conteúdo saiu da page (`/marcacoes-propriedade`, agora
 * um redirect) para este componente reusável, embutido na aba "Marcações" do hub
 * Dados (sub-navegação Vocabulário / Por propriedade). `embedded` troca o
 * cabeçalho/altura: o hub já provê header + gate; standalone preserva o
 * CpPageHeader original para os testes que importam o componente.
 */
import * as React from 'react';
import {
  Shield,
  Search,
  X,
  Download,
  Layers,
  Boxes,
  FolderTree,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  History,
} from 'lucide-react';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { PropertyMarkingPillList } from '@/components/markings/property-marking-pill';
import { TabsCompact, type TabsCompactItem } from '@/components/ui/tabs-compact';
import {
  Markings,
  OntologyNodes,
  PropertyMarkings,
  Projects,
  Lineage,
  type Marking,
  type OntologyNodeSearchItem,
  type ProjectListItem,
  type LineageEvent,
  type PropertyMarkingItem,
} from '@/lib/api';

// ───────────────────────────────────────────────────────────────────────────
// Top-level workspace
// ───────────────────────────────────────────────────────────────────────────

type LeftTab = 'marking' | 'kind' | 'operation';

export function MarcacoesPropriedadeWorkspace({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const t = useT();
  return (
    <>
      {!embedded && <CpPageHeader title={t('mp.title')} subtitle={t('mp.subtitle')} />}
      <Workspace heightClass={embedded ? 'h-full' : 'h-[calc(100vh-118px)]'} />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Workspace shell
// ───────────────────────────────────────────────────────────────────────────

function Workspace({ heightClass }: { heightClass: string }) {
  const [vocab, setVocab] = React.useState<Marking[]>([]);
  const [allNodes, setAllNodes] = React.useState<OntologyNodeSearchItem[]>([]);
  const [projects, setProjects] = React.useState<ProjectListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [globalErr, setGlobalErr] = React.useState<string | null>(null);

  // Selection state
  const [leftTab, setLeftTab] = React.useState<LeftTab>('marking');
  const [markingFilter, setMarkingFilter] = React.useState<string | null>(null);
  const [kindFilter, setKindFilter] = React.useState<string | null>(null);
  const [operationFilter, setOperationFilter] = React.useState<string | null>(null);

  // Center filters
  const [search, setSearch] = React.useState('');
  const [propertyKeyFilter, setPropertyKeyFilter] = React.useState('');
  const [missingMode, setMissingMode] = React.useState(false);

  // Bulk + detail
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [activeNode, setActiveNode] = React.useState<OntologyNodeSearchItem | null>(null);

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      Markings.list({ limit: 500 }).catch(() => [] as Marking[]),
      OntologyNodes.search({ limit: 100 }).catch(() => [] as OntologyNodeSearchItem[]),
      Projects.list().catch(() => [] as ProjectListItem[]),
    ])
      .then(([m, n, p]) => {
        if (!live) return;
        setVocab(m);
        setAllNodes(n);
        setProjects(p);
      })
      .catch((e) => live && setGlobalErr((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  // Re-fetch nodes when search changes (debounced).
  React.useEffect(() => {
    if (!search.trim()) return;
    const t = setTimeout(() => {
      OntologyNodes.search({ q: search.trim(), limit: 100 })
        .then(setAllNodes)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // Distinct kinds for left tab.
  const kinds = React.useMemo(() => {
    const set = new Set<string>();
    for (const n of allNodes) set.add(n.node_type);
    return Array.from(set).sort();
  }, [allNodes]);

  return (
    <div
      className={'flex flex-col ' + heightClass}
      data-testid="marcacoes-propriedade-workspace"
    >
      {globalErr && (
        <div className="mx-6 mt-3 px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
          {globalErr}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <LeftPane
          tab={leftTab}
          onChangeTab={setLeftTab}
          vocab={vocab}
          kinds={kinds}
          projects={projects}
          markingFilter={markingFilter}
          onPickMarking={setMarkingFilter}
          kindFilter={kindFilter}
          onPickKind={setKindFilter}
          operationFilter={operationFilter}
          onPickOperation={setOperationFilter}
          loading={loading}
        />
        <CenterPane
          allNodes={allNodes}
          vocab={vocab}
          markingFilter={markingFilter}
          kindFilter={kindFilter}
          operationFilter={operationFilter}
          search={search}
          onSearch={setSearch}
          propertyKeyFilter={propertyKeyFilter}
          onChangePropertyKeyFilter={setPropertyKeyFilter}
          missingMode={missingMode}
          onToggleMissing={() => setMissingMode((v) => !v)}
          checked={checked}
          onCheckChange={setChecked}
          activeNode={activeNode}
          onActivate={setActiveNode}
          onMutated={() => {
            // Force refresh of right pane by setting active node again.
            if (activeNode) setActiveNode({ ...activeNode });
          }}
        />
        <RightPane
          node={activeNode}
          vocab={vocab}
          onClose={() => setActiveNode(null)}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Left pane (320px) — Tabs: marking / kind / operation
// ───────────────────────────────────────────────────────────────────────────

interface LeftProps {
  tab: LeftTab;
  onChangeTab: (t: LeftTab) => void;
  vocab: Marking[];
  kinds: string[];
  projects: ProjectListItem[];
  markingFilter: string | null;
  onPickMarking: (id: string | null) => void;
  kindFilter: string | null;
  onPickKind: (k: string | null) => void;
  operationFilter: string | null;
  onPickOperation: (id: string | null) => void;
  loading: boolean;
}

function LeftPane(props: LeftProps) {
  /*
    Wave I.4 — tabs compactas. Operador relatou: "as tabs, os textos
    estão tão grandes que quebram linha". Solução:
      • Labels curtos ("Marcação", "Tipo", "Operação")
      • fullLabel via tooltip nativo + aria-label preservam descritivo
      • Badge count por eixo (marcações, tipos, operações)
      • max-width por tab + truncate + scroll horizontal se overflow
  */
  const t = useT();
  const tabsItems: TabsCompactItem<LeftTab>[] = [
    {
      value: 'marking',
      label: t('mp.tabMarking'),
      fullLabel: t('mp.tabMarkingFull'),
      icon: Shield,
      count: props.vocab.length,
      testId: 'mp-tab-marking',
    },
    {
      value: 'kind',
      label: t('mp.tabKind'),
      fullLabel: t('mp.tabKindFull'),
      icon: Boxes,
      count: props.kinds.length,
      testId: 'mp-tab-kind',
    },
    {
      value: 'operation',
      label: t('mp.tabOperation'),
      fullLabel: t('mp.tabOperationFull'),
      icon: FolderTree,
      count: props.projects.length,
      testId: 'mp-tab-operation',
    },
  ];
  return (
    <aside
      className="w-[320px] shrink-0 border-r border-border-light bg-white flex flex-col"
      data-testid="mp-left-pane"
      aria-label={t('mp.navAria')}
    >
      <TabsCompact
        items={tabsItems}
        value={props.tab}
        onChange={props.onChangeTab}
        ariaLabel={t('mp.axisAria')}
        maxTabWidth={140}
      />
      <div className="flex-1 overflow-y-auto">
        {props.loading && (
          <p className="p-4 text-[11px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {!props.loading && props.tab === 'marking' && (
          <ul className="py-1" data-testid="mp-marking-list">
            <li>
              <ResetItem
                active={props.markingFilter === null}
                onClick={() => props.onPickMarking(null)}
                label={t('mp.allMarkings')}
              />
            </li>
            {props.vocab.map((m) => (
              <li key={m.id}>
                <NavItem
                  testid={`mp-marking-${m.slug}`}
                  active={props.markingFilter === m.id}
                  onClick={() =>
                    props.onPickMarking(props.markingFilter === m.id ? null : m.id)
                  }
                  label={m.display_name}
                  hint={m.slug}
                  icon={Shield}
                />
              </li>
            ))}
            {props.vocab.length === 0 && (
              <li className="px-4 py-3 text-[11px] text-muted-on-light italic">
                {t('mp.noMarkings')}
              </li>
            )}
          </ul>
        )}
        {!props.loading && props.tab === 'kind' && (
          <ul className="py-1" data-testid="mp-kind-list">
            <li>
              <ResetItem
                active={props.kindFilter === null}
                onClick={() => props.onPickKind(null)}
                label={t('mp.allKinds')}
              />
            </li>
            {props.kinds.map((k) => (
              <li key={k}>
                <NavItem
                  testid={`mp-kind-${k}`}
                  active={props.kindFilter === k}
                  onClick={() =>
                    props.onPickKind(props.kindFilter === k ? null : k)
                  }
                  label={k}
                  hint={t('mp.kindHint')}
                  icon={Boxes}
                />
              </li>
            ))}
          </ul>
        )}
        {!props.loading && props.tab === 'operation' && (
          <ul className="py-1" data-testid="mp-op-list">
            <li>
              <ResetItem
                active={props.operationFilter === null}
                onClick={() => props.onPickOperation(null)}
                label={t('mp.allOperations')}
              />
            </li>
            {props.projects.map((p) => (
              <li key={p.id}>
                <NavItem
                  testid={`mp-op-${p.slug}`}
                  active={props.operationFilter === p.id}
                  onClick={() =>
                    props.onPickOperation(
                      props.operationFilter === p.id ? null : p.id,
                    )
                  }
                  label={p.display_name}
                  hint={p.slug}
                  icon={FolderTree}
                />
              </li>
            ))}
            {props.projects.length === 0 && (
              <li className="px-4 py-3 text-[11px] text-muted-on-light italic">
                {t('mp.noOperations')}
              </li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function NavItem({
  active,
  onClick,
  label,
  hint,
  icon: Icon,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={
        'w-full px-3 py-2 flex items-center gap-2 text-left text-[12px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset ' +
        (active
          ? 'bg-primary/10 text-primary font-semibold'
          : 'hover:bg-canvas-light text-text-on-light')
      }
      aria-pressed={active}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {hint && (
          <span className="block text-[10px] font-mono text-muted-on-light truncate">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

function ResetItem({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full px-3 py-2 flex items-center gap-2 text-left text-[11.5px] uppercase tracking-wider font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset ' +
        (active
          ? 'bg-primary/5 text-primary'
          : 'text-muted-on-light hover:text-text-on-light')
      }
      aria-pressed={active}
    >
      <Layers className="w-3 h-3" strokeWidth={1.5} />
      {label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Center pane — filtered list of nodes + bulk select + bulk actions
// ───────────────────────────────────────────────────────────────────────────

interface CenterProps {
  allNodes: OntologyNodeSearchItem[];
  vocab: Marking[];
  markingFilter: string | null;
  kindFilter: string | null;
  operationFilter: string | null;
  search: string;
  onSearch: (s: string) => void;
  propertyKeyFilter: string;
  onChangePropertyKeyFilter: (s: string) => void;
  missingMode: boolean;
  onToggleMissing: () => void;
  checked: Set<string>;
  onCheckChange: (s: Set<string>) => void;
  activeNode: OntologyNodeSearchItem | null;
  onActivate: (n: OntologyNodeSearchItem | null) => void;
  onMutated: () => void;
}

function CenterPane(p: CenterProps) {
  const t = useT();
  const [nodeMarkings, setNodeMarkings] = React.useState<
    Record<string, Record<string, PropertyMarkingItem[]>>
  >({});
  const [actionMsg, setActionMsg] = React.useState<string | null>(null);
  const [actionErr, setActionErr] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState<null | 'apply' | 'remove'>(null);

  // Load property markings for visible nodes (lazy, bulk-fetched per node).
  React.useEffect(() => {
    let live = true;
    Promise.all(
      p.allNodes.slice(0, 80).map(async (n) => {
        try {
          const m = await PropertyMarkings.listForNode(n.id);
          return [n.id, m] as const;
        } catch {
          return [n.id, {}] as const;
        }
      }),
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, Record<string, PropertyMarkingItem[]>> = {};
      for (const [id, m] of pairs) next[id] = m;
      setNodeMarkings(next);
    });
    return () => {
      live = false;
    };
  }, [p.allNodes]);

  // Apply filters.
  const filtered = React.useMemo(() => {
    return p.allNodes.filter((n) => {
      if (p.kindFilter && n.node_type !== p.kindFilter) return false;
      if (p.propertyKeyFilter && !n.property_keys.includes(p.propertyKeyFilter))
        return false;

      // Marking filter: keep only nodes that HAVE / DO NOT HAVE the marking.
      const propMarks = nodeMarkings[n.id] || {};
      const hasMarking = (markId: string): boolean => {
        for (const arr of Object.values(propMarks)) {
          if (arr.some((m) => m.marking_id === markId)) return true;
        }
        return false;
      };
      if (p.markingFilter) {
        const ok = hasMarking(p.markingFilter);
        if (p.missingMode ? ok : !ok) return false;
      }
      return true;
    });
  }, [p.allNodes, nodeMarkings, p.markingFilter, p.kindFilter, p.propertyKeyFilter, p.missingMode]);

  const allVisibleIds = filtered.map((n) => n.id);
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => p.checked.has(id));

  const toggleAll = () => {
    if (allChecked) p.onCheckChange(new Set());
    else p.onCheckChange(new Set(allVisibleIds));
  };
  const toggleOne = (id: string) => {
    const next = new Set(p.checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    p.onCheckChange(next);
  };

  async function onApply(markingId: string, propertyKey?: string) {
    setActionMsg(null);
    setActionErr(null);
    setBulkBusy(true);
    try {
      const ids = Array.from(p.checked);
      const r = await PropertyMarkings.bulkApply({
        node_ids: ids,
        marking_id: markingId,
        property_key: propertyKey || null,
      });
      setActionMsg(
        t('mp.applyResult')
          .replace('{applied}', String(r.applied))
          .replace('{skipped}', String(r.skipped)) +
          (r.failed.length
            ? t('mp.failuresSuffix').replace('{n}', String(r.failed.length))
            : ''),
      );
      // Refresh visible markings.
      const updated: Record<string, Record<string, PropertyMarkingItem[]>> = {};
      for (const id of ids) {
        try {
          updated[id] = await PropertyMarkings.listForNode(id);
        } catch {
          updated[id] = nodeMarkings[id] || {};
        }
      }
      setNodeMarkings((prev) => ({ ...prev, ...updated }));
      p.onMutated();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBulkBusy(false);
      setPickerOpen(null);
    }
  }

  async function onRemove(markingId: string, propertyKey?: string) {
    setActionMsg(null);
    setActionErr(null);
    setBulkBusy(true);
    try {
      const ids = Array.from(p.checked);
      const r = await PropertyMarkings.bulkRemove({
        node_ids: ids,
        marking_id: markingId,
        property_key: propertyKey || null,
      });
      setActionMsg(
        t('mp.removeResult')
          .replace('{applied}', String(r.applied))
          .replace('{skipped}', String(r.skipped)) +
          (r.failed.length
            ? t('mp.failuresSuffix').replace('{n}', String(r.failed.length))
            : ''),
      );
      const updated: Record<string, Record<string, PropertyMarkingItem[]>> = {};
      for (const id of ids) {
        try {
          updated[id] = await PropertyMarkings.listForNode(id);
        } catch {
          updated[id] = nodeMarkings[id] || {};
        }
      }
      setNodeMarkings((prev) => ({ ...prev, ...updated }));
      p.onMutated();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBulkBusy(false);
      setPickerOpen(null);
    }
  }

  function onExport() {
    const url = PropertyMarkings.exportCsvUrl({
      node_type: p.kindFilter || undefined,
      marking_id: p.markingFilter || undefined,
    });
    window.open(url, '_blank');
  }

  return (
    <section className="flex-1 min-w-0 flex flex-col" data-testid="mp-center-pane">
      {/* Filters bar */}
      <div className="border-b border-border-light bg-white p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-on-light"
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            type="text"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder={t('mp.searchPlaceholder')}
            aria-label={t('mp.searchAria')}
            data-testid="mp-search"
            className="w-full h-8 pl-7 pr-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <input
          type="text"
          value={p.propertyKeyFilter}
          onChange={(e) => p.onChangePropertyKeyFilter(e.target.value)}
          placeholder={t('mp.propFilterPlaceholder')}
          aria-label={t('mp.propFilterAria')}
          data-testid="mp-prop-filter"
          className="h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-1 focus:ring-primary w-[200px] font-mono"
        />
        <label className="flex items-center gap-1.5 text-[11px] text-text-on-light">
          <input
            type="checkbox"
            checked={p.missingMode}
            onChange={p.onToggleMissing}
            data-testid="mp-missing-mode"
            aria-label={t('mp.missingModeAria')}
          />
          {t('mp.missingMode')}
        </label>
        <button
          type="button"
          onClick={onExport}
          data-testid="mp-export"
          className="h-8 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={t('mp.exportCsvAria')}
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('mp.exportCsv')}
        </button>
      </div>

      {/* Bulk actions sticky */}
      {p.checked.size > 0 && (
        <div
          className="border-b border-border-light bg-canvas-light p-2.5 flex items-center gap-2"
          data-testid="mp-bulk-bar"
          role="region"
          aria-live="polite"
        >
          <span className="text-[11.5px] font-semibold">
            {t('mp.selected')
              .replace('{n}', String(p.checked.size))
              .replace('{plural}', p.checked.size === 1 ? '' : 's')}
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen('apply')}
            disabled={bulkBusy}
            data-testid="mp-bulk-apply"
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} />
            {t('mp.bulkApply')}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen('remove')}
            disabled={bulkBusy}
            data-testid="mp-bulk-remove"
            className="h-7 px-2.5 text-[11px] bg-white text-danger border border-danger hover:bg-danger/5 flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-danger"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.5} />
            {t('mp.bulkRemove')}
          </button>
          <button
            type="button"
            onClick={() => p.onCheckChange(new Set())}
            className="h-7 px-2.5 text-[11px] text-muted-on-light hover:text-text-on-light focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {t('mp.clearSelection')}
          </button>
          {bulkBusy && (
            <span className="flex items-center gap-1 text-[11px] text-muted-on-light">
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
              {t('mp.processing')}
            </span>
          )}
        </div>
      )}
      {actionMsg && (
        <p
          className="px-3 py-2 text-[11px] text-success bg-success/5 border-b border-success/30 font-mono"
          role="status"
          aria-live="polite"
          data-testid="mp-action-msg"
        >
          {actionMsg}
        </p>
      )}
      {actionErr && (
        <p
          className="px-3 py-2 text-[11px] text-danger bg-danger/5 border-b border-danger/30 font-mono"
          role="alert"
          aria-live="assertive"
          data-testid="mp-action-err"
        >
          {actionErr}
        </p>
      )}

      {/* Header row + list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-canvas-light sticky top-0 z-10">
            <tr className="text-left">
              <th className="w-9 p-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label={t('mp.checkAllAria')}
                  data-testid="mp-check-all"
                />
              </th>
              <th className="p-2 text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('mp.colObject')}
              </th>
              <th className="p-2 text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('mp.colMarkings')}
              </th>
            </tr>
          </thead>
          <tbody data-testid="mp-node-list">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-[11.5px] text-muted-on-light italic">
                  {t('mp.noNodes')}
                </td>
              </tr>
            )}
            {filtered.map((n) => {
              const propMarks = nodeMarkings[n.id] || {};
              const allMarks: PropertyMarkingItem[] = Object.values(propMarks).flat();
              const isActive = p.activeNode?.id === n.id;
              return (
                <tr
                  key={n.id}
                  data-testid={`mp-node-row-${n.id}`}
                  data-active={isActive}
                  className={
                    'border-b border-border-light hover:bg-canvas-light cursor-pointer ' +
                    (isActive ? 'bg-primary/5' : '')
                  }
                  onClick={() => p.onActivate(n)}
                >
                  <td className="p-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={p.checked.has(n.id)}
                      onChange={() => toggleOne(n.id)}
                      aria-label={t('mp.selectOneAria').replace('{name}', n.name)}
                      data-testid={`mp-check-${n.id}`}
                    />
                  </td>
                  <td className="p-2 align-top">
                    <span className="block font-semibold truncate">{n.name}</span>
                    <span className="block text-[10px] font-mono text-muted-on-light truncate">
                      {n.node_type} · urn:{n.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="p-2 align-top">
                    {allMarks.length === 0 ? (
                      <span className="text-[10.5px] text-muted-on-light italic">
                        {t('mp.noMark')}
                      </span>
                    ) : (
                      <PropertyMarkingPillList markings={allMarks} display="responsive" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <MarkingPickerDialog
          mode={pickerOpen}
          vocab={p.vocab}
          checkedCount={p.checked.size}
          onCancel={() => setPickerOpen(null)}
          onConfirm={(markingId, propertyKey) =>
            pickerOpen === 'apply'
              ? onApply(markingId, propertyKey)
              : onRemove(markingId, propertyKey)
          }
        />
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// MarkingPickerDialog — used for bulk apply + bulk remove
// ───────────────────────────────────────────────────────────────────────────

function MarkingPickerDialog({
  mode,
  vocab,
  checkedCount,
  onCancel,
  onConfirm,
}: {
  mode: 'apply' | 'remove';
  vocab: Marking[];
  checkedCount: number;
  onCancel: () => void;
  onConfirm: (markingId: string, propertyKey?: string) => void;
}) {
  const t = useT();
  const [markingId, setMarkingId] = React.useState('');
  const [propertyKey, setPropertyKey] = React.useState('');
  const verb = mode === 'apply' ? t('mp.pickerApply') : t('mp.pickerRemove');
  const isDestructive = mode === 'remove';

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex items-center justify-center"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t('mp.pickerAria').replace('{verb}', verb)}
      data-testid="mp-picker-dialog"
    >
      <div
        className="bg-white border border-border-light w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[14px] font-semibold mb-1">
          {t('mp.pickerTitle')
            .replace('{verb}', verb)
            .replace('{n}', String(checkedCount))
            .replace('{plural}', checkedCount === 1 ? '' : 's')}
        </h3>
        <p className="text-[11.5px] text-muted-on-light mb-4">
          {mode === 'apply' ? t('mp.pickerApplyDesc') : t('mp.pickerRemoveDesc')}
        </p>
        <div className="space-y-3">
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            {t('mp.pickerMarkingLabel')}
            <select
              value={markingId}
              onChange={(e) => setMarkingId(e.target.value)}
              data-testid="mp-picker-marking"
              className="mt-1 w-full h-9 px-2 text-[12px] bg-white border border-border-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">{t('mp.pickerChoose')}</option>
              {vocab.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            {t('mp.pickerPropLabel')}
            <input
              type="text"
              value={propertyKey}
              onChange={(e) => setPropertyKey(e.target.value)}
              data-testid="mp-picker-property"
              placeholder={t('mp.pickerPropPlaceholder')}
              className="mt-1 w-full h-9 px-2 text-[12px] bg-white border border-border-light font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 text-[12px] bg-white border border-border-light hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!markingId}
            onClick={() => onConfirm(markingId, propertyKey.trim() || undefined)}
            data-testid="mp-picker-confirm"
            className={
              'h-8 px-3 text-[12px] text-white border focus:outline-none focus:ring-2 disabled:opacity-50 ' +
              (isDestructive
                ? 'bg-danger border-danger hover:bg-danger/90 focus:ring-danger'
                : 'bg-primary border-primary hover:bg-primary-hover focus:ring-primary')
            }
          >
            {verb}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Right pane (380px) — detail, applied markings, property markings, audit
// ───────────────────────────────────────────────────────────────────────────

function RightPane({
  node,
  vocab,
  onClose,
}: {
  node: OntologyNodeSearchItem | null;
  vocab: Marking[];
  onClose: () => void;
}) {
  const t = useT();
  const askConfirm = useConfirm();
  const [propMarks, setPropMarks] = React.useState<
    Record<string, PropertyMarkingItem[]>
  >({});
  const [hist, setHist] = React.useState<LineageEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const vocabById = React.useMemo(
    () => Object.fromEntries(vocab.map((m) => [m.id, m])),
    [vocab],
  );

  const refresh = React.useCallback(async () => {
    if (!node) return;
    setLoading(true);
    setErr(null);
    try {
      const [pm, linProp, linApply, linRem, linRemProp] = await Promise.all([
        PropertyMarkings.listForNode(node.id),
        Lineage.listEvents({ limit: 50, event_type: 'markings.apply.property' }).catch(
          () => [] as LineageEvent[],
        ),
        Lineage.listEvents({ limit: 50, event_type: 'markings.apply' }).catch(
          () => [] as LineageEvent[],
        ),
        Lineage.listEvents({ limit: 50, event_type: 'markings.remove' }).catch(
          () => [] as LineageEvent[],
        ),
        Lineage.listEvents({ limit: 50, event_type: 'markings.remove.property' }).catch(
          () => [] as LineageEvent[],
        ),
      ]);
      setPropMarks(pm);
      const all = [...linProp, ...linApply, ...linRem, ...linRemProp];
      // Dedupe by id, filter by metadata_.node_id OR metadata_.resource_id, sort desc.
      const byId = new Map<string, LineageEvent>();
      for (const ev of all) byId.set(ev.id, ev);
      const filtered = Array.from(byId.values())
        .filter((e) => {
          const md = (e.metadata_ as Record<string, unknown>) || {};
          return md.node_id === node.id || md.resource_id === node.id;
        })
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
        .slice(0, 20);
      setHist(filtered);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [node]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (!node) {
    return (
      <aside
        className="w-[380px] shrink-0 border-l border-border-light bg-canvas-light p-4 flex items-center justify-center"
        data-testid="mp-right-pane-empty"
      >
        <p className="text-[11.5px] text-muted-on-light italic text-center">
          {t('mp.rightEmpty')}
        </p>
      </aside>
    );
  }

  async function removeOne(propKey: string, markingId: string) {
    const ok = await askConfirm({
      title: t('mp.removeOneTitle'),
      description: t('mp.removeOneDesc')
        .replace('{prop}', propKey)
        .replace('{name}', node!.name),
      tone: 'warning',
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    try {
      await PropertyMarkings.remove(node!.id, propKey, markingId);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <aside
      className="w-[380px] shrink-0 border-l border-border-light bg-canvas-light overflow-y-auto"
      data-testid="mp-right-pane"
      aria-label={t('mp.rightDetailAria')}
    >
      <header className="p-4 border-b border-border-light bg-white flex items-start gap-2">
        <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold">
            {t('mp.rightObjectLabel')}
          </p>
          <p className="text-[13px] font-semibold truncate">{node.name}</p>
          <p className="text-[10px] font-mono text-muted-on-light truncate">
            {node.node_type} · urn:{node.id}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('mp.rightCloseAria')}
          data-testid="mp-right-close"
          className="text-muted-on-light hover:text-text-on-light focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </header>

      {loading && (
        <p className="p-4 text-[11px] text-muted-on-light italic">{t('common.loading')}</p>
      )}
      {err && (
        <p className="m-4 px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30">
          {err}
        </p>
      )}

      <Section title={t('mp.propMarkingsTitle')} testid="mp-right-prop">
        {Object.keys(propMarks).length === 0 ? (
          <p className="text-[11px] text-muted-on-light italic">
            {t('mp.propMarkingsEmpty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {Object.entries(propMarks).map(([propKey, items]) => (
              <li
                key={propKey}
                className="bg-white border border-border-light p-2"
                data-testid={`mp-right-prop-${propKey}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1.5">
                  {propKey}
                </p>
                <ul className="space-y-1">
                  {items.map((m) => (
                    <li
                      key={m.marking_id}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <PropertyMarkingPillList markings={[m]} display="full" />
                      <span className="flex-1 font-mono text-muted-on-light text-[10px]">
                        {new Date(m.applied_at).toLocaleString('pt-BR')}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOne(propKey, m.marking_id)}
                        aria-label={t('mp.removeOneAria')
                          .replace('{marking}', m.marking_display_name)
                          .replace('{prop}', propKey)}
                        data-testid={`mp-right-remove-${m.marking_slug}-${propKey}`}
                        className="h-5 w-5 flex items-center justify-center border border-border-light hover:border-danger hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
                      >
                        <X className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('mp.historyTitle')} testid="mp-right-history" icon={History}>
        {hist.length === 0 ? (
          <p className="text-[11px] text-muted-on-light italic">{t('mp.historyEmpty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {hist.map((ev) => {
              const md = (ev.metadata_ || {}) as Record<string, unknown>;
              const markName =
                (vocabById[String(md.marking_id || '')]?.display_name) ||
                String(md.marking_id || '');
              return (
                <li
                  key={ev.id}
                  className="bg-white border border-border-light p-2"
                  data-testid={`mp-right-hist-${ev.id}`}
                >
                  <p className="text-[11px] font-semibold">
                    {ev.event_type} · {markName}
                  </p>
                  <p className="text-[10px] font-mono text-muted-on-light">
                    {ev.actor || t('mp.systemActor')} ·{' '}
                    {new Date(ev.timestamp).toLocaleString('pt-BR')}
                  </p>
                  {md.property_key !== undefined && (
                    <p className="text-[10px] font-mono text-muted-on-light">
                      property_key: {String(md.property_key)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
  testid,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  testid?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <section
      className="p-4 border-b border-border-light space-y-2"
      data-testid={testid}
    >
      <header className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />}
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
          {title}
        </p>
      </header>
      {children}
    </section>
  );
}
