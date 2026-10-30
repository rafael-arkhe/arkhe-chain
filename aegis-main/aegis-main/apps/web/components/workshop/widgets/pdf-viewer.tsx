'use client';

/**
 * PDF Viewer — Wave G.3 (2026-05-23).
 *
 * Renderiza um PDF via viewer nativo do navegador (object/iframe com
 * fragmento `#page=N&toolbar=Y/N`). Sem dependências externas — zero
 * npm install. Pesquisa R2 `slate/widgets/advanced.md`.
 *
 * Config:
 *   - source:           URL direta do PDF ou external_id de variable
 *   - page_default?:    pagina inicial (default 1)
 *   - show_toolbar?:    bool (default true)
 *   - download_enabled?: bool (default true) — quando false, força
 *                       `#toolbar=0` E remove o botão "abrir" do header
 *   - title?:           cabeçalho acima do viewer
 *   - height?:          px (default 360)
 *
 * UX:
 *   - Estado vazio: instrução pra configurar
 *   - Loading skeleton enquanto o iframe não carrega
 *   - Error state se a URL é claramente invalida (não-string, não-http)
 */
import * as React from 'react';
import { FileText, AlertCircle, ExternalLink } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  source?: string;
  page_default?: number;
  show_toolbar?: boolean;
  download_enabled?: boolean;
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
  // caminho dotted (ex.: "item.properties.documento_url") — mídia POR OBJETO.
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

function isLikelyPdfUrl(url: string): boolean {
  // Aceita data: URIs com mime pdf; URL absoluta; ou path local. Não exige
  // sufixo .pdf (URLs assinadas costumam ter querystring sem extensão).
  if (url.startsWith('data:application/pdf')) return true;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return true;
  return false;
}

function PdfViewer({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const url = resolveSource(cfg, variables);
  const page = Number.isFinite(cfg.page_default) && (cfg.page_default ?? 0) > 0 ? cfg.page_default : 1;
  const showToolbar = cfg.show_toolbar !== false;
  const downloadEnabled = cfg.download_enabled !== false;
  const effectiveToolbar = showToolbar && downloadEnabled;
  const height = typeof cfg.height === 'number' ? cfg.height : 360;

  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    // Reset loading state whenever source changes.
    setLoaded(false);
  }, [url]);

  if (!url) {
    return (
      <div
        className="bg-white border border-border-light p-3 text-caption text-muted-on-light italic flex items-center gap-2"
        data-testid="pdf-viewer-empty"
      >
        <FileText className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        Configure a URL ou o dado fonte do PDF.
      </div>
    );
  }

  if (!isLikelyPdfUrl(url)) {
    return (
      <div
        className="bg-white border border-danger/40 bg-danger/5 p-3 flex items-start gap-2"
        data-testid="pdf-viewer-error"
      >
        <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" strokeWidth={1.5} />
        <div className="text-caption">
          <p className="font-semibold text-danger">URL inválida</p>
          <p className="text-muted-on-light mt-1">
            Esperado http(s):// ou data:application/pdf. Recebido: <code className="font-mono">{url}</code>
          </p>
        </div>
      </div>
    );
  }

  const fragment = `#page=${page}&toolbar=${effectiveToolbar ? 1 : 0}`;
  const src = `${url}${fragment}`;

  return (
    <div
      className="bg-canvas-light border border-border-light flex flex-col"
      data-testid="pdf-viewer-widget"
    >
      {cfg.title && (
        <header className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2 shrink-0">
          <FileText className="w-3 h-3 text-primary" strokeWidth={1.5} />
          <p className="text-caption uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
            {cfg.title}
          </p>
          {downloadEnabled && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir PDF em nova aba"
              className="text-caption text-primary hover:underline flex items-center gap-1"
              data-testid="pdf-viewer-open"
            >
              abrir <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            </a>
          )}
        </header>
      )}
      <div className="relative" style={{ height }}>
        {!loaded && (
          <div
            className="absolute inset-0 bg-canvas-light flex items-center justify-center"
            data-testid="pdf-viewer-skeleton"
            aria-hidden="true"
          >
            <div className="flex items-center gap-2 text-caption text-muted-on-light font-mono">
              <span className="inline-block w-3 h-3 border-l border-primary animate-spin" />
              carregando PDF…
            </div>
          </div>
        )}
        <iframe
          src={src}
          title={cfg.title ?? 'Visualizador de PDF'}
          data-testid="pdf-viewer-iframe"
          onLoad={() => setLoaded(true)}
          style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

registerWidget('pdf_viewer', PdfViewer, {
  group: 'content',
  label: 'Visualizador de PDF',
  description:
    'Mostra um PDF embarcado no painel. Permite definir pagina inicial e esconder a barra de ferramentas do navegador.',
  icon: 'file',
  defaultColSpan: 8,
  mockConfig: {
    source: 'https://www.africau.edu/images/default/sample.pdf',
    title: 'Relatório de operação · amostra',
    page_default: 1,
    show_toolbar: true,
    download_enabled: true,
    height: 320,
  } satisfies Cfg,
  mockVariables: {},
  previewWidth: 460,
  previewHeight: 340,
  config_schema: [
    {
      name: 'source',
      label: 'URL ou dado fonte',
      description:
        'URL direta do PDF (https://...) ou external_id de uma variável que carregue a URL.',
      field: 'string',
      placeholder: 'https://… ou nome_do_dado',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho acima do visualizador.',
      field: 'string',
      placeholder: 'ex.: Relatório · amostra',
    },
    {
      name: 'page_default',
      label: 'Página inicial',
      description: 'Número da página exibida ao carregar.',
      field: 'number',
      min: 1,
      max: 9999,
      step: 1,
      default: 1,
    },
    {
      name: 'show_toolbar',
      label: 'Mostrar barra de ferramentas',
      description: 'Exibe a barra padrão do navegador (zoom, navegação, busca).',
      field: 'boolean',
      default: true,
    },
    {
      name: 'download_enabled',
      label: 'Permitir abrir/baixar',
      description:
        'Quando desligado, esconde o botão "abrir em nova aba" e força toolbar=0 (some o botão de download).',
      field: 'boolean',
      default: true,
    },
    {
      name: 'height',
      label: 'Altura (px)',
      description: 'Altura visível em pixels.',
      field: 'number',
      min: 120,
      max: 1200,
      step: 20,
      default: 360,
      unit: 'px',
    },
  ],
});

export { PdfViewer };
