'use client';

/**
 * <ChatBubble /> — Sprint Wave D.4 (2026-05-23).
 *
 * Primitiva visual de bolha de chat extraída do pattern LibreChat-style
 * que `politicians-app/components/aip-chat/MessageView.tsx` já consagrou.
 * Reusada em `/painel-de-controle/aip-threads` e qualquer outra UI de chat
 * do security-app — não duplica visual.
 *
 * Padrão:
 *   - Avatar 28px à esquerda (sempre — não há flip)
 *   - Coluna direita com label uppercase + conteúdo prose
 *   - Sem "bolinhas redondas" — bordas retas + tokens DS
 *
 * `role` controla apenas o avatar e o label. O conteúdo é livre (children).
 */
import * as React from 'react';
import { User, AudioLines, Wrench } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ChatBubbleProps {
  role: ChatRole;
  /** Nome humano opcional — sobrescreve o label default (você / AIP / ferramenta). */
  label?: string;
  /** Timestamp pra mostrar em mono uppercase. */
  timestamp?: string;
  /** Conteúdo principal (markdown já renderizado, blocos, etc). */
  children: React.ReactNode;
  /** Classes extras. */
  className?: string;
  /** test id da raiz. */
  testId?: string;
}

// Rótulo default por papel — via useT() (i18n). "AIP" é a marca (literal nos
// dois locales); user/tool são traduzidos.
const ROLE_LABEL_KEY: Record<ChatRole, 'chat.roleUser' | 'chat.roleTool' | null> = {
  user: 'chat.roleUser',
  assistant: null,
  tool: 'chat.roleTool',
};

function Avatar({ role }: { role: ChatRole }) {
  if (role === 'user') {
    return (
      <div
        className="shrink-0 w-7 h-7 flex items-center justify-center border border-border-light bg-canvas-light"
        data-testid="chat-bubble-avatar-user"
      >
        <User className="w-3.5 h-3.5 text-text-on-light" strokeWidth={1.5} />
      </div>
    );
  }
  if (role === 'tool') {
    return (
      <div
        className="shrink-0 w-7 h-7 flex items-center justify-center border border-warning/40 bg-warning/10"
        data-testid="chat-bubble-avatar-tool"
      >
        <Wrench className="w-3.5 h-3.5 text-warning" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div
      className="shrink-0 w-7 h-7 flex items-center justify-center border border-primary/40 bg-primary/10"
      data-testid="chat-bubble-avatar-assistant"
    >
      <AudioLines className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
    </div>
  );
}

export function ChatBubble({
  role,
  label,
  timestamp,
  children,
  className,
  testId,
}: ChatBubbleProps) {
  const t = useT();
  const roleKey = ROLE_LABEL_KEY[role];
  const displayLabel = label ?? (roleKey ? t(roleKey) : 'AIP');
  return (
    <div
      className={cn('px-4 py-3', className)}
      data-testid={testId ?? `chat-bubble-${role}`}
      role="group"
      aria-label={`Mensagem de ${displayLabel}`}
    >
      <div className="max-w-3xl mx-auto flex gap-3">
        <Avatar role={role} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-caption font-mono uppercase tracking-wider text-muted-on-light">
              {displayLabel}
            </p>
            {timestamp && (
              <p
                className="text-caption font-mono text-muted-on-light"
                data-testid="chat-bubble-timestamp"
              >
                {timestamp}
              </p>
            )}
          </div>
          <div className="text-body text-text-on-light leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
