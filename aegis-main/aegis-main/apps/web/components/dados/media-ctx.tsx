'use client';

/**
 * MediaCtx — estado compartilhado da aba Arquivos (padrão DatasetBrowser).
 *
 * Extraído do media-workspace (frente 2 — UX Drive) para que a superfície
 * Drive (media-drive) e os slots da casca (media-workspace) consumam o mesmo
 * contexto sem import circular. `media-workspace` re-exporta tudo — os
 * consumidores existentes (DadosPage, testes) não mudam.
 *
 * Régua: cantos retos, #2D77BE único acento, useT() pt-BR+en-US.
 */
import * as React from 'react';

import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { MediaSets, type MediaSetOut, type MediaSetItem } from '@/lib/api';

export const MEDIA_LABEL_KEY: Record<string, string> = {
  image: 'media.type.image', video: 'media.type.video', audio: 'media.type.audio', document: 'media.type.document', mixed: 'media.type.mixed',
};

export function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${u[i]}`;
}

/** MIME → família visual (ícone/preview). */
export function kindFromMime(contentType?: string | null): string {
  if (!contentType) return 'document';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'document';
}

export interface MediaCtx {
  list: MediaSetOut[];
  sel: MediaSetOut | null;
  items: MediaSetItem[];
  selItem: MediaSetItem | null;
  msg: { ok: boolean; text: string } | null;
  setMsg: (m: { ok: boolean; text: string } | null) => void;
  setSelItem: (i: MediaSetItem | null) => void;
  open: (s: MediaSetOut) => void;
  reload: () => void;
  refresh: () => void;
  remove: (s: MediaSetOut) => Promise<void>;
  /** Aplica um SetOut fresco (retorno de op de pasta/rename) em list+sel. */
  syncSet: (s: MediaSetOut) => void;
}

const Ctx = React.createContext<MediaCtx | null>(null);

export function useMedia(): MediaCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useMedia fora do MediaProvider');
  return ctx;
}

export function MediaProvider({ enabled = true, children }: { enabled?: boolean; children: React.ReactNode }) {
  const t = useT();
  const [list, setList] = React.useState<MediaSetOut[]>([]);
  const [sel, setSel] = React.useState<MediaSetOut | null>(null);
  const [items, setItems] = React.useState<MediaSetItem[]>([]);
  const [selItem, setSelItem] = React.useState<MediaSetItem | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const confirm = useConfirm();

  const reload = React.useCallback((): Promise<MediaSetOut[]> => {
    return MediaSets.list()
      .then((l) => { setList(l); return l; })
      .catch(() => { setList([]); return [] as MediaSetOut[]; });
  }, []);
  // Fetch só quando a seção está ativa (a casca liga/desliga via `enabled`).
  React.useEffect(() => { if (enabled) reload(); }, [enabled, reload]);

  const open = React.useCallback((s: MediaSetOut) => {
    setSel(s); setMsg(null); setSelItem(null);
    MediaSets.listItems(s.id).then(setItems).catch(() => setItems([]));
  }, []);

  const refresh = React.useCallback(() => {
    // Sincroniza o `sel` com a lista fresca (folders/contadores mudam em ops
    // de pasta/upload/move — um sel STALE esconderia pastas recém-criadas).
    reload().then((l) => setSel((cur) => (cur ? l.find((s) => s.id === cur.id) ?? cur : cur)));
    setSel((cur) => {
      if (cur) MediaSets.listItems(cur.id).then(setItems).catch(() => {});
      return cur;
    });
  }, [reload]);

  const syncSet = React.useCallback((s: MediaSetOut) => {
    setList((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    setSel((cur) => (cur && cur.id === s.id ? s : cur));
  }, []);

  const remove = React.useCallback(async (s: MediaSetOut) => {
    const ok = await confirm({
      title: t('media.removeSet'),
      description: t('media.removeSetDesc'),
      tone: 'danger',
      confirmLabel: t('media.removeConfirm'),
    });
    if (!ok) return;
    try {
      await MediaSets.remove(s.id);
      setSel((cur) => {
        if (cur?.id === s.id) { setItems([]); setSelItem(null); return null; }
        return cur;
      });
      setMsg({ ok: true, text: t('media.removed') });
      reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha.' }); }
  }, [confirm, reload, t]);

  const value = React.useMemo<MediaCtx>(
    () => ({ list, sel, items, selItem, msg, setMsg, setSelItem, open, reload, refresh, remove, syncSet }),
    [list, sel, items, selItem, msg, open, reload, refresh, remove, syncSet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
