'use client';

/**
 * Audio Player — par sonoro do `video_player`. Player HTML5 simples a
 * partir de uma URL direta (`config.url`) OU de uma propriedade do
 * objeto/objeto ativo (`config.source_field`, resolvido contra a
 * variable indicada por `config.source`, ou contra o objeto ativo).
 *
 * Quando `config.transcript_field` aponta para uma propriedade de texto,
 * a transcrição é mostrada abaixo, somente leitura, em área rolável.
 *
 * Casos multi-domínio: replay de chamada gravada, áudio de denúncia,
 * captura de campo, nota de voz anexada a uma ocorrência. O widget não
 * sabe O QUE é o áudio — isso vem da ontologia.
 *
 * Config:
 *   - url?: string             URL direta do áudio (mp3/ogg/wav/m4a)
 *   - source?: string          external_id de variable (objeto ou {url})
 *   - source_field?: string    propriedade do objeto que carrega a URL
 *   - transcript_field?: string propriedade com a transcrição (texto)
 *   - title?: string           cabeçalho acima do player
 *   - autoplay?: boolean        começa sem clique (default false)
 *   - controls?: boolean        barra de controle (default true)
 */
import * as React from 'react';
import { AudioLines } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';

type Cfg = {
  url?: string;
  source?: string;
  source_field?: string;
  transcript_field?: string;
  title?: string;
  autoplay?: boolean;
  controls?: boolean;
};

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/') || s.startsWith('data:');
}

/** Resolve a variable-fonte (ou objeto ativo) em um Record consultável. */
function resolveObject(
  cfg: Cfg,
  variables: Record<string, unknown>,
): Record<string, unknown> | null {
  const src = (cfg.source ?? '').trim();
  const raw = src ? variables[src] : variables.object ?? variables.objeto;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    // Suporta envelope {properties: {...}} comum nos object cards.
    if (obj.properties && typeof obj.properties === 'object') {
      return obj.properties as Record<string, unknown>;
    }
    return obj;
  }
  return null;
}

function resolveUrl(cfg: Cfg, variables: Record<string, unknown>): string | null {
  // 1) URL direta tem prioridade.
  const direct = (cfg.url ?? '').trim();
  if (direct && isUrl(direct)) return direct;

  const obj = resolveObject(cfg, variables);

  // 2) propriedade indicada por source_field.
  const field = (cfg.source_field ?? '').trim();
  if (field && obj) {
    const v = obj[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  // 3) fallback: variable que é string ou {url} (igual ao video_player).
  const src = (cfg.source ?? '').trim();
  if (src) {
    const raw = variables[src];
    if (typeof raw === 'string' && isUrl(raw)) return raw;
    if (raw && typeof raw === 'object' && typeof (raw as { url?: unknown }).url === 'string') {
      return (raw as { url: string }).url;
    }
  }
  return null;
}

function resolveTranscript(cfg: Cfg, variables: Record<string, unknown>): string | null {
  const field = (cfg.transcript_field ?? '').trim();
  if (!field) return null;
  const obj = resolveObject(cfg, variables);
  const v = obj?.[field];
  if (typeof v === 'string' && v.trim()) return v;
  return null;
}

function AudioPlayer({ config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const url = resolveUrl(cfg, variables);
  const transcript = resolveTranscript(cfg, variables);
  const autoplay = !!cfg.autoplay;
  const controls = cfg.controls !== false;

  return (
    <div
      className="bg-white border border-border-light flex flex-col"
      data-testid="audio-player-widget"
    >
      <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
        <AudioLines className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
          {cfg.title || t('audioPlayer.title')}
        </p>
      </header>
      <div className="p-3 flex flex-col gap-2">
        {url ? (
          <audio
            data-testid="audio-player-element"
            src={url}
            autoPlay={autoplay}
            controls={controls}
            preload="metadata"
            className="w-full"
          >
            <track kind="captions" />
          </audio>
        ) : (
          <p
            className="text-small text-muted-on-light italic"
            data-testid="audio-player-empty"
          >
            {t('audioPlayer.empty')}
          </p>
        )}
        {transcript && (
          <div
            data-testid="audio-player-transcript"
            className="border border-border-light bg-canvas-light p-2 max-h-40 overflow-y-auto scrollbar-hide"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono mb-1">
              {t('audioPlayer.transcript')}
            </p>
            <p className="text-[12px] text-text-on-light whitespace-pre-wrap leading-relaxed">
              {transcript}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

registerWidget('audio_player', AudioPlayer, {
  group: 'content',
  label: 'Reprodutor de áudio',
  description:
    'Player HTML5 para arquivos de áudio (mp3/ogg/wav). Lê a URL de uma propriedade do objeto e mostra a transcrição quando disponível.',
  icon: 'audio-lines',
  defaultColSpan: 6,
  mockConfig: {
    title: 'Chamada · setor sul',
    url: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3',
  },
  mockVariables: {},
  previewWidth: 420,
  previewHeight: 160,
  config_schema: [
    {
      name: 'url',
      label: 'URL direta (opcional)',
      description: 'URL do áudio (mp3/ogg/wav). Tem prioridade sobre a propriedade.',
      field: 'string',
      placeholder: 'https://…/audio.mp3',
    },
    {
      name: 'source',
      label: 'Objeto fonte',
      description: 'Variable do objeto que carrega a URL e a transcrição.',
      field: 'variable-ref',
    },
    {
      name: 'source_field',
      label: 'Propriedade da URL',
      description: 'Propriedade do objeto que contém a URL do áudio.',
      field: 'property',
      typeFrom: 'source',
      placeholder: 'audio_url',
    },
    {
      name: 'transcript_field',
      label: 'Propriedade da transcrição',
      description: 'Propriedade de texto com a transcrição (somente leitura).',
      field: 'property',
      typeFrom: 'source',
      placeholder: 'transcricao',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima do player.',
      field: 'string',
      placeholder: 'ex.: Chamada · setor sul',
    },
    {
      name: 'autoplay',
      label: 'Tocar automaticamente',
      description: 'Liga autoplay ao carregar (o navegador pode bloquear).',
      field: 'boolean',
      default: false,
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

export { AudioPlayer };
