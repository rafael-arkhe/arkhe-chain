'use client';

/**
 * SectionHead — cabeçalho FORTE das seções da página Dados → Conexões.
 *
 * A página empilhava blocos com bordas iguais e nenhum ritmo: tudo parecia o
 * mesmo peso. Este cabeçalho dá a hierarquia de console: título (Inter
 * semibold), CONTAGEM em mono (dado estruturado é sempre mono), subtítulo
 * discreto e as ações à direita, fechados por uma régua de 1px.
 *
 * Régua: cantos retos, profundidade por BORDA (nunca sombra), #2D77BE só na
 * ação primária, strings via useT() no chamador.
 */
import * as React from 'react';

export function SectionHead({
  title, subtitle, count, note, actions, testid, icon,
}: {
  title: string;
  subtitle?: string;
  /** Contagem do que a seção governa. `null` = ainda carregando (some). */
  count?: number | null;
  /** Linha técnica opcional (ex.: versão esperada da frota), sempre mono. */
  note?: React.ReactNode;
  actions?: React.ReactNode;
  testid?: string;
  /** Um único ícone é permitido no cabeçalho de SEÇÃO — nunca nas linhas. */
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-3 border-b border-border-light pb-2"
      data-testid={testid}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon ? <span className="text-muted-on-light shrink-0">{icon}</span> : null}
          <h2 className="text-[13px] font-semibold text-text-on-light truncate">{title}</h2>
          {count != null && (
            <span
              data-testid={testid ? `${testid}-count` : undefined}
              className="font-mono text-[10px] leading-none px-1.5 py-1 border border-border-light text-muted-on-light shrink-0"
            >
              {count}
            </span>
          )}
        </div>
        {subtitle ? (
          <p className="text-[11px] text-muted-on-light mt-0.5">{subtitle}</p>
        ) : null}
        {note ? (
          <p className="text-[10px] font-mono text-muted-on-light mt-0.5">{note}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
