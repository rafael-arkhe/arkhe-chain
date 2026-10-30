'use client';

/**
 * Preferências · Browser de servidor — Sprint H1.3 (2026-05-22).
 *
 * Movido de `app/configuracoes/browser/page.tsx` (que agora redireciona
 * pra cá via next.config.mjs). Conteúdo idêntico, exceto:
 *   • PageShell removido — casca interna do painel já provê;
 *   • Header substituído por CpPageHeader (padrão Painel de Controle);
 *   • Toolbar "← Configurações" removido — sidebar do painel navega.
 *
 * Continua gated por `security.browser.manage` (defense-in-depth: layout
 * do painel já gateia por `painel.home.view`, mas operar sessão KasmVNC
 * é capability separada).
 */
import * as React from 'react';
import {
  AlertTriangle,
  Globe,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { BrowserSession, type BrowserStatus } from '@/lib/api/browser-session';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';

const STATUS_STYLE: Record<string, string> = {
  logged: 'border-success text-success bg-success/10',
  expired: 'border-warning text-warning bg-warning/10',
  never: 'border-border-light text-muted-on-light',
};

const PROVIDER_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  x_twitter: 'X (Twitter)',
  facebook: 'Facebook',
  threads: 'Threads',
  tiktok: 'TikTok',
  kwai: 'Kwai',
};

const STATE_LABEL: Record<string, string> = {
  logged: 'Logado',
  expired: 'Expirado',
  never: 'Sem sessão',
};

type BackendError =
  | { kind: 'kasm_password_missing' }
  | { kind: 'forbidden' }
  | { kind: 'unauthorized' }
  | { kind: 'other'; message: string }
  | null;

function classifyError(e: unknown): BackendError {
  if (!(e instanceof Error)) return { kind: 'other', message: String(e) };
  const msg = e.message || '';
  if (msg.toLowerCase().includes('kasm_vnc_password')) {
    return { kind: 'kasm_password_missing' };
  }
  if (e instanceof ApiError) {
    if (e.status === 403) return { kind: 'forbidden' };
    if (e.status === 401) return { kind: 'unauthorized' };
  }
  return { kind: 'other', message: msg };
}

export default function BrowserSessionPage() {
  const [status, setStatus] = React.useState<BrowserStatus | null>(null);
  const [error, setError] = React.useState<BackendError>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await BrowserSession.status();
      setStatus(r);
    } catch (e) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const probe = async () => {
    setBusy(true);
    try {
      const r = await BrowserSession.probe();
      setStatus(r);
      setError(null);
    } catch (e) {
      setError(classifyError(e));
    } finally {
      setBusy(false);
    }
  };

  const openBrowser = async () => {
    setError(null);
    try {
      // Valida sessão + carrega credenciais (loga vault.browser_session
      // .credentials_read no backend). Não usamos `creds.url` direto
      // porque ele vem como 127.0.0.1 — operador no Windows acessaria
      // o KasmVNC do próprio PC, não do servidor. Derivamos a URL do
      // host atual: chrome-proxy (Caddy) escuta :6901 no MESMO host
      // que serve o security-app, e o forward_auth injeta o basic
      // auth server-side. Mesma estratégia do politicians-app.
      await BrowserSession.credentials();
      const dynamicUrl = (() => {
        if (typeof window === 'undefined') return 'http://127.0.0.1:6901/';
        const { protocol, hostname } = window.location;
        if (protocol === 'https:') {
          // Cloudflare Tunnel: <slug>.<zone> → <slug>-browser.<zone>
          const [first, ...rest] = hostname.split('.');
          const browserHost = `${first}-browser.${rest.join('.')}`;
          return `https://${browserHost}/`;
        }
        // LAN dev: porta 6901 do mesmo host (HTTP — Caddy escuta sem TLS;
        // em prod com Cloudflare Tunnel o TLS termina no CF).
        return `http://${hostname}:6901/`;
      })();
      window.open(dynamicUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(classifyError(e));
    }
  };

  const notConfigured = error?.kind === 'kasm_password_missing';
  const canOpen = !notConfigured;

  return (
    <RequirePerm perm="security.browser.manage">
      <CpPageHeader
        title="Browser do servidor"
        subtitle="Sessão persistente para coleta autenticada (Instagram, X, etc.)"
      />
      <div className="h-full overflow-y-auto p-6 space-y-4 max-w-3xl">
        {/* ─── Erros classificados ──────────────────────── */}
        {notConfigured && <KasmNotConfiguredBanner />}
        {error?.kind === 'forbidden' && (
          <ErrorBanner
            title="Sem permissão"
            body="Sua conta não tem security.browser.manage. Peça ao administrador para atribuir essa permissão no /iam/papeis."
          />
        )}
        {error?.kind === 'unauthorized' && (
          <ErrorBanner
            title="Sessão expirada"
            body="Faça login novamente e tente outra vez."
          />
        )}
        {error?.kind === 'other' && (
          <ErrorBanner title="Erro" body={error.message} />
        )}

        {/* ─── Status providers ─────────────────────────── */}
        <section className="bg-canvas-light border border-border-light">
          <header className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light/40">
            <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex-1">
              Status da sessão
            </p>
            {status?.last_probe_at && (
              <span className="text-[10px] font-mono text-muted-on-light mr-2">
                última verificação:{' '}
                {new Date(status.last_probe_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <button
              type="button"
              onClick={probe}
              disabled={busy}
              data-testid="browser-re-probar"
              className="h-6 px-2 text-[10px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw
                className={cn('w-3 h-3', busy && 'animate-spin')}
                strokeWidth={1.5}
              />
              Re-probar
            </button>
          </header>
          <div className="p-4 space-y-3">
            {!status && !busy && !error && (
              <p className="text-[11px] text-muted-on-light italic">Carregando…</p>
            )}
            {!status && error && (
              <p className="text-[11px] text-muted-on-light italic">
                Não foi possível ler o status — backend não respondeu.
              </p>
            )}
            {status && (
              <>
                <div className="flex items-center gap-3 px-3 py-2 border border-border-light bg-panel-light">
                  <p className="text-[11px] uppercase tracking-wider font-semibold flex-1">
                    Chrome do servidor
                  </p>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
                      status.chrome_container_healthy
                        ? 'border-success text-success bg-success/10'
                        : 'border-danger text-danger bg-danger/10',
                    )}
                  >
                    {status.chrome_container_healthy ? 'saudável' : 'caído'}
                  </span>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
                      status.profile_volume_mounted
                        ? 'border-success text-success bg-success/10'
                        : 'border-danger text-danger bg-danger/10',
                    )}
                  >
                    perfil {status.profile_volume_mounted ? 'montado' : 'ausente'}
                  </span>
                </div>

                {Object.entries(status.cookies ?? {}).length === 0 && (
                  <p className="text-[11px] text-muted-on-light italic">
                    Nenhuma plataforma monitorada ainda.
                  </p>
                )}
                {Object.entries(status.cookies ?? {}).map(([provider, state]) => (
                  <div
                    key={provider}
                    data-testid={`browser-status-${provider}`}
                    className="flex items-center gap-3 px-3 py-2 border border-border-light bg-panel-light"
                  >
                    <p className="text-[11px] uppercase tracking-wider font-semibold flex-1">
                      {PROVIDER_LABEL[provider] ?? provider}
                    </p>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border',
                        STATUS_STYLE[state] ?? STATUS_STYLE.never,
                      )}
                    >
                      {STATE_LABEL[state] ?? state}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        {/* ─── Open KasmVNC ─────────────────────────────── */}
        <section className="bg-canvas-light border border-border-light p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck
              className="w-4 h-4 text-success shrink-0 mt-0.5"
              strokeWidth={1.5}
            />
            <div className="flex-1">
              <p className="text-[12px] font-medium">Abrir browser do servidor</p>
              <p className="text-[10px] text-muted-on-light leading-relaxed mt-1">
                KasmVNC roda em container isolado. Suas credenciais não saem do
                servidor. Cookies persistem entre sessões e ficam cifrados no
                vault. Cada acesso é auditado em
                <code className="text-primary mx-1">LineageEvent</code>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openBrowser}
            disabled={!canOpen}
            data-testid="browser-open"
            className={cn(
              'inline-flex items-center gap-2 h-8 px-3 text-[11px] border',
              canOpen
                ? 'bg-primary text-white border-primary hover:bg-primary-hover'
                : 'bg-raised-light border-border-light text-muted-on-light cursor-not-allowed',
            )}
          >
            <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
            {canOpen ? 'Abrir KasmVNC →' : 'Indisponível · configurar primeiro'}
          </button>
        </section>
      </div>
    </RequirePerm>
  );
}

function ErrorBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border border-danger/30">
      <p className="font-semibold mb-0.5">{title}</p>
      <p className="text-danger/80">{body}</p>
    </div>
  );
}

function KasmNotConfiguredBanner() {
  return (
    <div className="bg-warning/10 border border-warning/40 text-text-on-light p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="w-4 h-4 text-warning shrink-0 mt-0.5"
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <p className="text-[12px] font-semibold text-warning">
            KasmVNC ainda não está configurado
          </p>
          <p className="text-[11px] text-text-on-light leading-relaxed mt-1">
            O backend <code className="font-mono">ontology-api</code> precisa da
            variável <code className="font-mono">KASM_VNC_PASSWORD</code> pra
            gerar credenciais. Esta variável é cifrada, fica no
            <code className="font-mono mx-1">.env</code> do servidor e nunca
            chega ao operador.
          </p>
        </div>
      </div>

      <div className="bg-canvas-light border border-border-light p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
          Passos pra ativar
        </p>
        <ol className="list-decimal list-inside space-y-1 text-[11px] text-text-on-light leading-relaxed">
          <li>
            Edite{' '}
            <code className="font-mono text-primary">ontology-module/.env</code>{' '}
            adicionando:
          </li>
        </ol>
        <pre className="text-[10px] font-mono bg-panel-light border border-border-light p-2 overflow-x-auto select-all">
          KASM_VNC_PASSWORD=&lt;senha-aleatoria-32-bytes&gt;
        </pre>
        <ol
          start={2}
          className="list-decimal list-inside space-y-1 text-[11px] text-text-on-light leading-relaxed"
        >
          <li>
            Em{' '}
            <code className="font-mono text-primary">
              ontology-module/compose.yaml
            </code>{' '}
            (ou docker-compose.yml) garanta que o serviço{' '}
            <code className="font-mono">api</code> tem:
          </li>
        </ol>
        <pre className="text-[10px] font-mono bg-panel-light border border-border-light p-2 overflow-x-auto select-all">
          {`services:
  api:
    environment:
      KASM_VNC_PASSWORD: \${KASM_VNC_PASSWORD}`}
        </pre>
        <ol
          start={3}
          className="list-decimal list-inside space-y-1 text-[11px] text-text-on-light leading-relaxed"
        >
          <li>
            Force-recreate o stack:{' '}
            <code className="font-mono text-primary">
              podman compose up -d --force-recreate api
            </code>
          </li>
          <li>Recarregue esta página.</li>
        </ol>
      </div>

      <p className="text-[10px] text-muted-on-light leading-relaxed">
        O container KasmVNC + Caddy proxy é provisionado pelo compose do
        ontology-module — não é uma feature da UI. Veja{' '}
        <code className="font-mono text-primary">
          docs/security-app/configuracoes-browser-vm.md
        </code>{' '}
        para o setup completo.
      </p>
    </div>
  );
}
