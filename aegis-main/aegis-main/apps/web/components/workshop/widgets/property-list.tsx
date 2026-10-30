'use client';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  title?: string;
  /** external_id da variável `objectAggregation`/`function` que devolve
   *  um objeto plano `{ k: v }`, ou caminho `var.path` (ex: "selected_node.properties"). */
  source: string;
  /** Lista fixa de chaves a mostrar (na ordem). Default: todas. */
  keys?: string[];
};

function pick(
  variables: Record<string, unknown>,
  bindings: Record<string, unknown>,
  source: string,
): Record<string, unknown> {
  // Suporta path "a.b.c" pra navegar dentro da variable. O objeto SELECIONADO
  // (ex.: `item_selecionado` de um select_change) vive numa BINDING, não numa
  // variável declarada — e `variables` exclui bindings quando há backend. Por isso
  // cai pra `bindings[raiz]` quando a variável não tem a raiz (detalhe de seleção).
  // Robustez: source pode vir undefined/não-string (widget sem `source`
  // configurado, ou config malformado do cliente) → objeto vazio, NUNCA crash.
  if (typeof source !== 'string' || !source) return {};
  const parts = source.split('.');
  let cur: unknown =
    parts[0] in variables ? variables[parts[0]] : bindings[parts[0]];
  for (let i = 1; i < parts.length; i++) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[parts[i]];
    } else {
      return {};
    }
  }
  return (cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : {});
}

function PropertyList({ config, variables, bindings }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const obj = pick(variables, bindings ?? {}, cfg.source);
  // `keys` aceita 3 formatos: array (canônico), string CSV (formato dos templates
  // criados via API), ou undefined (cai para chaves do objeto).
  const rawKeys: unknown = cfg.keys;
  let keys: string[];
  if (Array.isArray(rawKeys) && rawKeys.length > 0) {
    keys = rawKeys as string[];
  } else if (typeof rawKeys === 'string' && rawKeys.trim()) {
    keys = rawKeys.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    // undefined / null / '' / [] → mostra TODAS as keys do objeto
    keys = Object.keys(obj);
  }
  return (
    <div className="bg-white border border-border-light">
      {cfg.title && (
        <div className="h-8 px-3 border-b border-border-light flex items-center bg-raised-light/40">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">{cfg.title}</p>
        </div>
      )}
      <dl className="px-3 py-2 space-y-1 text-[11px]">
        {keys.length === 0 && (
          <p className="italic text-muted-on-light">Sem dados.</p>
        )}
        {keys.map((k) => (
          <div key={k} className="flex justify-between gap-3 border-b border-border-light/40 py-1">
            <dt className="text-muted-on-light uppercase tracking-wider text-[10px]">{k}</dt>
            <dd className="font-mono text-right truncate max-w-[60%]" title={String(obj[k] ?? '')}>
              {obj[k] == null
                ? '—'
                : typeof obj[k] === 'object'
                  ? JSON.stringify(obj[k])
                  : String(obj[k])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
registerWidget('property_list', PropertyList, {
  group: 'data',
  label: 'Lista de propriedades (chave/valor)',
  description: 'Mostra pares chave/valor de um objeto. Aceita caminhos com ponto (ex.: `selecionado.propriedades`).',
  icon: 'list',
  defaultColSpan: 5,
  mockConfig: { title: 'Propriedades', source: 'props' },
  mockVariables: {
    props: {
      nome: 'José da Silva',
      cpf: '123.456.789-00',
      placa: 'BRA2E19',
      cidade: 'São Paulo',
      status: 'monitorado',
    },
  },
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho do bloco (opcional).',
      field: 'string',
      placeholder: 'ex.: Propriedades',
    },
    {
      name: 'source',
      label: 'Origem do dado',
      description:
        'Dado que retorna um objeto. Use o sufixo opcional pra navegar (ex.: `properties` mostra só as propriedades).',
      field: 'variable-path',
    },
    {
      name: 'keys',
      label: 'Propriedades visíveis',
      description:
        'Propriedades a exibir, em ordem. Escolhidas do contrato do tipo do dado de origem; vazio mostra todas.',
      field: 'property',
      multi: true,
      typeFrom: 'source',
    },
  ],
});
