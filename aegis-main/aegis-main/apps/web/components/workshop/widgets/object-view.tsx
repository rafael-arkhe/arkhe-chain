'use client';

/**
 * Object View — Sprint 3 do parity roadmap.
 *
 * Widget genérico pra mostrar detalhes de UM objeto em layout
 * config-driven (header opcional + grupos de fields). Substitui o
 * `property_list` quando o operador quer formatação mais elaborada
 * (groups, types específicos por field, etc).
 *
 * Config:
 *   - `source: string`   external_id da variable que produz o objeto
 *   - `title?: string`   header opcional no topo
 *   - `groups`: array de seções
 *       - `title`: cabeçalho da seção
 *       - `fields[]`: { key, label, type? }
 *   - `show_unknown`: bool — quando true, mostra chaves do objeto que
 *     não estão em nenhum group como seção "Outros"
 *
 * Mock: pessoa com 2 grupos (Identidade · Contato).
 */
import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type FieldType = 'string' | 'number' | 'date' | 'url' | 'boolean';

type FieldDef = {
  key: string;
  label: string;
  type?: FieldType;
};

type GroupDef = {
  title: string;
  fields: FieldDef[];
};

type Cfg = {
  source?: string;
  title?: string;
  groups?: GroupDef[];
  show_unknown?: boolean;
};

/**
 * Normaliza `groups` em array. Aceita array (canônico, do builder visual
 * 'object-groups') ou string JSON (apps salvos quando o campo era 'string').
 * Sem isto, uma string estouraria `.map` no render.
 */
function normalizeGroups(raw: unknown): GroupDef[] {
  if (Array.isArray(raw)) return raw as GroupDef[];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as GroupDef[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function pickObject(
  variables: Record<string, unknown>,
  bindings: Record<string, unknown>,
  source: string | undefined,
): Record<string, unknown> | null {
  if (!source) return null;
  // Objeto selecionado vive numa BINDING (não variável declarada) → fallback.
  const v = source in variables ? variables[source] : bindings[source];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function FieldValue({ value, type }: { value: unknown; type?: FieldType }) {
  if (value == null || value === '')
    return <span className="text-muted-on-light">—</span>;
  if (type === 'boolean')
    return <>{value ? 'sim' : 'não'}</>;
  if (type === 'number' && typeof value === 'number')
    return <>{value.toLocaleString('pt-BR')}</>;
  if (type === 'date' && typeof value === 'string') {
    try {
      return <>{new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>;
    } catch {
      return <>{value}</>;
    }
  }
  if (type === 'url' && typeof value === 'string') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1"
      >
        abrir
        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
      </a>
    );
  }
  if (typeof value === 'object') return <code className="text-[10px]">{JSON.stringify(value)}</code>;
  return <>{String(value)}</>;
}

function ObjectView({ config, variables, bindings }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const obj = pickObject(variables, bindings ?? {}, cfg.source);

  if (!obj) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Sem objeto pra mostrar. Configure `source` (variable) no Inspetor.
      </div>
    );
  }

  const groups = normalizeGroups(cfg.groups);
  const declaredKeys = new Set<string>();
  for (const g of groups) for (const f of g.fields) declaredKeys.add(f.key);
  const unknownKeys = Object.keys(obj).filter((k) => !declaredKeys.has(k));

  return (
    <div className="bg-white border border-border-light flex flex-col">
      {cfg.title && (
        <header className="h-9 px-3 border-b border-border-light bg-raised-light/40 flex items-center">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono">
            {cfg.title}
          </p>
        </header>
      )}
      <div className="divide-y divide-border-light/60">
        {groups.map((g, gi) => (
          <section key={`${g.title}-${gi}`} className="px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-2">
              {g.title}
            </p>
            <dl className="space-y-1.5">
              {g.fields.map((f) => (
                <div
                  key={f.key}
                  className="grid grid-cols-[120px_1fr] gap-2 items-baseline"
                >
                  <dt className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono">
                    {f.label}
                  </dt>
                  <dd className="text-[11px] text-text-on-light break-words">
                    <FieldValue value={obj[f.key]} type={f.type} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {cfg.show_unknown && unknownKeys.length > 0 && (
          <section className="px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold font-mono mb-2">
              Outros
            </p>
            <dl className="space-y-1.5">
              {unknownKeys.map((k) => (
                <div
                  key={k}
                  className="grid grid-cols-[120px_1fr] gap-2 items-baseline"
                >
                  <dt className="text-[10px] uppercase tracking-wider text-muted-on-light font-mono">
                    {k}
                  </dt>
                  <dd className="text-[11px] text-text-on-light break-words">
                    <FieldValue value={obj[k]} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

const MOCK_PERSON = {
  nome: 'José da Silva',
  cpf: '123.456.789-00',
  rg: '99.888.777-X',
  data_nascimento: '1982-03-17',
  email: 'jose.silva@example.com',
  telefone: '+55 11 99999-1234',
  endereco: 'Rua das Acácias, 142 · Vila Mariana, São Paulo · SP',
  ativo: true,
};

registerWidget('object_view', ObjectView, {
  group: 'data',
  label: 'Vista de objeto (detalhado)',
  description:
    'Detalhe estruturado de um objeto, agrupado em seções com formatação por campo (texto, número, data, link, sim/não).',
  icon: 'square-pen',
  defaultColSpan: 10,
  mockConfig: {
    source: 'obj',
    title: 'Detalhe da pessoa',
    groups: [
      {
        title: 'Identidade',
        fields: [
          { key: 'nome', label: 'Nome' },
          { key: 'cpf', label: 'CPF' },
          { key: 'rg', label: 'RG' },
          { key: 'data_nascimento', label: 'Nascimento', type: 'date' },
        ],
      },
      {
        title: 'Contato',
        fields: [
          { key: 'email', label: 'E-mail' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'endereco', label: 'Endereço' },
        ],
      },
    ],
    show_unknown: true,
  },
  mockVariables: { obj: MOCK_PERSON },
  previewWidth: 380,
  previewHeight: 460,
  config_schema: [
    {
      name: 'source',
      label: 'Objeto a exibir',
      description: 'Dado que retorna o objeto detalhado. Use o sufixo (ex.: `properties`) pra navegar.',
      field: 'variable-path',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho opcional exibido no topo do bloco.',
      field: 'string',
    },
    {
      name: 'show_unknown',
      label: 'Mostrar campos extras',
      description: 'Quando ligado, exibe seção "Outros" com campos do objeto que não estão em nenhum grupo.',
      field: 'boolean',
      default: false,
    },
    {
      name: 'groups',
      label: 'Grupos',
      description:
        'Seções com título; cada campo escolhe a propriedade pelo contrato do tipo do dado de origem. Tipos: texto, número, data, link, sim/não.',
      field: 'object-groups',
      typeFrom: 'source',
    },
  ],
});
