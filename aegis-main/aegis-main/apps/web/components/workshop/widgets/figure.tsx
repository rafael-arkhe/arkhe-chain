'use client';

/**
 * Figura — T3-F2 (2026-06-29). Bloco-base de documento: imagem por URL com
 * legenda (par estático do widget `image`, que liga a um nó da ontologia).
 * Presentational.
 */
import * as React from 'react';
import { Image as ImageIcon } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = { url?: string; caption?: string; alt?: string };

function Figure({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  return (
    <figure data-testid="figure-widget" className="border border-border-light bg-white">
      {cfg.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cfg.url} alt={cfg.alt || cfg.caption || ''} className="w-full block" />
      ) : (
        <div className="p-6 flex items-center justify-center text-muted-on-light">
          <ImageIcon className="w-6 h-6" strokeWidth={1.5} />
        </div>
      )}
      {cfg.caption && (
        <figcaption className="px-2 py-1.5 text-[11px] text-muted-on-light border-t border-border-light">
          {cfg.caption}
        </figcaption>
      )}
    </figure>
  );
}

registerWidget('figure', Figure, {
  group: 'content',
  label: 'Figura (imagem + legenda)',
  description: 'Imagem por URL com legenda. Par estático do widget de imagem da ontologia.',
  icon: 'image',
  defaultColSpan: 12,
  mockConfig: { url: '', caption: 'Figura 1 — descrição da imagem' } satisfies Cfg,
  config_schema: [
    { name: 'url', label: 'URL da imagem', field: 'string', placeholder: 'https://…' },
    { name: 'caption', label: 'Legenda', field: 'string', placeholder: 'ex.: Figura 1 — …' },
    { name: 'alt', label: 'Texto alternativo', field: 'string', placeholder: 'descrição p/ acessibilidade' },
  ],
});

export { Figure };
