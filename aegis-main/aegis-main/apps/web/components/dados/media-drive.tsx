'use client';

/**
 * MediaDrive — a superfície "Google Drive" da aba Arquivos (frente 2 do
 * feedback do operador 2026-07-06: "quero essa aba EXATAMENTE COMO UM
 * GOOGLE DRIVE"). CENTER da casca, dentro de um conjunto:
 *
 *   - breadcrumb de PASTAS (conjunto › pasta › subpasta) + "Nova pasta"
 *   - grade OU lista (toggle) com ordenação por nome/data/tamanho
 *   - upload IMEDIATO (seleção/arrastar → tray de progresso; cai na pasta atual)
 *   - menu "..." por item/pasta: visualizar · baixar · renomear · mover · excluir
 *   - preview GRANDE (lightbox) no duplo-clique, com ←/→ entre arquivos
 *   - busca tenant-wide por nome (resultados navegam até o item)
 *
 * Tudo servido pelos endpoints /platform/v23/media (o browser nunca vê a uri
 * interna s3://). Régua: cantos retos, #2D77BE único acento, SÓ BORDA,
 * useT() pt-BR+en-US, diálogos via confirm/promptModal (nunca nativos).
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Download, Eye, File, FileText, Film, Folder, FolderInput, FolderOpen,
  FolderPlus, Image, LayoutGrid, List, Loader2, MoreVertical, Music, Pencil,
  Plus, Search, Trash2, Upload, X,
} from 'lucide-react';

import { promptModal, useConfirm } from '@/components/dialog/confirm-dialog';
import { FloatingPopover } from '@/components/ui/floating-popover';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { MediaSets, type MediaSearchHit, type MediaSetItem, type MediaSetOut } from '@/lib/api';

import { fmtBytes, kindFromMime, useMedia } from './media-ctx';

const ICON_MAP: Record<string, typeof Image> = {
  image: Image, video: Film, audio: Music, document: FileText,
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pasta';
}

function acceptForType(mediaType: string): string {
  switch (mediaType) {
    case 'image': return 'image/*';
    case 'video': return 'video/*';
    case 'audio': return 'audio/*';
    case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.xml';
    default: return '*';
  }
}

function downloadItem(item: MediaSetItem) {
  const a = document.createElement('a');
  a.href = MediaSets.contentUrl(item.id, { download: true });
  a.download = item.filename || 'download';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Falha.';
}

type SortKey = 'name' | 'date' | 'size';
type UploadEntry = { name: string; status: 'sending' | 'ok' | 'err' };

/* -------------------------------------------------------------------------- */
/* MediaDrive — superfície completa (toolbar + pastas + arquivos + overlays).  */
/* -------------------------------------------------------------------------- */

export function MediaDrive() {
  const t = useT();
  const tx = t as (k: string) => string;
  const confirm = useConfirm();
  const canWrite = useCan('data.media.write');
  const { list, sel, items, selItem, setSelItem, msg, setMsg, open, refresh, syncSet } = useMedia();

  const [cwd, setCwd] = React.useState('/');
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<MediaSearchHit[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<MediaSetItem | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<MediaSetItem | null>(null);
  const [uploads, setUploads] = React.useState<UploadEntry[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const dragCounter = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const newBtnRef = React.useRef<HTMLButtonElement>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  // menu "..." — um popover; a âncora é o botão clicado (item OU pasta).
  const menuAnchorRef = React.useRef<HTMLElement | null>(null);
  const [menuItem, setMenuItem] = React.useState<MediaSetItem | null>(null);
  const [menuFolder, setMenuFolder] = React.useState<string | null>(null);
  // navegação vinda da BUSCA: troca de conjunto e só então entra na pasta.
  const pendingNav = React.useRef<{ folder: string; item: MediaSetItem } | null>(null);

  React.useEffect(() => {
    if (pendingNav.current) {
      setCwd(pendingNav.current.folder);
      setSelItem(pendingNav.current.item);
      pendingNav.current = null;
    } else {
      setCwd('/');
    }
    setQuery(''); setHits(null); setLightbox(null); setMenuItem(null); setMenuFolder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  // Busca com debounce; <2 chars não varre o tenant (contrato do backend).
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits(null); setSearching(false); return; }
    setSearching(true);
    const h = setTimeout(() => {
      MediaSets.search(q)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(h);
  }, [query]);

  /* pastas do cwd = declaradas no conjunto ∪ derivadas dos itens */
  const folderSet = React.useMemo(() => {
    const s = new Set<string>();
    (sel?.folders || []).forEach((f) => s.add(f));
    items.forEach((i) => {
      let p = i.folder_path || '/';
      while (p && p !== '/') { s.add(p); p = p.slice(0, p.lastIndexOf('/')) || '/'; }
    });
    return s;
  }, [sel?.folders, items]);

  const childFolders = React.useMemo(() => {
    const prefix = cwd === '/' ? '/' : cwd + '/';
    const kids = new Set<string>();
    folderSet.forEach((f) => {
      if (f !== cwd && f.startsWith(prefix)) {
        const seg = f.slice(prefix.length).split('/')[0];
        if (seg) kids.add(prefix + seg);
      }
    });
    return [...kids].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [folderSet, cwd]);

  const files = React.useMemo(() => {
    const arr = items.filter((i) => (i.folder_path || '/') === cwd);
    const { key, dir } = sort;
    return [...arr].sort((a, b) => {
      if (key === 'size') return (a.size_bytes - b.size_bytes) * dir;
      if (key === 'date') return (a.created_at || '').localeCompare(b.created_at || '') * dir;
      return a.filename.localeCompare(b.filename, 'pt-BR', { sensitivity: 'base' }) * dir;
    });
  }, [items, cwd, sort]);

  const segs = cwd === '/' ? [] : cwd.slice(1).split('/');

  /* ── operações ─────────────────────────────────────────────────────── */

  async function doCreateFolder() {
    if (!sel) return;
    const name = await promptModal({
      title: tx('media.drive.newFolderTitle'),
      placeholder: tx('media.drive.folderName'),
    });
    if (!name) return;
    try {
      const s = await MediaSets.createFolder(sel.id, (cwd === '/' ? '' : cwd) + '/' + name.trim());
      syncSet(s);
      setMsg({ ok: true, text: tx('media.drive.folderCreated') });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  async function doRenameItem(item: MediaSetItem) {
    const name = await promptModal({
      title: tx('media.drive.renameTitle'),
      defaultValue: item.filename,
    });
    if (!name || name.trim() === item.filename) return;
    try {
      await MediaSets.updateItem(item.id, { filename: name.trim() });
      setMsg({ ok: true, text: tx('media.drive.renamed') });
      refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  async function doDeleteItem(item: MediaSetItem) {
    const ok = await confirm({
      title: tx('media.drive.deleteItem'),
      description: `${item.filename} — ${tx('media.drive.deleteItemDesc')}`,
      tone: 'danger',
      confirmLabel: tx('media.drive.delete'),
    });
    if (!ok) return;
    try {
      await MediaSets.removeItem(item.id);
      if (selItem?.id === item.id) setSelItem(null);
      if (lightbox?.id === item.id) setLightbox(null);
      setMsg({ ok: true, text: tx('media.drive.deleted') });
      refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  async function doRenameFolder(path: string) {
    if (!sel) return;
    const cur = path.slice(path.lastIndexOf('/') + 1);
    const name = await promptModal({
      title: tx('media.drive.renameTitle'),
      defaultValue: cur,
    });
    if (!name || name.trim() === cur) return;
    const parent = path.slice(0, path.lastIndexOf('/')) || '';
    try {
      const s = await MediaSets.renameFolder(sel.id, path, `${parent}/${name.trim()}`);
      syncSet(s);
      setMsg({ ok: true, text: tx('media.drive.renamed') });
      refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  async function doDeleteFolder(path: string) {
    if (!sel) return;
    const ok = await confirm({
      title: tx('media.drive.deleteFolder'),
      description: `${path} — ${tx('media.drive.deleteFolderDesc')}`,
      tone: 'danger',
      confirmLabel: tx('media.drive.delete'),
    });
    if (!ok) return;
    try {
      await MediaSets.removeFolder(sel.id, path);
      setMsg({ ok: true, text: tx('media.drive.deleted') });
      refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  const uploadFiles = React.useCallback(async (fl: File[]) => {
    if (!sel || fl.length === 0) return;
    let base = 0;
    setUploads((u) => { base = u.length; return [...u, ...fl.map((f) => ({ name: f.name, status: 'sending' as const }))]; });
    for (let k = 0; k < fl.length; k++) {
      const idx = base + k;
      try {
        await MediaSets.uploadItem(sel.id, fl[k], { folder: cwd });
        setUploads((u) => u.map((e, i) => (i === idx ? { ...e, status: 'ok' } : e)));
      } catch {
        setUploads((u) => u.map((e, i) => (i === idx ? { ...e, status: 'err' } : e)));
      }
    }
    refresh();
  }, [sel, cwd, refresh]);

  function openHit(h: MediaSearchHit) {
    const target = list.find((s) => s.id === h.media_set_id);
    if (!target) return;
    if (sel?.id === target.id) {
      setCwd(h.folder_path || '/');
      setSelItem(h);
      setQuery(''); setHits(null);
    } else {
      pendingNav.current = { folder: h.folder_path || '/', item: h };
      open(target);
    }
  }

  /* ── drag & drop na área toda (gesto Drive) ────────────────────────── */
  const onDragEnter = (e: React.DragEvent) => {
    if (!canWrite) return;
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!canWrite) return;
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); }
  };
  const onDrop = (e: React.DragEvent) => {
    if (!canWrite) return;
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(Array.from(e.dataTransfer.files));
  };

  if (!sel) return null;
  const sortBtn = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? null : sort.dir === 1
      ? <ChevronUp className="w-3 h-3" strokeWidth={1.5} />
      : <ChevronDown className="w-3 h-3" strokeWidth={1.5} />;

  return (
    <div
      className="flex-1 min-h-0 flex flex-col relative"
      onDragEnter={onDragEnter}
      onDragOver={(e) => { if (canWrite) { e.preventDefault(); e.stopPropagation(); } }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ── toolbar: breadcrumb · busca · novo · vista ─────────────────── */}
      <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 shrink-0" data-testid="md-toolbar">
        <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-hide" data-testid="md-breadcrumb" aria-label={tx('media.drive.breadcrumb')}>
          <button
            type="button"
            onClick={() => setCwd('/')}
            data-testid="md-crumb-root"
            className={'text-[11px] shrink-0 max-w-[220px] truncate ' + (segs.length === 0 ? 'font-semibold text-text-on-light' : 'text-muted-on-light hover:text-primary')}
          >
            {sel.display_name}
          </button>
          {segs.map((seg, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
              <button
                type="button"
                onClick={() => setCwd('/' + segs.slice(0, i + 1).join('/'))}
                data-testid={`md-crumb-${i}`}
                className={'text-[11px] shrink-0 max-w-[180px] truncate ' + (i === segs.length - 1 ? 'font-semibold text-text-on-light' : 'text-muted-on-light hover:text-primary')}
              >
                {seg}
              </button>
            </React.Fragment>
          ))}
          <span className="text-[10px] text-muted-on-light font-mono shrink-0 pl-2">
            {sel.item_count} · {fmtBytes(sel.total_bytes)}
          </span>
          {sel.markings.length > 0 && (
            <span className="text-[10px] text-muted-on-light truncate shrink-0 pl-2">
              {t('media.markings')}: {sel.markings.join(', ')}
            </span>
          )}
        </nav>

        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 text-muted-on-light absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx('media.drive.searchPlaceholder')}
            data-testid="md-search"
            className="h-7 w-56 pl-7 pr-6 text-[11px] bg-white border border-border-light outline-none focus:border-primary placeholder:text-muted-on-light"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={tx('media.drive.clearSearch')}
              data-testid="md-search-clear"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-on-light hover:text-primary"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {canWrite && (
          <>
            <button
              type="button"
              ref={newBtnRef}
              onClick={() => setNewOpen((v) => !v)}
              data-testid="md-new"
              className="h-7 px-2.5 shrink-0 text-[11px] flex items-center gap-1 bg-primary text-white hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {tx('media.drive.new')}
            </button>
            <FloatingPopover open={newOpen} onClose={() => setNewOpen(false)} anchorRef={newBtnRef} align="end" role="menu" testId="md-new-menu" minWidth={180}>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setNewOpen(false); doCreateFolder(); }}
                data-testid="md-new-folder"
                className="w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 hover:bg-primary/5 hover:text-primary"
              >
                <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.5} /> {tx('media.drive.newFolder')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setNewOpen(false); inputRef.current?.click(); }}
                data-testid="md-new-upload"
                className="w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 hover:bg-primary/5 hover:text-primary"
              >
                <Upload className="w-3.5 h-3.5" strokeWidth={1.5} /> {tx('media.drive.uploadFiles')}
              </button>
            </FloatingPopover>
          </>
        )}

        <div className="flex border border-border-light shrink-0" role="group" aria-label={tx('media.drive.viewToggle')}>
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
            aria-label={tx('media.drive.viewGrid')}
            data-testid="md-view-grid"
            className={'h-7 w-7 flex items-center justify-center ' + (view === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-on-light hover:text-primary')}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            aria-label={tx('media.drive.viewList')}
            data-testid="md-view-list"
            className={'h-7 w-7 flex items-center justify-center border-l border-border-light ' + (view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-on-light hover:text-primary')}
          >
            <List className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {msg && (
        <div
          role="status"
          data-testid="md-msg"
          className={'h-7 px-3 shrink-0 border-b border-border-light flex items-center gap-1.5 text-[11px] ' + (msg.ok ? 'text-success' : 'text-danger')}
        >
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          <span className="truncate">{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label={tx('media.drive.dismiss')} className="ml-auto text-muted-on-light hover:text-primary">
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* ── corpo: resultados de busca OU pastas+arquivos ──────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {hits !== null ? (
          <SearchResults hits={hits} searching={searching} query={query} onOpen={openHit} />
        ) : (
          <>
            {childFolders.length > 0 && (
              <section className="px-3 pt-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">{tx('media.drive.folders')}</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2" data-testid="md-folders">
                  {childFolders.map((path) => (
                    <FolderTile
                      key={path}
                      path={path}
                      canWrite={canWrite}
                      onEnter={() => setCwd(path)}
                      onMenu={(el) => { menuAnchorRef.current = el; setMenuFolder(path); setMenuItem(null); }}
                    />
                  ))}
                </div>
              </section>
            )}

            {files.length > 0 && childFolders.length > 0 && (
              <p className="px-3 pt-3 text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">{tx('media.drive.files')}</p>
            )}

            {files.length === 0 && childFolders.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-1.5 text-muted-on-light" data-testid="md-grid-empty">
                <FolderOpen className="w-7 h-7" strokeWidth={1} />
                <p className="text-[12px]">{tx('media.drive.emptyFolder')}</p>
                {canWrite && <p className="text-[10px]">{tx('media.drive.emptyHint')}</p>}
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-3" data-testid="md-grid">
                {files.map((item) => (
                  <FileCard
                    key={item.id}
                    item={item}
                    selected={item.id === selItem?.id}
                    onSelect={() => setSelItem(item)}
                    onOpen={() => setLightbox(item)}
                    onMenu={(el) => { menuAnchorRef.current = el; setMenuItem(item); setMenuFolder(null); }}
                  />
                ))}
              </div>
            ) : files.length > 0 ? (
              <div className="px-3 py-2" data-testid="md-rows">
                <div className="grid grid-cols-[minmax(0,1fr)_140px_110px_90px_32px] items-center h-8 border-b border-border-light text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                  <button type="button" onClick={() => sortBtn('name')} data-testid="md-sort-name" className="flex items-center gap-1 text-left hover:text-primary">
                    {tx('media.drive.name')} <SortIcon k="name" />
                  </button>
                  <span>{tx('media.drive.uploadedBy')}</span>
                  <button type="button" onClick={() => sortBtn('date')} data-testid="md-sort-date" className="flex items-center gap-1 text-left hover:text-primary">
                    {tx('media.drive.modified')} <SortIcon k="date" />
                  </button>
                  <button type="button" onClick={() => sortBtn('size')} data-testid="md-sort-size" className="flex items-center gap-1 justify-end hover:text-primary">
                    {tx('media.drive.size')} <SortIcon k="size" />
                  </button>
                  <span />
                </div>
                {files.map((item) => (
                  <FileRow
                    key={item.id}
                    item={item}
                    selected={item.id === selItem?.id}
                    onSelect={() => setSelItem(item)}
                    onOpen={() => setLightbox(item)}
                    onMenu={(el) => { menuAnchorRef.current = el; setMenuItem(item); setMenuFolder(null); }}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* menu "..." de item */}
      <FloatingPopover
        open={!!menuItem}
        onClose={() => setMenuItem(null)}
        anchorRef={menuAnchorRef}
        align="end"
        role="menu"
        testId="md-item-menu"
        minWidth={180}
      >
        {menuItem && (
          <>
            <MenuBtn testId="md-menu-open" icon={Eye} label={tx('media.drive.preview')} onClick={() => { setLightbox(menuItem); setSelItem(menuItem); setMenuItem(null); }} />
            <MenuBtn testId="md-menu-download" icon={Download} label={tx('media.download')} onClick={() => { downloadItem(menuItem); setMenuItem(null); }} />
            {canWrite && (
              <>
                <div className="border-t border-border-light" />
                <MenuBtn testId="md-menu-rename" icon={Pencil} label={tx('media.drive.rename')} onClick={() => { const it = menuItem; setMenuItem(null); doRenameItem(it); }} />
                <MenuBtn testId="md-menu-move" icon={FolderInput} label={tx('media.drive.move')} onClick={() => { setMoveTarget(menuItem); setMenuItem(null); }} />
                <MenuBtn testId="md-menu-delete" icon={Trash2} label={tx('media.drive.delete')} danger onClick={() => { const it = menuItem; setMenuItem(null); doDeleteItem(it); }} />
              </>
            )}
          </>
        )}
      </FloatingPopover>

      {/* menu "..." de pasta */}
      <FloatingPopover
        open={!!menuFolder}
        onClose={() => setMenuFolder(null)}
        anchorRef={menuAnchorRef}
        align="end"
        role="menu"
        testId="md-folder-menu"
        minWidth={180}
      >
        {menuFolder && (
          <>
            <MenuBtn testId="md-fmenu-open" icon={FolderOpen} label={tx('media.drive.open')} onClick={() => { setCwd(menuFolder); setMenuFolder(null); }} />
            {canWrite && (
              <>
                <div className="border-t border-border-light" />
                <MenuBtn testId="md-fmenu-rename" icon={Pencil} label={tx('media.drive.rename')} onClick={() => { const p = menuFolder; setMenuFolder(null); doRenameFolder(p); }} />
                <MenuBtn testId="md-fmenu-delete" icon={Trash2} label={tx('media.drive.delete')} danger onClick={() => { const p = menuFolder; setMenuFolder(null); doDeleteFolder(p); }} />
              </>
            )}
          </>
        )}
      </FloatingPopover>

      {/* input de upload (o "Enviar arquivos" do + Novo) */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptForType(sel.media_type)}
        onChange={(e) => { if (e.target.files) uploadFiles(Array.from(e.target.files)); e.target.value = ''; }}
        className="hidden"
        data-testid="md-upload-input"
      />

      {/* overlay de drop */}
      {dragging && (
        <div className="absolute inset-0 z-20 border-2 border-primary bg-primary/5 flex items-center justify-center pointer-events-none" data-testid="md-drop-overlay">
          <p className="text-[12px] font-semibold text-primary bg-white border border-primary px-4 py-2">
            {tx('media.drive.dropHere').replace('{folder}', cwd === '/' ? sel.display_name : segs[segs.length - 1])}
          </p>
        </div>
      )}

      {/* tray de envios (canto inferior direito, como no Drive) */}
      {uploads.length > 0 && (
        <UploadTray uploads={uploads} onDismiss={() => setUploads([])} />
      )}

      {lightbox && (
        <Lightbox
          item={lightbox}
          files={files}
          onClose={() => setLightbox(null)}
          onNav={(it) => { setLightbox(it); setSelItem(it); }}
        />
      )}

      {moveTarget && sel && (
        <MoveDialog
          item={moveTarget}
          sets={list}
          onClose={() => setMoveTarget(null)}
          onDone={(m) => { setMoveTarget(null); setMsg(m); refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MenuBtn({ testId, icon: Icon, label, onClick, danger }: {
  testId: string; icon: typeof Eye; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      data-testid={testId}
      className={'w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 ' + (danger ? 'text-danger hover:bg-danger/5' : 'hover:bg-primary/5 hover:text-primary')}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
    </button>
  );
}

function FolderTile({ path, canWrite, onEnter, onMenu }: {
  path: string; canWrite: boolean; onEnter: () => void; onMenu: (el: HTMLElement) => void;
}) {
  const t = useT() as (k: string) => string;
  const seg = path.slice(path.lastIndexOf('/') + 1);
  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={onEnter}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
      data-testid={`md-folder-${slugify(seg)}`}
      className="group h-10 px-2.5 border border-border-light bg-canvas-light hover:border-primary/50 flex items-center gap-2 cursor-pointer select-none"
      title={path}
    >
      <Folder className="w-4 h-4 text-muted-on-light shrink-0" strokeWidth={1.5} />
      <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-text-on-light">{seg}</span>
      {canWrite && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={t('media.drive.itemMenu')}
          data-testid={`md-fmenu-${slugify(seg)}`}
          className="shrink-0 h-6 w-6 flex items-center justify-center text-muted-on-light opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary transition-opacity motion-reduce:transition-none"
        >
          <MoreVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

function FileCard({ item, selected, onSelect, onOpen, onMenu }: {
  item: MediaSetItem; selected: boolean; onSelect: () => void; onOpen: () => void; onMenu: (el: HTMLElement) => void;
}) {
  const t = useT() as (k: string) => string;
  const kind = kindFromMime(item.content_type);
  const Icon = ICON_MAP[kind] || File;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      data-testid={`md-card-${item.id}`}
      className={
        'group relative border bg-canvas-light text-left overflow-hidden cursor-pointer select-none transition-colors motion-reduce:transition-none' +
        (selected ? ' border-primary ring-1 ring-primary/20' : ' border-border-light hover:border-primary/50')
      }
    >
      <div className="w-full aspect-square flex items-center justify-center bg-raised-light overflow-hidden">
        {kind === 'image' && item.uri ? (
          <img
            src={MediaSets.contentUrl(item.id)}
            alt={item.filename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Icon className="w-6 h-6 text-muted-on-light" strokeWidth={1.5} />
        )}
      </div>
      <div className="px-2 py-1.5 border-t border-border-light flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-muted-on-light shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-text-on-light truncate" title={item.filename}>{item.filename}</p>
          <p className="text-[9px] text-muted-on-light font-mono">{fmtBytes(item.size_bytes)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={t('media.drive.itemMenu')}
          data-testid={`md-menu-${item.id}`}
          className="shrink-0 h-6 w-6 flex items-center justify-center text-muted-on-light opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary transition-opacity motion-reduce:transition-none"
        >
          <MoreVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function FileRow({ item, selected, onSelect, onOpen, onMenu }: {
  item: MediaSetItem; selected: boolean; onSelect: () => void; onOpen: () => void; onMenu: (el: HTMLElement) => void;
}) {
  const t = useT() as (k: string) => string;
  const kind = kindFromMime(item.content_type);
  const Icon = ICON_MAP[kind] || File;
  const by = typeof item.meta?.uploaded_by === 'string' ? (item.meta.uploaded_by as string) : '—';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      data-testid={`md-row-${item.id}`}
      className={
        'group grid grid-cols-[minmax(0,1fr)_140px_110px_90px_32px] items-center h-9 border-b border-border-light/60 cursor-pointer select-none text-[11px] ' +
        (selected ? 'bg-primary/5' : 'hover:bg-canvas-light')
      }
    >
      <span className="flex items-center gap-2 min-w-0 pr-2">
        <Icon className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
        <span className="truncate font-medium text-text-on-light" title={item.filename}>{item.filename}</span>
      </span>
      <span className="truncate text-muted-on-light">{by}</span>
      <span className="text-muted-on-light">{fmtDate(item.created_at)}</span>
      <span className="text-right font-mono text-muted-on-light">{fmtBytes(item.size_bytes)}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-label={t('media.drive.itemMenu')}
        data-testid={`md-menu-${item.id}`}
        className="h-6 w-6 flex items-center justify-center text-muted-on-light opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary transition-opacity motion-reduce:transition-none"
      >
        <MoreVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

function SearchResults({ hits, searching, query, onOpen }: {
  hits: MediaSearchHit[]; searching: boolean; query: string; onOpen: (h: MediaSearchHit) => void;
}) {
  const t = useT() as (k: string) => string;
  return (
    <div className="px-3 py-2" data-testid="md-search-results">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold h-8 flex items-center gap-2">
        {t('media.drive.results')} ({hits.length})
        {searching && <Loader2 className="w-3 h-3 animate-spin" />}
      </p>
      {hits.length === 0 && !searching && (
        <p className="text-[12px] text-muted-on-light py-6 text-center" data-testid="md-search-empty">
          {t('media.drive.noResults').replace('{q}', query.trim())}
        </p>
      )}
      {hits.map((h) => {
        const Icon = ICON_MAP[kindFromMime(h.content_type)] || File;
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => onOpen(h)}
            data-testid={`md-hit-${h.id}`}
            className="w-full grid grid-cols-[minmax(0,1fr)_minmax(0,240px)_90px] items-center h-9 border-b border-border-light/60 text-left text-[11px] hover:bg-canvas-light"
          >
            <span className="flex items-center gap-2 min-w-0 pr-2">
              <Icon className="w-3.5 h-3.5 text-muted-on-light shrink-0" strokeWidth={1.5} />
              <span className="truncate font-medium text-text-on-light">{h.filename}</span>
            </span>
            <span className="truncate text-muted-on-light">
              {h.set_name}{(h.folder_path || '/') !== '/' ? ` › ${(h.folder_path || '').slice(1).split('/').join(' › ')}` : ''}
            </span>
            <span className="text-right font-mono text-muted-on-light">{fmtBytes(h.size_bytes)}</span>
          </button>
        );
      })}
    </div>
  );
}

function UploadTray({ uploads, onDismiss }: { uploads: UploadEntry[]; onDismiss: () => void }) {
  const t = useT() as (k: string) => string;
  const sending = uploads.filter((u) => u.status === 'sending').length;
  const done = uploads.length - sending;
  return (
    <div className="absolute bottom-3 right-3 z-30 w-72 border border-border-light bg-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]" data-testid="md-upload-tray">
      <div className="h-8 px-2.5 border-b border-border-light flex items-center justify-between bg-canvas-light">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          {sending > 0
            ? t('media.drive.uploading').replace('{n}', String(sending))
            : t('media.drive.uploadsDone').replace('{n}', String(done))}
        </span>
        <button type="button" onClick={onDismiss} aria-label={t('media.drive.dismiss')} data-testid="md-upload-dismiss" className="text-muted-on-light hover:text-primary">
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto scrollbar-hide">
        {uploads.map((u, i) => (
          <li key={i} className="h-8 px-2.5 flex items-center gap-2 text-[11px] border-b border-border-light/60 last:border-b-0">
            {u.status === 'sending' && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-on-light shrink-0" />}
            {u.status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
            {u.status === 'err' && <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />}
            <span className="truncate text-text-on-light">{u.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lightbox — o preview GRANDE do Drive (duplo-clique / menu Visualizar).      */
/* -------------------------------------------------------------------------- */

function Lightbox({ item, files, onClose, onNav }: {
  item: MediaSetItem; files: MediaSetItem[]; onClose: () => void; onNav: (i: MediaSetItem) => void;
}) {
  const t = useT() as (k: string) => string;
  const idx = files.findIndex((f) => f.id === item.id);
  const prev = idx > 0 ? files[idx - 1] : null;
  const next = idx >= 0 && idx < files.length - 1 ? files[idx + 1] : null;
  const kind = kindFromMime(item.content_type);
  const Icon = ICON_MAP[kind] || File;
  const src = item.uri ? MediaSets.contentUrl(item.id) : null;
  const framed = kind === 'document' && !!src &&
    ((item.content_type || '').includes('pdf') || (item.content_type || '').startsWith('text/'));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && prev) onNav(prev);
      else if (e.key === 'ArrowRight' && next) onNav(next);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNav, prev, next]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" role="dialog" aria-modal="true" aria-label={item.filename} data-testid="md-lightbox">
      <div className="h-12 px-4 flex items-center gap-3 shrink-0">
        <Icon className="w-4 h-4 text-white/70 shrink-0" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-white truncate" data-testid="md-lb-name">{item.filename}</span>
        <span className="text-[10px] font-mono text-white/60 shrink-0">{fmtBytes(item.size_bytes)}</span>
        <div className="flex-1" />
        {src && (
          <button
            type="button"
            onClick={() => downloadItem(item)}
            aria-label={t('media.download')}
            data-testid="md-lb-download"
            className="h-8 w-8 flex items-center justify-center text-white/80 hover:text-white border border-white/20 hover:border-white/60"
          >
            <Download className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('media.drive.close')}
          data-testid="md-lb-close"
          className="h-8 w-8 flex items-center justify-center text-white/80 hover:text-white border border-white/20 hover:border-white/60"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative flex items-center justify-center px-16 pb-6" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full flex items-center justify-center" data-testid="md-lb-body">
          {kind === 'image' && src ? (
            <img src={src} alt={item.filename} className="max-w-[88vw] max-h-[80vh] object-contain" />
          ) : kind === 'video' && src ? (
            <video src={src} controls className="max-w-[88vw] max-h-[80vh] bg-black" preload="metadata" />
          ) : kind === 'audio' && src ? (
            <div className="w-[520px] max-w-[88vw] p-6 bg-white border border-border-light">
              <p className="text-[12px] font-medium text-text-on-light truncate mb-3">{item.filename}</p>
              <audio src={src} controls className="w-full" preload="metadata" />
            </div>
          ) : framed && src ? (
            <iframe src={src} title={item.filename} className="w-[86vw] h-[80vh] bg-white border-0" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/80" data-testid="md-lb-noview">
              <Icon className="w-10 h-10" strokeWidth={1} />
              <p className="text-[12px]">{t('media.drive.noPreview')}</p>
              {src && (
                <button
                  type="button"
                  onClick={() => downloadItem(item)}
                  className="h-8 px-3 text-[11px] flex items-center gap-1.5 border border-white/40 hover:border-white text-white"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('media.download')}
                </button>
              )}
            </div>
          )}
        </div>

        {prev && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNav(prev); }}
            aria-label={t('media.drive.prev')}
            data-testid="md-lb-prev"
            className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-white/80 hover:text-white border border-white/20 hover:border-white/60 bg-black/40"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNav(next); }}
            aria-label={t('media.drive.next')}
            data-testid="md-lb-next"
            className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-white/80 hover:text-white border border-white/20 hover:border-white/60 bg-black/40"
          >
            <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* MoveDialog — "Mover para" com dropdowns REAIS (conjunto + pasta).           */
/* -------------------------------------------------------------------------- */

function MoveDialog({ item, sets, onClose, onDone }: {
  item: MediaSetItem;
  sets: MediaSetOut[];
  onClose: () => void;
  onDone: (msg: { ok: boolean; text: string }) => void;
}) {
  const t = useT() as (k: string) => string;
  const [setId, setSetId] = React.useState(item.media_set_id);
  const [folder, setFolder] = React.useState(item.folder_path || '/');
  const [busy, setBusy] = React.useState(false);
  const target = sets.find((s) => s.id === setId);
  const folders = ['/'].concat((target?.folders || []).filter((f) => f !== '/'));

  async function submit() {
    setBusy(true);
    try {
      await MediaSets.updateItem(item.id, {
        ...(setId !== item.media_set_id ? { media_set_id: setId } : {}),
        folder_path: folder,
      });
      onDone({ ok: true, text: t('media.drive.moved') });
    } catch (e) {
      onDone({ ok: false, text: errText(e) });
    } finally { setBusy(false); }
  }

  if (typeof document === 'undefined') return null;
  const SEL = 'w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary';
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('media.drive.moveTitle')}
      data-testid="md-move-dialog"
      className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div className="w-full max-w-[440px] bg-white border border-border-light shadow-2xl text-text-on-light" onClick={(e) => e.stopPropagation()}>
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-primary text-primary">
            <FolderInput className="w-3.5 h-3.5" strokeWidth={1.5} />
          </span>
          <h2 className="text-[13px] font-semibold flex-1 truncate">
            {t('media.drive.moveTitle')} — {item.filename}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('media.drive.close')} data-testid="md-move-close" className="text-muted-on-light hover:text-text-on-light">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>
        <div className="p-4 space-y-3 text-[12px]">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{t('media.drive.moveSet')}</label>
            <select
              value={setId}
              onChange={(e) => { setSetId(e.target.value); setFolder('/'); }}
              data-testid="md-move-set"
              className={SEL}
            >
              {sets.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{t('media.drive.moveFolder')}</label>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              data-testid="md-move-folder"
              className={SEL}
            >
              {folders.map((f) => (
                <option key={f} value={f}>{f === '/' ? t('media.drive.root') : f}</option>
              ))}
            </select>
          </div>
        </div>
        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} data-testid="md-move-cancel" className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary">
            {t('media.drive.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || (setId === item.media_set_id && folder === (item.folder_path || '/'))}
            data-testid="md-move-ok"
            className="h-8 px-3 text-[12px] flex items-center gap-1.5 border bg-primary text-white border-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('media.drive.moveConfirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
