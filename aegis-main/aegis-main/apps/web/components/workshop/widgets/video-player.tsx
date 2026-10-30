'use client';

/**
 * Video Player — Sprint Wave D.4 (2026-05-23).
 *
 * Player HTML5 simples. Aceita URL direta de vídeo (mp4/webm/ogg) ou
 * uma fonte vinda de variable. Sem autoplay-with-sound por default
 * (browsers bloqueiam) — autoplay liga `muted` automaticamente.
 *
 * Casos de uso: review de captura CCTV armazenada, vídeo institucional
 * embarcado em briefing, replay de operação gravada.
 *
 * Config:
 *   - source:    URL direta (ou external_id de variable que carrega URL)
 *   - poster?:   imagem mostrada antes do play
 *   - muted?:    bool — mudo por default (default true se autoplay)
 *   - autoplay?: bool — começa sem clique
 *   - controls?: bool — barra de controle (default true)
 *   - title?:    cabeçalho acima do player
 *   - height?:   px (default 280)
 */
import * as React from 'react';
import { Video } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  source?: string;
  poster?: string;
  muted?: boolean;
  autoplay?: boolean;
  controls?: boolean;
  title?: string;
  height?: number;
};

function resolveSource(
  cfg: Cfg,
  variables: Record<string, unknown>,
): string | null {
  const raw = (cfg.source ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
    return raw;
  }
  // caminho dotted (ex.: "item.properties.video_url") — mídia POR OBJETO no loop/detalhe.
  if (raw.includes('.')) {
    let cur: unknown = variables;
    for (const seg of raw.split('.')) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
      else { cur = null; break; }
    }
    if (typeof cur === 'string') return cur;
  }
  const fromVar = variables[raw];
  if (typeof fromVar === 'string') return fromVar;
  if (
    fromVar &&
    typeof fromVar === 'object' &&
    'url' in (fromVar as Record<string, unknown>) &&
    typeof (fromVar as { url: unknown }).url === 'string'
  ) {
    return (fromVar as { url: string }).url;
  }
  return null;
}

function VideoPlayer({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const url = resolveSource(cfg, variables);
  const height = typeof cfg.height === 'number' ? cfg.height : 280;
  const autoplay = !!cfg.autoplay;
  const muted = cfg.muted == null ? autoplay : !!cfg.muted; // autoplay → muted true
  const controls = cfg.controls !== false;

  return (
    <div
      className="bg-white border border-border-light flex flex-col"
      data-testid="video-player-widget"
    >
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <Video className="w-3 h-3 text-primary" strokeWidth={1.5} />
          <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
            {cfg.title}
          </p>
        </header>
      )}
      <div
        className="bg-canvas-light flex items-center justify-center"
        style={{ height }}
        data-testid="video-player-canvas"
      >
        {url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            data-testid="video-player-element"
            src={url}
            poster={cfg.poster}
            autoPlay={autoplay}
            muted={muted}
            controls={controls}
            playsInline
            style={{
              width: '100%',
              height: '100%',
              maxHeight: height,
              objectFit: 'contain',
              background: '#0F172A',
            }}
          />
        ) : (
          <p
            className="text-small text-muted-on-light italic"
            data-testid="video-player-empty"
          >
            Configure a URL ou o dado fonte.
          </p>
        )}
      </div>
    </div>
  );
}

registerWidget('video_player', VideoPlayer, {
  group: 'content',
  label: 'Reprodutor de vídeo',
  description:
    'Player HTML5 para arquivos mp4/webm. Suporta autoplay (mudo), poster e controles.',
  icon: 'video',
  defaultColSpan: 8,
  mockConfig: {
    source:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Captura · setor sul',
    height: 280,
    controls: true,
    muted: true,
  },
  mockVariables: {},
  previewWidth: 460,
  previewHeight: 300,
  config_schema: [
    {
      name: 'source',
      label: 'URL ou dado fonte',
      description:
        'URL direta do vídeo (mp4/webm) ou external_id de um dado que carregue a URL.',
      field: 'string',
      placeholder: 'https://… ou nome_do_dado',
    },
    {
      name: 'poster',
      label: 'Imagem de capa (URL)',
      description: 'Imagem mostrada antes do play.',
      field: 'string',
      placeholder: 'https://…/thumb.jpg',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima do player.',
      field: 'string',
      placeholder: 'ex.: Captura · setor sul',
    },
    {
      name: 'height',
      label: 'Altura (px)',
      description: 'Altura visível em pixels.',
      field: 'number',
      min: 120,
      max: 720,
      step: 20,
      default: 280,
      unit: 'px',
    },
    {
      name: 'autoplay',
      label: 'Tocar automaticamente',
      description: 'Liga autoplay (sempre em mudo para satisfazer o navegador).',
      field: 'boolean',
      default: false,
    },
    {
      name: 'muted',
      label: 'Mudo',
      description: 'Mantém o áudio silenciado mesmo após o operador clicar play.',
      field: 'boolean',
      default: true,
    },
    {
      name: 'controls',
      label: 'Mostrar controles',
      description: 'Exibe a barra de controles do navegador.',
      field: 'boolean',
      default: true,
    },
  ],
});

export { VideoPlayer };
