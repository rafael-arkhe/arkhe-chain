'use client';

/**
 * Notificações — Sprint H1.5 (2026-05-22).
 *
 * Canais de alerta e cadências de digest. Stub atual: configurações
 * por canal serão expostas conforme os feeds de alerta forem ativados
 * na tenant. Movido de /preferencias/notificacoes na iter 5.
 */
import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { COMUNICACAO_TABS } from '@/components/control-panel/hub-tabs';

export default function NotificacoesPage() {
  return (
    <RequirePerm perm="security.configuracoes.view">
      <CpPageHeader
        title="Notificações"
        subtitle="Canais de alerta e cadências de digest"
      />
      <CpHubSubnav group="Comunicação" tabs={COMUNICACAO_TABS} />
      <div className="p-6 max-w-2xl">
        <p className="text-[11px] text-muted-on-light italic">
          Configurações por canal serão expostas conforme os feeds de alerta
          forem ativados na sua tenant.
        </p>
      </div>
    </RequirePerm>
  );
}
