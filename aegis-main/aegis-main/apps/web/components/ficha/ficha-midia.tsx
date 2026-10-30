'use client';

/**
 * WidgetMidia — aba "Mídia" da ficha (FRENTE D).
 *
 * Lê Entities.evidence(id) e FILTRA as fontes sociais/mídia (Instagram,
 * TikTok, Reddit, X/Twitter, YouTube, foto/face). De cada registro extrai um
 * item visual:
 *   • thumbnail (storage_url / thumbnail / image / media_url quando houver)
 *   • título (caption/title/text/display)
 *   • link externo (url/permalink/page)
 *   • rede de origem (derivada do source_tool — nada hardcoded de vertical)
 *
 * Renderiza uma galeria: cards com thumbnail quando existe; senão, linha
 * título + link + badge da rede. Sem ícone colorido, sem rounded, sem emoji.
 *
 * NÃO reusa getPayload/extractRecords de widgets-prontos (fora do escopo) —
 * helpers mínimos locais.
 */
import * as React from 'react';
import { ExternalLink, Image as ImageIcon, Download, Loader2 } from 'lucide-react';
import { Widget } from './widget';
import { useT } from '@/lib/i18n/provider';
import { promptModal } from '@/components/dialog/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { Entities, type IdentidadePossivel } from '@/lib/api';

type EvidenceRow = {
  source_tool?: string;
  payload?: unknown;
  payload_excerpt?: string;
  confidence?: number;
  collected_at?: string;
};

// Fontes sociais/mídia — casa o source_tool por substring (multi-domínio).
const MEDIA_SOURCE_RE = /instaloader|tiktok|reddit|agent_x|youtube|instagram|gram|foto|face/i;

/** Rótulo curto da rede a partir do source_tool (derivado, não hardcoded). */
function networkLabel(src?: string): string {
  if (!src) return 'mídia';
  const s = src.toLowerCase();
  if (s.includes('instaloader') || s.includes('instagram')) return 'Instagram';
  if (s.includes('tiktok')) return 'TikTok';
  if (s.includes('reddit')) return 'Reddit';
  if (s.includes('agent_x') || /\bx\b/.test(s)) return 'X';
  if (s.includes('youtube')) return 'YouTube';
  if (s.includes('face')) return 'Face';
  if (s.includes('foto')) return 'Foto';
  return src.replace(/_/g, ' ');
}

/** Desembrulha o envelope {data,status,sha256} → usa o `data`. */
function unwrapEnvelope(payload: unknown): unknown {
  let p: unknown = payload;
  if (p && typeof p === 'object' && !Array.isArray(p) && 'data' in (p as Record<string, unknown>)) {
    const d = (p as Record<string, unknown>).data;
    if (d && typeof d === 'object') p = d;
  }
  return p;
}

function getPayload(e: EvidenceRow): unknown {
  if (e.payload != null) return e.payload;
  const ex = e.payload_excerpt;
  if (typeof ex === 'string') {
    const s = ex.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    }
  }
  return null;
}

const LIST_KEYS = [
  'results', 'items', 'posts', 'media', 'photos', 'fotos', 'registros', 'hits', 'rows', 'lista',
  // gram search/profile → data.users[]{username,fullName,profilePicUrl,isVerified}.
  'users',
];

function extractRecords(payload: unknown): Record<string, unknown>[] {
  const p = unwrapEnvelope(payload);
  if (Array.isArray(p)) {
    return p.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  if (p && typeof p === 'object') {
    const obj = p as Record<string, unknown>;
    for (const k of LIST_KEYS) {
      const v = obj[k];
      if (Array.isArray(v)) {
        return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
      }
    }
    return [obj];
  }
  return [];
}

const THUMB_KEYS = ['storage_url', 'thumbnail', 'thumb', 'image_url', 'image', 'media_url', 'foto_url', 'picture', 'avatar', 'profile_pic_url', 'profilePicUrl'];
const TITLE_KEYS = ['caption', 'title', 'text', 'display', 'descricao', 'description', 'handle', 'username', 'nome', 'full_name', 'fullName'];
const URL_KEYS = ['url', 'permalink', 'page', 'link', 'post_url', 'profile_url'];

function pickString(rec: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

type MediaItem = {
  thumb?: string;
  title?: string;
  url?: string;
  network: string;
};

/** Texto de um post do agent_x (text/caption); fallback p/ os TITLE_KEYS. */
const POST_TEXT_KEYS = ['text', 'caption', 'title', 'content', 'body'];

/** Empurra 1 registro como MediaItem se tiver QUALQUER sinal exibível. */
function pushRecord(out: MediaItem[], rec: Record<string, unknown>, network: string) {
  const thumb = pickString(rec, THUMB_KEYS);
  const title = pickString(rec, TITLE_KEYS);
  // tiktok_user_videos: o `url` do item é o link do card (vídeo).
  const url = pickString(rec, URL_KEYS);
  if (!thumb && !title && !url) return;
  out.push({ thumb, title, url, network });
}

/** Converte 1 evidência social em N itens de mídia. */
function toMediaItems(e: EvidenceRow): MediaItem[] {
  const recs = extractRecords(getPayload(e));
  const network = networkLabel(e.source_tool);
  const out: MediaItem[] = [];
  for (const rec of recs) {
    // agent_x_search → data.items[]{url, posts:[{text,url,...}]}: cada POST vira
    // um card próprio (texto + link do post), herdando a rede da fonte.
    const posts = rec.posts;
    if (Array.isArray(posts) && posts.length) {
      for (const p of posts) {
        if (!p || typeof p !== 'object') continue;
        const post = p as Record<string, unknown>;
        const thumb = pickString(post, THUMB_KEYS);
        const title = pickString(post, POST_TEXT_KEYS) ?? pickString(post, TITLE_KEYS);
        const url = pickString(post, URL_KEYS) ?? pickString(rec, URL_KEYS);
        if (!thumb && !title && !url) continue;
        out.push({ thumb, title, url, network });
      }
      continue;
    }
    pushRecord(out, rec, network);
  }
  return out;
}

function useEntityEvidence(
  entityId: string | null,
): { rows: EvidenceRow[] | null; refetch: () => void } {
  const [rows, setRows] = React.useState<EvidenceRow[] | null>(null);
  // `tick` força um novo fetch após a coleta (sem trocar de entidade).
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    Entities.evidence(entityId)
      .then((d) => !cancelled && setRows((Array.isArray(d) ? d : []) as EvidenceRow[]))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId, tick]);
  const refetch = React.useCallback(() => setTick((n) => n + 1), []);
  return { rows, refetch };
}

/** Perfis correlacionados (identity_decision) — "Mídia E PERFIS": mesmo sem foto
 *  coletada, os perfis sociais descobertos viram cards clicáveis. */
function useEntityIdentidades(entityId: string | null): IdentidadePossivel[] | null {
  const [rows, setRows] = React.useState<IdentidadePossivel[] | null>(null);
  React.useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    Entities.identidades(entityId)
      .then((r) => !cancelled && setRows((r?.identidades || []).filter((p) => p.status !== 'rejected')))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId]);
  return rows;
}

/** Identidade correlata → card de perfil (rede + @handle + link). */
function identidadeToItem(p: IdentidadePossivel): MediaItem {
  const r = p as unknown as Record<string, unknown>;
  const net = (r.tipo ?? r.rede ?? r.plataforma ?? r.fonte) as string | undefined;
  const url = typeof r.url === 'string' ? r.url : undefined;
  return { network: networkLabel(net), title: p.identificador, url };
}

export function WidgetMidia({ entityId }: { entityId?: string | null }) {
  const t = useT();
  const { rows: all, refetch } = useEntityEvidence(entityId ?? null);
  const idents = useEntityIdentidades(entityId ?? null);
  const [collecting, setCollecting] = React.useState(false);
  // Progresso POR REDE ao vivo (operador NUNCA no escuro): cada step do fan-out
  // chega via SSE/poll de collectMediaViaTask. label = tool (→ rede amigável),
  // detail = "ok" / "falhou: motivo".
  const [mediaSteps, setMediaSteps] = React.useState<{ label: string; detail?: string }[]>([]);
  const collectAbortRef = React.useRef<AbortController | null>(null);
  // Resumo INLINE da última coleta (não depende de <Toaster /> montado): honesto
  // sobre o que coletou e o que foi bloqueado (por rede + motivo legível).
  const [result, setResult] = React.useState<{
    coletadas: number;
    itens: number;
    falhas: { rede: string; motivo: string }[];
  } | null>(null);

  // Resumo honesto do fan-out: quantas redes concluíram (ok) vs bloquearam (falha).
  const mediaStats = React.useMemo(() => {
    let ok = 0;
    let fail = 0;
    for (const s of mediaSteps) {
      if (!s.detail) continue;
      if (s.detail.startsWith('ok')) ok += 1;
      else fail += 1;
    }
    return { ok, fail };
  }, [mediaSteps]);

  const cancelCollect = React.useCallback(() => {
    collectAbortRef.current?.abort();
    setCollecting(false);
  }, []);

  const items = React.useMemo<MediaItem[] | null>(() => {
    if (!all || !idents) return null;
    // Fotos/posts das fontes de mídia + perfis correlacionados (com link).
    const media = all.filter((e) => MEDIA_SOURCE_RE.test(e.source_tool ?? '')).flatMap(toMediaItems);
    const profiles = idents
      .filter((p) => p.identificador || (p as unknown as Record<string, unknown>).url)
      .map(identidadeToItem);
    return [...media, ...profiles];
  }, [all, idents]);

  // Gesto "Coletar posts e fotos": finalidade LGPD via promptModal (NUNCA diálogo
  // nativo) → POST /entities/{id}/collect-media → refaz a evidência. Resumo honesto:
  // quantas redes coletaram, quantos itens, e o que foi bloqueado (com motivo).
  const onCollect = React.useCallback(async () => {
    if (!entityId || collecting) return;
    const purpose = await promptModal({
      title: t('ficha.midia.coletar'),
      description: t('ficha.midia.finalidade'),
      placeholder: t('ficha.midia.finalidade'),
      confirmLabel: t('ficha.midia.coletar'),
    });
    if (!purpose || !purpose.trim()) return;
    setCollecting(true);
    setResult(null);
    setMediaSteps([]);
    const ctrl = new AbortController();
    collectAbortRef.current = ctrl;
    try {
      // Coleta ASSÍNCRONA: o painel de progresso por rede atualiza ao vivo via
      // onProgress (SSE/poll). O operador vê cada rede ok/bloqueado em tempo real.
      const r = await Entities.collectMediaViaTask(entityId, purpose.trim(), {
        onProgress: setMediaSteps,
        signal: ctrl.signal,
      });
      const falhas = Array.isArray(r.falhas) ? r.falhas : [];
      setResult({ coletadas: r.coletadas, itens: r.itens, falhas });
      const resumo = t('ficha.midia.coletaResumo')
        .replace('{n}', String(r.coletadas))
        .replace('{itens}', String(r.itens));
      if (r.itens > 0 || r.coletadas > 0) {
        toast.success(resumo);
      } else {
        toast.info(resumo);
      }
      // Falhas: honesto sobre o que foi bloqueado, com o motivo por rede.
      for (const f of falhas) {
        toast.error(
          t('ficha.midia.coletaFalha').replace('{rede}', f.rede).replace('{motivo}', f.motivo),
        );
      }
      refetch();
    } catch {
      // Cancelamento pelo operador não é erro a reportar — só encerra o painel.
      if (!ctrl.signal.aborted) {
        const msg = t('ficha.midia.coletaFalha').replace('{rede}', '—').replace('{motivo}', '—');
        setResult({ coletadas: 0, itens: 0, falhas: [{ rede: '—', motivo: '—' }] });
        toast.error(msg);
      }
    } finally {
      setCollecting(false);
      collectAbortRef.current = null;
    }
  }, [entityId, collecting, t, refetch]);

  return (
    <Widget
      title={t('ficha.midia.titulo')}
      description={items ? `${items.length} ${t('ficha.midia.itens')}` : t('ficha.midia.descricao')}
    >
      {entityId && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={onCollect}
            disabled={collecting}
            data-testid="ficha-midia-coletar"
            className="h-7 px-2.5 text-[11px] font-semibold bg-canvas-light text-text-on-light border border-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {collecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-on-light" strokeWidth={1.5} />
            ) : (
              <Download className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
            )}
            {collecting ? t('ficha.midia.coletando') : t('ficha.midia.coletar')}
          </button>
        </div>
      )}
      {collecting && (
        <div
          data-testid="ficha-midia-coleta-progresso"
          className="mb-3 border border-border-light bg-panel-light p-2 text-[11px]"
        >
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-muted-on-light" strokeWidth={1.5} />
              {t('ficha.midia.coletandoTitulo').replace('{n}', String(mediaSteps.length))}
              {(mediaStats.ok > 0 || mediaStats.fail > 0) && (
                <span className="normal-case tracking-normal text-muted-on-light">
                  ·{' '}
                  <span className="text-primary">
                    {t('ficha.midia.statOk').replace('{n}', String(mediaStats.ok))}
                  </span>
                  {mediaStats.fail > 0 && (
                    <>
                      {' · '}
                      <span className="text-danger">
                        {t('ficha.midia.statBloqueado').replace('{n}', String(mediaStats.fail))}
                      </span>
                    </>
                  )}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={cancelCollect}
              data-testid="ficha-midia-coleta-cancelar"
              className="ml-auto h-6 px-2 text-[10px] text-muted-on-light hover:text-text-on-light border border-border-light hover:border-primary"
            >
              {t('ficha.midia.cancelar')}
            </button>
          </div>
          {mediaSteps.length > 0 && (
            <ul className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-hide">
              {mediaSteps.map((s, i) => (
                <li key={`${s.label}-${i}`} className="font-mono flex items-center gap-1.5">
                  <span className="text-text-on-light">{networkLabel(s.label)}</span>
                  {s.detail && (
                    <span className={s.detail.startsWith('ok') ? 'text-primary' : 'text-danger'}>
                      ·{' '}
                      {s.detail.startsWith('ok')
                        ? t('ficha.midia.statusOk')
                        : t('ficha.midia.statusBloqueado').replace(
                            '{motivo}',
                            s.detail.replace(/^(falhou|bloqueado):?\s*/i, ''),
                          )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && (
        <div
          data-testid="ficha-midia-coleta-resumo"
          className="mb-3 border border-border-light bg-canvas-light px-2.5 py-2"
        >
          <p className="text-[10px] uppercase tracking-wider text-primary mb-0.5">
            {t('ficha.midia.coletaConcluida')}
          </p>
          <p className="text-[11px] text-text-on-light">
            {t('ficha.midia.coletaResumo')
              .replace('{n}', String(result.coletadas))
              .replace('{itens}', String(result.itens))}
          </p>
          {result.falhas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.falhas.map((f, i) => (
                <li key={`${f.rede}-${i}`} className="text-[10.5px] text-muted-on-light">
                  {t('ficha.midia.coletaFalha')
                    .replace('{rede}', f.rede)
                    .replace('{motivo}', f.motivo)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {items === null && (
        <p className="text-[11px] text-muted-on-light italic">{t('ficha.midia.carregando')}</p>
      )}
      {items && items.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-on-light italic">
          {t('ficha.midia.vazio')}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((m, i) => {
            const inner = (
              <>
                {m.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumb}
                    alt={m.title || m.network}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full aspect-video object-cover bg-raised-light"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full aspect-video bg-raised-light/60 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-muted-on-light" strokeWidth={1.5} />
                  </div>
                )}
                <div className="px-1.5 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light truncate">
                      {m.network}
                    </span>
                    {m.url && (
                      <ExternalLink
                        className="w-2.5 h-2.5 text-muted-on-light shrink-0 ml-auto"
                        strokeWidth={1.5}
                      />
                    )}
                  </div>
                  {m.title && (
                    <p className="text-[11px] text-text-on-light leading-tight line-clamp-2 mt-0.5">
                      {m.title}
                    </p>
                  )}
                </div>
              </>
            );
            const className =
              'group block border border-border-light bg-canvas-light hover:border-primary overflow-hidden';
            return (
              <li key={`${m.network}-${i}`}>
                {m.url ? (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    title={m.title || m.url}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className={className}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}
