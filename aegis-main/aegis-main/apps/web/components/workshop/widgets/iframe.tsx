'use client';

/**
 * Iframe — Sprint 5 do parity roadmap.
 *
 * Embed externo via iframe. Por segurança, valida host contra allowlist
 * configurada (default: hosts internos da AEGIS + serviços públicos
 * comuns). Hosts não aprovados renderizam fallback de erro.
 *
 * Onda 5 (Safe Tag + AEGIS): caminho SAME-ORIGIN (raiz-relativo, validado por
 * ``isSameOriginPath`` — o mesmo leitor do ``EmbedFrame`` 3b) é sempre
 * permitido e NÃO leva sandbox: é a nossa própria origem servida em tile
 * (telas de portaria no Início do condomínio), e o cookie httpOnly do
 * operador precisa fluir p/ o iframe e p/ o EventSource /api/stream/live.
 */
import * as React from 'react';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { isSameOriginPath } from '@/lib/pages/embed-defaults';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  url?: string;
  title?: string;
  height?: number;
  /** Hosts permitidos (CSV). Vazio = default allowlist. */
  allowed_hosts?: string;
  /** Centro do mapa `lat,lng` — vira `?center=` na URL do iframe. */
  map_center?: string;
  /** Cerca: um `lat,lng` por LINHA (textarea) — vira `?fence=lat,lng;lat,lng;…`.
   *  Aceita também `;` na mesma linha (tolerante ao colar o formato compacto). */
  map_fence?: string;
};

const DEFAULT_ALLOWLIST = [
  'docs.aegis.local',
  'grafana.local',
  'www.google.com',
  'www.openstreetmap.org',
  'www.youtube.com',
  'youtube.com',
  'player.vimeo.com',
];

// Exemplo REAL (cerca `itap_orv` do livetracker legado + centróide) usado como
// DEFAULT dos campos de mapa — o operador VÊ o formato esperado (um "lat, lng"
// por linha; anel fechado) e usa/edita. Aparece no editor via `?? f.default`.
const DEMO_MAP_CENTER = '-23.5687, -48.0162';
const DEMO_MAP_FENCE = [
  '-23.5703357, -48.0186513', '-23.5706897, -48.0184474', '-23.5706110, -48.0182436',
  '-23.5713682, -48.0178868', '-23.5715084, -48.0178198', '-23.5717960, -48.0175730',
  '-23.5705078, -48.0155292', '-23.5710732, -48.0152610', '-23.5699374, -48.0121550',
  '-23.5667660, -48.0135443', '-23.5664095, -48.0126190', '-23.5660260, -48.0127880',
  '-23.5660407, -48.0128255', '-23.5669504, -48.0152073', '-23.5659916, -48.0156579',
  '-23.5666431, -48.0164411', '-23.5657408, -48.0173531', '-23.5676560, -48.0196866',
  '-23.5679854, -48.0194345', '-23.5702029, -48.0184367', '-23.5703357, -48.0186513',
].join('\n');

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function Iframe({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const allowed = cfg.allowed_hosts
    ? cfg.allowed_hosts.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWLIST;

  if (!cfg.url) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Configure `url` no Inspetor.
      </div>
    );
  }

  const sameOrigin = isSameOriginPath(cfg.url);
  const host = hostOf(cfg.url);
  if (!sameOrigin && (!host || !allowed.some((h) => host === h || host.endsWith('.' + h)))) {
    return (
      <div className="bg-white border border-danger/40 bg-danger/5 p-3 text-[11px] flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" strokeWidth={1.5} />
        <div>
          <p className="font-semibold text-danger">Host não aprovado</p>
          <p className="text-muted-on-light mt-1">
            `{host || cfg.url}` não está em `allowed_hosts`. Para permitir, adicione no Inspetor.
          </p>
        </div>
      </div>
    );
  }

  // Monta a query da URL a partir dos campos SEPARADOS (centro + cerca). O centro
  // é `lat,lng`; a cerca é uma linha `lat,lng` por vértice (textarea) → junta com
  // `;` no formato que o livemap lê (`fence=lat,lng;lat,lng;…`). Tolerante a `;`
  // ou vírgula-de-linha se o operador colar o formato compacto.
  // Fallback ao DEFAULT só p/ iframes de MAPA (livemap/residentmap): o `default`
  // do config_schema é DISPLAY-only — não persiste no save sem o operador editar
  // o campo. Sem isto, ele vê a cerca no editor, salva, e o iframe carrega SEM
  // ela. `??` (não `||`): campo VAZIO ('' após limpar de propósito) vence → dá
  // pra tirar a cerca. Não-mapa não recebe params.
  const isMapEmbed = /livemap|residentmap/i.test(cfg.url || '');
  const centerSrc = cfg.map_center ?? (isMapEmbed ? DEMO_MAP_CENTER : '');
  const fenceSrc = cfg.map_fence ?? (isMapEmbed ? DEMO_MAP_FENCE : '');
  const qparts: string[] = [];
  const center = centerSrc.replace(/\s+/g, ''); // "lat,lng" sem espaços
  if (center) qparts.push('center=' + encodeURIComponent(center));
  const fencePts = fenceSrc
    .split(/[\n;]+/)
    .map((l) => l.replace(/\s+/g, '')) // cada vértice "lat,lng" limpo
    .filter(Boolean);
  if (fencePts.length) qparts.push('fence=' + encodeURIComponent(fencePts.join(';')));
  const q = qparts.join('&');
  const finalUrl = q ? cfg.url + (cfg.url.includes('?') ? '&' : '?') + q : cfg.url;

  return (
    <div className="bg-canvas-light border border-border-light flex flex-col">
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
            {cfg.title}
          </p>
          <a
            href={finalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            abrir <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          </a>
        </header>
      )}
      <iframe
        src={finalUrl}
        title={cfg.title ?? cfg.url}
        style={{ height: cfg.height ?? 360 }}
        sandbox={sameOrigin ? undefined : 'allow-scripts allow-same-origin allow-popups'}
        referrerPolicy="no-referrer"
        data-testid="iframe-widget"
      />
    </div>
  );
}

registerWidget('iframe', Iframe, {
  group: 'content',
  label: 'Página embarcada',
  description:
    'Embute uma página externa em ambiente isolado, restrita aos sites permitidos, ou um caminho same-origin da plataforma (ex.: /portaria/livemap/index.html). Útil para dashboards, docs e telas operacionais.',
  icon: 'frame',
  defaultColSpan: 10,
  mockConfig: {
    url: 'https://www.openstreetmap.org/export/embed.html?bbox=-46.65%2C-23.56%2C-46.62%2C-23.53',
    title: 'OSM · Av. Paulista',
    height: 280,
  },
  mockVariables: {},
  previewWidth: 460,
  previewHeight: 340,
  config_schema: [
    { name: 'url', label: 'Endereço da página', field: 'string', placeholder: 'https://… ou /caminho/same-origin' },
    { name: 'title', label: 'Título', field: 'string', placeholder: 'OSM · Av. Paulista' },
    { name: 'height', label: 'Altura (px)', field: 'number', min: 80, max: 1200, step: 10, default: 360, unit: 'px' },
    { name: 'allowed_hosts', label: 'Sites permitidos (separados por vírgula)', field: 'string', placeholder: 'docs.aegis.local, grafana.local' },
    { name: 'map_center', label: 'Centro do mapa (lat, lng)', field: 'string', default: DEMO_MAP_CENTER, placeholder: DEMO_MAP_CENTER },
    { name: 'map_fence', label: 'Cerca do condomínio — um "lat, lng" por linha', field: 'textarea', default: DEMO_MAP_FENCE, placeholder: '-23.5703357, -48.0186513\n-23.5706897, -48.0184474\n…' },
  ],
});
