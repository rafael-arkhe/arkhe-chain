'use client';

/**
 * Dropdown — Sprint 5 do parity roadmap.
 * Select genérico que escreve em uma variable. Emite value_change.
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Workshop } from '@/lib/workshop/client';

type Option = { value: string; label: string };

type Cfg = {
  target?: string;
  label?: string;
  options?: Option[];
  placeholder?: string;
  /** Filtro AO VIVO: popula as opções com os valores DISTINTOS de `field`
   *  do ObjectSet `distinct_variable` (ou `distinct_object_type`). */
  field?: string;
  distinct_variable?: string;
  distinct_object_type?: string;
};

function Dropdown({ appId, config, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const target = cfg.target ?? '';
  const staticOptions = cfg.options ?? [];
  const [fetched, setFetched] = React.useState<Option[]>([]);
  const wantsLive = !!cfg.field && !!(cfg.distinct_variable || cfg.distinct_object_type) && staticOptions.length === 0;

  React.useEffect(() => {
    if (!wantsLive || !appId) return;
    let cancel = false;
    Workshop.distinctObjectSet(appId, {
      variable: cfg.distinct_variable,
      object_type: cfg.distinct_object_type,
      field: cfg.field as string,
    })
      .then((res) => { if (!cancel) setFetched((res.values || []).map((v) => ({ value: v, label: v }))); })
      .catch(() => { if (!cancel) setFetched([]); });
    return () => { cancel = true; };
  }, [appId, wantsLive, cfg.field, cfg.distinct_variable, cfg.distinct_object_type]);

  const options = staticOptions.length > 0 ? staticOptions : fetched;
  const current = target && typeof bindings[target] === 'string' ? (bindings[target] as string) : '';

  const onChange = (v: string) => {
    if (!target) return;
    setBinding(target, v);
    emit?.('value_change', { value: v, target });
  };

  if (!target) {
    return (
      <div className="bg-white border border-border-light p-2 text-[11px] text-muted-on-light italic">
        Configure `target` no Inspetor.
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-light p-2">
      {cfg.label && (
        <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold font-mono mb-1">
          {cfg.label}
        </label>
      )}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`dropdown-${target}`}
        className="w-full h-7 px-2 text-[11px] bg-canvas-light border border-border-light outline-none focus:border-primary"
      >
        <option value="">{cfg.placeholder ?? '— escolha —'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

registerWidget('dropdown', Dropdown, {
  group: 'data',
  label: 'Lista suspensa',
  description:
    'Lista suspensa que grava a opção escolhida em um dado. Use para filtros como UF, partido ou status.',
  icon: 'chevrons-down',
  defaultColSpan: 5,
  mockConfig: {
    label: 'UF',
    target: 'uf',
    options: [
      { value: 'SP', label: 'São Paulo' },
      { value: 'RJ', label: 'Rio de Janeiro' },
      { value: 'MG', label: 'Minas Gerais' },
      { value: 'BA', label: 'Bahia' },
    ],
    placeholder: '— todas —',
  },
  mockVariables: {},
  previewWidth: 280,
  previewHeight: 70,
  config_schema: [
    { name: 'label', label: 'Rótulo', field: 'string', placeholder: 'UF' },
    { name: 'target', label: 'Dado destino', field: 'variable-ref' },
    { name: 'placeholder', label: 'Texto vazio', field: 'string', placeholder: '— escolha —' },
    { name: 'options', label: 'Lista de opções (formato JSON)', field: 'string', placeholder: '[{"value":"sp","label":"São Paulo"}]' },
  ],
});
