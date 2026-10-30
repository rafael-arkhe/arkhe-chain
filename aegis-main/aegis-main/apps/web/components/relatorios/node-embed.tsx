'use client';

/**
 * <ReportNodeEmbed> — widget GENÉRICO embutido num relatório referenciando um
 * OntologyNode (P5 Onda 4). O relatório deixa de ser markdown livre e passa a
 * REFLETIR a ontologia: o operador "compila a partir de um nó" e o documento
 * mostra os dados AO VIVO do objeto (mesma fonte da /ficha).
 *
 * Domínio-neutro: opera sobre `node_id` + um `widget` do catálogo fechado
 * (object_table/vizinhos/correlacao/mapa/timeline) — nunca um vertical fixo.
 * Tudo via `Ontology` (canônico, governado por marking/tenant no backend), o que
 * mantém o embed determinístico (reflete o grafo materializado, não dispara
 * fan-out externo). O registro do embed + LineageEvent é feito no insert
 * (Notepad.embed) — aqui só renderizamos.
 *
 * data-testids: node-embed, node-embed-loading, node-embed-error,
 *   node-embed-empty, node-embed-title, node-embed-body.
 */
import * as React from 'react';
import {
  AlertCircle,
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  MapPin,
  Share2,
  Table2,
} from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Ontology } from '@/lib/api';
import type { NodeVersion } from '@/lib/api';
import type { OntologyNode, OntologyGraph } from '@/lib/api/types';

export type EmbedWidget =
  | 'object_table'
  | 'vizinhos'
  | 'correlacao'
  | 'mapa'
  | 'timeline';

export const EMBED_WIDGETS: EmbedWidget[] = [
  'object_table',
  'vizinhos',
  'correlacao',
  'mapa',
  'timeline',
];

const WIDGET_ICON: Record<EmbedWidget, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  object_table: Table2,
  vizinhos: Share2,
  correlacao: GitBranch,
  mapa: MapPin,
  timeline: Clock,
};

/** Extrai um par lat/lon das properties por FORMA do campo (multidomínio). */
function extractCoords(props: Record<string, unknown>): { lat: number; lon: number } | null {
  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const latKeys = ['latitude', 'lat', 'geo_lat', 'y'];
  const lonKeys = ['longitude', 'lon', 'lng', 'long', 'geo_lon', 'geo_lng', 'x'];
  let lat: number | null = null;
  let lon: number | null = null;
  for (const k of latKeys) if (lat === null && k in props) lat = num(props[k]);
  for (const k of lonKeys) if (lon === null && k in props) lon = num(props[k]);
  // objeto aninhado { lat, lng } / { latitude, longitude }
  for (const key of ['location', 'coordinates', 'geo', 'coord']) {
    const o = props[key];
    if (o && typeof o === 'object') {
      const obj = o as Record<string, unknown>;
      if (lat === null) lat = num(obj.lat ?? obj.latitude);
      if (lon === null) lon = num(obj.lng ?? obj.lon ?? obj.longitude);
    }
  }
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function ReportNodeEmbed({
  nodeId,
  widget,
}: {
  nodeId: string;
  widget: string;
}) {
  const t = useT();
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [node, setNode] = React.useState<OntologyNode | null>(null);
  const [graph, setGraph] = React.useState<OntologyGraph | null>(null);
  const [history, setHistory] = React.useState<NodeVersion[] | null>(null);

  const known = (EMBED_WIDGETS as string[]).includes(widget);

  React.useEffect(() => {
    if (!known) {
      setState('error');
      return;
    }
    let alive = true;
    setState('loading');
    (async () => {
      try {
        if (widget === 'vizinhos' || widget === 'correlacao') {
          const g = await Ontology.neighbors(nodeId, widget === 'correlacao' ? 2 : 1);
          if (alive) {
            setGraph(g);
            setState('ok');
          }
          return;
        }
        if (widget === 'timeline') {
          const h = await Ontology.nodeHistory(nodeId);
          if (alive) {
            setHistory(h);
            setState('ok');
          }
          return;
        }
        // object_table + mapa precisam do nó canônico.
        const n = await Ontology.getNode(nodeId);
        if (alive) {
          setNode(n);
          setState('ok');
        }
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [nodeId, widget, known]);

  const Icon = known ? WIDGET_ICON[widget as EmbedWidget] : AlertCircle;
  const titleKey = known ? `relatorios.widget.${widget}` : 'relatorios.embed.unknownWidget';

  return (
    <section
      className="my-3 border border-border-light bg-white"
      data-testid="node-embed"
      data-node-id={nodeId}
      data-widget={widget}
    >
      <header className="h-8 px-3 border-b border-border-light flex items-center gap-2 bg-canvas-light">
        <Icon className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <span className="text-[11px] font-semibold text-text-on-light" data-testid="node-embed-title">
          {t(titleKey)}
        </span>
        <a
          href={`/ficha/${encodeURIComponent(nodeId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          {t('relatorios.embed.openFicha')}
        </a>
      </header>

      <div className="p-3" data-testid="node-embed-body">
        {state === 'loading' && (
          <p
            className="flex items-center gap-1.5 text-[11px] text-muted-on-light"
            data-testid="node-embed-loading"
          >
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            {t('relatorios.embed.loading')}
          </p>
        )}
        {state === 'error' && (
          <p
            className="flex items-center gap-1.5 text-[11px] text-danger"
            data-testid="node-embed-error"
          >
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            {known ? t('relatorios.embed.error') : t('relatorios.embed.unknownWidget')}
          </p>
        )}
        {state === 'ok' && widget === 'object_table' && <ObjectTable node={node} />}
        {state === 'ok' && (widget === 'vizinhos' || widget === 'correlacao') && (
          <Neighbors graph={graph} rootId={nodeId} />
        )}
        {state === 'ok' && widget === 'mapa' && <MapEmbed node={node} />}
        {state === 'ok' && widget === 'timeline' && <Timeline history={history} />}
      </div>
    </section>
  );
}

function Empty() {
  const t = useT();
  return (
    <p className="text-[11px] text-muted-on-light italic" data-testid="node-embed-empty">
      {t('relatorios.embed.empty')}
    </p>
  );
}

function ObjectTable({ node }: { node: OntologyNode | null }) {
  const entries = Object.entries(node?.properties ?? {});
  if (!node || entries.length === 0) return <Empty />;
  return (
    <table className="w-full text-[11px] border-collapse">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-border-light/50 last:border-b-0">
            <td className="py-1 pr-3 align-top font-mono text-muted-on-light whitespace-nowrap">{k}</td>
            <td className="py-1 align-top text-text-on-light break-words">{fmtVal(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Neighbors({ graph, rootId }: { graph: OntologyGraph | null; rootId: string }) {
  const t = useT();
  const others = (graph?.nodes ?? []).filter((n) => n.id !== rootId);
  if (others.length === 0) return <Empty />;
  return (
    <ul className="space-y-1">
      {others.map((n) => (
        <li key={n.id} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-[10px] text-muted-on-light/80 uppercase tracking-wider shrink-0">
            {n.node_type}
          </span>
          <a
            href={`/ficha/${encodeURIComponent(n.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-on-light hover:text-primary hover:underline truncate"
          >
            {n.name || n.id}
          </a>
        </li>
      ))}
      <li className="text-[10px] text-muted-on-light pt-1">
        {others.length} · {(graph?.edges ?? []).length} {t('relatorios.widget.correlacao').toLowerCase()}
      </li>
    </ul>
  );
}

function MapEmbed({ node }: { node: OntologyNode | null }) {
  const t = useT();
  const coords = node ? extractCoords(node.properties ?? {}) : null;
  if (!coords) {
    return (
      <p className="text-[11px] text-muted-on-light italic" data-testid="node-embed-nocoords">
        {t('relatorios.embed.noCoords')}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 text-[11px]" data-testid="node-embed-coords">
      <MapPin className="w-4 h-4 text-primary shrink-0" strokeWidth={1.5} />
      <span className="font-mono text-text-on-light">
        {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
      </span>
      <a
        href={`/geo?lat=${coords.lat}&lon=${coords.lon}`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
      >
        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
        {t('relatorios.embed.openGeo')}
      </a>
    </div>
  );
}

function Timeline({ history }: { history: NodeVersion[] | null }) {
  const t = useT();
  const rows = [...(history ?? [])].sort((a, b) => a.version - b.version);
  if (rows.length === 0) return <Empty />;
  return (
    <ol className="space-y-1.5 border-l border-border-light pl-3">
      {rows.map((v) => (
        <li key={v.version} className="text-[11px] relative">
          <span className="absolute -left-[15px] top-1 w-1.5 h-1.5 bg-primary" aria-hidden />
          <span className="font-mono text-muted-on-light">
            {t('relatorios.embed.version')} {v.version}
          </span>
          {v.created_at && <span className="text-muted-on-light/70"> · {v.created_at}</span>}
          {v.author && <span className="text-text-on-light"> · {v.author}</span>}
        </li>
      ))}
    </ol>
  );
}
