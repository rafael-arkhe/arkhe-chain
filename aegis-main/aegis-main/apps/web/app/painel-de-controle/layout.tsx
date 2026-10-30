import * as React from 'react';
import { RequirePerm } from '@/components/auth/require-perm';
import { ControlPanelShell } from '@/components/control-panel/control-panel-shell';
import { ConfirmProvider } from '@/components/dialog/confirm-dialog';
import { I18nProvider } from '@/lib/i18n/provider';
import { AssistantPrefProvider } from '@/lib/assistant/assistant-pref-provider';
import { AipChatPrefsProvider } from '@/lib/aip/chat-prefs-provider';
import { AipAssistTrigger } from '@/components/aip-assist/aip-assist-trigger';

export const dynamic = 'force-dynamic';

/**
 * Layout do Painel de Controle.
 *
 * Sprint H1 (2026-05-22): full-bleed Palantir-style. O AuthShell global
 * detecta `pathname.startsWith('/painel-de-controle')` e remove
 * Header/Sidenav/Footer/CommandPalette globais — aqui só
 * RequirePerm + ControlPanelShell (casca interna espelhando o Foundry
 * Control Panel: sidebar próprio + "Voltar ao AEGIS" no rodapé).
 */
export default function PainelDeControleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequirePerm perm="painel.home.view">
      <I18nProvider>
        {/* #9 — AssistantPrefProvider compartilha o toggle da Conta com o
            FAB. Dentro do I18nProvider para que ambos vivam no mesmo escopo. */}
        <AssistantPrefProvider>
          {/* Sprint 9 Onda 5 — prefs do AIP Chat (dev-mode dos metadados + tom
              de voz), compartilhadas entre a Conta e o MessageView do chat. */}
          <AipChatPrefsProvider>
            <ConfirmProvider>
              <ControlPanelShell>{children}</ControlPanelShell>
              {/* Sprint L4 — AIP Assist trigger global no painel. Visível só
                  quando a preferência da Conta estiver ligada (default oculto). */}
              <AipAssistTrigger />
            </ConfirmProvider>
          </AipChatPrefsProvider>
        </AssistantPrefProvider>
      </I18nProvider>
    </RequirePerm>
  );
}
