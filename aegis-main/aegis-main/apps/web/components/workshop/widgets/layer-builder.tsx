'use client';

/**
 * layer_builder — Construtor de Camadas de Referência (o "My Maps" do AEGIS).
 *
 * O operador desenha, organiza em camadas/categorias, classifica, estiliza,
 * nomeia e PUBLICA. Cada camada vira 1 dataset editável + 1 board do DAG +
 * 1 node_type dedicado; publicar materializa os nós e a camada aparece sozinha
 * na aba "Camadas de referência" do /geo, com a cor/3D de cada feição.
 *
 * Layout (3 colunas, espelho do My Maps): árvore de Mapas→Camadas→feições à
 * esquerda · mesa de desenho no centro · paleta de ferramentas no topo do mapa.
 *
 * O rascunho durável é o PRÓPRIO dataset versionado (Salvar = SNAPSHOT) —
 * nada de localStorage.
 */
import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Hand,
  Layers,
  Loader2,
  MapPin,
  Palette,
  PenLine,
  Plus,
  Shield,
  Spline,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';

import dynamic from 'next/dynamic';

import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { useCan } from '@/lib/auth/useAuth';
import type { DrawMode } from '@/components/geo/builder-map';
import { Alerts } from '@/lib/api';
import {
  GeoLayers,
  type Layer,
  type LayersOut,
} from '@/lib/api/geo-layers';
import {
  exportFileName,
  featureCollectionToRows,
  type FeatureRow,
  type FeatureStyle,
  groupByCategoria,
  newFeatureId,
  rowsToFeatureCollection,
} from '@/lib/geo/geojson-io';
import { IMPORT_ACCEPT, isKmlFile, parseKmlToFeatureCollection } from '@/lib/geo/kml';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

// Mapa só no cliente (WebGL) e fora do bundle das outras telas — mesmo padrão
// do map_live. Também evita puxar mapbox-gl no ambiente de teste em jsdom.
const BuilderMap = dynamic(
  () => import('@/components/geo/builder-map').then((m) => m.BuilderMap),
  { ssr: false },
);

const MANAGE_PERM = 'security.geo.camada.manage';
const FENCE_PERM = 'alerts.geofences.manage';

interface Cfg {
  title?: string;
  height?: number;
  view?: 'streets' | 'satellite' | 'dark' | 'light';
  /** Abre já filtrado num "mapa" (grupo). Vazio = todos. */
  map_tag?: string;
  /** Centro inicial da mesa de desenho. */
  center_lat?: number;
  center_lng?: number;
  zoom?: number;
}

/** Paleta de CLASSIFICAÇÃO (a mesma régua do seed das zonas da Câmara): a cor
 *  carrega significado operacional, não decoração. */
export const PALETA: { color: string; key: string }[] = [
  { color: '#C8341F', key: 'builder.cor.critico' },
  { color: '#E97D2A', key: 'builder.cor.atencao' },
  { color: '#E8B33B', key: 'builder.cor.observacao' },
  { color: '#2D77BE', key: 'builder.cor.infra' },
  { color: '#3F8F5B', key: 'builder.cor.seguro' },
  { color: '#7C5CBF', key: 'builder.cor.outro' },
];

/** Aplica estilo a TODAS as feições de uma categoria (o gesto natural do My
 *  Maps: "a camada Tráfico é laranja"). Feição sem categoria não é tocada. */
export function aplicarEstiloNaCategoria(
  rows: FeatureRow[],
  categoria: string,
  style: FeatureStyle,
): FeatureRow[] {
  // compara NORMALIZADO: `groupByCategoria` agrupa por `.trim()`, então uma
  // pasta de KML chamada "Tráfico " casaria zero linhas numa comparação crua —
  // o operador escolheria a cor e nada mudaria.
  const alvo = (categoria || '').trim();
  return rows.map((r) =>
    (r.categoria || '').trim() === alvo
      ? { ...r, geo_style: { ...r.geo_style, ...style } }
      : r,
  );
}

/** Override por FEIÇÃO — vence o da categoria (aplicado depois). */
export function aplicarEstiloNaFeicao(
  rows: FeatureRow[],
  id: string,
  style: FeatureStyle,
): FeatureRow[] {
  return rows.map((r) =>
    r.id === id ? { ...r, geo_style: { ...r.geo_style, ...style } } : r,
  );
}

/** Anel externo de um polígono, no contrato da geocerca ([lng,lat] — o mesmo
 *  que o avaliador do Atlas usa em `point_in_polygon`), SEM o vértice de
 *  fechamento repetido (o contrato da cerca usa anel aberto).
 *
 *  MultiPolygon de mais de um bloco devolve null de propósito: a cerca só
 *  aceita um anel, e promover cobrindo só o primeiro bloco criaria vigilância
 *  com buraco silencioso — invasão no segundo bloco nunca alertaria. */
export function anelDaFeicao(row: FeatureRow): number[][] | null {
  const g = row.geometry;
  let anel: number[][] | null = null;
  if (g?.type === 'Polygon') anel = (g.coordinates?.[0] as number[][]) || null;
  if (g?.type === 'MultiPolygon') {
    const blocos = (g.coordinates as number[][][][]) || [];
    if (blocos.length !== 1) return null;
    anel = (blocos[0]?.[0] as number[][]) || null;
  }
  if (!anel || anel.length < 3) return null;
  const primeiro = anel[0];
  const ultimo = anel[anel.length - 1];
  const fechado = primeiro[0] === ultimo[0] && primeiro[1] === ultimo[1];
  const aberto = fechado ? anel.slice(0, -1) : anel;
  return aberto.length >= 3 ? aberto : null;
}

/** Detalhe do backend quando houver (ex.: "camada com 2400 feições excede o
 *  teto de 2000") — engolir isso num toast genérico deixa o operador sem saber
 *  o que corrigir. */
export function mensagemDeErro(e: unknown, fallback: string): string {
  const detalhe = (e as { detail?: unknown; message?: unknown } | null)?.detail
    ?? (e as { message?: unknown } | null)?.message;
  return typeof detalhe === 'string' && detalhe.trim() && detalhe.length < 300
    ? detalhe
    : fallback;
}

const TOOLS: { mode: DrawMode; icon: React.ElementType; key: string }[] = [
  { mode: 'simple_select', icon: Hand, key: 'builder.tool.select' },
  { mode: 'draw_polygon', icon: Square, key: 'builder.tool.polygon' },
  { mode: 'draw_line_string', icon: Spline, key: 'builder.tool.line' },
  { mode: 'draw_point', icon: MapPin, key: 'builder.tool.point' },
];

/** Todas as camadas (agrupadas ou avulsas) em ordem de exibição. */
function flatten(data: LayersOut | null): Layer[] {
  if (!data) return [];
  return [...data.maps.flatMap((m) => m.layers), ...data.avulsas];
}

function LayerBuilder({ config }: WidgetRenderProps) {
  const t = useT();
  const cfg = (config || {}) as Cfg;
  const canManage = useCan(MANAGE_PERM);
  // Promover a cerca é OUTRO gesto governado (o motor de alertas é dele) —
  // quem desenha não necessariamente pode armar alerta.
  const canFence = useCan(FENCE_PERM);

  // `t` é uma função NOVA a cada render — usá-la como dependência de efeito/
  // callback dispara loop infinito de recarga. Fica na ref; o texto é
  // traduzido na hora de renderizar (o estado guarda a CHAVE, não a frase).
  const tRef = React.useRef(t);
  tRef.current = t;

  const [data, setData] = React.useState<LayersOut | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [erroKey, setErroKey] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<FeatureRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<DrawMode>('simple_select');
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publicado, setPublicado] = React.useState<{ n: number; removidos: number } | null>(null);
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  const [estiloAberto, setEstiloAberto] = React.useState<string | null>(null);
  const [importando, setImportando] = React.useState(false);
  const [promovendo, setPromovendo] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  // Espelho do activeId p/ callbacks assíncronos conferirem, DEPOIS do await,
  // se o operador ainda está na mesma camada.
  const activeIdRef = React.useRef<string | null>(activeId);
  activeIdRef.current = activeId;

  const layers = React.useMemo(() => flatten(data), [data]);
  const active = layers.find((l) => l.id === activeId) || null;
  // Há trabalho salvo que ainda NÃO está no mapa? (feições no dataset ≠ nós
  // materializados). É o estado que ficava invisível: salvar não publica.
  const pendenteDePublicar =
    !!active && active.feature_count !== active.materialized_count;

  const reload = React.useCallback(async () => {
    setLoading(true);
    setErroKey(null);
    try {
      const out = await GeoLayers.list();
      setData(out);
      return out;
    } catch {
      setErroKey('builder.erro.carregar');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // Seleciona a primeira camada quando ainda não há uma ativa.
  React.useEffect(() => {
    if (activeId || layers.length === 0) return;
    const filtered = cfg.map_tag
      ? layers.filter((l) => l.mapa?.slug === cfg.map_tag)
      : layers;
    if (filtered[0]) setActiveId(filtered[0].id);
  }, [layers, activeId, cfg.map_tag]);

  // Carrega as feições da camada ativa.
  React.useEffect(() => {
    if (!activeId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const out = await GeoLayers.features(activeId);
        if (cancelled) return;
        setRows(out.rows);
        setDirty(false);
        setSelectedId(null);
        setPublicado(null);   // o placar é da camada anterior
      } catch {
        if (!cancelled) toast.error(tRef.current('builder.erro.feicoes'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Aviso do browser ao sair com desenho não salvo (único mecanismo nativo
  // aceitável — nada de persistir rascunho em localStorage).
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const confirmDiscard = React.useCallback(async () => {
    if (!dirty) return true;
    return confirmModal({
      title: tRef.current('builder.dirty.titulo'),
      description: tRef.current('builder.dirty.mensagem'),
      confirmLabel: tRef.current('builder.dirty.descartar'),
    });
  }, [dirty]);

  const criarCamada = async () => {
    // Criar camada TROCA a camada ativa — o desenho pendente sumiria sem aviso.
    if (!(await confirmDiscard())) return;
    const nome = await promptModal({
      title: t('builder.camada.nova'),
      description: t('builder.camada.novaAjuda'),
      placeholder: t('builder.camada.nomePlaceholder'),
    });
    if (!nome?.trim()) return;
    try {
      const layer = await GeoLayers.create({
        nome: nome.trim(),
        mapa: cfg.map_tag || undefined,
      });
      await reload();
      setActiveId(layer.id);
      toast.success(t('builder.camada.criada'));
    } catch {
      toast.error(t('builder.camada.erroCriar'));
    }
  };

  const salvar = async () => {
    if (!activeId || saving) return;
    const alvo = activeId;
    setSaving(true);
    try {
      const out = await GeoLayers.saveFeatures(alvo, rows);
      // Trocar de camada durante o PUT: a resposta da camada ANTERIOR não
      // pode sobrescrever a view atual (escreveria as feições de A sob o
      // rótulo de B, e o próximo save mandaria A para B).
      if (activeIdRef.current !== alvo) return;
      setRows(out.rows);
      setDirty(false);
      await reload();
      toast.success(tRef.current('builder.salvoPublicarPendente'));
    } catch (e) {
      toast.error(mensagemDeErro(e, tRef.current('builder.erro.salvar')));
    } finally {
      setSaving(false);
    }
  };

  const publicar = async () => {
    if (!activeId || publishing) return;
    const alvo = activeId;
    setPublishing(true);
    setPublicado(null);
    let etapa: 'salvar' | 'publicar' = 'salvar';
    try {
      // Publicar SEM salvar deixaria o mapa contando outra história do que a
      // tela mostra — grava o pendente antes.
      if (dirty) {
        const out = await GeoLayers.saveFeatures(alvo, rows);
        if (activeIdRef.current !== alvo) return;
        setRows(out.rows);
        setDirty(false);
      }
      etapa = 'publicar';
      const res = await GeoLayers.publish(alvo);
      if (activeIdRef.current !== alvo) return;
      if (res.status !== 'OK') {
        toast.error(res.error || tRef.current('builder.erro.publicar'));
        await reload();   // estado da árvore reflete o run que falhou
        return;
      }
      setPublicado({ n: res.materialized, removidos: res.removed });
      await reload();
      toast.success(tRef.current('builder.publicado'));
    } catch (e) {
      // reportar "não publicou" quando quem falhou foi o SAVE mandaria o
      // operador procurar o problema no lugar errado
      toast.error(mensagemDeErro(e, tRef.current(
        etapa === 'salvar' ? 'builder.erro.salvar' : 'builder.erro.publicar',
      )));
    } finally {
      setPublishing(false);
    }
  };

  const importarArquivo = async (file: File | null | undefined) => {
    if (!file || !activeId || importando) return;
    const alvo = activeId;
    setImportando(true);
    try {
      const fc = isKmlFile(file.name)
        ? await parseKmlToFeatureCollection(file)
        : JSON.parse(await file.text());
      const { rows: novas, skipped } = featureCollectionToRows(fc);
      // o parse do KML carrega uma lib pesada: o operador pode ter trocado de
      // camada no meio — anexar na camada errada seria pior que não importar
      if (activeIdRef.current !== alvo) return;
      if (novas.length === 0) {
        toast.error(tRef.current('builder.import.nada'));
        return;
      }
      // Import ADICIONA feição nova e ATUALIZA a de mesmo id (o export do
      // próprio construtor preserva os ids: reimportar um arquivo editado no
      // QGIS tem que refletir a edição, não ser descartado em silêncio).
      let novasCount = 0;
      let atualizadas = 0;
      setRows((prev) => {
        const porId = new Map(prev.map((r) => [r.id, r]));
        for (const nova of novas) {
          if (porId.has(nova.id)) atualizadas += 1;
          else novasCount += 1;
          porId.set(nova.id, nova);
        }
        return [...porId.values()];
      });
      setDirty(true);
      const partes = [tRef.current('builder.import.ok')];
      if (atualizadas > 0) {
        partes.push(`(${atualizadas} ${tRef.current('builder.import.atualizadas')})`);
      }
      if (skipped > 0) {
        partes.push(`(${skipped} ${tRef.current('builder.import.descartadas')})`);
      }
      toast.success(partes.join(' '));
    } catch (e) {
      toast.error(mensagemDeErro(e, tRef.current('builder.import.erro')));
    } finally {
      setImportando(false);
    }
  };

  const exportar = () => {
    if (!active) return;
    const fc = rowsToFeatureCollection(rows);
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(active.nome);
    // anexar antes de clicar e revogar DEPOIS: revogar na hora aborta o
    // download em alguns browsers
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const promoverACerca = async (row: FeatureRow) => {
    if (promovendo) return;   // duplo-clique criaria duas cercas alertando junto
    const ring = anelDaFeicao(row);
    if (!ring) {
      toast.error(tRef.current('builder.cerca.soPoligono'));
      return;
    }
    const ok = await confirmModal({
      title: tRef.current('builder.cerca.titulo'),
      description: tRef.current('builder.cerca.descricao'),
      confirmLabel: tRef.current('builder.cerca.confirmar'),
    });
    if (!ok) return;
    setPromovendo(row.id);
    try {
      // O anel já está em [lng,lat] — a MESMA convenção do avaliador do Atlas
      // (point_in_polygon). A cerca nasce como objeto INDEPENDENTE: apagar a
      // camada depois não a remove (e o operador é avisado disso no modal).
      await Alerts.geofences.create({
        // nome NÃO traduzido: vira dado persistido, e o placeholder do idioma
        // de quem criou ficaria eternizado pros colegas de outro locale
        name: row.nome?.trim() || `Camada · ${row.id}`,
        shape: 'polygon',
        coordinates: ring,
        severity: 'medium',
      });
      toast.success(tRef.current('builder.cerca.criada'));
    } catch (e) {
      toast.error(mensagemDeErro(e, tRef.current('builder.cerca.erro')));
    } finally {
      setPromovendo(null);
    }
  };

  const aplicarEstilo = (alvo: { categoria?: string; id?: string }, style: FeatureStyle) => {
    setRows((prev) =>
      alvo.id
        ? aplicarEstiloNaFeicao(prev, alvo.id, style)
        : aplicarEstiloNaCategoria(prev, alvo.categoria || '', style),
    );
    setDirty(true);
  };

  const onDrawCreate = (geometry: GeoJSON.Geometry) => {
    const row: FeatureRow = { id: newFeatureId(), geometry };
    setRows((prev) => [...prev, row]);
    setSelectedId(row.id);
    setDirty(true);
  };

  const onDrawUpdate = (id: string, geometry: GeoJSON.Geometry) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, geometry } : r)));
    setDirty(true);
  };

  const removerFeicoes = (ids: string[]) => {
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedId((cur) => (cur && ids.includes(cur) ? null : cur));
    setDirty(true);
  };

  const renomearFeicao = async (row: FeatureRow) => {
    const nome = await promptModal({
      title: t('builder.feicao.renomear'),
      defaultValue: row.nome || '',
      placeholder: t('builder.feicao.nomePlaceholder'),
      required: false,
    });
    if (nome == null) return;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, nome: nome.trim() || undefined } : r)),
    );
    setDirty(true);
  };

  const trocarCamada = async (id: string) => {
    if (id === activeId) return;
    if (!(await confirmDiscard())) return;
    setActiveId(id);
  };

  const grupos = React.useMemo(() => groupByCategoria(rows), [rows]);
  const center = {
    lat: typeof cfg.center_lat === 'number' ? cfg.center_lat : -23.5505,
    lng: typeof cfg.center_lng === 'number' ? cfg.center_lng : -46.6333,
  };
  const height = typeof cfg.height === 'number' ? cfg.height : 560;

  const visibleGroups = cfg.map_tag
    ? (data?.maps || []).filter((m) => m.slug === cfg.map_tag)
    : data?.maps || [];
  const visibleAvulsas = cfg.map_tag ? [] : data?.avulsas || [];

  return (
    <div
      data-testid="layer-builder"
      className="w-full border border-border-light bg-surface-light flex flex-col"
      style={{ height }}
    >
      <div className="h-9 px-3 flex items-center gap-2 border-b border-border-light shrink-0">
        <Layers className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <span className="text-[12px] flex-1 truncate">
          {cfg.title || t('builder.titulo')}
        </span>
        {/* Estado da camada em UMA frase. O gesto de desenhar não termina em
            "salvar": o desenho só existe no MAPA depois de publicar. Antes,
            quem não publicava via a tela dizer "salvo" e o /geo vazio. */}
        {active && (dirty || pendenteDePublicar) && (
          <span
            data-testid={dirty ? 'builder-dirty' : 'builder-pendente'}
            className="text-[10px] font-mono text-warning"
          >
            {dirty ? t('builder.naoSalvo') : t('builder.naoPublicado')}
          </span>
        )}
        {publicado && !dirty && !pendenteDePublicar && (
          <span data-testid="builder-publicado" className="text-[10px] font-mono text-success">
            {publicado.n} {t('builder.noMapa')}
            {publicado.removidos > 0 ? ` · −${publicado.removidos}` : ''}
          </span>
        )}
        {active && (
          <button
            type="button"
            data-testid="builder-exportar"
            onClick={exportar}
            title={t('builder.exportar')}
            aria-label={t('builder.exportar')}
            className="h-6 w-6 flex items-center justify-center border border-border-light hover:bg-raised-light"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
        {canManage && active && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={IMPORT_ACCEPT}
              data-testid="builder-import-input"
              className="hidden"
              onChange={(e) => {
                void importarArquivo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              data-testid="builder-importar"
              onClick={() => fileRef.current?.click()}
              title={t('builder.importar')}
              aria-label={t('builder.importar')}
              className="h-6 w-6 flex items-center justify-center border border-border-light hover:bg-raised-light"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </>
        )}
        {canManage && (
          <button
            type="button"
            data-testid="builder-salvar"
            onClick={salvar}
            disabled={!activeId || !dirty || saving}
            title={t('builder.salvarAjuda')}
            className="h-6 px-2 text-[11px] text-muted-on-light border border-border-light hover:bg-raised-light disabled:opacity-40 flex items-center gap-1"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
            {t('builder.salvarRascunho')}
            {/* rascunho = guardar SEM mandar pro mapa (raro; o gesto normal é
                o botão ao lado, que salva e publica de uma vez) */}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            data-testid="builder-publicar"
            onClick={publicar}
            disabled={!activeId || publishing}
            title={t('builder.publicarAjuda')}
            className="h-6 px-2 text-[11px] border border-accent bg-accent text-white hover:opacity-90 disabled:opacity-40 flex items-center gap-1"
          >
            {publishing && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
            {dirty || pendenteDePublicar
              ? t('builder.salvarEPublicar')
              : t('builder.publicar')}
          </button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Árvore: Mapas → Camadas → feições por categoria */}
        <aside className="w-64 shrink-0 border-r border-border-light overflow-y-auto">
          <div className="h-8 px-3 flex items-center gap-1.5 border-b border-border-light">
            <span className="text-[11px] flex-1 text-muted-on-light">
              {t('builder.camadas')}
            </span>
            {canManage && (
              <button
                type="button"
                data-testid="builder-nova-camada"
                onClick={criarCamada}
                title={t('builder.camada.nova')}
                aria-label={t('builder.camada.nova')}
                className="h-5 w-5 flex items-center justify-center hover:bg-raised-light"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>

          {loading && (
            <p className="px-3 py-2 text-[11px] text-muted-on-light">
              {t('builder.carregando')}
            </p>
          )}
          {erroKey && <p className="px-3 py-2 text-[11px] text-danger">{t(erroKey)}</p>}
          {!loading && !erroKey && layers.length === 0 && (
            <p className="px-3 py-3 text-[11px] text-muted-on-light leading-relaxed">
              {t('builder.vazio')}
            </p>
          )}

          {visibleGroups.map((grupo) => {
            const open = openGroups[grupo.slug] !== false;
            return (
              <div key={grupo.slug} className="border-b border-border-light">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((p) => ({ ...p, [grupo.slug]: !open }))
                  }
                  className="w-full h-8 px-3 flex items-center gap-1.5 text-[11px] hover:bg-raised-light"
                >
                  {open ? (
                    <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                  )}
                  <span className="flex-1 truncate text-left">{grupo.label}</span>
                  <span className="font-mono text-[9px] text-muted-on-light">
                    {grupo.layers.length}
                  </span>
                </button>
                {open &&
                  grupo.layers.map((l) => (
                    <LayerRow
                      key={l.id}
                      layer={l}
                      active={l.id === activeId}
                      onClick={() => trocarCamada(l.id)}
                    />
                  ))}
              </div>
            );
          })}
          {visibleAvulsas.map((l) => (
            <LayerRow
              key={l.id}
              layer={l}
              active={l.id === activeId}
              onClick={() => trocarCamada(l.id)}
            />
          ))}

          {/* Feições da camada ativa, agrupadas por categoria (= grupos do My Maps) */}
          {active && rows.length > 0 && (
            <div className="border-t border-border-light mt-1">
              <p className="px-3 h-7 flex items-center text-[10px] uppercase tracking-wide text-muted-on-light">
                {t('builder.feicoes')} · {rows.length}
              </p>
              {grupos.map((g) => (
                <div key={`cat:${g.categoria}`}>
                  {g.categoria && (
                    <div className="px-3 py-1 flex items-center gap-1.5 bg-raised-light/40">
                      <span className="flex-1 truncate text-[10px] text-muted-on-light">
                        {g.categoria}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          data-testid={`builder-estilo-cat-${g.categoria}`}
                          onClick={() =>
                            setEstiloAberto((cur) =>
                              cur === `cat:${g.categoria}` ? null : `cat:${g.categoria}`,
                            )
                          }
                          title={t('builder.estilo.categoria')}
                          aria-label={t('builder.estilo.categoria')}
                          className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
                        >
                          <Palette className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  )}
                  {estiloAberto === `cat:${g.categoria}` && (
                    <EstiloPicker
                      testId={`builder-paleta-cat-${g.categoria}`}
                      atual={g.rows[0]?.geo_style}
                      onPick={(style, fecha) => {
                        aplicarEstilo({ categoria: g.categoria }, style);
                        if (fecha) setEstiloAberto(null);
                      }}
                    />
                  )}
                  <ul>
                    {g.rows.map((r) => (
                      <li
                        key={r.id}
                        data-testid={`builder-feicao-${r.id}`}
                        className={cn(
                          'px-3 py-1 text-[11px] flex items-center gap-2 hover:bg-raised-light/50 cursor-pointer',
                          selectedId === r.id && 'bg-raised-light',
                        )}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <span
                          className="w-2 h-2 shrink-0 border border-white/40"
                          style={{ backgroundColor: r.geo_style?.color || '#2D77BE' }}
                        />
                        <span className="flex-1 truncate">
                          {r.nome || t('builder.feicaoSemNome')}
                        </span>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              data-testid={`builder-estilo-${r.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEstiloAberto((cur) =>
                                  cur === `f:${r.id}` ? null : `f:${r.id}`,
                                );
                              }}
                              aria-label={t('builder.estilo.feicao')}
                              className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
                            >
                              <Palette className="w-3 h-3" strokeWidth={1.5} />
                            </button>
                            {canFence && anelDaFeicao(r) && (
                              <button
                                type="button"
                                data-testid={`builder-cerca-${r.id}`}
                                disabled={promovendo === r.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void promoverACerca(r);
                                }}
                                title={t('builder.cerca.titulo')}
                                aria-label={t('builder.cerca.titulo')}
                                className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
                              >
                                <Shield className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void renomearFeicao(r);
                              }}
                              aria-label={t('builder.feicao.renomear')}
                              className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
                            >
                              <PenLine className="w-3 h-3" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              data-testid={`builder-remover-${r.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                removerFeicoes([r.id]);
                              }}
                              aria-label={t('builder.feicao.remover')}
                              className="h-4 w-4 flex items-center justify-center text-muted-on-light hover:text-danger"
                            >
                              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                    {g.rows.map((r) =>
                      estiloAberto === `f:${r.id}` ? (
                        <li key={`estilo-${r.id}`}>
                          <EstiloPicker
                            testId={`builder-paleta-${r.id}`}
                            atual={r.geo_style}
                            onPick={(style, fecha) => {
                              aplicarEstilo({ id: r.id }, style);
                              if (fecha) setEstiloAberto(null);
                            }}
                          />
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Mesa de desenho */}
        <div className="flex-1 min-w-0 relative">
          {canManage && active && (
            <div className="absolute top-2 left-2 z-10 flex border border-border-light bg-surface-light">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.mode}
                    type="button"
                    data-testid={`builder-tool-${tool.mode}`}
                    onClick={() => setMode(tool.mode)}
                    title={t(tool.key)}
                    aria-label={t(tool.key)}
                    aria-pressed={mode === tool.mode}
                    className={cn(
                      'h-7 w-7 flex items-center justify-center border-r border-border-light last:border-r-0',
                      mode === tool.mode
                        ? 'bg-accent text-white'
                        : 'hover:bg-raised-light text-muted-on-light',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
          )}
          {active ? (
            <BuilderMap
              center={center}
              zoom={typeof cfg.zoom === 'number' ? cfg.zoom : 13}
              view={cfg.view || 'streets'}
              features={rows}
              selectedId={selectedId}
              mode={mode}
              readOnly={!canManage}
              onModeChange={setMode}
              onDrawCreate={onDrawCreate}
              onDrawUpdate={onDrawUpdate}
              onDrawDelete={removerFeicoes}
              onSelect={setSelectedId}
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center p-6">
              <Upload className="w-5 h-5 text-muted-on-light" strokeWidth={1.5} />
              <p className="text-[12px] text-muted-on-light max-w-xs leading-relaxed">
                {t('builder.semCamada')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Paleta de classificação + extrusão 3D. A cor é a mesma que o /geo desenha
 *  (viaja em `geo_style` até `properties.geo_style` do nó). */
function EstiloPicker({
  atual,
  onPick,
  testId,
}: {
  atual?: FeatureStyle;
  /** `fecha` = o gesto terminou (escolher cor). O slider de altura dispara a
   *  cada tick e NÃO pode fechar o painel — fecharia no primeiro movimento e a
   *  altura congelaria onde o ponteiro caiu. */
  onPick: (style: FeatureStyle, fecha: boolean) => void;
  testId: string;
}) {
  const t = useT();
  const altura = atual?.extruded_height ?? 0;
  return (
    <div
      data-testid={testId}
      className="px-3 py-2 border-y border-border-light bg-surface-light flex flex-col gap-2"
    >
      <div className="flex flex-wrap gap-1">
        {PALETA.map((p) => (
          <button
            key={p.color}
            type="button"
            data-testid={`${testId}-${p.color.replace('#', '')}`}
            onClick={() => onPick({ color: p.color, alpha: atual?.alpha ?? 0.35 }, true)}
            title={t(p.key)}
            aria-label={t(p.key)}
            className={cn(
              'w-5 h-5 border',
              atual?.color === p.color ? 'border-text-on-light' : 'border-white/40',
            )}
            style={{ backgroundColor: p.color }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[10px] text-muted-on-light">
        <span className="shrink-0">{t('builder.estilo.altura')}</span>
        <input
          type="range"
          min={0}
          max={600}
          step={20}
          value={altura}
          data-testid={`${testId}-altura`}
          onChange={(e) => onPick({ extruded_height: Number(e.target.value) }, false)}
          className="flex-1"
        />
        <span className="font-mono w-10 text-right">
          {altura}
          {t('builder.estilo.metros')}
        </span>
      </label>
    </div>
  );
}

function LayerRow({
  layer,
  active,
  onClick,
}: {
  layer: Layer;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`builder-camada-${layer.id}`}
      onClick={onClick}
      className={cn(
        'w-full px-3 py-1.5 text-[11px] flex items-center gap-2 text-left hover:bg-raised-light/60',
        active && 'bg-raised-light',
      )}
    >
      <span className="flex-1 truncate" title={layer.node_type}>
        {layer.nome}
      </span>
      {/* desenhadas / no mapa — divergiu, tem coisa esperando publicação */}
      <span
        className={cn(
          'font-mono text-[9px] shrink-0',
          layer.feature_count !== layer.materialized_count
            ? 'text-warning'
            : 'text-muted-on-light',
        )}
        title={
          layer.feature_count !== layer.materialized_count
            ? `${layer.feature_count} desenhadas · ${layer.materialized_count} no mapa`
            : undefined
        }
      >
        {layer.feature_count !== layer.materialized_count
          ? `${layer.feature_count}/${layer.materialized_count}`
          : layer.feature_count}
      </span>
    </button>
  );
}

registerWidget('layer_builder', LayerBuilder, {
  group: 'viz',
  label: 'Construtor de camadas',
  description:
    'Desenhe, organize e publique camadas de referência do mapa (polígonos, linhas e pontos). Cada camada vira um fluxo no DAG e aparece no /geo com o estilo de cada feição.',
  icon: 'layers',
  defaultColSpan: 12,
  mockConfig: {
    title: 'Construtor de camadas',
    height: 560,
    view: 'streets',
    zoom: 13,
  },
  mockVariables: {},
  config_schema: [
    { name: 'title', label: 'Título', field: 'string', placeholder: 'ex.: Construtor de camadas' },
    { name: 'height', label: 'Altura', field: 'number', min: 400, max: 900, step: 20, default: 560, unit: 'px' },
    {
      name: 'view', label: 'Base', field: 'select', default: 'streets',
      options: [
        { value: 'streets', label: 'Ruas' },
        { value: 'satellite', label: 'Satélite' },
        { value: 'dark', label: 'Escuro' },
        { value: 'light', label: 'Claro' },
      ],
    },
    {
      name: 'map_tag', label: 'Mapa (grupo)', field: 'string',
      description: 'Abre já filtrado neste mapa. Vazio = todas as camadas do tenant.',
      placeholder: 'ex.: seguranca-centro',
    },
    { name: 'center_lat', label: 'Centro (lat)', field: 'number', step: 0.0001, default: -23.5505 },
    { name: 'center_lng', label: 'Centro (lng)', field: 'number', step: 0.0001, default: -46.6333 },
    { name: 'zoom', label: 'Zoom', field: 'number', min: 1, max: 20, step: 1, default: 13 },
  ],
});

export { LayerBuilder };
