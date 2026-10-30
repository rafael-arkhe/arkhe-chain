'use client';

/**
 * Container Group — Sprint Wave D.4 (2026-05-23).
 *
 * Wrapper que agrupa N widgets-filhos em um bloco rotulado com toggle
 * de collapse. Paridade leve com o "Basic container" do Slate (sem o
 * cross-cutting de Repeating/Split/Tabbed que já vivem em outros
 * widgets do registry).
 *
 * Como o registry atual não suporta children-by-config aninhados pelo
 * Inspetor (operador adiciona widgets soltos no canvas e o
 * `container-group` apenas RECONHECE quais ids ele agrega), aceitamos:
 *   - children_ids: array de IDs de outros widgets do mesmo painel
 *   - placeholder_text: o que mostrar quando a lista está vazia
 *
 * O componente NÃO RENDERIZA os filhos (eles já são montados pelo
 * canvas do Workshop). Aqui ele exibe o TÍTULO + um "anchor" visual
 * que o operador entende como "estes ids fazem parte do grupo X".
 *
 * Em uso live (painel publicado em /workshop/view/...), o componente
 * apenas se mantém como um "card de seção" — uma forma leve mas honesta
 * do conceito de container em UI atual.
 */
import * as React from 'react';
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  title?: string;
  children_ids?: string[] | string;
  placeholder_text?: string;
  initially_collapsed?: boolean;
};

function readChildren(cfg: Cfg): string[] {
  const raw = cfg.children_ids;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string');
    } catch {
      // CSV fallback
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return [];
}

function ContainerGroup({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const childIds = readChildren(cfg);
  const [collapsed, setCollapsed] = React.useState(!!cfg.initially_collapsed);

  return (
    <section
      className="bg-white border border-border-light flex flex-col"
      data-testid="container-group-widget"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        data-testid="container-group-toggle"
        aria-expanded={!collapsed}
        className="h-8 px-2.5 border-b border-border-light bg-canvas-light flex items-center gap-2 text-left hover:bg-raised-light"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
        )}
        <FolderTree className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="text-h3 font-semibold flex-1 truncate">
          {cfg.title ?? 'Seção'}
        </p>
        <span
          className="text-caption font-mono text-muted-on-light"
          data-testid="container-group-count"
        >
          {childIds.length} {childIds.length === 1 ? 'widget' : 'widgets'}
        </span>
      </button>

      {!collapsed && (
        <div
          className="p-3 flex flex-col gap-2"
          data-testid="container-group-body"
        >
          {childIds.length === 0 ? (
            <p
              className="text-small text-muted-on-light italic"
              data-testid="container-group-empty"
            >
              {cfg.placeholder_text ??
                'Vincule IDs de widgets que pertencem a esta seção.'}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {childIds.map((id, i) => (
                <li
                  key={`${id}-${i}`}
                  data-testid={`container-group-child-${i}`}
                  className="text-caption font-mono text-text-on-light bg-canvas-light border border-border-light px-1.5 py-0.5"
                >
                  {id}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

registerWidget('container_group', ContainerGroup, {
  group: 'content',
  label: 'Grupo de widgets',
  description:
    'Cabeçalho de seção colapsável que agrupa visualmente um conjunto de widgets do painel.',
  icon: 'folder-tree',
  defaultColSpan: 12,
  mockConfig: {
    title: 'Identificação',
    children_ids: ['identificacao_basica', 'endereco_principal', 'documentos'],
    placeholder_text: 'Adicione os widgets desta seção.',
  } satisfies Cfg,
  mockVariables: {},
  config_schema: [
    {
      name: 'title',
      label: 'Título da seção',
      description: 'Aparece no cabeçalho do agrupamento.',
      field: 'string',
      placeholder: 'ex.: Identificação',
    },
    {
      name: 'children_ids',
      label: 'IDs dos widgets agrupados (JSON ou separados por vírgula)',
      description:
        'Lista dos identificadores dos widgets que pertencem a este grupo.',
      field: 'string',
      placeholder: '["id1","id2"] ou id1, id2',
    },
    {
      name: 'placeholder_text',
      label: 'Texto quando vazio',
      description: 'Mensagem mostrada se nenhum widget está vinculado.',
      field: 'string',
      placeholder: 'ex.: Adicione os widgets desta seção.',
    },
    {
      name: 'initially_collapsed',
      label: 'Iniciar recolhido',
      description: 'Se ligado, o operador precisa clicar para expandir.',
      field: 'boolean',
      default: false,
    },
  ],
});

export { ContainerGroup };
