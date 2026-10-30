'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';

/**
 * Rotação obrigatória de senha. Espelha
 * politicians-app/app/login/change-password/page.tsx, adaptado pro
 * estilo Palantir-sharp do security-app (mesmo template da /login).
 *
 * Disparada pelo /login quando o backend retorna
 * `must_change_password: true`. Após sucesso (204), redireciona pra
 * `next` (default `/`).
 *
 * Next 15 prerendering exige que `useSearchParams()` esteja dentro de
 * <Suspense> — sem isso o `next build` falha no static export.
 */
export default function ChangePasswordPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-panel-light" />}>
      <ChangePasswordInner />
    </React.Suspense>
  );
}

function ChangePasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [current, setCurrent] = React.useState('');
  const [pw1, setPw1] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw1 !== pw2) {
      setError('Senhas novas não conferem.');
      return;
    }
    if (pw1.length < 12) {
      setError('A senha precisa ter pelo menos 12 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: current,
          new_password: pw1,
        }),
        cache: 'no-store',
      });
      if (res.status === 204) {
        router.replace(next);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(
        typeof body.detail === 'string'
          ? body.detail
          : `Falha ao trocar senha (${res.status}).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de rede.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-panel-light text-text-on-light">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] bg-canvas-light border border-border-light shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
          <div className="px-6 py-5 border-b border-border-light flex flex-col items-center gap-2">
            <Image
              src="/logo-white.svg"
              alt=""
              width={32}
              height={32}
              className="invert"
            />
            <p className="text-[10px] font-mono tracking-[0.32em] uppercase">
              AEGIS
            </p>
            <p className="text-[10px] font-mono text-muted-on-light">
              Rotação de senha
            </p>
          </div>

          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <p className="text-[11px] text-muted-on-light leading-snug font-mono">
              Sua conta está marcada para troca de senha. Escolha uma senha
              que atenda à política: <strong>≥ 12 caracteres</strong>, não
              está em listas comuns e não contém seu usuário.
            </p>

            <div>
              <label
                className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold"
                htmlFor="current"
              >
                Senha atual
              </label>
              <div className="mt-1 relative">
                <Lock
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
                  strokeWidth={1.5}
                />
                <input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="w-full h-9 pl-8 pr-2 bg-canvas-light border border-border-light text-[13px] font-mono outline-none focus:border-primary"
                  required
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <label
                className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold"
                htmlFor="pw1"
              >
                Nova senha
              </label>
              <div className="mt-1 relative">
                <KeyRound
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
                  strokeWidth={1.5}
                />
                <input
                  id="pw1"
                  type="password"
                  autoComplete="new-password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  className="w-full h-9 pl-8 pr-2 bg-canvas-light border border-border-light text-[13px] font-mono outline-none focus:border-primary"
                  required
                  minLength={12}
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <label
                className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold"
                htmlFor="pw2"
              >
                Confirmar nova senha
              </label>
              <div className="mt-1 relative">
                <KeyRound
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-on-light"
                  strokeWidth={1.5}
                />
                <input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="w-full h-9 pl-8 pr-2 bg-canvas-light border border-border-light text-[13px] font-mono outline-none focus:border-primary"
                  required
                  minLength={12}
                  disabled={busy}
                />
              </div>
            </div>

            {error && (
              <div className="border border-danger bg-danger/10 px-3 py-2 text-[11px] text-danger font-mono">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="change-password-submit"
              className="w-full h-9 bg-primary text-white text-[12px] font-medium uppercase tracking-[0.18em] hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? 'Atualizando…' : 'Atualizar senha'}
            </button>
          </form>
        </div>
      </div>

      <footer className="px-6 py-3 border-t border-border-light text-[10px] font-mono text-muted-on-light flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 border border-border-light px-1.5 py-0.5 uppercase tracking-[0.18em]"
          data-testid="change-password-secure-badge"
        >
          <ShieldCheck className="w-3 h-3 text-success" strokeWidth={1.5} />
          Ambiente seguro
        </span>
        <span>
          v{process.env.NEXT_PUBLIC_AEGIS_SDK_VERSION || 'dev'} · AEGIS SDK
        </span>
      </footer>
    </div>
  );
}
