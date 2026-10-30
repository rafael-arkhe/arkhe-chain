'use client';

/**
 * MarcacoesWorkspace — conteúdo da aba "Marcações" do hub Dados (LOTE1 ELO
 * PAGES · #7 · 2026-06-28).
 *
 * A seção de sidenav "Marcações" foi dissolvida; suas duas telas viram UMA aba
 * do hub Dados com sub-navegação local: **Vocabulário** (CRUD do vocabulário +
 * categorias + elegibilidade) e **Por propriedade** (workspace 3-pane de
 * aplicação por propriedade). Reusa os componentes extraídos das pages (que
 * agora redirecionam para cá), embutidos (`embedded`) — sem CpPageHeader/
 * RequirePerm próprios, pois o hub já provê cabeçalho + gate (markings.read).
 *
 * Deep-link: `/painel-de-controle/dados?aba=marcacoes` abre em Vocabulário;
 * `?aba=marcacoes&sub=propriedade` abre direto em "Por propriedade" (preserva o
 * link antigo de /marcacoes-propriedade via o redirect).
 */
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Tag, SlidersHorizontal } from 'lucide-react';

import { MarcacoesVocabWorkspace } from '@/components/markings/marcacoes-vocab-workspace';
import { MarcacoesPropriedadeWorkspace } from '@/components/markings/marcacoes-propriedade-workspace';
import { useT } from '@/lib/i18n/provider';

type Sub = 'vocabulario' | 'propriedade';

const SUB_BTN = 'h-7 px-2.5 text-[11px] border flex items-center gap-1.5';

export function MarcacoesWorkspace() {
  const t = useT();
  const searchParams = useSearchParams();
  const fromQuery = searchParams?.get('sub');
  const [sub, setSub] = React.useState<Sub>(
    fromQuery === 'propriedade' ? 'propriedade' : 'vocabulario',
  );

  const tabs: { value: Sub; label: string; Icon: typeof Tag }[] = [
    { value: 'vocabulario', label: t('dados.marcacoes.vocabulario'), Icon: Tag },
    { value: 'propriedade', label: t('dados.marcacoes.porPropriedade'), Icon: SlidersHorizontal },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="dd-marcacoes">
      <div
        className="px-6 pt-4 flex items-center gap-1"
        role="group"
        aria-label={t('dados.marcacoes.subnavAria')}
      >
        {tabs.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            data-testid={`dd-marc-sub-${value}`}
            onClick={() => setSub(value)}
            aria-pressed={sub === value}
            className={
              SUB_BTN +
              (sub === value
                ? ' border-primary text-primary bg-primary/5'
                : ' border-border-light bg-white hover:border-primary')
            }
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
          </button>
        ))}
      </div>

      <div
        className={
          'flex-1 min-h-0 ' +
          (sub === 'vocabulario' ? 'overflow-y-auto scrollbar-hide' : '')
        }
      >
        {sub === 'vocabulario' ? (
          <MarcacoesVocabWorkspace embedded />
        ) : (
          <MarcacoesPropriedadeWorkspace embedded />
        )}
      </div>
    </div>
  );
}
