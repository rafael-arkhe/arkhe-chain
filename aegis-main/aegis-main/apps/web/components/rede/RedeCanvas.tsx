'use client';

/**
 * RedeCanvas — wrapper de `react-force-graph-2d` para o painel /rede.
 *
 * Cada `kind` da ontologia tem cor + shape + ícone próprios. Ícones são
 * SVG paths do lucide-react pré-cacheados como HTMLImageElement (data
 * URI) e desenhados via ctx.drawImage no centro do shape colorido.
 *
 * Dynamic import com `ssr: false` é obrigatório: a lib usa <canvas> e
 * d3-force, que tocam `window`/`document` no construtor.
 */
import { useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Entity, EntityLink } from '@/lib/api/types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div
      data-testid="rede-canvas-loading"
      className="flex h-full w-full items-center justify-center bg-canvas-light"
    >
      <p className="text-[11px] font-mono text-muted-on-light">
        Carregando motor de grafo…
      </p>
    </div>
  ),
}) as unknown as React.ComponentType<Record<string, unknown>>;

/* -------------------------------------------------------------------------- */
/* Style por kind (cor + shape + path SVG do lucide)                          */
/* -------------------------------------------------------------------------- */
type Shape = 'circle' | 'square' | 'diamond' | 'hex';

/** Paths SVG lucide-react @ viewBox 24x24, stroke-only — desenhados em
 *  branco em cima do shape colorido. Path simplificado pra cada kind. */
const LUCIDE_PATH: Record<string, string> = {
  // Política
  parlamentar:   'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  partido:       'M3 22h18 M5 22V12a7 7 0 1 1 14 0v10 M9 22v-4h6v4 M9 8h.01 M15 8h.01',
  uf:            'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  // Empresa / fornecedor
  fornecedor:    'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18 M2 22h20 M9 7h.01 M13 7h.01 M9 11h.01 M13 11h.01 M9 15h.01 M13 15h.01',
  empresa:       'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18 M2 22h20 M9 7h.01 M13 7h.01 M9 11h.01 M13 11h.01',
  // Mídia
  video:         'm22 8-6 4 6 4V8z M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z',
  canal:         'M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z M7 21l5-3 5 3',
  // Tempo / agenda
  evento:        'M8 2v4 M16 2v4 M3 10h18 M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z',
  // Social
  perfil_social: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  // Notícia
  noticia:       'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zM10 6h8v4h-8z M10 14h8 M10 18h6',
  // Documentos
  proposicao:    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  // Pessoa investigada
  pessoa:        'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  // Threat IOC
  ioc:           'M12 9v4 M12 17h.01 M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  // Endereço / casa
  endereco:      'M9 22V12h6v10 M2 10.6 12 2l10 8.6V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9.4z',
  // Legacy
  veiculo:       'M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2 M14 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  telefone:      'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  mandado:       'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  bo:            'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  organizacao:   'M2 22h20 M4 22V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14 M10 6V4a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v2 M9 22v-4h6v4',
  arma:          'M9 11l3 3L22 4',
};

const TYPE_STYLE: Record<string, { color: string; shape: Shape; iconKey?: string }> = {
  parlamentar:   { color: '#2D77BE', shape: 'circle',  iconKey: 'parlamentar' },
  partido:       { color: '#9C27B0', shape: 'square',  iconKey: 'partido' },
  uf:            { color: '#3D9F58', shape: 'diamond', iconKey: 'uf' },
  fornecedor:    { color: '#E8B33B', shape: 'hex',     iconKey: 'fornecedor' },
  video:         { color: '#E97D2A', shape: 'square',  iconKey: 'video' },
  canal:         { color: '#E97D2A', shape: 'square',  iconKey: 'canal' },
  evento:        { color: '#5C6470', shape: 'diamond', iconKey: 'evento' },
  perfil_social: { color: '#7B68EE', shape: 'circle',  iconKey: 'perfil_social' },
  noticia:       { color: '#0066CC', shape: 'square',  iconKey: 'noticia' },
  proposicao:    { color: '#C8341F', shape: 'square',  iconKey: 'proposicao' },
  empresa:       { color: '#E8B33B', shape: 'square',  iconKey: 'empresa' },
  pessoa:        { color: '#2D77BE', shape: 'circle',  iconKey: 'pessoa' },
  ioc:           { color: '#C8341F', shape: 'diamond', iconKey: 'ioc' },
  endereco:      { color: '#8A93A0', shape: 'diamond', iconKey: 'endereco' },
  veiculo:       { color: '#3D9F58', shape: 'square',  iconKey: 'veiculo' },
  telefone:      { color: '#E97D2A', shape: 'circle',  iconKey: 'telefone' },
  mandado:       { color: '#C8341F', shape: 'square',  iconKey: 'mandado' },
  bo:            { color: '#E8B33B', shape: 'diamond', iconKey: 'bo' },
  organizacao:   { color: '#C8341F', shape: 'hex',     iconKey: 'organizacao' },
  arma:          { color: '#E8B33B', shape: 'square',  iconKey: 'arma' },
};

function styleFor(type: string | undefined): { color: string; shape: Shape; iconKey?: string } {
  if (!type) return { color: '#8A93A0', shape: 'circle' };
  return TYPE_STYLE[type] ?? { color: '#8A93A0', shape: 'circle' };
}

/** Desenha shape geométrica centrada em (x, y) com raio `r`. */
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      break;
    case 'square':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'hex': {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
  }
}

/** Cache de Image objects por iconKey (data URI SVG branco). */
const ICON_CACHE = new Map<string, HTMLImageElement>();

function getIconImage(iconKey: string): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const cached = ICON_CACHE.get(iconKey);
  if (cached) return cached;
  const path = LUCIDE_PATH[iconKey];
  if (!path) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.src = dataUri;
  ICON_CACHE.set(iconKey, img);
  return img;
}

export type RedeNode = Entity & {
  /** Tamanho relativo derivado do degree no subgrafo. */
  val?: number;
};

export type RedeLink = {
  source: string;
  target: string;
  label?: string;
  /** Carrega o objeto original do backend pra inspeção. */
  raw?: EntityLink;
};

type Props = {
  nodes: Entity[];
  links: EntityLink[];
  selectedId: string | null;
  rootId: string | null;
  onNodeClick: (node: Entity) => void;
  width: number;
  height: number;
};

export function RedeCanvas({
  nodes,
  links,
  selectedId,
  rootId,
  onNodeClick,
  width,
  height,
}: Props) {
  const fgRef = useRef<unknown>(null);

  /** Pre-carrega imagens pra todos kinds presentes (assíncrono, sem block). */
  useEffect(() => {
    const kinds = new Set(nodes.map((n) => styleFor(n.entity_type).iconKey).filter(Boolean) as string[]);
    for (const k of kinds) getIconImage(k);
  }, [nodes]);

  /** Tamanho proporcional ao degree (clamp 8..18). */
  const sized = useMemo(() => {
    const deg = new Map<string, number>();
    for (const l of links) {
      deg.set(l.source_id, (deg.get(l.source_id) ?? 0) + 1);
      deg.set(l.target_id, (deg.get(l.target_id) ?? 0) + 1);
    }
    const max = Math.max(1, ...Array.from(deg.values()));
    // Base 2× o tamanho anterior (28..52 em grafo pequeno).
    // Boost adaptativo cap em 1.6× pra grafos densos não estourarem.
    const N = nodes.length;
    const sizeBoost = Math.min(1.6, 1 + (N - 20) / 150);
    const base = 28 * sizeBoost;
    const range = 24 * sizeBoost;
    // Onda 2 — super-nó de CLUSTER dimensiona pela CONTAGEM de membros (_count),
    // não pelo grau; escala log p/ um cluster gigante não estourar a viewport.
    const maxCount = Math.max(
      1,
      ...nodes.map((n) => ((n as Entity)._count ?? 0)),
    );
    return nodes.map((n) => {
      const cnt = (n as Entity)._count;
      if (typeof cnt === 'number') {
        const ratio = Math.log(cnt + 1) / Math.log(maxCount + 1);
        return { ...n, val: base + ratio * range * 1.8 };
      }
      const d = deg.get(n.id) ?? 0;
      const ratio = max > 0 ? d / max : 0;
      const val = base + ratio * range;
      return { ...n, val };
    });
  }, [nodes, links]);

  /** Shape exigido pelo force-graph: { nodes, links } com source/target string. */
  const graphData = useMemo(
    () => ({
      nodes: sized,
      links: links.map<RedeLink>((l) => ({
        source: l.source_id,
        target: l.target_id,
        label: l.link_type,
        raw: l,
      })),
    }),
    [sized, links],
  );

  /** Configura forças d3 pra grafo bem espalhado + reset zoom.
   *  Re-tenta até fgRef.current estar populado (force-graph é dynamic). */
  useEffect(() => {
    if (nodes.length === 0) return;
    let cancelled = false;
    const timers: number[] = [];

    type FgApi = {
      zoomToFit?: (ms: number, padding: number) => void;
      d3Force?: (name: string, force?: unknown) => {
        distance?: (n: number) => unknown;
        strength?: (n: number | ((node: unknown) => number)) => unknown;
        distanceMax?: (n: number) => unknown;
      } | null;
      d3ReheatSimulation?: () => void;
    };

    const applyForces = async (fg: FgApi) => {
      const nNodes = nodes.length;
      let d3: typeof import('d3-force-3d') | null = null;
      try {
        d3 = await import('d3-force-3d');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[rede] d3-force-3d não disponível:', e);
      }

      try {
        const chargeForce = fg.d3Force?.('charge');
        // Charge moderado — proporcional ao N mas com teto, pra não
        // empurrar os nodes pra fora da viewport
        const charge = -Math.min(8000, Math.max(2500, nNodes * 50));
        chargeForce?.strength?.(charge);
        // eslint-disable-next-line no-console
        console.info('[rede] charge applied:', charge, 'nodes:', nNodes);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[rede] charge falhou:', e);
      }

      try {
        const linkForce = fg.d3Force?.('link');
        linkForce?.distance?.(150);
        linkForce?.strength?.(0.4);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[rede] link falhou:', e);
      }

      if (d3) {
        try {
          // Collide proporcional ao boost — gap de 12px após o raio
          const collide = d3
            .forceCollide()
            .radius((n: unknown) => ((n as RedeNode).val ?? 14) + 12)
            .strength(1)
            .iterations(2);
          fg.d3Force?.('collide', collide as unknown as never);
          // eslint-disable-next-line no-console
          console.info('[rede] forceCollide registered');
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[rede] collide falhou:', e);
        }
      }

      try {
        fg.d3ReheatSimulation?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[rede] reheat falhou:', e);
      }

      // Fit após simulator descansar — padding menor em grafos grandes
      // pra nodes ocuparem mais pixels da viewport.
      const padding = nNodes > 50 ? 20 : 60;
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) {
            try {
              fg.zoomToFit?.(800, padding);
            } catch {
              /* ignora */
            }
          }
        }, 2000),
      );
    };

    // Re-tenta até fgRef populado (dynamic import async)
    let attempts = 0;
    const tryApply = () => {
      if (cancelled) return;
      attempts += 1;
      const fg = fgRef.current as FgApi | null;
      if (fg && typeof fg.d3Force === 'function') {
        // eslint-disable-next-line no-console
        console.info('[rede] fgRef pronto após', attempts, 'tentativa(s)');
        void applyForces(fg);
        return;
      }
      if (attempts < 30) {
        timers.push(window.setTimeout(tryApply, 100));
      } else {
        // eslint-disable-next-line no-console
        console.warn('[rede] desistiu de pegar fgRef após 30 tentativas');
      }
    };
    tryApply();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [rootId, nodes.length, links.length]);

  if (nodes.length === 0) {
    return (
      <div
        data-testid="rede-canvas-empty"
        className="flex h-full w-full flex-col items-center justify-center gap-2 bg-canvas-light"
      >
        <p className="text-[12px] font-semibold text-text-on-light">
          Nenhuma entidade selecionada
        </p>
        <p className="text-[11px] font-mono text-muted-on-light">
          Use a busca à esquerda para escolher um nó raiz e expandir vínculos.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="rede-canvas" className="h-full w-full bg-canvas-light">
      <ForceGraph2D
        ref={fgRef as never}
        graphData={graphData as never}
        width={width}
        height={height}
        backgroundColor="#FFFFFF"
        nodeId="id"
        nodeRelSize={4}
        nodeVal={(n: unknown) => (n as RedeNode).val ?? 8}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={(node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as Entity & { x?: number; y?: number; val?: number };
          if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
          const { color, shape, iconKey } = styleFor(n.entity_type);
          const isSelected = selectedId === n.id;
          const isRoot = rootId === n.id;
          const radius = n.val ?? 10;

          // Halo do nó raiz / selecionado
          if (isRoot || isSelected) {
            ctx.save();
            drawShape(ctx, shape, n.x, n.y, radius + 4);
            ctx.lineWidth = 2.5 / globalScale;
            ctx.strokeStyle = isRoot ? '#14181E' : '#2D77BE';
            ctx.stroke();
            ctx.restore();
          }

          // Shape colorido
          drawShape(ctx, shape, n.x, n.y, radius);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 1.5 / globalScale;
          ctx.strokeStyle = '#0a0e14';
          ctx.stroke();

          // Ícone lucide dentro do shape (60% do raio)
          if (iconKey) {
            const img = getIconImage(iconKey);
            if (img && img.complete && img.naturalWidth > 0) {
              const iconSize = radius * 1.2;
              ctx.drawImage(img, n.x - iconSize / 2, n.y - iconSize / 2, iconSize, iconSize);
            }
          }

          // Label SEMPRE visível abaixo do node — fontSize escalado pelo
          // globalScale pra ficar legível mesmo em zoom-out forte.
          // Sem threshold de zoom: usuário sempre lê o que é cada node.
          {
            const label = n.name || n.id;
            // fontSize world-space (cresce com zoom-out) — 14px world ≈
            // 14px tela na escala 1, e fica visível mesmo zoom 0.2.
            const fontSize = Math.max(14 / Math.max(0.4, globalScale), 12);
            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const truncated = label.length > 32 ? label.slice(0, 32) + '…' : label;
            const m = ctx.measureText(truncated);
            const pad = 4 / Math.max(0.4, globalScale);
            const labelY = n.y + radius + 4;
            // Fundo branco com borda sutil pra contraste
            ctx.fillStyle = 'rgba(255,255,255,0.96)';
            ctx.fillRect(
              n.x - m.width / 2 - pad,
              labelY,
              m.width + pad * 2,
              fontSize + pad * 2,
            );
            ctx.strokeStyle = 'rgba(20,24,30,0.15)';
            ctx.lineWidth = 0.5 / globalScale;
            ctx.strokeRect(
              n.x - m.width / 2 - pad,
              labelY,
              m.width + pad * 2,
              fontSize + pad * 2,
            );
            ctx.fillStyle = '#14181E';
            ctx.fillText(truncated, n.x, labelY + pad);
          }
        }}
        nodePointerAreaPaint={(node: unknown, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as Entity & { x?: number; y?: number; val?: number };
          if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
          const { shape } = styleFor(n.entity_type);
          const radius = (n.val ?? 10) + 4;
          ctx.fillStyle = color;
          drawShape(ctx, shape, n.x, n.y, radius);
          ctx.fill();
        }}
        nodeLabel={(n: unknown) => {
          // Tooltip nativo é HTML — usa-se estilo inline pra parecer com
          // o resto do app (sharp, monospace, sem rounded).
          const e = n as Entity;
          return `<div style="font-family:Inter,sans-serif;background:#FFFFFF;border:1px solid #D7DBDF;padding:6px 8px;font-size:11px;color:#14181E;max-width:240px;line-height:1.4"><div style="font-weight:600">${e.name}</div><div style="font-family:'JetBrains Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:#5C6470;margin-top:2px">${e.entity_type}</div></div>`;
        }}
        linkColor={(l: unknown) => {
          const link = l as RedeLink;
          const sId = typeof link.source === 'string' ? link.source : (link.source as unknown as Entity).id;
          const tId = typeof link.target === 'string' ? link.target : (link.target as unknown as Entity).id;
          if (selectedId && (sId === selectedId || tId === selectedId)) return '#2D77BE';
          return '#8A93A0';
        }}
        linkWidth={(l: unknown) => {
          const link = l as RedeLink;
          const sId = typeof link.source === 'string' ? link.source : (link.source as unknown as Entity).id;
          const tId = typeof link.target === 'string' ? link.target : (link.target as unknown as Entity).id;
          if (selectedId && (sId === selectedId || tId === selectedId)) return 2.5;
          return 1.2;
        }}
        linkCurvature={0.15}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={0.95}
        linkDirectionalArrowColor={() => '#5C6470'}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const l = link as RedeLink & { source: unknown; target: unknown };
          const src = l.source as { x?: number; y?: number };
          const tgt = l.target as { x?: number; y?: number };
          if (
            typeof src.x !== 'number' ||
            typeof src.y !== 'number' ||
            typeof tgt.x !== 'number' ||
            typeof tgt.y !== 'number'
          )
            return;
          if (!l.label || globalScale < 0.7) return;
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          const fontSize = Math.max(9 / globalScale, 2.5);
          ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const m = ctx.measureText(l.label);
          const pad = 3 / globalScale;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(mx - m.width / 2 - pad, my - fontSize / 2 - pad, m.width + pad * 2, fontSize + pad * 2);
          ctx.fillStyle = '#5C6470';
          ctx.fillText(l.label, mx, my);
        }}
        onNodeClick={(node: unknown) => onNodeClick(node as Entity)}
        onNodeHover={(node: unknown) => {
          if (typeof document !== 'undefined') {
            document.body.style.cursor = node ? 'pointer' : 'default';
          }
        }}
        /* Mais ticks; decay lento; warmup pra estabilizar antes de mostrar */
        cooldownTicks={800}
        d3VelocityDecay={0.15}
        d3AlphaDecay={0.008}
        warmupTicks={100}
        minZoom={0.05}
        maxZoom={6}
      />
    </div>
  );
}
