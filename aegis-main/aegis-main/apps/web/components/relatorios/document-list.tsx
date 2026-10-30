'use client';

/**
 * #2 — DocumentList: lista de Documentos COMPARTILHADA por /relatorios e
 * /briefings. Antes era uma lista chapada (título + linha de meta) que não
 * escalava. Agora: busca, filtros (classificação + estado) e linhas ricas com
 * categorização DERIVADA — selo de classificação COLORIDO (cor falante: cor +
 * rótulo) + chips de marcação neutros + versão em mono + estado. Sem campo novo
 * no backend (decisão do operador).
 *
 * Estética: cantos retos, único acento azul-aço, sem emoji, JetBrains Mono p/
 * dado, strings via useT(). Testids preservados (`${prefix}-item-${id}` etc.).
 */
import * as React from 'react';
import { Plus, Search, Pin, Lock, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import type { NotepadDoc } from '@/lib/api';
import { SelectField } from '@/components/buscar/select-field';
import {
  CLASSIFICATION_BG,
  CLASSIFICATION_TEXT,
  CLASSIFICATION_LABEL,
  isClassificationLevel,
  type ClassificationLevel,
} from '@/lib/classification';
import {
  filterDocs,
  orderDocs,
  hasActiveFilter,
  type DocStateFilter,
} from '@/lib/relatorios/doc-filter';

const LEVELS: ClassificationLevel[] = ['publico', 'restrito', 'confidencial', 'sigiloso'];

export function DocumentList({
  docs,
  selectedId,
  onSelect,
  onCreate,
  label,
  prefix,
}: {
  docs: NotepadDoc[];
  selectedId?: string;
  onSelect: (d: NotepadDoc) => void;
  /** Quando presente, mostra o botão "+" (só /relatorios cria). */
  onCreate?: () => void;
  label: string;
  /** 'rel' | 'briefings' — preserva os data-testid existentes. */
  prefix: string;
}) {
  const t = useT();
  const [query, setQuery] = React.useState('');
  const [cls, setCls] = React.useState('');
  const [state, setState] = React.useState<DocStateFilter>('');

  const filter = { query, classification: cls, state };
  const ordered = React.useMemo(
    () => orderDocs(filterDocs(docs, filter)),
    [docs, query, cls, state],
  );
  const filtering = hasActiveFilter(filter);
  const clear = () => {
    setQuery('');
    setCls('');
    setState('');
  };

  return (
    <aside className="w-64 border-r border-border-light flex flex-col shrink-0">
      <div className="h-9 px-3 border-b border-border-light flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{label}</span>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            data-testid={`${prefix}-new`}
            aria-label={t('docList.new')}
            className="text-muted-on-light hover:text-primary"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Busca + filtros (categorização derivada) */}
      <div className="p-2 space-y-1.5 border-b border-border-light shrink-0">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light pointer-events-none"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid={`${prefix}-search`}
            placeholder={t('docList.search')}
            className="w-full h-7 pl-7 pr-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <SelectField
            name={`${prefix}-fcls`}
            testId={`${prefix}-filter-cls`}
            value={cls}
            options={LEVELS.map((lv) => ({ value: lv, label: CLASSIFICATION_LABEL[lv] }))}
            emptyLabel={t('docList.allCls')}
            onChange={setCls}
          />
          <SelectField
            name={`${prefix}-fstate`}
            testId={`${prefix}-filter-state`}
            value={state}
            options={[
              { value: 'signed', label: t('docList.signed') },
              { value: 'draft', label: t('docList.draft') },
            ]}
            emptyLabel={t('docList.allStates')}
            onChange={(v) => setState(v as DocStateFilter)}
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto scrollbar-hide" data-testid={`${prefix}-list`}>
        {ordered.length === 0 ? (
          <li
            className="px-3 py-4 text-[11px] text-muted-on-light italic flex flex-col items-start gap-2"
            data-testid={`${prefix}-empty`}
          >
            {filtering ? t('docList.noMatch') : t('docList.empty')}
            {filtering && (
              <button
                type="button"
                onClick={clear}
                data-testid={`${prefix}-clear`}
                className="not-italic inline-flex items-center gap-1 h-6 px-2 text-[10px] bg-white border border-border-light hover:border-primary"
              >
                <X className="w-3 h-3" strokeWidth={1.5} /> {t('docList.clear')}
              </button>
            )}
          </li>
        ) : (
          ordered.map((d) => {
            const active = selectedId === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelect(d)}
                  data-testid={`${prefix}-item-${d.id}`}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border-light/60 block',
                    active ? 'bg-primary/5' : 'hover:bg-canvas-light',
                  )}
                >
                  <DocRow doc={d} active={active} />
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="h-7 px-3 border-t border-border-light flex items-center text-[10px] text-muted-on-light shrink-0">
        <span className="font-mono tabular-nums">
          {filtering ? `${ordered.length}/${docs.length}` : docs.length}
        </span>
        <span className="ml-1">{t('docList.docs')}</span>
      </div>
    </aside>
  );
}

/** Linha rica: título + categorização (selo de classificação colorido + chips de
 *  marcação + versão mono + estado). */
function DocRow({ doc, active }: { doc: NotepadDoc; active: boolean }) {
  const lvl = isClassificationLevel(doc.classification_level)
    ? (doc.classification_level as ClassificationLevel)
    : null;
  const marks = doc.markings || [];
  return (
    <span className="min-w-0 block">
      <span className="flex items-center gap-1.5">
        {doc.pinned && <Pin className="w-3 h-3 shrink-0 text-primary" strokeWidth={1.5} />}
        <span className={cn('block truncate text-[11px] font-medium', active && 'text-primary')}>
          {doc.title}
        </span>
      </span>
      <span className="flex items-center flex-wrap gap-1 mt-1">
        {lvl && (
          <span
            className={cn(
              'inline-flex items-center h-4 px-1 text-[9px] font-semibold tracking-wide',
              CLASSIFICATION_BG[lvl],
              CLASSIFICATION_TEXT[lvl],
            )}
          >
            {CLASSIFICATION_LABEL[lvl]}
          </span>
        )}
        {marks.slice(0, 2).map((m) => (
          <span
            key={m}
            className="inline-flex items-center h-4 px-1 text-[9px] border border-border-light text-muted-on-light"
          >
            {m}
          </span>
        ))}
        {marks.length > 2 && (
          <span className="text-[9px] text-muted-on-light font-mono">+{marks.length - 2}</span>
        )}
        <span className="text-[9px] text-muted-on-light font-mono tabular-nums">v{doc.version}</span>
        {doc.signed && <Lock className="w-2.5 h-2.5 text-success shrink-0" strokeWidth={2} />}
      </span>
    </span>
  );
}
