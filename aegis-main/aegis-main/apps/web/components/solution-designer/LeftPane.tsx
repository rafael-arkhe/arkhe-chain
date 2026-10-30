'use client';

/**
 * LeftPane — Node Toolbar + Reference Library (M4 #9).
 *
 * Two tabs:
 *  - "Componentes": searchable palette of node kinds grouped by phase.
 *    Clicking a component adds a concrete node to the canvas.
 *  - "Biblioteca de referência": curated patterns by vertical; preview +
 *    "Usar como base" loads the pattern graph into the canvas.
 */
import * as React from 'react';
import { Search, Boxes } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import type { DictKey } from '@/lib/i18n/dict';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { SolutionPattern } from '@/lib/api';
import { PALETTE, PHASE_META, kindLabel, kindHintKey, type Phase } from './nodeMeta';
import { PanelHeader } from './PanelHeader';

type Tab = 'components' | 'library';

/**
 * Reference-library categories (mirror the Foundry trio Industry / Technical
 * / Workflow). Backend categories: vertical → Industry, tecnico → Technical,
 * fluxo → Workflow.
 */
const LIBRARY_CATEGORIES: Array<{ key: string; labelKey: DictKey }> = [
  { key: 'vertical', labelKey: 'solutions.catIndustry' },
  { key: 'tecnico', labelKey: 'solutions.catTechnical' },
  { key: 'fluxo', labelKey: 'solutions.catWorkflow' },
];

export function LeftPane({
  patterns,
  onAddComponent,
  onLoadPattern,
  onPreviewPattern,
  onClose,
}: {
  patterns: SolutionPattern[];
  onAddComponent: (kind: string, phase: Phase) => void;
  onLoadPattern: (p: SolutionPattern) => void;
  onPreviewPattern: (p: SolutionPattern) => void;
  /** #11 — fechar o painel (chrome consistente com os demais painéis). */
  onClose?: () => void;
}) {
  const t = useT();
  const [tab, setTab] = React.useState<Tab>('components');
  const [q, setQ] = React.useState('');

  const ql = q.trim().toLowerCase();

  return (
    <div
      className="h-full min-w-0 flex flex-col border-r border-border-light bg-canvas-light"
      data-testid="solutions-left-pane"
    >
      {/* #11 — header de painel consistente (ícone + título + ×). */}
      <PanelHeader
        icon={Boxes}
        title={t('solutions.leftPaneTitle')}
        titleTestId="left-pane-title"
        onClose={onClose}
        closeTestId="left-pane-close"
        closeLabel={t('common.close')}
      />
      <div className="flex border-b border-border-light">
        <button
          type="button"
          onClick={() => setTab('components')}
          aria-pressed={tab === 'components'}
          data-testid="left-tab-components"
          className={
            'flex-1 px-2 py-2 text-[11px] uppercase tracking-wider flex items-center justify-center ' +
            (tab === 'components'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-on-light')
          }
        >
          {/* #13 — sem ícone na aba (poluía sem ajudar) */}
          {t('solutions.nodeToolbar')}
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          aria-pressed={tab === 'library'}
          data-testid="left-tab-library"
          className={
            'flex-1 px-2 py-2 text-[11px] uppercase tracking-wider flex items-center justify-center ' +
            (tab === 'library'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-on-light')
          }
        >
          {t('solutions.referenceLibrary')}
        </button>
      </div>

      <div className="p-2 border-b border-border-light">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('solutions.searchComponents')}
            className="h-8 pl-7 text-[11.5px]"
            data-testid="left-search"
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-auto scrollbar-hide p-2 space-y-3">
        {tab === 'components' &&
          PALETTE.map((grp) => {
            const kinds = grp.kinds.filter(
              (k) => !ql || kindLabel(k).toLowerCase().includes(ql),
            );
            if (!kinds.length) return null;
            const meta = PHASE_META[grp.phase];
            return (
              <div key={grp.phase}>
                <p
                  className={`text-[9px] uppercase tracking-widest mb-1 ${meta.tone}`}
                >
                  {meta.label}
                </p>
                <div className="space-y-1">
                  {kinds.map((k) => {
                    const hintKey = kindHintKey(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onAddComponent(k, grp.phase)}
                        data-testid={`palette-${k}`}
                        title={hintKey ? t(hintKey) : undefined}
                        className="w-full text-left px-2 py-1.5 bg-white border border-border-light hover:border-primary"
                      >
                        <span className="block text-[11.5px] text-text-on-light truncate">
                          {kindLabel(k)}
                        </span>
                        {hintKey && (
                          <span
                            className="block text-[9.5px] leading-snug text-muted-on-light mt-0.5 line-clamp-2"
                            data-testid={`palette-hint-${k}`}
                          >
                            {t(hintKey)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {tab === 'library' && (
          <div className="space-y-3" data-testid="reference-library">
            {LIBRARY_CATEGORIES.map((cat) => {
              const matches = patterns.filter(
                (p) =>
                  (p.category || 'vertical') === cat.key &&
                  (!ql ||
                    p.title.toLowerCase().includes(ql) ||
                    (p.description || '').toLowerCase().includes(ql) ||
                    (p.vertical || '').toLowerCase().includes(ql)),
              );
              if (!matches.length) return null;
              return (
                <div key={cat.key} className="min-w-0" data-testid={`library-cat-${cat.key}`}>
                  <p className="text-[9px] uppercase tracking-widest mb-1 text-muted-on-light truncate">
                    {t(cat.labelKey)}
                  </p>
                  <div className="space-y-2">
                    {matches.map((p) => (
                      <div
                        key={p.id}
                        className="min-w-0 bg-white border border-border-light p-2"
                        data-testid={`pattern-${p.slug}`}
                      >
                        <p className="text-[12px] font-semibold text-text-on-light break-words">
                          {p.title}
                        </p>
                        <p className="text-[10.5px] text-muted-on-light mt-0.5 break-words">
                          {p.description}
                        </p>
                        <p className="text-[9px] font-mono text-muted-on-light mt-1">
                          {p.nodes.length} nós · {p.edges.length} conexões
                        </p>
                        {/* #11 — copy curta + flex-1 (dividem a largura, não
                            estouram o painel de 240px). Preview secundário. */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Button
                            variant="outline"
                            className="h-7 flex-1 text-[10.5px] justify-center truncate"
                            onClick={() => onPreviewPattern(p)}
                            data-testid={`pattern-preview-${p.slug}`}
                          >
                            {t('solutions.openPreview')}
                          </Button>
                          <Button
                            variant="default"
                            className="h-7 flex-1 text-[10.5px] justify-center truncate"
                            onClick={() => onLoadPattern(p)}
                            data-testid={`pattern-use-${p.slug}`}
                          >
                            {t('solutions.useAsBase')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
