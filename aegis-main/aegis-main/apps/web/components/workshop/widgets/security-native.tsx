'use client';

/**
 * Wrappers Workshop para os widgets nativos da security-app. Cada
 * widget existente em components/painel/* ou components/ficha/* é
 * re-exportado com `registerWidget(...)` sob o namespace
 * `security.<widget>` para uso no Renderer.
 *
 * F4: como o backend Workshop ainda não conhece nossas Entities CCTV
 * (vai precisar de bridge Entity→OntologyNode em F4.5), aqui os
 * widgets puxam dados diretamente do `Cctv` client local — ignoram
 * `variables` do Workshop evaluate. Isso é POR DESIGN nesta fase:
 * mantém UX intacta enquanto o backend amadurece.
 *
 * Quando F4.5 entrar, alguns desses widgets passam a aceitar
 * `cfg.source` (external_id de variable) e usam o evaluate output.
 */

import { KpiCard } from '@/components/painel/kpi-card';
import { AlertasDestaque } from '@/components/painel/alertas-destaque';
import { LinhaTempo } from '@/components/painel/linha-tempo';
import { MiniMap } from '@/components/painel/mini-map';
import { CamerasPrioritarias } from '@/components/painel/cameras-prioritarias';
import { ContagemPorClasse } from '@/components/painel/contagem-classe';
import { WidgetCidades } from '@/components/ficha/widget-cidades';
import { WidgetObservacoesCctv } from '@/components/ficha/widget-observacoes-cctv';
import { WidgetResumoExecutivo } from '@/components/ficha/ficha-resumo';
import { WidgetMidia as WidgetMidiaSocial } from '@/components/ficha/ficha-midia';
import {
  WidgetAntecedentes,
  WidgetEnderecos,
  WidgetIdentificacao,
  WidgetLinhaTempo as FichaLinhaTempo,
  WidgetMandados,
  WidgetVeiculos,
} from '@/components/ficha/widgets-prontos';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { resolveFormatColor, type FormatRule } from '@/lib/workshop/format-rules';

// ── Mock fixtures (preview no editor / paleta) ────────────────────────
const MOCK_OBJ = {
  id: '00000000-0000-4000-8000-000000000042',
  name: 'José da Silva',
  entity_type: 'pessoa',
  classification: 'restrito',
  version: 3,
  created_at: '2024-11-12T14:32:00Z',
  updated_at: '2026-05-10T09:18:00Z',
  created_by: 'analista_01',
} as const;

const MOCK_PROPERTIES: Record<string, unknown> = {
  nome: 'José da Silva',
  cpf: '123.456.789-00',
  rg: '99.888.777-X',
  data_nascimento: '1982-03-17',
  nome_mae: 'Maria da Silva',
  endereco: 'Rua das Acácias, 142 · Vila Mariana, São Paulo · SP',
  enderecos: [
    'Rua das Acácias, 142 · Vila Mariana, São Paulo · SP',
    'Av. Paulista, 1000 · Bela Vista, São Paulo · SP (antigo)',
  ],
  telefone: '+55 11 99999-1234',
  ocupacao: 'Motorista de aplicativo',
};

const MOCK_EVENTS = [
  {
    id: 'cctv-mock-1',
    at: '2026-05-18T15:42:00Z',
    kind: 'cctv',
    text: 'Detecção facial em Av. Paulista (cam-013)',
    classification: 'restrito',
    _entity_id: '00000000-0000-4000-8000-000000000042',
  },
  {
    id: 'mandado-mock-1',
    at: '2026-05-17T11:10:00Z',
    kind: 'mandado',
    text: 'Mandado de busca expedido · 4ª Vara Criminal',
    classification: 'sigiloso',
  },
  {
    id: 'bo-mock-1',
    at: '2026-05-12T08:30:00Z',
    kind: 'bo',
    text: 'BO registrado · 4º DP · furto de veículo',
    classification: 'reservado',
  },
  {
    id: 'alerta-mock-1',
    at: '2026-05-08T20:05:00Z',
    kind: 'alerta',
    text: 'Match LPR · placa BRA2E19 · Marginal Tietê',
    classification: 'restrito',
  },
];

// ── helpers ───────────────────────────────────────────────────────────

function pickValue(
  variables: Record<string, unknown>,
  external?: string,
): unknown {
  if (!external) return undefined;
  return variables[external];
}

function pickEntityId(
  config: Record<string, unknown>,
  variables: Record<string, unknown>,
): string | null {
  // 1) cfg.entity_id literal (raro)
  if (typeof config.entity_id === 'string' && config.entity_id) return config.entity_id;
  // 2) cfg.entity_from = external_id da variable
  if (typeof config.entity_from === 'string') {
    const v = variables[config.entity_from];
    if (typeof v === 'string') return v;
  }
  // 3) variável padrão "entity_id" (a Ficha injeta isso)
  if (typeof variables.entity_id === 'string') return variables.entity_id;
  return null;
}

// ── Home ──────────────────────────────────────────────────────────────

type KpiCfg = {
  label: string;
  value_from?: string;
  delta_from?: string;
  hint?: string;
  unavailable_from?: string;
  /** Backlog #8: regras de cor (limiar) avaliadas contra o valor do KPI. */
  format_rules?: FormatRule[] | string;
};

function KpiCardWrapper({ config, variables }: WidgetRenderProps) {
  const cfg = config as KpiCfg;
  const raw = pickValue(variables, cfg.value_from);
  const value = typeof raw === 'string' || typeof raw === 'number' ? raw : null;
  const delta = pickValue(variables, cfg.delta_from);
  const unavailable = !!pickValue(variables, cfg.unavailable_from);
  // Backlog #8: a primeira regra que casa o valor define a cor do número
  // grande. Reuso TOTAL do util compartilhado (mesma lógica do metric_card /
  // object_table_v2). Sem regra → null → cor default no KpiCard.
  const valueColor = resolveFormatColor(value, cfg.format_rules);
  return (
    <KpiCard
      label={cfg.label}
      value={value}
      delta={typeof delta === 'number' ? delta : undefined}
      hint={cfg.hint}
      unavailable={unavailable}
      valueColor={valueColor}
    />
  );
}
registerWidget('security.kpi_card', KpiCardWrapper, {
  group: 'viz',
  label: 'KPI bindado a variável',
  description: 'Cartão de KPI customizável — label, valor e delta lidos de variables externas (Workshop evaluate).',
  icon: 'square-activity',
  defaultColSpan: 4,
  mockConfig: {
    label: 'Alertas críticos',
    value_from: 'kpi_value',
    delta_from: 'kpi_delta',
    hint: 'últimas 24h',
  },
  mockVariables: { kpi_value: 47, kpi_delta: -12 },
  config_schema: [
    {
      name: 'label',
      label: 'Rótulo',
      description: 'Texto acima do número.',
      field: 'string',
      placeholder: 'ex.: Alertas críticos',
    },
    {
      name: 'value_from',
      label: 'Variável do valor',
      description: 'external_id da variable que produz o número exibido.',
      field: 'variable-ref',
    },
    {
      name: 'delta_from',
      label: 'Variável do delta (%)',
      description: 'external_id de uma variable opcional com a variação percentual.',
      field: 'variable-ref',
    },
    {
      name: 'hint',
      label: 'Hint',
      description: 'Linha pequena abaixo do número.',
      field: 'string',
    },
    {
      name: 'format_rules',
      label: 'Regras de cor',
      // Backlog #8: builder visual (FormatRulesEditor) — colore o número
      // grande por limiar. Para o KPI o campo "Coluna" fica vazio (regra
      // aplica ao valor único de `value_from`). A primeira regra que casa
      // vence; o delta mantém a cor de tendência própria.
      description: 'Colore o número por regra de limiar. A primeira que casa vence.',
      field: 'format-rules',
    },
  ],
});

function AlertasDestaqueWrapper() {
  return <AlertasDestaque />;
}
registerWidget('security.alertas_destaque', AlertasDestaqueWrapper, {
  // type-id histórico mantido p/ não quebrar layouts salvos; o widget é, e
  // sempre foi, o FEED DE DETECÇÕES CCTV (#4). Alertas de regra/geocerca =
  // widget `alert_list` (lê o inbox, leva a /alertas).
  group: 'home',
  label: 'Dashboard · detecções recentes',
  description: 'Feed das detecções recentes das câmeras (LPR, face, objeto). Leva a /cameras.',
  icon: 'bell-ring',
  defaultColSpan: 5,
  mockVariables: {}, // widget busca dados reais; sem backend mostra estado vazio honesto
  previewWidth: 360,
  previewHeight: 440,
  config_schema: [
    {
      name: 'limit',
      label: 'Limite de alertas',
      description: 'Quantos alertas mostrar no card.',
      field: 'number',
      min: 1,
      max: 50,
      step: 1,
      default: 5,
    },
    {
      name: 'severity_min',
      label: 'Severidade mínima',
      description: 'Filtra alertas abaixo dessa severidade.',
      field: 'select',
      options: [
        { value: 'baixa', label: 'Baixa' },
        { value: 'media', label: 'Média' },
        { value: 'alta', label: 'Alta' },
        { value: 'critica', label: 'Crítica' },
      ],
      default: 'baixa',
    },
  ],
});

type LinhaTempoCfg = {
  events_from?: string;
  live_cctv_from?: string;
};

function LinhaTempoWrapper({ config, variables }: WidgetRenderProps) {
  const cfg = config as LinhaTempoCfg;
  // Variable opcional: array de events JSON-like (mesmo shape do home).
  // Quando ausente, passa lista vazia — o widget mostra estado limpo.
  const raw = pickValue(variables, cfg.events_from);
  const events = Array.isArray(raw) ? (raw as Parameters<typeof LinhaTempo>[0]['events']) : [];
  const liveCctv = pickValue(variables, cfg.live_cctv_from) as
    | Parameters<typeof LinhaTempo>[0]['liveCctv']
    | undefined;
  return <LinhaTempo events={events} liveCctv={liveCctv ?? null} />;
}
registerWidget('security.linha_tempo', LinhaTempoWrapper, {
  group: 'viz',
  label: 'Linha do tempo bindada',
  description: 'Timeline genérica — eventos vêm de uma variable externa (formato: [{id, at, kind, text, classification}]).',
  icon: 'activity',
  defaultColSpan: 20,
  mockConfig: { events_from: 'eventos' },
  mockVariables: { eventos: MOCK_EVENTS },
  previewWidth: 720,
  previewHeight: 360,
  config_schema: [
    {
      name: 'events_from',
      label: 'Variável dos eventos',
      description: 'external_id da variable que retorna array de eventos.',
      field: 'variable-ref',
    },
    {
      name: 'live_cctv_from',
      label: 'Variável de live CCTV',
      description: 'external_id opcional pra contagem de detecções ao vivo.',
      field: 'variable-ref',
    },
  ],
});

type MiniMapCfg = {
  auto_focus_cluster?: boolean;
  center?: { lat?: number; lng?: number };
  zoom_height_m?: number;
  interactive?: boolean;
  show_controls?: boolean;
  show_pins?: boolean;
  show_open_link?: boolean;
};

function MiniMapWrapper({ config }: WidgetRenderProps) {
  const cfg = (config as MiniMapCfg) ?? {};
  const center =
    cfg.center && typeof cfg.center.lat === 'number' && typeof cfg.center.lng === 'number'
      ? { lat: cfg.center.lat, lon: cfg.center.lng }
      : undefined;
  return (
    <MiniMap
      autoFocusCluster={cfg.auto_focus_cluster ?? true}
      center={center}
      zoomHeight={cfg.zoom_height_m}
      interactive={cfg.interactive ?? false}
      showControls={cfg.show_controls ?? false}
      showPins={cfg.show_pins ?? false}
      showOpenLink={cfg.show_open_link ?? true}
    />
  );
}
registerWidget('security.mini_map', MiniMapWrapper, {
  group: 'home',
  label: 'Dashboard · mini-mapa Cesium',
  description: 'Globo 3D centrado no cluster de eventos com maior atividade nas últimas 24h.',
  icon: 'map',
  defaultColSpan: 5,
  mockConfig: { auto_focus_cluster: true, show_open_link: true },
  previewWidth: 360,
  previewHeight: 280,
  config_schema: [
    {
      name: 'auto_focus_cluster',
      label: 'Auto-focar cluster com maior atividade',
      description:
        'Quando ligado, ignora o centro manual e usa o hotspot com mais detecções nas últimas 24h.',
      field: 'boolean',
      default: true,
    },
    {
      name: 'center',
      label: 'Centro manual (lat/lng)',
      description: 'Usado apenas quando o auto-focus está desligado.',
      field: 'lat-lng',
    },
    {
      name: 'zoom_height_m',
      label: 'Altitude da câmera',
      description: 'Distância vertical (em metros) entre a câmera e o solo.',
      field: 'number',
      min: 500,
      max: 5_000_000,
      step: 500,
      unit: 'm',
      default: 45000,
    },
    {
      name: 'interactive',
      label: 'Permitir interação (drag e zoom)',
      description: 'Liga arrastar/zoom no globo. Em mini-mapa-teaser deixe desligado.',
      field: 'boolean',
      default: false,
    },
    {
      name: 'show_controls',
      label: 'Mostrar controles UI do Cesium',
      description: 'Exibe os toggles de relevo, prédios, labels e iluminação.',
      field: 'boolean',
      default: false,
    },
    {
      name: 'show_pins',
      label: 'Mostrar pins de streams',
      description: 'Desenha um pin para cada stream CCTV cadastrado.',
      field: 'boolean',
      default: false,
    },
    {
      name: 'show_open_link',
      label: 'Mostrar botão "Abrir Mapa →"',
      description: 'Liga o card todo como atalho para a página /geo.',
      field: 'boolean',
      default: true,
    },
  ],
});

function CamerasPrioritariasWrapper() {
  return <CamerasPrioritarias />;
}
registerWidget('security.cameras_prioritarias', CamerasPrioritariasWrapper, {
  group: 'home',
  label: 'Dashboard · câmeras prioritárias',
  description: 'Top N streams CCTV ranqueadas por volume de detecções recentes.',
  icon: 'video',
  defaultColSpan: 5,
  mockVariables: {}, // widget tem fallback interno
  previewWidth: 360,
  previewHeight: 440,
  config_schema: [
    {
      name: 'limit',
      label: 'Top N câmeras',
      description: 'Quantas câmeras prioritárias exibir.',
      field: 'number',
      min: 1,
      max: 20,
      step: 1,
      default: 5,
    },
    {
      name: 'window_minutes',
      label: 'Janela de ranking',
      description: 'Minutos de detecções considerados pro ranqueamento.',
      field: 'number',
      min: 15,
      max: 1440,
      step: 15,
      unit: 'min',
      default: 60,
    },
  ],
});

function ContagemPorClasseWrapper() {
  return <ContagemPorClasse />;
}
registerWidget('security.contagem_classe', ContagemPorClasseWrapper, {
  group: 'home',
  label: 'Dashboard · contagem por classe',
  description: 'Distribuição agregada de detecções por classe (face, placa) na janela ativa.',
  icon: 'chart-bar',
  defaultColSpan: 5,
  mockVariables: {}, // empty state se renderiza limpo
  previewWidth: 360,
  previewHeight: 320,
  config_schema: [
    {
      name: 'window_minutes',
      label: 'Janela',
      description: 'Período em minutos pra agregação.',
      field: 'number',
      min: 15,
      max: 1440,
      step: 15,
      unit: 'min',
      default: 60,
    },
    {
      name: 'classes',
      label: 'Classes (CSV)',
      description: 'Lista por vírgula. Vazio = face,plate.',
      field: 'string',
      placeholder: 'ex.: face,plate',
    },
  ],
});

// ── Ficha ─────────────────────────────────────────────────────────────

type WidgetWithEntityCfg = { entity_id?: string; entity_from?: string };

function WidgetIdentificacaoWrapper({ config, variables }: WidgetRenderProps) {
  // O WidgetIdentificacao consome `properties` (entries chave→valor) +
  // `obj` (metadata: id/tipo/classificação/versão/auditoria). Ambos são
  // injetados como variables pelo FichaWorkshopShell. `properties_from`
  // permite override pra binding customizado quando o operador
  // configura via Inspetor.
  const cfg = config as WidgetWithEntityCfg & { properties_from?: string };
  const props =
    (cfg.properties_from && variables[cfg.properties_from]) ??
    variables.properties ??
    {};
  const obj = variables.obj as Parameters<typeof WidgetIdentificacao>[0]['obj'];
  // Contrato do type-def (objectTypeSchema) injetado pelo shell: dirige
  // rótulo/formato do NEGÓCIO + colapsa o TÉCNICO. null → fallback heurístico.
  const typeDef = variables.type_def as Parameters<typeof WidgetIdentificacao>[0]['typeDef'];
  return (
    <WidgetIdentificacao
      properties={props as Record<string, unknown>}
      obj={obj}
      typeDef={typeDef}
    />
  );
}
registerWidget('security.ficha.identificacao', WidgetIdentificacaoWrapper, { fichaTab: 'identidade',
  group: 'ficha',
  label: 'Ficha · identificação',
  description: 'Cabeçalho de identidade: nome, CPF, RG, data de nascimento e demais propriedades cadastradas.',
  icon: 'id-card',
  defaultColSpan: 10,
  mockVariables: { properties: MOCK_PROPERTIES, obj: MOCK_OBJ },
  config_schema: [
    {
      name: 'properties_from',
      label: 'Variável das propriedades',
      description:
        'external_id da variable com o objeto `{k: v}` das propriedades. Default: `properties` (injetado pela rota).',
      field: 'variable-ref',
      placeholder: 'properties',
    },
  ],
});

function WidgetAntecedentesWrapper({ config, variables }: WidgetRenderProps) {
  return <WidgetAntecedentes entityId={pickEntityId(config as Record<string, unknown>, variables)} />;
}
registerWidget('security.ficha.antecedentes', WidgetAntecedentesWrapper, { fichaTab: 'historico',
  group: 'ficha',
  label: 'Ficha · antecedentes criminais',
  description: 'Histórico de BOs, processos e ocorrências vinculadas à entidade.',
  icon: 'scroll',
  defaultColSpan: 10,
  mockVariables: {}, // widget tem fixture interna
  config_schema: [
    {
      name: 'show_only_open',
      label: 'Apenas em aberto',
      description: 'Esconde processos arquivados/extintos.',
      field: 'boolean',
      default: false,
    },
  ],
});

function WidgetMandadosWrapper({ config, variables }: WidgetRenderProps) {
  return <WidgetMandados entityId={pickEntityId(config as Record<string, unknown>, variables)} />;
}
registerWidget('security.ficha.mandados', WidgetMandadosWrapper, { fichaTab: 'historico',
  group: 'ficha',
  label: 'Ficha · mandados',
  description: 'Mandados de busca/prisão associados — filtra por status (aberto, cumprido, extinto).',
  icon: 'gavel',
  defaultColSpan: 10,
  mockVariables: {}, // widget tem fixture interna
  config_schema: [
    {
      name: 'status',
      label: 'Status',
      description: 'Quais mandados mostrar.',
      field: 'select',
      options: [
        { value: 'todos', label: 'Todos' },
        { value: 'aberto', label: 'Em aberto' },
        { value: 'cumprido', label: 'Cumpridos' },
        { value: 'extinto', label: 'Extintos' },
      ],
      default: 'todos',
    },
  ],
});

function WidgetVeiculosWrapper({ config, variables }: WidgetRenderProps) {
  const obj = (variables?.obj ?? {}) as Record<string, unknown>;
  return (
    <WidgetVeiculos
      entityId={pickEntityId(config as Record<string, unknown>, variables)}
      canonical={obj.__canonical === true}
    />
  );
}
registerWidget('security.ficha.veiculos', WidgetVeiculosWrapper, { fichaTab: 'historico',
  group: 'ficha',
  label: 'Ficha · veículos',
  description: 'Tabela de veículos vinculados (placa, modelo, cor, situação) — diretos e indiretos.',
  icon: 'car',
  defaultColSpan: 10,
  mockVariables: {}, // widget tem fixture interna
  config_schema: [
    {
      name: 'include_indirect',
      label: 'Incluir vínculos indiretos',
      description: 'Mostra veículos ligados via cônjuge/familiar/sócio.',
      field: 'boolean',
      default: false,
    },
  ],
});

function WidgetEnderecosWrapper({ variables }: WidgetRenderProps) {
  // O FichaWorkshopShell injeta `properties` como variable — pra o
  // componente puxar Endereço / enderecos[] do entity real e renderizar
  // OSM embed centrado nas coords (ou geocode via Nominatim).
  const properties =
    (variables.properties as Record<string, unknown> | undefined) ?? {};
  return <WidgetEnderecos properties={properties} />;
}
registerWidget('security.ficha.enderecos', WidgetEnderecosWrapper, { fichaTab: 'identidade',
  group: 'ficha',
  label: 'Ficha · endereços',
  description: 'Endereços conhecidos com geocodificação OSM e embed do mapa.',
  icon: 'map-pin',
  defaultColSpan: 10,
  mockVariables: { properties: MOCK_PROPERTIES },
  config_schema: [
    {
      name: 'limit',
      label: 'Limite',
      description: 'Quantos endereços listar (default: todos).',
      field: 'number',
      min: 1,
      max: 200,
      step: 1,
    },
    {
      name: 'only_current',
      label: 'Apenas endereço atual',
      description: 'Esconde endereços antigos / não mais válidos.',
      field: 'boolean',
      default: false,
    },
  ],
});

function WidgetLinhaTempoFichaWrapper({ config, variables }: WidgetRenderProps) {
  return <FichaLinhaTempo entityId={pickEntityId(config as Record<string, unknown>, variables)} />;
}
registerWidget('security.ficha.linha_tempo', WidgetLinhaTempoFichaWrapper, { fichaTab: 'atividade',
  group: 'ficha',
  label: 'Ficha · linha do tempo',
  description: 'Cronologia da entidade: BOs, mandados, detecções CCTV e vínculos por data.',
  icon: 'activity',
  defaultColSpan: 20,
  mockVariables: {}, // widget tem fixture interna
  previewWidth: 560,
  config_schema: [
    {
      name: 'window_days',
      label: 'Janela',
      description: 'Dias de histórico a exibir.',
      field: 'number',
      min: 1,
      max: 3650,
      step: 1,
      unit: 'd',
      default: 365,
    },
    {
      name: 'kinds',
      label: 'Tipos de evento (CSV)',
      description:
        'Lista por vírgula entre: bo, mandado, alerta, cctv, briefing, relatorio. Vazio = todos.',
      field: 'string',
      placeholder: 'ex.: bo,mandado',
    },
  ],
});

function WidgetCidadesWrapper({ config, variables }: WidgetRenderProps) {
  const id = pickEntityId(config as Record<string, unknown>, variables);
  if (!id) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Sem entity_id — pasta esse widget numa ficha ou injete via variable.
      </div>
    );
  }
  return <WidgetCidades entityId={id} />;
}
registerWidget('security.ficha.cidades', WidgetCidadesWrapper, { fichaTab: 'atividade',
  group: 'ficha',
  label: 'Ficha · cidades observadas',
  description: 'Cidades onde a entidade foi detectada via CCTV, com link pra trajetória no /geo.',
  icon: 'building',
  defaultColSpan: 10,
  mockVariables: { entity_id: '00000000-0000-4000-8000-000000000042' },
  config_schema: [
    {
      name: 'entity_id',
      label: 'Entity id (override)',
      description:
        'Geralmente injetado pela rota /ficha/[id]. Override útil pra preview no editor.',
      field: 'string',
    },
    {
      name: 'window_days',
      label: 'Janela',
      description: 'Dias considerados pro mapeamento por cidade.',
      field: 'number',
      min: 1,
      max: 365,
      step: 1,
      unit: 'd',
      default: 90,
    },
  ],
});

function WidgetObservacoesCctvWrapper({ config, variables }: WidgetRenderProps) {
  const id = pickEntityId(config as Record<string, unknown>, variables);
  if (!id) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Sem entity_id — coloca este widget numa ficha ou injeta via variable.
      </div>
    );
  }
  return <WidgetObservacoesCctv entityId={id} />;
}
registerWidget('security.ficha.observacoes_cctv', WidgetObservacoesCctvWrapper, { fichaTab: 'atividade',
  group: 'ficha',
  label: 'Ficha · observações CCTV',
  description: 'Detecções recentes da entidade nas câmeras (face e LPR) com thumbnail do frame.',
  icon: 'video',
  defaultColSpan: 10,
  mockVariables: { entity_id: '00000000-0000-4000-8000-000000000042' },
  config_schema: [
    {
      name: 'entity_id',
      label: 'Entity id (override)',
      description:
        'Geralmente injetado pela rota /ficha/[id]. Override útil pra preview no editor.',
      field: 'string',
    },
    {
      name: 'limit',
      label: 'Limite',
      description: 'Quantas observações exibir.',
      field: 'number',
      min: 1,
      max: 200,
      step: 1,
      default: 25,
    },
    {
      name: 'min_confidence',
      label: 'Confiança mínima',
      description: 'Score mínimo (0–1) pro match face/placa.',
      field: 'number',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.7,
    },
  ],
});

// ── Resumo executivo (FRENTE D) — painel de SITUAÇÃO no TOPO da ficha ──
// Vai no slot `top` (não numa aba específica): alertas computados das
// evidências + contagem de fontes + confiança agregada de identidade.
function WidgetResumoExecutivoWrapper({ config, variables }: WidgetRenderProps) {
  return (
    <WidgetResumoExecutivo entityId={pickEntityId(config as Record<string, unknown>, variables)} />
  );
}
registerWidget('security.ficha.resumo', WidgetResumoExecutivoWrapper, {
  group: 'ficha',
  label: 'Ficha · resumo executivo',
  description:
    'Painel de situação no topo da ficha: alertas (mandado em aberto, sanção, PEP), fontes com dado vs consultadas e confiança agregada de identidade.',
  icon: 'gauge',
  defaultColSpan: 20,
  mockVariables: { entity_id: '00000000-0000-4000-8000-000000000042' },
  config_schema: [
    {
      name: 'entity_id',
      label: 'Entity id (override)',
      description:
        'Geralmente injetado pela rota /ficha/[id]. Override útil pra preview no editor.',
      field: 'string',
    },
  ],
});

// ── Mídia social/OSINT (FRENTE D) — aba "Mídia" ──
// Distinto do `security.ficha.midia` do parlamentar (que lê properties.media[]):
// este lê Entities.evidence filtrando fontes sociais (Instagram, TikTok, X,
// Reddit, YouTube, foto/face) e monta a galeria a partir do payload real.
function WidgetMidiaSocialWrapper({ config, variables }: WidgetRenderProps) {
  return (
    <WidgetMidiaSocial entityId={pickEntityId(config as Record<string, unknown>, variables)} />
  );
}
registerWidget('security.ficha.midia_social', WidgetMidiaSocialWrapper, { fichaTab: 'midia',
  group: 'ficha',
  label: 'Ficha · mídia e perfis',
  description:
    'Galeria de fotos, posts e perfis das fontes sociais coletadas (Instagram, TikTok, X, Reddit, YouTube, face).',
  icon: 'image',
  defaultColSpan: 20,
  mockVariables: { entity_id: '00000000-0000-4000-8000-000000000042' },
  config_schema: [
    {
      name: 'entity_id',
      label: 'Entity id (override)',
      description:
        'Geralmente injetado pela rota /ficha/[id]. Override útil pra preview no editor.',
      field: 'string',
    },
  ],
});
