'use client';

/**
 * MosaicToolbar — §C C1: seletor de MOSAICOS NOMEADOS na toolbar do /cameras.
 *
 * Substitui o antigo botão "Mosaico N×" (que jogava TODAS as câmeras na grade).
 * Espelha o padrão provado do `UserViewsToolbar` (dropdown de itens nomeados por
 * usuário + criar/editar/excluir), mas ancorado num `FloatingPopover` (não fecha
 * no scroll interno; portal sólido sem glass).
 *
 * Gesto: trocar entre mosaicos salvos (carrega o recorte no canvas + polling só
 * dele) ou voltar à "Câmera única". Criar/editar abre o modal focado (parent).
 * Excluir confirma via confirmModal (nunca diálogo nativo).
 *
 * DS: cantos retos, #2D77BE só no ativo/seleção, lucide neutro, mono nas
 * contagens, strings via useT() (pt-BR + en-US).
 */
import * as React from 'react';
import { Check, Grid3x3, Monitor, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { FloatingPopover } from '@/components/ui/floating-popover';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import type { CCTVStream } from '@/lib/api/cctv';
import { mosaicCount, type Mosaic, type ZonePolygon } from '@/lib/cameras/mosaic';

type Props = {
  mosaics: Mosaic[];
  activeId: string | null;
  streams: CCTVStream[];
  zones: ZonePolygon[];
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onEdit: (m: Mosaic) => void;
  onDelete: (id: string) => void;
};

export function MosaicToolbar({
  mosaics,
  activeId,
  streams,
  zones,
  onSelect,
  onNew,
  onEdit,
  onDelete,
}: Props) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const active = mosaics.find((m) => m.id === activeId) ?? null;

  const q = query.trim().toLowerCase();
  const visible = React.useMemo(
    () => (!q ? mosaics : mosaics.filter((m) => m.name.toLowerCase().includes(q))),
    [mosaics, q],
  );

  const remove = async (m: Mosaic) => {
    const ok = await confirmModal({
      title: t('cameras.mosaic.deleteConfirm').replace('{name}', m.name),
      tone: 'danger',
      confirmLabel: t('cameras.mosaic.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    onDelete(m.id);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="mosaic-trigger"
        onClick={() => setOpen((o) => !o)}
        title={t('cameras.mosaic.triggerTip')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'h-7 px-2.5 text-[11px] border flex items-center gap-1.5 max-w-[220px]',
          active
            ? 'bg-primary text-white border-primary'
            : 'bg-raised-light border-border-light hover:border-primary',
        )}
      >
        <Grid3x3 className="w-3 h-3 shrink-0" strokeWidth={1.5} />
        <span className="truncate">{active ? active.name : t('cameras.mosaic.trigger')}</span>
      </button>

      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        align="start"
        offset={4}
        minWidth={288}
        maxHeight="min(70vh, 420px)"
        zIndex={50}
        role="listbox"
        ariaLabel={t('cameras.mosaic.trigger')}
        testId="mosaic-pop"
        bodyTestId="mosaic-pop-body"
        header={
          mosaics.length > 0 ? (
            <span className="flex h-9 shrink-0 items-center gap-1 border-b border-border-light px-2">
              <Search className="w-3.5 h-3.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('cameras.mosaic.searchPlaceholder')}
                data-testid="mosaic-search"
                className="flex-1 bg-transparent text-[12px] outline-none"
              />
            </span>
          ) : undefined
        }
      >
        {/* Voltar à câmera única (só quando há mosaico ativo) */}
        {active && (
          <button
            type="button"
            data-testid="mosaic-single"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-b border-border-light/60 px-2 py-1.5 text-left text-[11px] hover:bg-raised-light/50"
          >
            <Monitor className="w-3.5 h-3.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
            <span className="truncate">{t('cameras.mosaic.single')}</span>
          </button>
        )}

        {mosaics.length === 0 ? (
          <p className="px-3 py-3 text-[11px] italic text-muted-on-light">
            {t('cameras.mosaic.emptyHint')}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-[11px] italic text-muted-on-light">
            {t('cameras.mosaic.none')}
          </p>
        ) : (
          <ul className="divide-y divide-border-light/60">
            {visible.map((m) => {
              const on = m.id === activeId;
              const count = mosaicCount(m, streams, zones);
              return (
                <li
                  key={m.id}
                  data-testid={`mosaic-item-${m.id}`}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5',
                    on ? 'bg-raised-light' : 'hover:bg-raised-light/40',
                  )}
                >
                  <button
                    type="button"
                    data-testid={`mosaic-load-${m.id}`}
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                    }}
                    title={t('cameras.mosaic.load')}
                    className="flex flex-1 min-w-0 items-center gap-2 text-left"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border',
                        on ? 'border-primary bg-primary' : 'border-transparent',
                      )}
                    >
                      {on && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px]">{m.name}</span>
                      <span className="block text-[9px] font-mono text-muted-on-light/70">
                        {count} {t('cameras.mosaic.countUnit')}
                        {' · '}
                        {t(
                          m.selection.mode === 'manual'
                            ? 'cameras.mosaic.badgeManual'
                            : 'cameras.mosaic.badgeFilter',
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid={`mosaic-edit-${m.id}`}
                    onClick={() => {
                      onEdit(m);
                      setOpen(false);
                    }}
                    aria-label={t('cameras.mosaic.edit')}
                    className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary border border-transparent hover:border-primary shrink-0"
                  >
                    <Pencil className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    data-testid={`mosaic-remove-${m.id}`}
                    onClick={() => void remove(m)}
                    aria-label={t('cameras.mosaic.remove')}
                    className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger shrink-0"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          data-testid="mosaic-new"
          onClick={() => {
            onNew();
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 border-t border-border-light px-2 py-2 text-left text-[11px] text-primary hover:bg-primary/5"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
          {t('cameras.mosaic.new')}
        </button>
      </FloatingPopover>
    </div>
  );
}
