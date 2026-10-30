/**
 * Wave 1 inc2 — NodeFieldSpec: o campo DECLARATIVO de um nó do DAG.
 *
 * Espelho clean-room de `INodeProperties` do n8n (research/n8n/packages/workflow/
 * src/interfaces.ts:1845) — renomeado p/ o AEGIS: displayName→label, name→key,
 * description→help. Um nó vira DADO (um array de NodeFieldSpec) + um renderer
 * genérico (`NodeFieldsRenderer`), matando o switch de componentes React à mão.
 *
 * Módulo PURO (sem React) — o motor de visibilidade (`displayOptions`) e os
 * defaults são testáveis isoladamente (TDD). Ver [[project_dag_espinha_launch]].
 */

/** Tipos de campo (subconjunto dos NodePropertyTypes do n8n que cobre os nós do
 *  DAG). Composição infinita via `collection` (grupo repetível) e escape hatch
 *  `custom` (aponta um componente bespoke por chave — filtro/code/tools/pickers). */
export type NodeFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'options'
  | 'multiOptions'
  | 'json'
  | 'notice'
  | 'collection'
  | 'column' // ref a UMA coluna de entrada (ColumnSelect: select estrito, input livre se sem schema)
  | 'column-multi' // ref a VÁRIAS colunas (ColumnMultiSelect: chips)
  | 'custom';

export interface NodeFieldOption {
  name: string;
  value: string | number | boolean;
  description?: string;
}

/** Knobs por-widget (saco aberto, como o typeOptions do n8n — cada chave é lida
 *  só pelo widget correspondente). */
export interface NodeFieldTypeOptions {
  rows?: number; // textarea (string)
  password?: boolean; // input type=password (string)
  multiline?: boolean; // textarea (string)
  minValue?: number; // number
  maxValue?: number; // number
  step?: number; // number
  /** Fonte dinâmica de opções (reusa o vocabulário do SchemaForm/DynamicRefSelect:
   *  datasets/object_types/properties/sources/markings/cameras/…). Quando setado,
   *  o widget vira dropdown lazy do backend em vez de options estáticas. */
  loadOptions?: string;
  loadOptionsDependsOn?: string; // key de outro campo (contexto do loader)
  /** collection: torna o grupo repetível (array) com botão add/remove. */
  multipleValues?: boolean;
  addButtonText?: string;
  itemFields?: NodeFieldSpec[]; // sub-campos do grupo (recursão)
  /** custom: chave do componente bespoke registrado (IfConfig/AipToolsConfig/…). */
  widget?: string;
  [k: string]: unknown;
}

/** Motor "campo aparece só quando outro=X" (espelho de IDisplayOptions do n8n).
 *  Semântica: AND entre chaves de `show`; OR dentro dos valores de uma chave;
 *  `hide` vence `show`. */
export interface DisplayOptions {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
}

export interface NodeFieldSpec {
  key: string; // n8n `name` — a chave no bag de valores (config)
  label: string; // n8n `displayName`
  type: NodeFieldType;
  default?: unknown;
  required?: boolean;
  help?: string; // n8n `description`
  placeholder?: string;
  options?: NodeFieldOption[]; // options / multiOptions
  typeOptions?: NodeFieldTypeOptions;
  displayOptions?: DisplayOptions;
  /** testid EXPLÍCITO do input — na migração big-bang, preserva os `pb-cfg-*`
   *  históricos (specs/unit tests os usam). Ausente → `${prefix}-${key}`. */
  testid?: string;
}

/** OR dentro de uma chave: `actual` casa QUALQUER valor aceito. Coage por string
 *  (o config grava strings; o accepted pode ser bool/number) — paridade com o
 *  checkConditions do n8n (includes/isEqual). */
export function fieldValueMatches(
  actual: unknown,
  accepted: Array<string | number | boolean>,
): boolean {
  return accepted.some((v) => {
    if (typeof v === 'boolean') return Boolean(actual) === v;
    return actual === v || String(actual ?? '') === String(v);
  });
}

/** Decide se um campo é visível dado o config atual (espelho de displayParameter
 *  do n8n): sem displayOptions → visível; `show` exige TODAS as chaves casarem
 *  (AND); `hide` esconde se QUALQUER chave casar (hide vence show). */
export function shouldDisplayField(
  field: NodeFieldSpec,
  values: Record<string, unknown>,
): boolean {
  const disp = field.displayOptions;
  if (!disp) return true;
  if (disp.show) {
    for (const [key, accepted] of Object.entries(disp.show)) {
      if (!fieldValueMatches(values[key], accepted)) return false;
    }
  }
  if (disp.hide) {
    for (const [key, accepted] of Object.entries(disp.hide)) {
      if (fieldValueMatches(values[key], accepted)) return false;
    }
  }
  return true;
}

/** Config inicial de um nó a partir do seu schema declarativo (o par `type`+
 *  `default` do n8n). Campos sem default são omitidos (o widget usa placeholder). */
export function defaultsFromFields(
  fields: NodeFieldSpec[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}
