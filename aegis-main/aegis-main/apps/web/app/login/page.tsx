'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { Styles, type PublicBrandOut } from '@/lib/api';
import { DEFAULT_LOGIN } from '@/lib/app-shell/defaults';

interface LoginResponse {
  must_change_password?: boolean;
  detail?: string;
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-panel-light" />}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh: refreshAuth } = useAuth();
  const t = useT();
  const next = params.get('next') || '/';

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [totpCode, setTotpCode] = React.useState('');
  const [showTotp, setShowTotp] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // M2 (2026-05-24) — marca pública do tenant (pré-login). Começa nula;
  // o useEffect hidrata. Enquanto não chega, a tela usa os defaults AEGIS
  // (logo/slogan/cor canônicos) — nunca tela em branco.
  const [brand, setBrand] = React.useState<PublicBrandOut | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    Styles.getPublicBrand()
      .then((b) => {
        if (!cancelled) setBrand(b);
      })
      .catch(() => {
        // Best-effort: sem rede, mantém os defaults AEGIS.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quando `login_use_default` é true (ou não há marca), aplica a marca
  // AEGIS neutra. Caso contrário, aplica a marca do tenant com fallback
  // nos defaults AEGIS para campos vazios.
  const useDefault = brand?.login_use_default !== false;
  const logoUrl = useDefault
    ? DEFAULT_LOGIN.logo_url
    : brand?.logo_url || DEFAULT_LOGIN.logo_url;
  const slogan = useDefault
    ? t('login.subtitle')
    : brand?.slogan || t('login.subtitle');
  const primaryColor = useDefault ? null : brand?.primary_color || null;
  const background = useDefault ? null : brand?.login_background || null;
  const message = useDefault ? null : brand?.login_message || null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          totp_code: totpCode || undefined,
        }),
        cache: 'no-store',
      });
      const body: LoginResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.detail === 'totp_required') {
          setShowTotp(true);
          setError(t('login.errorTotp'));
          return;
        }
        if (res.status === 401) {
          setError(t('login.errorInvalid'));
          return;
        }
        if (res.status === 423) {
          setError(t('login.errorLocked'));
          return;
        }
        setError(body.detail || `${t('login.errorInvalid')} (${res.status})`);
        return;
      }
      if (body.must_change_password) {
        router.replace(
          '/login/change-password?next=' + encodeURIComponent(next),
        );
        return;
      }
      // Re-fetch /api/auth/me pra que o AuthProvider pegue o cookie
      // recém-setado ANTES de navegar — sem isso a sidenav e
      // RequirePerm renderizam com principal=null até o próximo load.
      await refreshAuth();
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.errorNetwork'));
    } finally {
      setBusy(false);
    }
  }

  // Cor primária custom é aplicada via CSS var inline (sem tocar tokens
  // globais): botão + foco dos inputs herdam dela quando o tenant define.
  const customStyle = primaryColor
    ? ({
        ['--login-primary' as string]: primaryColor,
      } as React.CSSProperties)
    : undefined;
  const accent = primaryColor ?? undefined;

  return (
    <div
      className="min-h-screen flex flex-col bg-panel-light text-text-on-light"
      style={{
        ...(customStyle ?? {}),
        ...(background
          ? {
              backgroundImage: `url(${background})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : {}),
      }}
      data-testid="login-root"
      data-brand-default={useDefault ? 'true' : 'false'}
    >
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] bg-canvas-light border border-border-light shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
          <div className="px-6 py-5 border-b border-border-light flex flex-col items-center gap-2">
            <Image
              src={logoUrl}
              alt=""
              width={32}
              height={32}
              data-testid="login-logo"
              unoptimized
            />
            <p
              className="text-[10px] font-mono tracking-[0.32em] uppercase"
              data-testid="login-brand-name"
            >
              {brand?.pwa_name || 'AEGIS'}
            </p>
            <p
              className="text-[10px] font-mono text-muted-on-light"
              data-testid="login-slogan"
            >
              {slogan}
            </p>
            {message && (
              <p
                className="text-[11px] text-text-on-light text-center mt-1"
                data-testid="login-message"
              >
                {message}
              </p>
            )}
          </div>

          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <div>
              <label
                className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold"
                htmlFor="username"
              >
                {t('login.username')}
              </label>
              <div className="mt-1 relative">
                <UserIcon
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-9 pl-8 pr-2 bg-canvas-light border border-border-light text-[13px] font-mono outline-none focus:border-primary"
                  style={accent ? { borderColor: undefined } : undefined}
                  required
                  disabled={busy}
                  aria-label={t('login.username')}
                />
              </div>
            </div>
            <div>
              <label
                className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold"
                htmlFor="password"
              >
                {t('login.password')}
              </label>
              <div className="mt-1 relative">
                <Lock
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 pl-8 pr-2 bg-canvas-light border border-border-light text-[13px] font-mono outline-none focus:border-primary"
                  required
                  disabled={busy}
                  aria-label={t('login.password')}
                />
              </div>
            </div>
            {showTotp && (
              <div>
                <label
                  className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold"
                  htmlFor="totp"
                >
                  {t('login.totp')}
                </label>
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, ''))
                  }
                  className="mt-1 w-full h-9 px-2 bg-canvas-light border border-border-light text-[13px] font-mono tracking-[0.4em] outline-none focus:border-primary"
                  placeholder="123456"
                  disabled={busy}
                  aria-label={t('login.totp')}
                />
              </div>
            )}

            {error && (
              <div
                className="border border-danger bg-danger/10 px-3 py-2 text-[11px] text-danger font-mono"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit"
              className="w-full h-9 bg-primary text-white text-[12px] font-medium uppercase tracking-[0.18em] hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2"
              style={accent ? { backgroundColor: accent } : undefined}
            >
              {busy ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </div>

      <footer className="px-6 py-3 border-t border-border-light text-[10px] font-mono text-muted-on-light flex items-center justify-between gap-3 bg-panel-light">
        <span
          className="inline-flex items-center gap-1.5 border border-border-light px-1.5 py-0.5 uppercase tracking-[0.18em]"
          data-testid="login-secure-badge"
        >
          <ShieldCheck className="w-3 h-3 text-success" strokeWidth={1.5} aria-hidden />
          {t('login.secureEnv')}
        </span>
        <span data-testid="login-sdk-version">
          v{process.env.NEXT_PUBLIC_AEGIS_SDK_VERSION || 'dev'} ·{' '}
          {brand?.company_name || brand?.pwa_name || 'AEGIS'}
        </span>
      </footer>
    </div>
  );
}
