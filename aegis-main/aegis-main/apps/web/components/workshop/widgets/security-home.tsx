'use client';

/**
 * Widget composto `security.home.layout` — reproduz BIT a BIT o
 * conteúdo da Home da security-app (sem o PageShell). É um
 * "macro-widget" pra essa fase: garante UX 100% intacta durante o
 * port pra Workshop. Em F7 (editor) podemos quebrar em widgets
 * individuais (KpiCard × N, MiniMap, etc.) e dar drag-drop real.
 */

import { useMemo } from 'react';
import { useT } from '@/lib/i18n/provider';
import { detectionClassLabel, detectionConf, detectionKindLabel } from '@/lib/i18n/detection';
import { KpiCard } from '@/components/painel/kpi-card';
import { MiniMap } from '@/components/painel/mini-map';
import { AlertasDestaque } from '@/components/painel/alertas-destaque';
import { CamerasPrioritarias } from '@/components/painel/cameras-prioritarias';
import { ContagemPorClasse } from '@/components/painel/contagem-classe';
import { LinhaTempo } from '@/components/painel/linha-tempo';
import { nonAggregate } from '@/lib/api/cctv';
// Stores COMPARTILHADOS (#12) — dedupam o fetch entre todos os widgets da Home:
// cada rota faz 1 fetch + 1 poller global (pausado em aba oculta), em vez de
// 1 por widget. O dado continua aparecendo/atualizando igual.
import { useCctvCount } from '@/lib/data/cctv-count-store';
import { useCctvDetections } from '@/lib/data/cctv-detections-store';
import { useMeHome } from '@/lib/data/me-home-store';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

// Macro legado mantido pra compat com seeds antigas (load via
// localStorage). Operador novo usa os 3 widgets explodidos abaixo:
//   security.home.kpis_row    (5 KPIs editáveis)
//   security.home.mid_row     (MiniMap + Alertas + Contagem + Câmeras)
//   security.home.timeline_row (LinhaTempo)
type Cfg = {
  sections?: Array<'kpis' | 'mid' | 'timeline'>;
};

function SecurityHomeLayout({ config }: WidgetRenderProps) {
  const t = useT();
  const cfg = config as Cfg;
  const sections = cfg.sections ?? ['kpis', 'mid', 'timeline'];

  const { home, live } = useMeHome();
  const { detections: cctvDetections } = useCctvDetections();
  const { data: cctvCount } = useCctvCount();

  const mergedTimeline = useMemo(() => {
    // Robustez: os hooks podem devolver undefined (carregando / sem dado / dado
    // sujo do cliente) → arrays vazios, NUNCA crash de .filter/.map (tela branca).
    const fromCctv = (Array.isArray(cctvDetections) ? cctvDetections : []).filter(nonAggregate).map((d) => ({
      id: `cctv-${d.id}`,
      at: d.detected_at,
      kind: d.kind === 'lpr' ? 'alerta' : 'objeto',
      text: `${detectionKindLabel(t, d.kind)} · ${detectionClassLabel(t, d.label)} · ${detectionConf(t, Math.round(d.confidence * 100))}`,
      classification: 'restrito',
      _entity_id: d.linked_entity_id,
    }));
    const baseline = (Array.isArray(home?.timeline) ? home.timeline : []).map((t) => ({ ...t, _entity_id: undefined }));
    return [...fromCctv, ...baseline]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);
  }, [cctvDetections, home.timeline, t]);

  const k = home?.kpis; // robustez: kpis pode faltar (carregando / dado sujo)

  return (
    <div className="space-y-4">
      {sections.includes('kpis') && (
        <section data-testid="kpis" className="grid grid-cols-5 gap-3" aria-label="Indicadores">
          <KpiCard
            label="BOs · 24h"
            value={k?.bos_24h?.value ?? null}
            delta={k?.bos_24h?.delta_pct}
            unavailable={!live}
          />
          <KpiCard
            label="Mandados em aberto"
            value={k?.mandados_abertos?.value ?? null}
            delta={k?.mandados_abertos?.delta_pct}
            unavailable={!live}
          />
          <KpiCard
            label="Viaturas ativas"
            value={k?.viaturas_ativas?.value ?? null}
            delta={k?.viaturas_ativas?.delta_pct}
            unavailable={!live}
          />
          <KpiCard
            label="Detecções CCTV · total"
            value={cctvCount?.detections_total ?? null}
            hint="ontology"
          />
          <KpiCard
            label="Streams CCTV online"
            value={cctvCount ? `${cctvCount.streams_online}/${cctvCount.streams_total}` : null}
            hint="agora"
          />
        </section>
      )}

      {sections.includes('mid') && (
        <section className="grid grid-cols-4 gap-3 h-[460px]">
          <div className="col-span-1">
            <MiniMap />
          </div>
          <div className="col-span-1">
            <AlertasDestaque />
          </div>
          <div className="col-span-1">
            <ContagemPorClasse />
          </div>
          <div className="col-span-1">
            <CamerasPrioritarias />
          </div>
        </section>
      )}

      {sections.includes('timeline') && (
        <section className="h-[340px]">
          <LinhaTempo events={mergedTimeline} liveCctv={cctvCount} />
        </section>
      )}
    </div>
  );
}
registerWidget('security.home.layout', SecurityHomeLayout, {
  group: 'home',
  label: 'Dashboard · layout completo',
  description: 'Macro com KPIs, mosaico do meio e linha do tempo numa única peça.',
  icon: 'layout-dashboard',
  defaultColSpan: 20,
  mockVariables: {}, // shape honesto via FALLBACK_ME_HOME (KPIs null/'—')
  previewWidth: 1280,
  previewHeight: 900,
  config_schema: [
    {
      name: 'show_kpis',
      label: 'Mostrar linha de KPIs',
      field: 'boolean',
      default: true,
    },
    {
      name: 'show_mid',
      label: 'Mostrar mosaico do meio',
      description: 'Mini-map + alertas + contagem + câmeras.',
      field: 'boolean',
      default: true,
    },
    {
      name: 'show_timeline',
      label: 'Mostrar linha do tempo',
      field: 'boolean',
      default: true,
    },
  ],
});

// ── Widgets EXPLODIDOS pro editor — cada um é um bloco removível ──

type KpisRowCfg = {
  /** Quais KPIs renderizar e em que ordem. */
  kpis?: Array<'bos_24h' | 'mandados_abertos' | 'viaturas_ativas' | 'detecoes_cctv' | 'streams_cctv'>;
};

function KpisRow({ config }: WidgetRenderProps) {
  const cfg = config as KpisRowCfg;
  const kpis = cfg.kpis ?? [
    'bos_24h',
    'mandados_abertos',
    'viaturas_ativas',
    'detecoes_cctv',
    'streams_cctv',
  ];
  const { home, live } = useMeHome();
  const { data: cctvCount } = useCctvCount();

  const k = home?.kpis; // robustez: kpis pode faltar (carregando / dado sujo)
  type KpiId =
    | 'bos_24h'
    | 'mandados_abertos'
    | 'viaturas_ativas'
    | 'detecoes_cctv'
    | 'streams_cctv';
  const card = (id: KpiId) => {
    switch (id) {
      case 'bos_24h':
        return <KpiCard label="BOs · 24h" value={k?.bos_24h?.value ?? null} delta={k?.bos_24h?.delta_pct} unavailable={!live} />;
      case 'mandados_abertos':
        return <KpiCard label="Mandados em aberto" value={k?.mandados_abertos?.value ?? null} delta={k?.mandados_abertos?.delta_pct} unavailable={!live} />;
      case 'viaturas_ativas':
        return <KpiCard label="Viaturas ativas" value={k?.viaturas_ativas?.value ?? null} delta={k?.viaturas_ativas?.delta_pct} unavailable={!live} />;
      case 'detecoes_cctv':
        return <KpiCard label="Detecções CCTV · total" value={cctvCount?.detections_total ?? null} hint="ontology" />;
      case 'streams_cctv':
        return <KpiCard label="Streams CCTV online" value={cctvCount ? `${cctvCount.streams_online}/${cctvCount.streams_total}` : null} hint="agora" />;
      default:
        return null;
    }
  };

  return (
    <section
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, kpis.length)}, minmax(0,1fr))` }}
      aria-label="Indicadores"
    >
      {kpis.map((k2) => (
        <div key={k2}>{card(k2)}</div>
      ))}
    </section>
  );
}
registerWidget('security.home.kpis_row', KpisRow, {
  group: 'home',
  label: 'Dashboard · linha de KPIs',
  description: 'Faixa horizontal: BOs · mandados · viaturas · detecções · streams.',
  icon: 'gauge',
  defaultColSpan: 20,
  mockVariables: {}, // FALLBACK_ME_HOME honesto interno (KPIs null/'—')
  previewWidth: 1280,
  previewHeight: 120,
  config_schema: [
    {
      name: 'kpis',
      label: 'KPIs visíveis (CSV)',
      description:
        'Lista separada por vírgula entre: bos_24h, mandados_abertos, viaturas_ativas, detecoes_cctv, streams_cctv. Vazio = todos.',
      field: 'string',
      placeholder: 'ex.: bos_24h,viaturas_ativas',
    },
  ],
});

type MidRowCfg = {
  /** Widgets a renderizar na linha do meio. */
  widgets?: Array<'minimap' | 'alertas' | 'contagem' | 'cameras'>;
};

function MidRow({ config }: WidgetRenderProps) {
  const cfg = config as MidRowCfg;
  const widgets = cfg.widgets ?? ['minimap', 'alertas', 'contagem', 'cameras'];
  return (
    <section
      className="grid gap-3 h-[460px]"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, widgets.length)}, minmax(0,1fr))` }}
    >
      {widgets.map((w) => {
        switch (w) {
          case 'minimap':
            return <div key={w}><MiniMap /></div>;
          case 'alertas':
            return <div key={w}><AlertasDestaque /></div>;
          case 'contagem':
            return <div key={w}><ContagemPorClasse /></div>;
          case 'cameras':
            return <div key={w}><CamerasPrioritarias /></div>;
          default:
            return null;
        }
      })}
    </section>
  );
}
registerWidget('security.home.mid_row', MidRow, {
  group: 'home',
  label: 'Dashboard · mosaico do meio',
  description: 'Quatro tiles lado a lado: mini-mapa, alertas, contagem, câmeras.',
  icon: 'columns-3',
  defaultColSpan: 20,
  mockVariables: {}, // sub-widgets têm fallbacks
  previewWidth: 1280,
  previewHeight: 460,
  config_schema: [
    {
      name: 'tiles',
      label: 'Tiles visíveis (CSV)',
      description:
        'Lista separada por vírgula entre: mini_map, alertas, contagem, cameras. Vazio = todos.',
      field: 'string',
      placeholder: 'ex.: mini_map,alertas',
    },
    {
      name: 'min_height',
      label: 'Altura mínima',
      description: 'Altura mínima de cada tile (em pixels).',
      field: 'number',
      min: 200,
      max: 800,
      step: 20,
      unit: 'px',
      default: 460,
    },
  ],
});

function TimelineRow() {
  const t = useT();
  const { home } = useMeHome();
  const { detections: cctvDetections } = useCctvDetections();
  const { data: cctvCount } = useCctvCount();

  const mergedTimeline = useMemo(() => {
    // Robustez: os hooks podem devolver undefined (carregando / sem dado / dado
    // sujo do cliente) → arrays vazios, NUNCA crash de .filter/.map (tela branca).
    const fromCctv = (Array.isArray(cctvDetections) ? cctvDetections : []).filter(nonAggregate).map((d) => ({
      id: `cctv-${d.id}`,
      at: d.detected_at,
      kind: d.kind === 'lpr' ? 'alerta' : 'objeto',
      text: `${detectionKindLabel(t, d.kind)} · ${detectionClassLabel(t, d.label)} · ${detectionConf(t, Math.round(d.confidence * 100))}`,
      classification: 'restrito',
      _entity_id: d.linked_entity_id,
    }));
    const baseline = (Array.isArray(home?.timeline) ? home.timeline : []).map((t) => ({ ...t, _entity_id: undefined }));
    return [...fromCctv, ...baseline].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  }, [cctvDetections, home.timeline, t]);

  return (
    <section className="h-[340px]">
      <LinhaTempo events={mergedTimeline} liveCctv={cctvCount} />
    </section>
  );
}
registerWidget('security.home.timeline_row', TimelineRow, {
  group: 'home',
  label: 'Dashboard · linha do tempo',
  description: 'Eventos do operador mesclados com detecções CCTV, ordenados por data.',
  icon: 'activity',
  defaultColSpan: 20,
  mockVariables: {}, // FALLBACK_ME_HOME honesto (timeline vazia até dado real)
  previewWidth: 1080,
  previewHeight: 340,
  config_schema: [
    {
      name: 'window_hours',
      label: 'Janela de tempo',
      description: 'Quantas horas de eventos exibir.',
      field: 'number',
      min: 1,
      max: 168,
      step: 1,
      unit: 'h',
      default: 24,
    },
    {
      name: 'include_cctv',
      label: 'Incluir eventos CCTV',
      description: 'Mostra detecções de CCTV mescladas à timeline.',
      field: 'boolean',
      default: true,
    },
  ],
});

// ── Widgets ÚLTRA-EXPLODIDOS ─ 1 widget por item ────────────────

type KpiId =
  | 'bos_24h'
  | 'mandados_abertos'
  | 'viaturas_ativas'
  | 'detecoes_cctv'
  | 'streams_cctv';

type KpiHomeCfg = { kpi: KpiId };

function SingleKpiCard({ config }: WidgetRenderProps) {
  const cfg = config as KpiHomeCfg;
  const { home, live } = useMeHome();
  const { data: cctvCount } = useCctvCount();

  const k = home?.kpis; // robustez: kpis pode faltar (carregando / dado sujo)
  switch (cfg.kpi) {
    case 'bos_24h':
      return <KpiCard label="BOs · 24h" value={k?.bos_24h?.value ?? null} delta={k?.bos_24h?.delta_pct} unavailable={!live} />;
    case 'mandados_abertos':
      return <KpiCard label="Mandados em aberto" value={k?.mandados_abertos?.value ?? null} delta={k?.mandados_abertos?.delta_pct} unavailable={!live} />;
    case 'viaturas_ativas':
      return <KpiCard label="Viaturas ativas" value={k?.viaturas_ativas?.value ?? null} delta={k?.viaturas_ativas?.delta_pct} unavailable={!live} />;
    case 'detecoes_cctv':
      return <KpiCard label="Detecções CCTV · total" value={cctvCount?.detections_total ?? null} hint="ontology" />;
    case 'streams_cctv':
      return <KpiCard label="Streams CCTV online" value={cctvCount ? `${cctvCount.streams_online}/${cctvCount.streams_total}` : null} hint="agora" />;
    default:
      return <KpiCard label={cfg.kpi ?? '—'} value={null} />;
  }
}
registerWidget('security.home.kpi_card', SingleKpiCard, {
  group: 'home',
  label: 'Dashboard · KPI individual',
  description: 'Um único cartão de KPI selecionado entre BOs, mandados, viaturas, detecções ou streams.',
  icon: 'square-activity',
  defaultColSpan: 4,
  mockConfig: { kpi: 'bos_24h' },
  mockVariables: {},
  config_schema: [
    {
      name: 'kpi',
      label: 'KPI',
      description: 'Qual indicador exibir.',
      field: 'select',
      options: [
        { value: 'bos_24h', label: 'BOs nas últimas 24h' },
        { value: 'mandados_abertos', label: 'Mandados abertos' },
        { value: 'viaturas_ativas', label: 'Viaturas ativas' },
        { value: 'detecoes_cctv', label: 'Detecções CCTV' },
        { value: 'streams_cctv', label: 'Streams CCTV (online/total)' },
      ],
    },
  ],
});
