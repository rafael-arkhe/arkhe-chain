'use client';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  label?: string;
  /** external_id da variável agregada (ex: ObjectAggregation count). */
  source: string;
  unit?: string;
  hint?: string;
};

/** Card com 1 número grande + label. Lê o valor da variable agregada. */
function Counter({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const raw = variables[cfg.source];
  const num = typeof raw === 'number' ? raw : raw != null ? Number(raw) : null;
  return (
    <div className="bg-white border border-border-light p-3 flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {cfg.label ?? cfg.source}
      </p>
      <p className="text-[28px] font-semibold tabular-nums leading-tight">
        {num == null || Number.isNaN(num) ? '—' : num.toLocaleString('pt-BR')}
        {cfg.unit && (
          <span className="text-[14px] text-muted-on-light ml-1.5">{cfg.unit}</span>
        )}
      </p>
      {cfg.hint && <p className="text-[10px] text-muted-on-light">{cfg.hint}</p>}
    </div>
  );
}
registerWidget('counter', Counter, {
  group: 'viz',
  label: 'Contador numérico',
  description: 'Métrica única em fonte grande — mostra o resultado de uma contagem ou agregação de dados.',
  icon: 'hash',
  defaultColSpan: 4,
  mockConfig: {
    label: 'BOs · 24h',
    source: 'count_24h',
    unit: '',
    hint: 'região metropolitana',
  },
  mockVariables: { count_24h: 142 },
  config_schema: [
    {
      name: 'label',
      label: 'Rótulo',
      description: 'Título acima do número. Quando vazio, usa o identificador do dado.',
      field: 'string',
      placeholder: 'ex.: BOs · 24h',
    },
    {
      name: 'source',
      label: 'Dado a exibir',
      description: 'ID do dado agregado que produz o número exibido.',
      field: 'variable-ref',
    },
    {
      name: 'unit',
      label: 'Unidade',
      description: 'Sufixo curto exibido ao lado do número (ex.: "%", "km", "/h").',
      field: 'string',
      placeholder: 'ex.: km',
    },
    {
      name: 'hint',
      label: 'Texto auxiliar',
      description: 'Linha pequena abaixo do número, pra dar contexto à métrica.',
      field: 'string',
    },
  ],
});
