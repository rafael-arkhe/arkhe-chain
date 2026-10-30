'use client';

/**
 * MosaicEditorModal — §C C1: cria/edita um MOSAICO NOMEADO de câmeras.
 *
 * Modal focado (padrão dos demais modais da página: ModalPortal + ds-overlay,
 * NUNCA diálogo nativo). Dois modos de seleção:
 *   - manual — conjunto FIXO de câmeras escolhidas a dedo (multi-select);
 *   - filtro — recorte DINÂMICO por cidade + situação + tags + ZONA (polígono
 *     do /geo, por ponto-em-polígono). Câmera nova que casar entra sozinha.
 *
 * Contagem viva ("N câmeras neste mosaico") resolvida por `resolveMosaic` do
 * módulo puro — o operador vê o alcance antes de salvar. Zero input técnico
 * cru: cidade/tags/zona/câmera vêm de selects populados do dado real.
 *
 * DS: cantos retos, #2D77BE só no selecionado, lucide neutro, useT() pt/en.
 */
import * as React from 'react';
import { Check, ChevronDown, Grid3x3, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { FloatingPopover } from '@/components/ui/floating-popover';
import { deriveCities } from '@/components/cameras/camera-filters';
import type { CCTVStream } from '@/lib/api/cctv';
import type { GeoZoneApi } from '@/lib/api/geo';
import {
  mosaicCount,
  newMosaicId,
  type Mosaic,
  type MosaicCols,
  type MosaicSelection,
} from '@/lib/cameras/mosaic';

type Props = {
  /** null = criar; um Mosaic = editar. */
  initial: Mosaic | null;
  streams: CCTVStream[];
  zones: GeoZoneApi[];
  /** todos os mosaicos (para gerar id novo sem colisão). */
  existing: Mosaic[];
  onSave: (m: Mosaic) => void;
  onClose: () => void;
};

const COLS: MosaicCols[] = ['auto', 2, 3, 4];

/** Multi-select inline (gatilho + FloatingPopover com busca + checklist),
 *  espelho do MarkingsSelect. zIndex > z do modal (70). */
function InlineMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  testid,
}: {
  options: { value: string; label: string; hint?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  testid: string;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const sel = React.useMemo(() => new Set(selected), [selected]);
  const q = query.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      !q
        ? options
        : options.filter(
            (o) =>
              o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
          ),
    [options, q],
  );
  const toggle = (v: string) => {
    const next = new Set(sel);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };
  const selectedLabels = options.filter((o) => sel.has(o.value)).map((o) => o.label);
  const triggerText =
    sel.size === 0 ? placeholder : selectedLabels.join(', ') || String(sel.size);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testid}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 w-full items-center justify-between gap-2 border border-border-light bg-canvas-light px-2 text-left text-[11px] outline-none hover:border-primary focus:border-primary"
      >
        <span className={sel.size ? 'truncate text-text-on-light' : 'truncate text-muted-on-light'}>
          {triggerText}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 shrink-0 text-muted-on-light transition-transform', open && 'rotate-180')}
          strokeWidth={1.5}
        />
      </button>
      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        align="start"
        offset={4}
        matchTriggerWidth
        minWidth={220}
        maxHeight="min(50vh, 280px)"
        zIndex={70}
        role="listbox"
        testId={`${testid}-pop`}
        bodyTestId={`${testid}-options`}
        header={
          <span className="flex h-9 shrink-0 items-center gap-1 border-b border-border-light px-2">
            <Search className="w-3.5 h-3.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              data-testid={`${testid}-input`}
              className="flex-1 bg-transparent text-[12px] outline-none"
            />
          </span>
        }
      >
        {options.length === 0 ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">{emptyLabel}</p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-2 text-[10px] italic text-muted-on-light">
            {t('buscar.multiselect.vazio')}
          </p>
        ) : (
          visible.map((o) => {
            const on = sel.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                data-testid={`${testid}-opt-${o.value}`}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-primary/5"
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border',
                    on ? 'border-primary bg-primary' : 'border-border-light',
                  )}
                >
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 font-mono text-[9px] text-muted-on-light/70">{o.hint}</span>
                )}
              </button>
            );
          })
        )}
      </FloatingPopover>
    </>
  );
}

export function MosaicEditorModal({ initial, streams, zones, existing, onSave, onClose }: Props) {
  const t = useT();
  const [name, setName] = React.useState(initial?.name ?? '');
  const [mode, setMode] = React.useState<'manual' | 'filter'>(initial?.selection.mode ?? 'filter');
  const [streamIds, setStreamIds] = React.useState<string[]>(
    initial?.selection.mode === 'manual' ? initial.selection.streamIds : [],
  );
  const initFilter = initial?.selection.mode === 'filter' ? initial.selection.filter : undefined;
  const [city, setCity] = React.useState<string>(initFilter?.city ?? '');
  const [status, setStatus] = React.useState<'' | 'online' | 'offline'>(initFilter?.status ?? '');
  const [tags, setTags] = React.useState<string[]>(initFilter?.tags ?? []);
  const [zoneId, setZoneId] = React.useState<string>(initFilter?.zoneId ?? '');
  const [cols, setCols] = React.useState<MosaicCols>(initial?.layout.cols ?? 'auto');
  const [nameError, setNameError] = React.useState(false);

  const cities = React.useMemo(() => deriveCities(streams), [streams]);
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of streams) for (const tg of s.tags ?? []) {
      const c = tg.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [streams]);

  const selection: MosaicSelection = React.useMemo(() => {
    if (mode === 'manual') return { mode: 'manual', streamIds };
    return {
      mode: 'filter',
      filter: {
        ...(city ? { city } : {}),
        ...(status ? { status } : {}),
        ...(tags.length ? { tags } : {}),
        ...(zoneId ? { zoneId } : {}),
      },
    };
  }, [mode, streamIds, city, status, tags, zoneId]);

  const draft: Mosaic = React.useMemo(
    () => ({ id: initial?.id ?? '__draft__', name, selection, layout: { cols } }),
    [initial, name, selection, cols],
  );
  const count = React.useMemo(
    () => mosaicCount(draft, streams, zones),
    [draft, streams, zones],
  );

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    const id = initial?.id ?? newMosaicId(existing);
    onSave({ id, name: trimmed, selection, layout: { cols } });
  };

  const labelCls = 'text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold';
  const fieldCls =
    'h-8 w-full border border-border-light bg-canvas-light px-2 text-[11px] outline-none focus:border-primary';

  return (
    <ModalPortal>
      <div
        data-testid="mosaic-editor-modal"
        className="fixed inset-0 z-50 flex items-center justify-center ds-overlay p-6"
        onClick={onClose}
      >
        <div
          className="bg-canvas-light text-text-on-light border border-border-light w-full max-w-md flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="h-10 px-3 border-b border-border-light flex items-center gap-3 bg-panel-light">
            <Grid3x3 className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider flex-1">
              {t(initial ? 'cameras.mosaic.editTitle' : 'cameras.mosaic.newTitle')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center hover:bg-raised-light"
              aria-label={t('common.close')}
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </header>

          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-hide">
            {/* Nome */}
            <div className="space-y-1">
              <label className={labelCls} htmlFor="mosaic-name">
                {t('cameras.mosaic.nameLabel')}
              </label>
              <input
                id="mosaic-name"
                data-testid="mosaic-name-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(false);
                }}
                placeholder={t('cameras.mosaic.namePlaceholder')}
                autoFocus
                className={cn(fieldCls, nameError && 'border-danger')}
              />
              {nameError && (
                <p data-testid="mosaic-name-error" className="text-[10px] text-danger">
                  {t('cameras.mosaic.nameRequired')}
                </p>
              )}
            </div>

            {/* Modo de seleção */}
            <div className="space-y-1">
              <span className={labelCls}>{t('cameras.mosaic.selectionLabel')}</span>
              <div className="flex">
                {(['manual', 'filter'] as const).map((mo) => (
                  <button
                    key={mo}
                    type="button"
                    data-testid={`mosaic-mode-${mo}`}
                    onClick={() => setMode(mo)}
                    className={cn(
                      'h-8 flex-1 border text-[11px] -ml-px first:ml-0',
                      mode === mo
                        ? 'bg-primary text-white border-primary'
                        : 'bg-raised-light border-border-light hover:border-primary',
                    )}
                  >
                    {t(mo === 'manual' ? 'cameras.mosaic.modeManual' : 'cameras.mosaic.modeFilter')}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'manual' ? (
              <div className="space-y-1">
                <span className={labelCls}>{t('cameras.mosaic.pickCameras')}</span>
                <InlineMultiSelect
                  testid="mosaic-manual-select"
                  options={streams.map((s) => ({
                    value: s.id,
                    label: s.name,
                    hint: s.city ?? undefined,
                  }))}
                  selected={streamIds}
                  onChange={setStreamIds}
                  placeholder={t('cameras.mosaic.pickCameras')}
                  searchPlaceholder={t('cameras.mosaic.pickCamerasSearch')}
                  emptyLabel={t('cameras.filter.noStreams')}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-on-light">{t('cameras.mosaic.filterHint')}</p>
                {/* Cidade */}
                <div className="space-y-1">
                  <label className={labelCls} htmlFor="mosaic-filter-city">
                    {t('cameras.filter.city')}
                  </label>
                  <select
                    id="mosaic-filter-city"
                    data-testid="mosaic-filter-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={cn(fieldCls, city && 'border-primary text-primary')}
                  >
                    <option value="">{t('cameras.mosaic.cityAny')}</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Situação */}
                <div className="space-y-1">
                  <label className={labelCls} htmlFor="mosaic-filter-status">
                    {t('cameras.mosaic.statusLabel')}
                  </label>
                  <select
                    id="mosaic-filter-status"
                    data-testid="mosaic-filter-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as '' | 'online' | 'offline')}
                    className={cn(fieldCls, status && 'border-primary text-primary')}
                  >
                    <option value="">{t('cameras.mosaic.statusAny')}</option>
                    <option value="online">{t('cameras.filter.statusOnline')}</option>
                    <option value="offline">{t('cameras.filter.statusOffline')}</option>
                  </select>
                </div>
                {/* Tags */}
                <div className="space-y-1">
                  <span className={labelCls}>{t('cameras.mosaic.tagsLabel')}</span>
                  <InlineMultiSelect
                    testid="mosaic-filter-tags"
                    options={allTags.map((tg) => ({ value: tg, label: tg }))}
                    selected={tags}
                    onChange={setTags}
                    placeholder={t('cameras.mosaic.tagsAny')}
                    searchPlaceholder={t('cameras.mosaic.tagsSearch')}
                    emptyLabel={t('cameras.mosaic.tagsEmpty')}
                  />
                </div>
                {/* Zona */}
                <div className="space-y-1">
                  <label className={labelCls} htmlFor="mosaic-filter-zone">
                    {t('cameras.mosaic.zoneLabel')}
                  </label>
                  <select
                    id="mosaic-filter-zone"
                    data-testid="mosaic-filter-zone"
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    disabled={zones.length === 0}
                    className={cn(
                      fieldCls,
                      zoneId && 'border-primary text-primary',
                      zones.length === 0 && 'opacity-50',
                    )}
                  >
                    <option value="">
                      {zones.length === 0 ? t('cameras.mosaic.zoneNone') : t('cameras.mosaic.zoneAny')}
                    </option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Colunas */}
            <div className="space-y-1">
              <span className={labelCls}>{t('cameras.mosaic.columnsLabel')}</span>
              <div className="flex">
                {COLS.map((c) => (
                  <button
                    key={String(c)}
                    type="button"
                    data-testid={`mosaic-cols-${c}`}
                    onClick={() => setCols(c)}
                    className={cn(
                      'h-8 flex-1 border text-[11px] font-mono -ml-px first:ml-0',
                      cols === c
                        ? 'bg-primary text-white border-primary'
                        : 'bg-raised-light border-border-light hover:border-primary',
                    )}
                  >
                    {c === 'auto' ? t('cameras.mosaic.colAuto') : c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <footer className="px-3 py-2 border-t border-border-light flex items-center gap-3 bg-panel-light">
            <span data-testid="mosaic-count" className="text-[11px] font-mono text-muted-on-light flex-1">
              {count === 1
                ? t('cameras.mosaic.matchOne')
                : t('cameras.mosaic.matchN').replace('{n}', String(count))}
            </span>
            <button
              type="button"
              data-testid="mosaic-cancel"
              onClick={onClose}
              className="h-7 px-3 text-[11px] bg-canvas-light text-muted-on-light border border-border-light hover:border-danger hover:text-danger"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-testid="mosaic-save"
              onClick={save}
              className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover"
            >
              {t('cameras.mosaic.save')}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
