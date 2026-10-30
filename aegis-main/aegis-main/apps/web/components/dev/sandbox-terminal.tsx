'use client';

/**
 * SandboxTerminal (security-app) — terminal interativo do sandbox (débito 4).
 *
 * Shell bash real, isolado (--network=none), via WS `/sandbox/terminal`
 * autenticado por TICKET (o browser não lê o cookie httpOnly: pega um ticket
 * curto por HTTP e abre o WS com ?ticket=). xterm renderiza o PTY.
 *
 * O WS vai DIRETO ao ontology (NEXT_PUBLIC_ONTOLOGY_WS_URL) — o catch-all /api
 * strippa o upgrade do WS. Só é renderizado quando `Sandbox.terminalAvailable()`.
 * Cleanup robusto (fecha WS + dispose do xterm) ao desmontar.
 */
import * as React from 'react';

import { useT } from '@/lib/i18n/provider';
import { Sandbox } from '@/lib/api';

type ConnState = 'connecting' | 'open' | 'closed' | 'error';

export function SandboxTerminal() {
  const t = useT();
  const [conn, setConn] = React.useState<ConnState>('connecting');
  const hostRef = React.useRef<HTMLDivElement>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const xtermRef = React.useRef<{ dispose: () => void } | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let onResize: (() => void) | null = null;
    setConn('connecting');
    void (async () => {
      try {
        const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);
        await import('@xterm/xterm/css/xterm.css');
        if (disposed || !hostRef.current) return;
        const term = new XTerm({
          fontSize: 12,
          fontFamily: 'monospace',
          theme: { background: '#0d0d0d' },
          cursorBlink: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(hostRef.current);
        try { fit.fit(); } catch { /* host sem layout ainda */ }
        xtermRef.current = term;

        const { ticket } = await Sandbox.terminalTicket();
        if (disposed) { term.dispose(); return; }
        const url = Sandbox.terminalWsUrl(ticket);
        if (!url) { setConn('error'); return; }
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => setConn('open');
        ws.onmessage = (ev) => term.write(typeof ev.data === 'string' ? ev.data : '');
        ws.onerror = () => setConn('error');
        ws.onclose = () => setConn('closed');
        term.onData((d: string) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(d);
        });
        onResize = () => { try { fit.fit(); } catch { /* noop */ } };
        window.addEventListener('resize', onResize);
      } catch {
        setConn('error');
      }
    })();

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener('resize', onResize);
      try { wsRef.current?.close(); } catch { /* noop */ }
      wsRef.current = null;
      try { xtermRef.current?.dispose(); } catch { /* noop */ }
      xtermRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col h-full" data-testid="sandbox-terminal">
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border-light bg-canvas-light">
        <span
          className={
            'h-1.5 w-1.5 ' +
            (conn === 'open' ? 'bg-success' : conn === 'error' ? 'bg-danger' : 'bg-warning')
          }
        />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light" data-testid="terminal-state">
          {t('ide.terminal')}{conn !== 'open' ? ` · ${conn}` : ''}
        </span>
      </div>
      <div ref={hostRef} data-testid="terminal-xterm-host" className="flex-1 overflow-hidden p-1 bg-[#0d0d0d]" />
    </div>
  );
}
