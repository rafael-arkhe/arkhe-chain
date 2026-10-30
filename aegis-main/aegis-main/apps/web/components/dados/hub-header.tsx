'use client';

/**
 * HubHeader — chrome de topo PADRÃO das seções-hub embarcadas do /dados
 * (Conexões · Provedores · Modelos), F7.3c.
 *
 * A gramática da casca dá a cada pane um header h-9 com rótulo uppercase
 * [10px] (Acervo, Quadro, Conjuntos, inspetores). As seções-hub abriam com
 * botões soltos flutuando em `px-6 pt-4` — sem linha de chrome. Este header
 * fecha a inconsistência: rótulo à esquerda, ações compactas (h-7) à direita.
 *
 * Régua: cantos retos, #2D77BE só acento, useT() no chamador.
 */
import * as React from 'react';

export function HubHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="h-9 px-3 border-b border-border-light flex items-center gap-2 shrink-0" data-testid="hub-header">
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light truncate">{label}</span>
      {children && <span className="ml-auto flex items-center gap-2">{children}</span>}
    </div>
  );
}
