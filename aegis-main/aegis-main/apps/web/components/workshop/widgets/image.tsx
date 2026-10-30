'use client';

/**
 * Image — par visual do audio_player/video_player. Mostra UMA imagem (de uma
 * URL direta ou de uma propriedade do objeto) OU uma GALERIA (quando a fonte é
 * um array de objetos com um campo de imagem). Multidomínio: foto de pessoa,
 * frame de câmera, anexo de ocorrência, talhão por satélite — o widget não sabe
 * O QUE é a imagem; isso vem da ontologia.
 *
 * Config:
 *   - url?: string            URL direta (prioridade)
 *   - source?: string         external_id de variable (objeto OU array)
 *   - source_field?: string   propriedade que carrega a URL da imagem
 *   - caption_field?: string  propriedade usada como legenda (galeria)
 *   - title?: string          cabeçalho
 *   - fit?: 'cover' | 'contain'
 */
import * as React from 'react';
import { Image as ImageIcon } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';

type Cfg = {
  url?: string;
  source?: string;
  source_field?: string;
  caption_field?: string;
  title?: string;
  fit?: 'cover' | 'contain';
};

function isUrl(s: string): boolean {
  // http(s) e caminhos relativos OK. data: SÓ imagem raster — bloqueia
  // data:image/svg+xml (SVG pode carregar markup arbitrário; raster não).
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return true;
  return /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i.test(s);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function propsOf(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.properties && typeof o.properties === 'object') return o.properties as Record<string, unknown>;
    return o;
  }
  return null;
}

interface Img {
  url: string;
  caption?: string;
}

function resolveImages(cfg: Cfg, variables: Record<string, unknown>): Img[] {
  // 1) URL direta.
  const direct = str(cfg.url).trim();
  if (direct && isUrl(direct)) return [{ url: direct }];

  const field = str(cfg.source_field).trim();
  const capField = str(cfg.caption_field).trim();
  const src = str(cfg.source).trim();
  const raw = src ? variables[src] : variables.object ?? variables.objeto;

  // 2) array → galeria.
  if (Array.isArray(raw)) {
    return raw
      .map((row): Img | null => {
        const p = propsOf(row) ?? {};
        const u = field ? str(p[field]) : str((p.image_url ?? p.url ?? p.thumbnail) as unknown);
        if (!u || !isUrl(u)) return null;
        const cap = capField ? str(p[capField]) : '';
        return cap ? { url: u, caption: cap } : { url: u };
      })
      .filter((x): x is Img => x !== null);
  }

  // 3) objeto único.
  const obj = propsOf(raw);
  if (obj) {
    const u = field ? str(obj[field]) : str((obj.image_url ?? obj.url ?? obj.thumbnail) as unknown);
    if (u && isUrl(u)) {
      const cap = capField ? str(obj[capField]) : '';
      return [cap ? { url: u, caption: cap } : { url: u }];
    }
  }
  // 4) variable string crua.
  if (typeof raw === 'string' && isUrl(raw)) return [{ url: raw }];
  return [];
}

function ImageWidget({ config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const images = resolveImages(cfg, variables ?? {});
  const fit = cfg.fit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div className="bg-white border border-border-light flex flex-col" data-testid="image-widget">
      <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
        <ImageIcon className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
          {cfg.title || t('image.title')}
        </p>
      </header>
      {images.length === 0 ? (
        <p className="p-3 text-small text-muted-on-light italic" data-testid="image-empty">
          {t('image.empty')}
        </p>
      ) : images.length === 1 ? (
        <div className="p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0].url}
            alt={images[0].caption || cfg.title || ''}
            data-testid="image-single"
            className={`w-full max-h-[420px] ${fit} border border-border-light bg-canvas-light`}
          />
          {images[0].caption && (
            <p className="text-[11px] text-muted-on-light mt-1 truncate">{images[0].caption}</p>
          )}
        </div>
      ) : (
        <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5" data-testid="image-gallery">
          {images.map((im, i) => (
            <figure key={i} className="border border-border-light bg-canvas-light">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={im.url}
                alt={im.caption || `${i + 1}`}
                data-testid={`image-gallery-item-${i}`}
                className={`w-full h-28 ${fit}`}
              />
              {im.caption && (
                <figcaption className="text-[10px] text-muted-on-light px-1 py-0.5 truncate">
                  {im.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

registerWidget('image', ImageWidget, {
  group: 'content',
  label: 'Imagem',
  description:
    'Mostra uma imagem (de uma URL ou propriedade do objeto) ou uma galeria quando a fonte é uma lista. Foto, frame de câmera, anexo — o conteúdo vem da ontologia.',
  icon: 'image',
  defaultColSpan: 6,
  mockConfig: {
    title: 'Imagem',
    url: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=640',
  },
  mockVariables: {},
  previewWidth: 420,
  previewHeight: 280,
  config_schema: [
    {
      name: 'url',
      label: 'URL direta (opcional)',
      description: 'URL da imagem. Tem prioridade sobre a propriedade.',
      field: 'string',
      placeholder: 'https://…/foto.jpg',
    },
    {
      name: 'source',
      label: 'Objeto ou lista fonte',
      description: 'Variable de um objeto (1 imagem) ou de uma lista (galeria).',
      field: 'variable-ref',
    },
    {
      name: 'source_field',
      label: 'Propriedade da imagem',
      description: 'Propriedade que contém a URL da imagem.',
      field: 'property',
      typeFrom: 'source',
      placeholder: 'image_url',
    },
    {
      name: 'caption_field',
      label: 'Propriedade da legenda',
      description: 'Propriedade usada como legenda (galeria).',
      field: 'property',
      typeFrom: 'source',
      placeholder: 'titulo',
    },
    {
      name: 'title',
      label: 'Título',
      field: 'string',
      placeholder: 'ex.: Frames recentes',
    },
    {
      name: 'fit',
      label: 'Ajuste',
      field: 'select',
      default: 'cover',
      options: [
        { value: 'cover', label: 'Preencher (cover)' },
        { value: 'contain', label: 'Conter (contain)' },
      ],
    },
  ],
});

export { ImageWidget, resolveImages };
