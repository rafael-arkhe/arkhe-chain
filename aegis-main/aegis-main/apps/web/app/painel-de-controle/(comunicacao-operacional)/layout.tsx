'use client';

/**
 * Layout do hub "Comunicação operacional" (Backlog #6b). Os dois itens-irmãos
 * do cluster Operacional — Comunicados (banners globais agendados) + Rotas de
 * alerta (roteamento de notificações na ontologia) — eram entradas soltas na
 * sidenav; viram UM item + abas que roteiam (CpHubSubnav), sem tocar nas
 * pages-alvo. Monta a barra UMA vez para ambas as sub-rotas (DRY), espelhando
 * o padrão do hub Identidade (`app/iam/layout.tsx`).
 *
 * Route group (parênteses): o segmento `(comunicacao-operacional)` é ignorado
 * na URL, então `/painel-de-controle/comunicados` e `/painel-de-controle/alertas`
 * são preservadas (rotas/perms intactas).
 *
 * Cada aba respeita sua perm (Comunicados=app_shell.manage · Rotas de
 * alerta=alerts.routes.view); CpHubSubnav esconde a aba sem perm e some se
 * sobrar ≤1 aba — a barreira real continua no RequirePerm de cada page.
 *
 * `h-full flex flex-col`: a barra (shrink-0) fica fixa no topo e o conteúdo da
 * página (flex-1, com seu próprio overflow) rola abaixo — idêntico ao IamLayout.
 */
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { COMUNICACAO_OPERACIONAL_TABS } from '@/components/control-panel/hub-tabs';

export default function ComunicacaoOperacionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      <CpHubSubnav group="Comunicação operacional" tabs={COMUNICACAO_OPERACIONAL_TABS} />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
