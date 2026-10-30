'use client';

/**
 * Legenda dos tipos de node presentes no grafo. Mostra shape + cor +
 * count por kind no canto superior direito do canvas.
 */
import * as React from 'react';
import type { Entity } from '@/lib/api/types';

type Shape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hex';

const TYPE_STYLE: Record<string, { color: string; shape: Shape; label?: string }> = {
  parlamentar:   { color: '#2D77BE', shape: 'circle',   label: 'Parlamentar' },
  partido:       { color: '#9C27B0', shape: 'square',   label: 'Partido' },
  uf:            { color: '#3D9F58', shape: 'diamond',  label: 'UF / Estado' },
  fornecedor:    { color: '#E8B33B', shape: 'hex',      label: 'Fornecedor CEAP' },
  video:         { color: '#E97D2A', shape: 'triangle', label: 'Vídeo' },
  canal:         { color: '#E97D2A', shape: 'square',   label: 'Canal' },
  evento:        { color: '#5C6470', shape: 'diamond',  label: 'Evento' },
  perfil_social: { color: '#7B68EE', shape: 'circle',   label: 'Perfil social' },
  noticia:       { color: '#0066CC', shape: 'square',   label: 'Notícia' },
  proposicao:    { color: '#C8341F', shape: 'square',   label: 'Proposição' },
  empresa:       { color: '#E8B33B', shape: 'square',   label: 'Empresa' },
  pessoa:        { color: '#2D77BE', shape: 'circle',   label: 'Pessoa' },
  ioc:           { color: '#C8341F', shape: 'diamond',  label: 'IOC' },
  veiculo:       { color: '#3D9F58', shape: 'square',   label: 'Veículo' },
  telefone:      { color: '#E97D2A', shape: 'circle',   label: 'Telefone' },
  mandado:       { color: '#C8341F', shape: 'square',   label: 'Mandado' },
  bo:            { color: '#E8B33B', shape: 'diamond',  label: 'BO' },
  endereco:      { color: '#8A93A0', shape: 'diamond',  label: 'Endereço' },
  organizacao:   { color: '#C8341F', shape: 'hex',      label: 'Organização' },
  arma:          { color: '#E8B33B', shape: 'triangle', label: 'Arma' },
};

function ShapeIcon({
  shape,
  color,
  size = 12,
}: {
  shape: Shape;
  color: string;
  size?: number;
}) {
  const r = size / 2;
  switch (shape) {
    case 'circle':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={r} cy={r} r={r - 1} fill={color} stroke="#0a0e14" strokeWidth="1" />
        </svg>
      );
    case 'square':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <rect x="1" y="1" width={size - 2} height={size - 2} fill={color} stroke="#0a0e14" strokeWidth="1" />
        </svg>
      );
    case 'diamond':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon
            points={`${r},1 ${size - 1},${r} ${r},${size - 1} 1,${r}`}
            fill={color}
            stroke="#0a0e14"
            strokeWidth="1"
          />
        </svg>
      );
    case 'triangle':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon
            points={`${r},1 ${size - 1},${size - 1} 1,${size - 1}`}
            fill={color}
            stroke="#0a0e14"
            strokeWidth="1"
          />
        </svg>
      );
    case 'hex': {
      const angle0 = Math.PI / 6;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + angle0;
        const x = r + (r - 1) * Math.cos(a);
        const y = r + (r - 1) * Math.sin(a);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts} fill={color} stroke="#0a0e14" strokeWidth="1" />
        </svg>
      );
    }
  }
}

export function RedeLegenda({ nodes }: { nodes: Entity[] }) {
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.entity_type, (m.get(n.entity_type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  if (counts.length === 0) return null;

  return (
    <div
      data-testid="rede-legenda"
      className="absolute top-3 right-3 bg-white border border-border-light px-2 py-1.5 z-10 max-h-[60vh] overflow-y-auto"
    >
      <p className="text-[9px] uppercase tracking-[0.16em] font-semibold font-mono text-muted-on-light mb-1.5">
        Tipos · {counts.length}
      </p>
      <ul className="space-y-0.5">
        {counts.map(([type, n]) => {
          const style = TYPE_STYLE[type] ?? { color: '#8A93A0', shape: 'circle' as Shape, label: type };
          return (
            <li key={type} className="flex items-center gap-2 text-[10px]">
              <ShapeIcon shape={style.shape} color={style.color} />
              <span className="flex-1 text-text-on-light">{style.label ?? type}</span>
              <span className="font-mono text-muted-on-light">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
