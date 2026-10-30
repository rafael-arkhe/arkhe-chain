'use client';

/**
 * MediaPreview — painel de preview inline de um item de MediaSet.
 *
 * Mostra preview de imagem/vídeo/áudio quando disponível, ou ícone +
 * metadados detalhados (filename, content_type, size, uri, created_at).
 * Espelha o padrão DatasetInspector (RIGHT pane, w-[320px]).
 *
 * Régua: cantos retos, #2D77BE único acento, useT() pt-BR+en-US.
 */
import * as React from 'react';
import Link from 'next/link';
import { Image, Film, Music, FileText, File, ExternalLink, Download, Loader2, Workflow } from 'lucide-react';
import { MediaSets } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { RequirePerm } from '@/components/auth/require-perm';
import type { MediaSetItem, MediaUsageBoard } from '@/lib/api';

const ICON_MAP: Record<string, typeof Image> = {
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
};

function kindFromMime(contentType?: string | null): string {
  if (!contentType) return 'document';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'document';
}

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${u[i]}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

type Props = {
  item: MediaSetItem;
};

export function MediaPreview({ item }: Props) {
  const t = useT();
  const kind = kindFromMime(item.content_type);
  const Icon = ICON_MAP[kind] || File;
  // Conteudo servido pelo BACKEND (preview/download) — a uri interna
  // (s3://minio) nao e alcancavel pelo browser; era o 'nao consigo
  // visualizar/baixar' do operador.
  const src = item.uri ? MediaSets.contentUrl(item.id) : undefined;

  function handleDownload() {
    if (!item.uri) return;
    const a = document.createElement('a');
    a.href = MediaSets.contentUrl(item.id, { download: true });
    a.download = item.filename || 'download';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="h-full flex flex-col" data-testid="md-preview">
      {/* Header */}
      <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <span className="text-[11px] font-semibold text-text-on-light truncate flex-1">
          {item.filename || t('media.previewTitle')}
        </span>
        {item.uri && (
          <button
            type="button"
            onClick={handleDownload}
            className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary"
            aria-label={t('media.download')}
            data-testid="md-preview-download"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-4">
        {/* Visual preview */}
        <div className="border border-border-light bg-canvas-light overflow-hidden" data-testid="md-preview-area">
          {kind === 'image' && src ? (
            <img
              src={src}
              alt={item.filename || t('media.previewImage')}
              className="w-full h-auto max-h-64 object-contain bg-raised-light"
              loading="lazy"
            />
          ) : kind === 'video' && src ? (
            <video
              src={src}
              controls
              className="w-full max-h-64 bg-black"
              preload="metadata"
            />
          ) : kind === 'audio' && src ? (
            <div className="w-full p-4 bg-raised-light">
              <audio src={src} controls className="w-full" preload="metadata" />
            </div>
          ) : (
            <div className="w-full aspect-video flex items-center justify-center bg-raised-light">
              <Icon className="w-8 h-8 text-muted-on-light" strokeWidth={1} />
            </div>
          )}
        </div>

        {/* Metadata table */}
        <section className="space-y-2" data-testid="md-preview-meta">
          <MetaRow label={t('media.filename')} value={item.filename} />
          <MetaRow label={t('media.drive.folder' as Parameters<typeof t>[0])} value={item.folder_path || '/'} mono />
          <MetaRow label={t('media.type')} value={item.content_type || '—'} mono />
          <MetaRow label={t('media.size')} value={fmtBytes(item.size_bytes)} mono />
          {item.uri && (
            <div className="flex items-start gap-2 text-[11px]">
              <span className="text-muted-on-light shrink-0 w-20">{t('media.uri')}</span>
              <a
                href={MediaSets.contentUrl(item.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 truncate"
                data-testid="md-preview-uri"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.uri}</span>
              </a>
            </div>
          )}
          <MetaRow label={t('media.previewCreated')} value={fmtDate(item.created_at)} />
        </section>

        {/* Frente 4 — QUAIS boards do DAG usam este arquivo (deep-link canvas) */}
        <UsageSection item={item} />

        {/* Actions */}
        <RequirePerm perm="data.media.write" fallback={null}>
          <section className="border-t border-border-light pt-3" data-testid="md-preview-actions">
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
              {t('media.actions')}
            </p>
            {item.uri && (
              <button
                type="button"
                onClick={handleDownload}
                className="h-7 px-3 text-[10px] border border-border-light bg-white hover:border-primary hover:text-primary flex items-center gap-1.5"
                data-testid="md-preview-download-btn"
              >
                <Download className="w-3 h-3" strokeWidth={1.5} />
                {t('media.download')}
              </button>
            )}
          </section>
        </RequirePerm>
      </div>
    </div>
  );
}

/* Frente 4 — "Fluxos que usam": espelho do used_by_boards do dataset-browser
 * (Workflow + Link p/ o canvas). `reads` = extract_file lê o arquivo;
 * `writes` = convert_file gera / proveniência generated_by_board. */
function UsageSection({ item }: { item: MediaSetItem }) {
  const t = useT();
  const tx = t as (k: string) => string;
  const [usage, setUsage] = React.useState<MediaUsageBoard[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    setUsage(null);
    // defensivo (lição inc1): mock parcial de @/lib/api sem itemUsage não quebra.
    Promise.resolve(MediaSets.itemUsage?.(item.id))
      .then((u) => { if (alive) setUsage(u ?? []); })
      .catch(() => { if (alive) setUsage([]); });
    return () => { alive = false; };
  }, [item.id]);
  const boardHref = (id: string) => `/painel-de-controle/dados?aba=pipelines&board=${encodeURIComponent(id)}`;
  return (
    <section className="border-t border-border-light pt-3" data-testid="md-usage">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-2">
        {tx('media.drive.usedBy')}{usage ? ` (${usage.length})` : ''}
      </p>
      {usage === null ? (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> …
        </p>
      ) : usage.length === 0 ? (
        <p className="text-[11px] text-muted-on-light italic" data-testid="md-usage-none">
          {tx('media.drive.usedByNone')}
        </p>
      ) : (
        <ul className="space-y-0.5 text-[11px]">
          {usage.map((b) => (
            <li key={b.id}>
              <Link href={boardHref(b.id)} data-testid={`md-usage-${b.id}`}
                className="flex items-center gap-1 text-primary hover:underline">
                <Workflow className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{b.display_name}</span>
                <span className="text-[9px] uppercase text-muted-on-light shrink-0">
                  · {b.roles.map((r) => tx(r === 'writes' ? 'media.drive.roleWrites' : 'media.drive.roleReads')).join(' + ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-muted-on-light shrink-0 w-20">{label}</span>
      <span className={'text-text-on-light break-all' + (mono ? ' font-mono' : '')}>{value}</span>
    </div>
  );
}
