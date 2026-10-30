'use client';

/**
 * Layout do hub Identidade (Fase 4 da consolidação de IA). As 4 telas IAM —
 * Equipe · Papéis · Permissões (avançado) · Auditoria (avançado) — eram itens
 * irmãos soltos na sidenav; viram UM item "Identidade" + abas que roteiam
 * (CpHubSubnav). Aqui o layout monta a barra UMA vez para todas as sub-rotas
 * /iam/* (DRY), sem tocar nas 4 pages. /iam redireciona p/ /iam/equipe.
 *
 * `h-full flex flex-col`: a barra (shrink-0) fica fixa no topo e o conteúdo da
 * página (flex-1, com seu próprio overflow-y-auto) rola abaixo — o <main> do
 * ControlPanelShell tem altura definida (flex-1 numa row h-full).
 */
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { IDENTIDADE_TABS } from '@/components/control-panel/hub-tabs';

export default function IamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <CpHubSubnav group="Identidade" tabs={IDENTIDADE_TABS} />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
