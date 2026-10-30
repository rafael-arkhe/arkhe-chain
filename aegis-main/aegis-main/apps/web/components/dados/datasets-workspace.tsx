'use client';

/**
 * Datasets e Branches — browser de versionamento de datasets (Rev 6/7 do backend).
 *
 * Onda 2 · I3: o estado + os slots foram extraídos para
 * `components/dados/dataset-browser.tsx` (Provider/contexto + DatasetsList/
 * DatasetContent/DatasetInspector) para a casca da Tela de Dados poder COMPOR o
 * detalhe do dataset em panes próprios (lista no Acervo · grade/branches/txs no
 * CENTER · Classificação&Marcações + ações no RIGHT). Este workspace standalone
 * compõe os MESMOS slots no 3-pane original — é o que o teste `datasets-page`
 * renderiza. i18n via useT().
 */
import * as React from 'react';
import { Database } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import {
  DatasetBrowserProvider,
  useDatasetBrowser,
  DatasetsList,
  DatasetContent,
  DatasetInspector,
} from '@/components/dados/dataset-browser';

export function DatasetsWorkspace({ embedded = false }: { embedded?: boolean }) {
  return (
    <DatasetBrowserProvider enabled>
      <StandaloneLayout embedded={embedded} />
    </DatasetBrowserProvider>
  );
}

function StandaloneLayout({ embedded }: { embedded: boolean }) {
  const t = useT();
  return (
    <div className={(embedded ? 'h-full' : 'h-[calc(100vh-3rem)]') + ' flex flex-col'}>
      {!embedded && (
        <header className="h-12 px-4 border-b border-border-light flex items-center gap-3 shrink-0">
          <Database className="w-4 h-4 text-primary" />
          <h1 className="text-[13px] font-semibold text-text-on-light">{t('dsw.title')}</h1>
          <span className="text-[11px] text-muted-on-light">{t('dsw.subtitle')}</span>
        </header>
      )}

      <div className="flex-1 flex min-h-0">
        {/* esquerda — datasets (busca + criar + lista) */}
        <aside className="w-56 border-r border-border-light flex flex-col shrink-0">
          <DatasetsList />
        </aside>

        {/* centro — grade/schema + branches + transações */}
        <main className="flex-1 min-w-0 min-h-0">
          <DatasetContent />
        </main>

        {/* direita — Classificação&Marcações + ações (só com dataset selecionado) */}
        <DatasetRightAside />
      </div>
    </div>
  );
}

function DatasetRightAside() {
  const { sel } = useDatasetBrowser();
  if (!sel) return null;
  return (
    <aside className="w-96 border-l border-border-light flex flex-col shrink-0">
      <DatasetInspector />
    </aside>
  );
}
