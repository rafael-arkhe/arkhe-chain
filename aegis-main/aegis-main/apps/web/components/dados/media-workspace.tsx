'use client';

/**
 * Media Sets — gerenciador de arquivos não-estruturados (imagem/vídeo/áudio/
 * documento) governados por marcações + tenant. Espelha /platform/v23/media.
 *
 * Frente 2 (feedback do operador 2026-07-06) — a aba Arquivos é um DRIVE:
 * o CENTER virou a superfície `MediaDrive` (pastas, grade/lista, busca,
 * renomear/mover/excluir, preview grande, upload imediato). Slots da casca:
 *   MediaSetsList     → 2º nível do Acervo (LEFT) — lista de conjuntos + criar
 *   MediaContent      → CENTER — o Drive do conjunto aberto
 *   MediaPreviewAside → RIGHT 320px — detalhes do item selecionado (fechável)
 * O estado compartilhado vive em `media-ctx` (re-exportado aqui — consumidores
 * existentes não mudam).
 *
 * Régua: cantos retos, #2D77BE único acento, useT() pt-BR+en-US.
 */
import * as React from 'react';
import { Plus, Trash2, Loader2, X } from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';
import { MediaSets, MEDIA_TYPES, type MediaSetOut } from '@/lib/api';

import { MEDIA_LABEL_KEY, MediaProvider, fmtBytes, useMedia } from './media-ctx';
import { MediaDrive } from './media-drive';
import { MediaPreview } from './media-preview';

export { MediaProvider, useMedia } from './media-ctx';

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';

/* -------------------------------------------------------------------------- */
/* Slot: MediaSetsList — 2º nível do Acervo (LEFT). Lista + criar conjunto.    */
/* -------------------------------------------------------------------------- */

export function MediaSetsList() {
  const t = useT();
  const { list, sel, open, reload, remove, setMsg } = useMedia();
  const [showCreate, setShowCreate] = React.useState(false);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-9 px-3 border-b border-border-light flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('media.sets')}</span>
        <RequirePerm perm="data.media.write" fallback={null}>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            data-testid="md-create-toggle"
            aria-label={t('media.newSet')}
            className="text-muted-on-light hover:text-primary"
          >
            {showCreate ? <X className="w-4 h-4" strokeWidth={1.5} /> : <Plus className="w-4 h-4" strokeWidth={1.5} />}
          </button>
        </RequirePerm>
      </div>
      {showCreate && (
        <CreateSet
          onCreated={(s) => { setMsg({ ok: true, text: t('media.created') }); reload(); open(s); setShowCreate(false); }}
          onErr={(m) => setMsg({ ok: false, text: m })}
        />
      )}
      <ul className="flex-1 overflow-y-auto scrollbar-hide" data-testid="md-list">
        {list.length === 0 && <li className="px-3 py-3 text-[11px] text-muted-on-light italic">{t('media.empty')}</li>}
        {list.map((s) => (
          <li key={s.id} className="flex items-center border-b border-border-light/60">
            <button type="button" onClick={() => open(s)} data-testid={`md-item-${s.slug}`}
              className={'flex-1 min-w-0 text-left px-3 py-2 ' + (sel?.id === s.id ? 'bg-primary/5 text-primary' : 'hover:bg-canvas-light')}>
              <span className="block truncate text-[11px] font-medium">{s.display_name}</span>
              <span className="block text-[10px] text-muted-on-light">{t(MEDIA_LABEL_KEY[s.media_type] as Parameters<typeof t>[0]) || s.media_type} · {s.item_count} item{s.item_count === 1 ? '' : 's'} · {fmtBytes(s.total_bytes)}</span>
            </button>
            <RequirePerm perm="data.media.write" fallback={null}>
              <button type="button" onClick={() => remove(s)} aria-label={t('media.removeSet')} data-testid={`md-del-${s.slug}`} className="px-2 text-muted-on-light hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
            </RequirePerm>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Slot: MediaContent — CENTER. O Drive do conjunto aberto.                    */
/* -------------------------------------------------------------------------- */

export function MediaContent() {
  const t = useT();
  const { sel } = useMedia();
  return (
    <div className="h-full flex flex-col">
      {sel ? (
        <MediaDrive />
      ) : (
        <>
          <div className="h-9 px-3 border-b border-border-light flex items-center shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('media.title')}</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-[12px] text-muted-on-light">
            {t('media.selectSet')}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Slot: MediaPreviewAside — RIGHT 320px da casca (detalhes do item).          */
/* -------------------------------------------------------------------------- */

export function MediaPreviewAside() {
  const t = useT();
  const { selItem, setSelItem } = useMedia();
  if (!selItem) return null;
  return (
    <aside className="w-[320px] shrink-0 border-l border-border-light bg-panel-light flex flex-col overflow-hidden">
      <div className="h-8 px-2 border-b border-border-light bg-white flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('media.previewPanel')}</span>
        <button type="button" onClick={() => setSelItem(null)} data-testid="md-preview-close" className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary" aria-label={t('media.previewClose')}>
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <MediaPreview item={selItem} />
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Standalone — rota antiga /media e testes compõem os MESMOS slots.           */
/* -------------------------------------------------------------------------- */

export function MediaWorkspace({ embedded = false }: { embedded?: boolean }) {
  return (
    <MediaProvider>
      <div className={(embedded ? 'h-full' : 'h-[calc(100vh-3rem)]') + ' flex min-h-0'}>
        <aside className="w-64 border-r border-border-light flex flex-col shrink-0">
          <MediaSetsList />
        </aside>
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MediaContent />
        </main>
        <MediaPreviewAside />
      </div>
    </MediaProvider>
  );
}

/* -------------------------------------------------------------------------- */
function CreateSet({ onCreated, onErr }: { onCreated: (s: MediaSetOut) => void; onErr: (t: string) => void }) {
  const t = useT();
  const [name, setName] = React.useState('');
  const [mediaType, setMediaType] = React.useState('image');
  const [busy, setBusy] = React.useState(false);
  async function create() {
    if (!name) { onErr(t('media.createErr')); return; }
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setBusy(true);
    try { const s = await MediaSets.create({ slug, display_name: name, media_type: mediaType }); setName(''); onCreated(s); }
    catch (e) { onErr(e instanceof Error ? e.message : t('media.createFail')); }
    finally { setBusy(false); }
  }
  return (
    <section className="border-b border-border-light px-3 py-2.5 bg-canvas-light space-y-2" data-testid="md-create">
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{t('media.name')}</label>
        <input type="text" value={name} data-testid="md-name" onChange={(e) => setName(e.target.value)} className={INP} placeholder={t('media.namePlaceholder')} />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{t('media.type')}</label>
        <select value={mediaType} data-testid="md-type" onChange={(e) => setMediaType(e.target.value)} className={INP}>
          {MEDIA_TYPES.map((m) => <option key={m} value={m}>{t(MEDIA_LABEL_KEY[m] as Parameters<typeof t>[0])}</option>)}
        </select>
      </div>
      <button type="button" onClick={create} disabled={busy} data-testid="md-create-btn"
        className="h-7 w-full text-[11px] flex items-center justify-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {t('media.create')}
      </button>
    </section>
  );
}
