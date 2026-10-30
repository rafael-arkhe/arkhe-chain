'use client';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = { content?: string; title?: string };

/** Markdown enxuto: títulos `#`/`##`/`###`, `**bold**`, `*itálico*`, links, quebras de
 *  linha e `${var}`. Sem lista/código/tabela (usar uma lib se precisar). */
function MarkdownV2({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const text = (cfg.content ?? '').replace(/\$\{(\w+)\}/g, (_m, k: string) => {
    const v = variables[k];
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
  // inline (negrito/itálico/link) primeiro; DEPOIS quebra por linha p/ detectar títulos.
  const inline = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>',
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>'); // itálico: sobra dos `*` que não são `**`
  const html = inline
    .split('\n')
    .map((line) => {
      const h = /^(#{1,3})\s+(.*)$/.exec(line);
      if (h) {
        const lvl = h[1].length;
        const cls =
          lvl === 1
            ? 'block text-[16px] font-semibold text-text-on-light mt-1 mb-1.5'
            : lvl === 2
              ? 'block text-[11px] uppercase tracking-wider font-semibold text-muted-on-light mt-4 mb-1'
              : 'block text-[12px] font-semibold text-text-on-light mt-2';
        return `<span class="${cls}">${h[2]}</span>`;
      }
      return line === '' ? '<span class="block h-2"></span>' : `${line}<br/>`;
    })
    .join('');
  return (
    <div className="bg-white border border-border-light p-3 text-[12px] leading-relaxed">
      {cfg.title && (
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-on-light mb-2">
          {cfg.title}
        </p>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
const MARKDOWN_SCHEMA = [
  {
    name: 'title',
    label: 'Título',
    description: 'Cabeçalho pequeno acima do texto (opcional).',
    field: 'string' as const,
    placeholder: 'ex.: NOTA OPERACIONAL',
  },
  {
    name: 'content',
    label: 'Conteúdo (texto formatado)',
    description:
      'Aceita **negrito**, quebras de linha e ${nome_do_dado} pra mostrar valores em tempo real.',
    field: 'string' as const,
    placeholder: 'Texto em **negrito** com ${entity_id}…',
  },
];

const MARKDOWN_MOCK = {
  title: 'NOTA OPERACIONAL',
  content:
    'Operação **Aurora** entrou em estágio de monitoramento.\nPróxima revisão: ${proxima_revisao}.',
};
const MARKDOWN_MOCK_VARS = { proxima_revisao: '24/05 às 18h' };

registerWidget('markdown_v2', MarkdownV2, {
  group: 'content',
  label: 'Texto Markdown',
  description: 'Bloco de texto com negrito, quebras de linha e valores de dados interpolados ao vivo.',
  icon: 'file-text',
  defaultColSpan: 10,
  config_schema: MARKDOWN_SCHEMA,
  mockConfig: MARKDOWN_MOCK,
  mockVariables: MARKDOWN_MOCK_VARS,
});
registerWidget('markdown', MarkdownV2, {
  group: 'content',
  label: 'Markdown (legado)',
  description: 'Versão antiga do bloco de texto — mantida pra compatibilidade com painéis existentes.',
  icon: 'file-text',
  config_schema: MARKDOWN_SCHEMA,
  mockConfig: MARKDOWN_MOCK,
  mockVariables: MARKDOWN_MOCK_VARS,
  hidden: true,
});
