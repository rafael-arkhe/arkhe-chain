/**
 * Wave D.4 — ChatBubble primitive tests (2026-05-23).
 *
 * Bolha de chat extraída do pattern LibreChat usado em politicians-app.
 */
import { render, screen } from '@testing-library/react';

import { ChatBubble } from '@/components/chat/chat-bubble';

describe('ChatBubble — Wave D.4', () => {
  it('renderiza um user com avatar de usuário e label "você"', () => {
    render(
      <ChatBubble role="user">
        Olá, preciso de ajuda.
      </ChatBubble>,
    );
    expect(screen.getByTestId('chat-bubble-user')).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-avatar-user')).toBeInTheDocument();
    expect(screen.getByText('você')).toBeInTheDocument();
    expect(screen.getByText('Olá, preciso de ajuda.')).toBeInTheDocument();
  });

  it('renderiza um assistant com avatar AIP e label "AIP"', () => {
    render(
      <ChatBubble role="assistant">
        Como posso ajudar?
      </ChatBubble>,
    );
    expect(screen.getByTestId('chat-bubble-assistant')).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-avatar-assistant')).toBeInTheDocument();
    expect(screen.getByText('AIP')).toBeInTheDocument();
  });

  it('renderiza um tool call com avatar de ferramenta', () => {
    render(<ChatBubble role="tool">tool output</ChatBubble>);
    expect(screen.getByTestId('chat-bubble-tool')).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-avatar-tool')).toBeInTheDocument();
    expect(screen.getByText('ferramenta')).toBeInTheDocument();
  });

  it('aceita label customizado e timestamp', () => {
    render(
      <ChatBubble role="user" label="Operador Alfa" timestamp="10:42">
        msg
      </ChatBubble>,
    );
    expect(screen.getByText('Operador Alfa')).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-timestamp')).toHaveTextContent('10:42');
  });

  it('aplica testId customizado', () => {
    render(
      <ChatBubble role="user" testId="custom-row-3">
        x
      </ChatBubble>,
    );
    expect(screen.getByTestId('custom-row-3')).toBeInTheDocument();
  });
});
