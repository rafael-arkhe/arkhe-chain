'use client';

/**
 * Dados — A Tela de Dados (Onda 2 · I1b casca 3-pane · I2 Quadro decomposto).
 *
 * Casca 3-pane espelhando /buscar (Palantir-style), orquestrando os workspaces
 * EMBARCADOS (não um god-component):
 *   LEFT  280px  = Acervo (nav de seções + 2º nível contextual) — acervo-nav.tsx
 *   CENTER       = workspace embarcado da seleção (ou o canvas do Quadro)
 *   RIGHT 320px  = Inspetor (inspetor de nó do Quadro — emerge na seção Pipelines)
 *
 * I2/I3 (decomposto): a seção Pipelines compõe os slots de pipeline-board.tsx (lista
 * UNIFICADA no Acervo · canvas no CENTER · inspetor de nó no RIGHT); a seção Datasets
 * compõe dataset-browser.tsx (lista no Acervo · grade no CENTER · governança no RIGHT).
 * v22 adapter (Onda 2): o modo Fácil/v22 foi DELETADO — os pipelines LEGADO aparecem na
 * MESMA lista (badge "básico"), abrem SOMENTE LEITURA (DAG travado + Executar) e o
 * inspetor vira o resumo read-only (V22Inspector). "Criar" gera v23.
 *
 * Deep-link `?aba=` lê+ESCREVE (padrão grafo selectAba, nunca localStorage);
 * `?board&node&ds` reservados p/ deep-link futuro.
 *
 * GOVERNANÇA (Onda 0): gating POR SEÇÃO (não 1 gate no hub). Conexões usa
 * `connectors.manage`. Provedores/Modelos ficam no grupo "Infra de IA" até existir
 * o hub próprio (NÃO orfana — ADD-alongside).
 */
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Cpu, DatabaseZap, GitMerge, Images, Tag, AudioLines, X, Code2, Cctv } from 'lucide-react';

import { useAuth } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { useCpSidenav } from '@/lib/store';
import { RequirePerm } from '@/components/auth/require-perm';
import { AcervoNav, type AcervoItem, type AcervoValue } from '@/components/dados/acervo-nav';
import {
  DatasetBrowserProvider,
  useDatasetBrowser,
  DatasetsList,
  DatasetContent,
  DatasetInspector,
} from '@/components/dados/dataset-browser';
import dynamic from 'next/dynamic';

import { ConectoresWorkspace } from '@/components/dados/conectores-workspace';
import { CamerasWorkspace } from '@/components/dados/cameras-workspace';
import { ProvedoresWorkspace } from '@/components/dados/provedores-workspace';
import {
  MediaProvider,
  MediaSetsList,
  MediaContent,
  MediaPreviewAside,
} from '@/components/dados/media-workspace';
import { ModelosWorkspace } from '@/components/dados/modelos-workspace';
import { MarcacoesWorkspace } from '@/components/dados/marcacoes-workspace';

// F7.3 — IDE (scratchpad) como seção do /dados. Lazy ssr:false: o Monaco só
// carrega quando a seção abre (fora do bundle das outras seções e dos testes).
const SandboxIDELazy = dynamic(
  () => import('@/components/dev/sandbox-ide').then((m) => m.SandboxIDE),
  { ssr: false, loading: () => <div className="p-4 text-[11px] text-muted-on-light">…</div> },
);

// Acervo: ordem = Acervo (a camada de dados) depois Infra de IA (transitório).
// O `value` (chave de deep-link) é estável; o rótulo vem do dict via labelKey.
const ACERVO_ITEMS: AcervoItem[] = [
  { value: 'conexoes', labelKey: 'acervo.item.conexoes', Icon: DatabaseZap, perm: 'connectors.manage', group: 'dados' },
  // §C C5 — Câmeras: registro + lista gerida + Placas procuradas + Pipeline de
  // detecções (visão GESTOR). Ícone neutro Cctv; gate security.cameras.manage.
  { value: 'cameras', labelKey: 'acervo.item.cameras', Icon: Cctv, perm: 'security.cameras.manage', group: 'dados' },
  { value: 'datasets', labelKey: 'acervo.item.datasets', Icon: GitMerge, perm: 'data.datasets.read', group: 'dados' },
  { value: 'arquivos', labelKey: 'acervo.item.arquivos', Icon: Images, perm: 'data.media.read', group: 'dados' },
  // F7.3 — IDE unificado no organismo /dados (tarefa #3 do operador): scratchpad
  // desvinculado (codegen AIP/pip/terminal); o nó de código do Quadro segue sendo
  // o caminho vinculado. Rota antiga /painel-de-controle/ide vira redirect.
  { value: 'ide', labelKey: 'acervo.item.ide', Icon: Code2, perm: 'function.invoke', group: 'dados' },
  { value: 'marcacoes', labelKey: 'acervo.item.marcacoes', Icon: Tag, perm: 'markings.read', group: 'dados' },
  // Infra de IA — não orfana Provedores/Modelos até existir o hub próprio.
  { value: 'provedores', labelKey: 'acervo.item.provedores', Icon: Cpu, perm: 'compute.providers.read', group: 'infra' },
  // Ícone do AIP = AudioLines (régua feedback_aip_icon_audiolines; nunca Brain).
  { value: 'modelos', labelKey: 'acervo.item.modelos', Icon: AudioLines, perm: 'aip.models.read', group: 'infra' },
];

const semPerm = (t: (k: string) => string) => (
  <p data-testid="dados-sem-perm" className="p-6 text-[12px] text-muted-on-light italic">
    {t('acervo.semPerm')}
  </p>
);

export default function DadosPage() {
  return (
    <React.Suspense fallback={null}>
      <Hub />
    </React.Suspense>
  );
}

function Hub() {
  const t = useT();
  const { principal, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Deep-link de seção: ?aba=conexoes|datasets|arquivos|pipelines|marcacoes|provedores|modelos
  const fromQuery = params?.get('aba');
  const [tab, setTab] = React.useState<AcervoValue | null>(null);

  // Espelha o backend Principal.has_permission (admin short-circuita) — gate POR SEÇÃO.
  const has = React.useCallback(
    (perm: string) =>
      !!principal && (principal.roles.includes('admin') || principal.permissions.includes(perm)),
    [principal],
  );
  const visibleItems = React.useMemo(() => ACERVO_ITEMS.filter((it) => has(it.perm)), [has]);

  // Seção efetiva: escolha do operador (se visível) → ?aba= (se visível) →
  // Pipelines (F7.3: o Quadro é o centro de gravidade da tríade) → 1ª visível.
  const activeTab: AcervoValue | null = React.useMemo(() => {
    const vis = visibleItems.map((it) => it.value);
    if (tab && vis.includes(tab)) return tab;
    if (fromQuery && vis.includes(fromQuery as AcervoValue)) return fromQuery as AcervoValue;
    return vis[0] ?? null;
  }, [tab, fromQuery, visibleItems]);

  // Seleção ESCREVE ?aba= (padrão grafo selectAba) — deep-link estável, sem localStorage.
  const selectTab = React.useCallback(
    (next: AcervoValue) => {
      setTab(next);
      const qs = new URLSearchParams(params?.toString() ?? '');
      qs.set('aba', next);
      // board/node/ds são específicos da seção anterior — limpa ao trocar de seção.
      qs.delete('board');
      qs.delete('node');
      qs.delete('ds');
      const s = qs.toString();
      router.replace(`${pathname}${s ? `?${s}` : ''}`);
    },
    [params, pathname, router],
  );

  // 🔴 O colapso do Acervo existia por causa da aba Pipelines: lá dentro o
  // operador queria o canvas inteiro, e sair da aba re-expandia. Sem a aba,
  // o Acervo é sempre o que o operador deixou — e o `setCpCollapsed` (o
  // sidenav do Painel) deixa de ter quem o mexa daqui.
  const [acervoCollapsed, setAcervoCollapsed] = React.useState(false);

  if (loading) return null;
  if (!principal || visibleItems.length === 0) {
    return semPerm(t);
  }

  return (
    // O Quadro (boards/canvas/inspetor) e o Browser de datasets compartilham estado
    // via contexto; os fetches só disparam quando a respectiva seção está ativa.
    <DatasetBrowserProvider enabled={activeTab === 'datasets'} initialDs={params?.get('ds') ?? null}>
    <MediaProvider enabled={activeTab === 'arquivos'}>
      {/* Casca 3-pane: herda a altura REAL do <main> (flex-1 overflow-y-auto da casca
          CP) via h-full/min-h-0 + overflow-hidden; cada pane rola por conta própria. */}
      <div className="h-full min-h-0 flex overflow-hidden relative">
        {/* LEFT — Acervo (nav de seções + 2º nível contextual) */}
        <AcervoNav
          items={visibleItems}
          active={activeTab}
          onSelect={selectTab}
          collapsed={acervoCollapsed}
          onCollapsedChange={setAcervoCollapsed}
          contextualSlot={
            activeTab === 'datasets' ? (
              <DatasetsList />
            ) : activeTab === 'arquivos' ? (
              <MediaSetsList />
            ) : null
          }
        />

        {/* CENTER — workspace embarcado da seleção (ou o canvas do Quadro). */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
            {activeTab === 'conexoes' && (
              <RequirePerm perm="connectors.manage" fallback={semPerm(t)}><ConectoresWorkspace embedded /></RequirePerm>
            )}
            {activeTab === 'cameras' && (
              <RequirePerm perm="security.cameras.manage" fallback={semPerm(t)}><CamerasWorkspace /></RequirePerm>
            )}
            {activeTab === 'datasets' && (
              <RequirePerm perm="data.datasets.read" fallback={semPerm(t)}><DatasetContent /></RequirePerm>
            )}
            {activeTab === 'arquivos' && (
              <RequirePerm perm="data.media.read" fallback={semPerm(t)}><MediaContent /></RequirePerm>
            )}
            {activeTab === 'ide' && (
              <RequirePerm perm="function.invoke" fallback={semPerm(t)}>
                <div className="h-full min-h-0" data-testid="ws-ide"><SandboxIDELazy /></div>
              </RequirePerm>
            )}
            {activeTab === 'marcacoes' && (
              <RequirePerm perm="markings.read" fallback={semPerm(t)}><MarcacoesWorkspace /></RequirePerm>
            )}
            {activeTab === 'provedores' && (
              <RequirePerm perm="compute.providers.read" fallback={semPerm(t)}><ProvedoresWorkspace embedded /></RequirePerm>
            )}
            {activeTab === 'modelos' && (
              <RequirePerm perm="aip.models.read" fallback={semPerm(t)}><ModelosWorkspace /></RequirePerm>
            )}
          </div>
        </div>

        {/* RIGHT — dado (Datasets) OU preview do arquivo (Arquivos, F7.3c).
            A2 (complemento 2026-07-04): o Inspetor do Quadro MORREU — config de
            nó é o NDV overlay; Execuções = modal no toolbar. Honesto: só com
            seleção. */}
        {activeTab === 'datasets' && <DatasetInspectorAside />}
        {activeTab === 'arquivos' && <MediaPreviewAside />}
      </div>
    </MediaProvider>
    </DatasetBrowserProvider>
  );
}

/** RIGHT da seção Datasets: Classificação&Marcações + ações (só com dataset aberto). */
function DatasetInspectorAside() {
  const { sel } = useDatasetBrowser();
  if (!sel) return null;
  return (
    <aside className="w-[320px] shrink-0 border-l border-border-light bg-panel-light flex flex-col overflow-hidden">
      <DatasetInspector />
    </aside>
  );
}
