'use client';

/**
 * <MediaGallery /> — grade de miniaturas de mídia (P2 ELO 2).
 *
 * Consome `NormalizedResult['media']` (detectado por SHAPE no ELO 1, nunca pelo
 * nome da fonte). Cada miniatura:
 *   - cantos retos (0px), borda discreta, sem rounded;
 *   - LAZY (`loading="lazy"`) + `onError` esconde a imagem quebrada (some, não
 *     deixa ícone de imagem rasgada);
 *   - só renderiza URLs http(s) absolutas — nunca vaza host de túnel/relativo;
 *   - `referrerPolicy="no-referrer"` (não revela o painel à CDN externa);
 *   - vídeo ganha um badge Play (lucide, neutro) sobre a capa;
 *   - clicar abre a URL em NOVA ABA (`target="_blank" rel="noopener noreferrer"`,
 *     regra do projeto — memória feedback_ficha_associacoes_e_nova_aba).
 *
 * Reuso: o ResultadoCard passa `max` (tira compacta de 3-4); o DetalheObjeto
 * renderiza a galeria completa (sem `max`).
 */
import * as React from 'react';
import { Play } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
import type { NormalizedResult } from '@/lib/buscar/types';

type MediaItem = NonNullable<NormalizedResult['media']>[number];

const HTTP_RE = /^https?:\/\//i;

export function MediaGallery({ media, max }: { media: MediaItem[]; max?: number }) {
  const t = useT();
  // Defesa em profundidade: o ELO 1 já garante http(s) absoluto, mas filtramos
  // de novo na borda de renderização (nunca vaza host de túnel/relativo).
  const safe = media.filter(
    (m) => HTTP_RE.test(m.url) && (!m.thumbnail || HTTP_RE.test(m.thumbnail)),
  );
  const shown = typeof max === 'number' ? safe.slice(0, max) : safe;
  if (shown.length === 0) return null;

  return (
    <div data-testid="buscar-galeria" className="grid grid-cols-4 gap-1">
      {shown.map((m, i) => (
        <MediaThumb key={`${m.url}-${i}`} item={m} videoLabel={t('buscar.galeria.video')} />
      ))}
    </div>
  );
}

function MediaThumb({ item, videoLabel }: { item: MediaItem; videoLabel: string }) {
  const isVideo = item.kind === 'video';
  // Capa: thumbnail explícito; para imagem, a própria URL serve de capa.
  const cover =
    item.thumbnail && HTTP_RE.test(item.thumbnail)
      ? item.thumbnail
      : item.kind === 'image'
        ? item.url
        : undefined;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.caption ?? (isVideo ? videoLabel : undefined)}
      className="relative block aspect-square border border-border-light bg-raised-light overflow-hidden"
    >
      {cover && (
        // next/image exigiria allowlist; adapters mandam CDNs arbitrárias.
        // <img> nativo + onError oculta a quebrada.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={item.caption ?? ''}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      {isVideo && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-label={videoLabel}
        >
          <span className="flex items-center justify-center bg-black/55 p-1">
            <Play className="w-3.5 h-3.5 text-white" strokeWidth={1.5} fill="currentColor" />
          </span>
        </span>
      )}
    </a>
  );
}
