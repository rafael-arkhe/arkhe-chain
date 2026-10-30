'use client';

/**
 * Conta — Sprint H1.5 (2026-05-22).
 *
 * Informações de identidade da sessão atual + ajustes de segurança da
 * conta (2FA). Vive em /painel-de-controle/conta — o item se chama
 * "Conta" no sidebar do painel, espelhando o que o conteúdo realmente
 * é (operador reclamou que "Preferências" duplicava a categoria do
 * painel, que já é a surface de Configurações).
 *
 * URL antiga /configuracoes e /painel-de-controle/preferencias
 * redirecionam pra cá (next.config.mjs).
 *
 * Gated por `security.configuracoes.view` (perm preservada do antigo
 * /configuracoes — defense-in-depth: layout do painel já gateia por
 * `painel.home.view`, mas conta é capability separada).
 */
import * as React from 'react';
import { AudioLines, Languages, ShieldCheck, Terminal } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { useAuth } from '@/lib/auth/useAuth';
import { useI18n, useT } from '@/lib/i18n/provider';
import { useAssistantPref } from '@/lib/assistant/assistant-pref-provider';
import { useAipChatPrefs } from '@/lib/aip/chat-prefs-provider';
import { TotpDialog } from '@/components/iam/TotpDialog';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { MeContextApi } from '@/lib/api';

export default function ContaPage() {
  const { principal } = useAuth();
  // Onda M1.c: o seletor de idioma migrou do rodapé do sidenav pra cá.
  const { locale, setLocale } = useI18n();
  const t = useT();
  // #9 — toggle do FAB do assistente (compartilha estado com o FAB via
  // AssistantPrefProvider). Default oculto.
  const { showFab, setShowFab } = useAssistantPref();
  const { metaMode, setMetaMode, tone, setTone, presets } = useAipChatPrefs();
  const [totpOpen, setTotpOpen] = React.useState(false);
  const [showPerms, setShowPerms] = React.useState(false);

  const permCount = principal?.permissions?.length ?? 0;

  return (
    <RequirePerm perm="security.configuracoes.view">
      <CpPageHeader
        title="Conta"
        subtitle="Identidade da sessão atual e ajustes de segurança"
      />
      <div className="p-6 max-w-2xl space-y-4">
        {/* ─── Identidade ─────────────────────────────── */}
        <section
          className="bg-canvas-light border border-border-light"
          data-testid="conta-identidade"
        >
          <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
              Identidade
            </p>
          </header>
          <div className="p-4 space-y-3">
            <Row label="Usuário" value={principal?.username ?? '—'} mono />
            <Row label="Nome" value={principal?.display_name ?? '—'} />
            <Row
              label="Papéis"
              value={(principal?.roles ?? []).join(' · ') || '—'}
              mono
            />
            <Row
              label="Permissões"
              value={
                permCount > 0
                  ? `${permCount} ${permCount === 1 ? 'permissão' : 'permissões'}`
                  : '—'
              }
              action={
                permCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPerms((s) => !s)}
                    data-testid="conta-perms-toggle"
                    className="text-[11px] text-primary hover:underline"
                  >
                    {showPerms ? 'ocultar' : 'ver todas'}
                  </button>
                ) : null
              }
            />
            {showPerms && permCount > 0 && (
              <div className="mt-2 px-3 py-2 bg-panel-light border border-border-light max-h-[180px] overflow-y-auto">
                <ul className="space-y-0.5">
                  {(principal?.permissions ?? []).map((p) => (
                    <li
                      key={p}
                      className="font-mono text-[10px] text-muted-on-light break-all"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* ─── Idioma ─────────────────────────────────── */}
        <section
          className="bg-canvas-light border border-border-light"
          data-testid="conta-idioma"
        >
          <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
              Idioma
            </p>
          </header>
          <div className="p-4 flex items-center gap-3">
            <Languages
              className="w-4 h-4 text-primary shrink-0"
              strokeWidth={1.5}
            />
            <div className="flex-1">
              <p className="text-[12px] font-medium">Idioma da interface</p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
                Aplica-se a toda a plataforma; a preferência fica salva na sua
                conta.
              </p>
            </div>
            <select
              data-testid="conta-locale-select"
              aria-label="Idioma da interface"
              value={locale}
              onChange={(e) => {
                void setLocale(e.target.value as typeof locale);
              }}
              className="h-8 px-2 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
        </section>

        {/* ─── Assistente (FAB) · #9 ──────────────────── */}
        <section
          className="bg-canvas-light border border-border-light"
          data-testid="conta-assistente"
        >
          <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
              {t('assistant.section')}
            </p>
          </header>
          <div className="p-4 flex items-center gap-3">
            <AudioLines
              className="w-4 h-4 text-primary shrink-0"
              strokeWidth={1.5}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium">
                {t('assistant.toggleLabel')}
              </p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
                {t('assistant.hint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showFab}
              aria-label={t('assistant.toggleLabel')}
              onClick={() => {
                void setShowFab(!showFab);
              }}
              data-testid="conta-assistant-toggle"
              className={
                'h-7 px-3 text-[11px] border shrink-0 ' +
                (showFab
                  ? 'bg-primary text-white border-primary hover:bg-primary/90'
                  : 'bg-raised-light border-border-light hover:border-primary')
              }
            >
              {showFab ? t('assistant.on') : t('assistant.off')}
            </button>
          </div>

          {/* Tom de voz do AIP Chat (Frente D) */}
          <div className="p-4 border-t border-border-light flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium">{t('aipChat.tone.label')}</p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
                {t('aipChat.tone.hint')}
              </p>
            </div>
            <select
              value={tone}
              onChange={(e) => void setTone(e.target.value)}
              data-testid="conta-aip-tone-select"
              aria-label={t('aipChat.tone.label')}
              className="h-7 px-2 text-[11px] bg-raised-light border border-border-light hover:border-primary shrink-0 max-w-[60%]"
            >
              <option value="">{t('aipChat.tone.default')}</option>
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Modo desenvolvedor do chat (Frente C) — metadados completos */}
          <div className="p-4 border-t border-border-light flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium">{t('aipChat.devmode.label')}</p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
                {t('aipChat.devmode.hint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={metaMode === 'advanced'}
              aria-label={t('aipChat.devmode.label')}
              onClick={() => void setMetaMode(metaMode === 'advanced' ? 'default' : 'advanced')}
              data-testid="conta-aip-devmode-toggle"
              className={
                'h-7 px-3 text-[11px] border shrink-0 ' +
                (metaMode === 'advanced'
                  ? 'bg-primary text-white border-primary hover:bg-primary/90'
                  : 'bg-raised-light border-border-light hover:border-primary')
              }
            >
              {metaMode === 'advanced' ? t('aipChat.devmode.on') : t('aipChat.devmode.off')}
            </button>
          </div>
        </section>

        {/* ─── Segurança · 2FA ────────────────────────── */}
        <section
          className="bg-canvas-light border border-border-light"
          data-testid="conta-seguranca"
        >
          <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
              Segurança
            </p>
          </header>
          <div className="p-4 flex items-start gap-3">
            <ShieldCheck
              className="w-4 h-4 text-success shrink-0 mt-0.5"
              strokeWidth={1.5}
            />
            <div className="flex-1">
              <p className="text-[12px] font-medium">
                Autenticação de 2 fatores ·{' '}
                {principal?.totp_enabled ? 'ativada' : 'desativada'}
              </p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
                Recomendado para todas as contas com acesso operacional.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTotpOpen(true)}
              data-testid="conta-totp-button"
              className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary"
            >
              {principal?.totp_enabled ? 'Reconfigurar' : 'Configurar'}
            </button>
          </div>
        </section>

        {/* ─── Dev (Safe Core) — M3 vendor dev-mode ────── */}
        <DevSection />
      </div>

      <TotpDialog open={totpOpen} onOpenChange={setTotpOpen} />
    </RequirePerm>
  );
}

/**
 * Seção "Dev (Safe Core)" — ativa/desativa o modo desenvolvedor (vendor).
 *
 * A senha é verificada server-side (hmac.compare_digest vs AEGIS_DEV_PASSWORD)
 * e nunca persiste no front. Ativar exige o papel `vendor`; o backend nega
 * (403) caso contrário — o gate real é `require_vendor_dev_mode` (papel vendor
 * + sessão dev-mode válida), independente do short-circuit de admin.
 *
 * Após ativar/desativar chamamos `refresh()` do AuthProvider para que o
 * `principal.dev_mode` (e o item "Dev" do sidenav) reflitam o novo estado.
 */
function DevSection() {
  const t = useT();
  const { principal, refresh } = useAuth();
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dev = principal?.dev_mode;
  const enabled = !!dev?.enabled;
  // #10 (2026-05-24) — dev-mode é gateado SÓ pela senha (AEGIS_DEV_PASSWORD),
  // não por papel. A seção é sempre visível em /conta (que já exige
  // `security.configuracoes.view`); quem tem a senha ativa o modo. Exigir um
  // papel `vendor` só pra VER o campo de senha era redundante (feedback do
  // operador) — a senha É a credencial.

  // #4 (2026-05-24) — relógio que avança 1×/min enquanto a sessão está ativa,
  // pra a contagem regressiva relativa ("encerra em N min") ficar viva sem
  // reload. Só roda enquanto `enabled` (não desperdiça timer quando inativo).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!enabled || !dev?.until) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [enabled, dev?.until]);

  // Horário absoluto curto e secundário: "24/05 18:20" (sem segundos, que
  // não agregam pro operador — o que importa é o relativo).
  const fmtAbsolute = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  // Tempo restante até `until`, em linguagem humana (via dict, locale-aware).
  // < 1 min → "encerrando"; senão min / h / h+min / dias.
  const fmtRemaining = (iso: string): string => {
    const ms = new Date(iso).getTime() - now;
    if (Number.isNaN(ms) || ms <= 0) return t('dev.expiringSoon');
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 1) return t('dev.relSeconds');
    if (totalMin < 60) return t('dev.relMinutes').replace('{n}', String(totalMin));
    const totalHours = Math.floor(totalMin / 60);
    if (totalHours >= 24) {
      return t('dev.relDays').replace('{n}', String(Math.floor(totalHours / 24)));
    }
    const mins = totalMin % 60;
    if (mins === 0) return t('dev.relHours').replace('{n}', String(totalHours));
    return t('dev.relHoursMinutes')
      .replace('{h}', String(totalHours))
      .replace('{m}', String(mins));
  };

  const onActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await MeContextApi.enableDevMode(password);
      setPassword('');
      await refresh();
    } catch {
      setError(t('dev.badPassword'));
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await MeContextApi.disableDevMode();
      await refresh();
    } catch {
      setError(t('common.retry'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bg-canvas-light border border-border-light"
      data-testid="conta-dev"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
          {t('dev.section')}
        </p>
      </header>
      <div className="p-4 flex items-start gap-3">
        <Terminal
          className="w-4 h-4 text-primary shrink-0 mt-0.5"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium">
            {t('dev.title')} ·{' '}
            <span data-testid="conta-dev-status">
              {enabled ? t('dev.statusOn') : t('dev.statusOff')}
            </span>
          </p>
          <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
            {t('dev.subtitle')}
          </p>
          {enabled && (
            <div className="mt-1" data-testid="conta-dev-active-state">
              <p className="text-[10px] text-success leading-relaxed">
                {t('dev.activeState')}
                {' · '}
                {dev?.until ? (
                  <>
                    {t('dev.expiresIn').replace(
                      '{rel}',
                      fmtRemaining(dev.until),
                    )}{' '}
                    <span className="text-muted-on-light">
                      ({fmtAbsolute(dev.until)})
                    </span>
                  </>
                ) : null}
              </p>
              <p className="text-[10px] text-muted-on-light mt-0.5 leading-relaxed">
                {t('dev.extendHint')}
              </p>
            </div>
          )}

          {!enabled && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password && !busy) void onActivate();
                }}
                placeholder={t('dev.passwordPlaceholder')}
                aria-label={t('dev.passwordLabel')}
                data-testid="conta-dev-password"
                className="h-8 px-2 flex-1 min-w-0 text-[12px] bg-white border border-border-light text-text-on-light focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <button
                type="button"
                disabled={!password || busy}
                onClick={() => void onActivate()}
                data-testid="conta-dev-activate"
                className="h-8 px-3 text-[11px] bg-primary text-white border border-primary disabled:opacity-50 hover:bg-primary/90"
              >
                {t('dev.activate')}
              </button>
            </div>
          )}

          {enabled && (
            <div className="mt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDeactivate()}
                data-testid="conta-dev-deactivate"
                className="h-8 px-3 text-[11px] bg-raised-light border border-border-light hover:border-primary disabled:opacity-50"
              >
                {t('dev.deactivate')}
              </button>
            </div>
          )}

          {error && (
            <p
              className="text-[11px] text-danger mt-2"
              data-testid="conta-dev-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold w-24 shrink-0">
        {label}
      </p>
      <p
        className={
          'flex-1 text-[12px] truncate' + (mono ? ' font-mono' : '')
        }
      >
        {value}
      </p>
      {action}
    </div>
  );
}
