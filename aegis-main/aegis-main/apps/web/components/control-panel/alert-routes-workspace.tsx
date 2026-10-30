'use client';

/**
 * Rotas de notificação — /painel-de-controle/alertas (2026-06-12).
 *
 * Config de roteamento de alertas sobre o store da ontologia (AlertRoute =
 * OntologyNode): cada rota casa kinds + severidade mínima e entrega por um
 * canal do registry de messaging (config do tenant em Tenant.metadata_.
 * messaging). Silenciar e desativar são GESTOS AUDITADOS no backend
 * (lineage alert_route.silenced/unsilenced/updated).
 *
 * Regras honradas:
 *  - feedback_no_manual_technical_input · kinds/severidade/canal/config-ref
 *    são dropdowns populados do backend — nunca texto livre técnico.
 *  - feedback_no_native_dialogs · promptModal (duração) + confirmModal.
 *  - feedback_ui_english_only · todas as strings via useT() (pt-BR + en-US).
 *  - cantos retos, zero emoji, JetBrains Mono (font-mono) para dados.
 */
import * as React from 'react';
import {
  AlertTriangle, BellOff, BellRing, Loader2, Pencil, Plus, Power, RouteOff,
  Settings2, Trash2, X,
} from 'lucide-react';

import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpEmptyState } from '@/components/control-panel/cp-empty-state';
import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import {
  AlertRoutes,
  type AlertChannel,
  type AlertRoute,
} from '@/lib/api';

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
// Kinds dos emissores nativos têm rótulo no dict; kinds de domínio (dado do
// tenant) aparecem como vieram — são vocabulário do próprio operador.
const LABELED_KINDS = new Set(['search_feed', 'object_watch', 'geofence', 'share']);
const LABELED_CHANNELS = new Set(['log', 'webhook', 'whatsapp', 'discord']);

type T = (k: string) => string;

function kindLabel(t: T, kind: string): string {
  return LABELED_KINDS.has(kind) ? t(`alertasRotas.kind.${kind}`) : kind;
}

function channelLabel(t: T, channel: string): string {
  return LABELED_CHANNELS.has(channel)
    ? t(`alertasRotas.channel.${channel}`)
    : channel;
}

function isSilenced(route: AlertRoute): boolean {
  if (!route.silence_until) return false;
  const until = Date.parse(route.silence_until);
  return Number.isFinite(until) && until > Date.now();
}

function fmtUntil(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—';
}

interface FormState {
  id: string | null; // null = criar
  name: string;
  kinds: string[];
  min_severity: string;
  channel: string;
  channel_config_ref: string;
}

const EMPTY_FORM: FormState = {
  id: null, name: '', kinds: [], min_severity: 'low', channel: 'log',
  channel_config_ref: '',
};

export function AlertRoutesWorkspace() {
  const t = useT();
  const canManage = useCan('alerts.routes.manage');

  const [routes, setRoutes] = React.useState<AlertRoute[] | null>(null);
  const [channels, setChannels] = React.useState<AlertChannel[]>([]);
  const [kinds, setKinds] = React.useState<string[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setErr(null);
    try {
      const [rs, chs, ks] = await Promise.all([
        AlertRoutes.list(),
        AlertRoutes.channels(),
        AlertRoutes.kinds(),
      ]);
      setRoutes(rs);
      setChannels(chs);
      setKinds(ks);
    } catch {
      setRoutes(null);
      setErr(t('alertasRotas.error'));
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const channelByName = React.useMemo(() => {
    const m: Record<string, AlertChannel> = {};
    for (const c of channels) m[c.channel] = c;
    return m;
  }, [channels]);

  // ── Gestos auditados ──────────────────────────────────────────────────────
  const doSilence = async (route: AlertRoute) => {
    const raw = await promptModal({
      title: t('alertasRotas.silence_prompt_title'),
      description: t('alertasRotas.silence_prompt_desc'),
      defaultValue: '60',
      placeholder: '60',
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
    });
    if (raw == null) return;
    const minutes = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setErr(t('alertasRotas.silence_invalid'));
      return;
    }
    const ok = await confirmModal({
      title: t('alertasRotas.silence_confirm_title'),
      description: t('alertasRotas.silence_confirm_desc')
        .replace('{name}', route.name)
        .replace('{minutes}', String(minutes)),
      tone: 'warning',
      confirmLabel: t('alertasRotas.silence'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(route.id);
    try {
      await AlertRoutes.silence(route.id, minutes);
      await load();
    } catch {
      setErr(t('alertasRotas.gesture_failed'));
    } finally {
      setBusy(null);
    }
  };

  const doUnsilence = async (route: AlertRoute) => {
    const ok = await confirmModal({
      title: t('alertasRotas.unsilence_confirm_title'),
      description: t('alertasRotas.unsilence_confirm_desc').replace(
        '{name}', route.name,
      ),
      confirmLabel: t('alertasRotas.unsilence'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(route.id);
    try {
      await AlertRoutes.silence(route.id, 0);
      await load();
    } catch {
      setErr(t('alertasRotas.gesture_failed'));
    } finally {
      setBusy(null);
    }
  };

  const doToggleActive = async (route: AlertRoute) => {
    const deactivating = route.active;
    const ok = await confirmModal({
      title: deactivating
        ? t('alertasRotas.deactivate_confirm_title')
        : t('alertasRotas.activate_confirm_title'),
      description: (deactivating
        ? t('alertasRotas.deactivate_confirm_desc')
        : t('alertasRotas.activate_confirm_desc')
      ).replace('{name}', route.name),
      tone: deactivating ? 'warning' : 'default',
      confirmLabel: deactivating
        ? t('alertasRotas.deactivate')
        : t('alertasRotas.activate'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(route.id);
    try {
      await AlertRoutes.update(route.id, { active: !route.active });
      await load();
    } catch {
      setErr(t('alertasRotas.gesture_failed'));
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (route: AlertRoute) => {
    const ok = await confirmModal({
      title: t('alertasRotas.delete_confirm_title'),
      description: t('alertasRotas.delete_confirm_desc').replace(
        '{name}', route.name,
      ),
      tone: 'danger',
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(route.id);
    try {
      await AlertRoutes.remove(route.id);
      await load();
    } catch {
      setErr(t('alertasRotas.gesture_failed'));
    } finally {
      setBusy(null);
    }
  };

  // ── Painel lateral criar/editar ───────────────────────────────────────────
  const openCreate = () => {
    setFormErr(null);
    setForm({ ...EMPTY_FORM, channel: channels[0]?.channel ?? 'log' });
  };
  const openEdit = (route: AlertRoute) => {
    setFormErr(null);
    setForm({
      id: route.id,
      name: route.name,
      kinds: [...(route.match?.kinds ?? [])],
      min_severity: route.match?.min_severity ?? 'low',
      channel: route.channel,
      channel_config_ref: route.channel_config_ref ?? '',
    });
  };

  const toggleKind = (kind: string) => {
    setForm((f) => {
      if (!f) return f;
      const has = f.kinds.includes(kind);
      return {
        ...f,
        kinds: has ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind],
      };
    });
  };

  const submitForm = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      setFormErr(t('alertasRotas.f.name_required'));
      return;
    }
    setFormErr(null);
    setBusy('form');
    const payload = {
      name: form.name.trim(),
      match: { kinds: form.kinds, min_severity: form.min_severity },
      channel: form.channel,
      channel_config_ref: form.channel_config_ref || null,
    };
    try {
      if (form.id) await AlertRoutes.update(form.id, payload);
      else await AlertRoutes.create(payload);
      setForm(null);
      await load();
    } catch {
      setFormErr(t('alertasRotas.save_failed'));
    } finally {
      setBusy(null);
    }
  };

  const selectedChannel = form ? channelByName[form.channel] : undefined;
  const channelNeedsConfig = Boolean(
    selectedChannel && selectedChannel.requires_config && !selectedChannel.configured,
  );

  // ── Configuração do canal (o gesto que tirava o operador do banco) ────────
  const [cfgAberta, setCfgAberta] = React.useState(false);
  const [cfgUrl, setCfgUrl] = React.useState('');
  const [cfgNome, setCfgNome] = React.useState('');
  const [cfgSalvando, setCfgSalvando] = React.useState(false);
  const [cfgMsg, setCfgMsg] = React.useState<string | null>(null);
  const [cfgErro, setCfgErro] = React.useState(false);

  // Trocar de canal no formulário zera o que estava digitado: a credencial de
  // um canal não pode vazar para a config de outro por descuido.
  React.useEffect(() => {
    setCfgAberta(false);
    setCfgUrl('');
    setCfgNome('');
    setCfgMsg(null);
  }, [form?.channel]);

  const salvarCanal = async () => {
    if (!form) return;
    setCfgSalvando(true);
    setCfgMsg(null);
    setCfgErro(false);
    try {
      await AlertRoutes.putChannel(form.channel, {
        channel: form.channel,
        url: cfgUrl.trim(),
        ...(cfgNome.trim() ? { username: cfgNome.trim() } : {}),
      });
      // relê os canais: é o backend que diz se ficou configurado, não a tela
      setChannels(await AlertRoutes.channels());
      setCfgUrl('');
      setCfgMsg(t('alertasRotas.channel_cfg.saved'));
    } catch (e) {
      setCfgErro(true);
      setCfgMsg((e as Error)?.message ?? t('alertasRotas.gesture_failed'));
    } finally {
      setCfgSalvando(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      <CpPageHeader
        title={t('alertasRotas.title')}
        subtitle={t('alertasRotas.subtitle')}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              {t('alertasRotas.new')}
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 p-6 space-y-4">
          {err && (
            <div
              role="alert"
              className="border border-danger/40 bg-danger/5 px-3 py-2 flex items-center gap-2 text-[12px] text-text-on-light"
            >
              <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={1.5} />
              <span className="flex-1">{err}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="h-7 px-2 text-[12px] border border-border-light bg-white hover:border-primary"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {routes == null && !err && (
            <div className="flex items-center gap-2 text-[12px] text-muted-on-light p-6">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              {t('common.loading')}
            </div>
          )}

          {routes != null && routes.length === 0 && (
            <CpEmptyState
              icon={RouteOff}
              title={t('alertasRotas.empty')}
              description={t('alertasRotas.empty_desc')}
              cta={
                canManage
                  ? { label: t('alertasRotas.new'), onClick: openCreate }
                  : undefined
              }
            />
          )}

          {routes != null && routes.length > 0 && (
            <table className="w-full text-[12px] border border-border-light bg-white">
              <thead>
                <tr className="border-b border-border-light text-left text-muted-on-light">
                  <th className="px-3 py-2 font-medium">{t('alertasRotas.col.name')}</th>
                  <th className="px-3 py-2 font-medium">{t('alertasRotas.col.match')}</th>
                  <th className="px-3 py-2 font-medium">{t('alertasRotas.col.channel')}</th>
                  <th className="px-3 py-2 font-medium">{t('alertasRotas.col.silence')}</th>
                  <th className="px-3 py-2 font-medium">{t('alertasRotas.col.active')}</th>
                  {canManage && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => {
                  const silenced = isSilenced(r);
                  return (
                    <tr key={r.id} className="border-b border-border-light last:border-b-0 align-top">
                      <td className="px-3 py-2 font-medium text-text-on-light">{r.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(r.match?.kinds ?? []).length === 0 ? (
                            <span className="text-muted-on-light">
                              {t('alertasRotas.match_all_kinds')}
                            </span>
                          ) : (
                            r.match.kinds.map((k) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.5 border border-border-light bg-canvas-light"
                              >
                                {kindLabel(t, k)}
                              </span>
                            ))
                          )}
                        </div>
                        <div className="mt-1 text-muted-on-light">
                          {t('alertasRotas.min_severity_prefix')}{' '}
                          {t(`alertasRotas.sev.${r.match?.min_severity ?? 'low'}`)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {channelLabel(t, r.channel)}
                        {r.channel_config_ref && (
                          <div className="font-mono text-[11px] text-muted-on-light">
                            {r.channel_config_ref}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {silenced ? (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <BellOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                            <span className="font-mono text-[11px]">
                              {fmtUntil(r.silence_until)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-on-light">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.active ? (
                          <span className="px-1.5 py-0.5 border border-success/40 text-success">
                            {t('alertasRotas.active')}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 border border-border-light text-muted-on-light">
                            {t('alertasRotas.inactive')}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {silenced ? (
                              <button
                                type="button"
                                data-testid={`route-unsilence-${r.id}`}
                                title={t('alertasRotas.unsilence')}
                                disabled={busy === r.id}
                                onClick={() => void doUnsilence(r)}
                                className="h-7 px-2 inline-flex items-center gap-1 border border-border-light bg-white hover:border-primary disabled:opacity-50"
                              >
                                <BellRing className="w-3.5 h-3.5" strokeWidth={1.5} />
                                {t('alertasRotas.unsilence')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                data-testid={`route-silence-${r.id}`}
                                title={t('alertasRotas.silence')}
                                disabled={busy === r.id}
                                onClick={() => void doSilence(r)}
                                className="h-7 px-2 inline-flex items-center gap-1 border border-border-light bg-white hover:border-primary disabled:opacity-50"
                              >
                                <BellOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                                {t('alertasRotas.silence')}
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`route-toggle-${r.id}`}
                              title={r.active ? t('alertasRotas.deactivate') : t('alertasRotas.activate')}
                              disabled={busy === r.id}
                              onClick={() => void doToggleActive(r)}
                              className="h-7 px-2 inline-flex items-center gap-1 border border-border-light bg-white hover:border-primary disabled:opacity-50"
                            >
                              <Power className="w-3.5 h-3.5" strokeWidth={1.5} />
                              {r.active ? t('alertasRotas.deactivate') : t('alertasRotas.activate')}
                            </button>
                            <button
                              type="button"
                              data-testid={`route-edit-${r.id}`}
                              title={t('common.edit')}
                              disabled={busy === r.id}
                              onClick={() => openEdit(r)}
                              className="h-7 w-7 inline-flex items-center justify-center border border-border-light bg-white hover:border-primary disabled:opacity-50"
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              data-testid={`route-delete-${r.id}`}
                              title={t('common.delete')}
                              disabled={busy === r.id}
                              onClick={() => void doDelete(r)}
                              className="h-7 w-7 inline-flex items-center justify-center border border-border-light bg-white hover:border-danger disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Painel lateral criar/editar — dropdowns populados, nunca texto
            técnico livre. */}
        {form && canManage && (
          <aside className="w-[380px] shrink-0 border-l border-border-light bg-white p-4 space-y-4">
            <header className="flex items-center gap-2">
              <h2 className="flex-1 text-[13px] font-semibold text-text-on-light">
                {form.id ? t('alertasRotas.edit_title') : t('alertasRotas.create_title')}
              </h2>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setForm(null)}
                className="text-muted-on-light hover:text-text-on-light"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </header>

            <label className="block text-[12px] space-y-1">
              <span className="text-muted-on-light">{t('alertasRotas.f.name')}</span>
              <input
                type="text"
                data-testid="route-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-8 px-2 bg-white border border-border-light outline-none focus:border-primary"
              />
            </label>

            <fieldset className="text-[12px] space-y-1">
              <legend className="text-muted-on-light">{t('alertasRotas.f.kinds')}</legend>
              <p className="text-[11px] text-muted-on-light">
                {t('alertasRotas.f.kinds_hint')}
              </p>
              <div className="space-y-1 max-h-44 overflow-y-auto border border-border-light p-2">
                {kinds.map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid={`route-kind-${k}`}
                      checked={form.kinds.includes(k)}
                      onChange={() => toggleKind(k)}
                    />
                    <span>{kindLabel(t, k)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-[12px] space-y-1">
              <span className="text-muted-on-light">{t('alertasRotas.f.min_severity')}</span>
              <select
                data-testid="route-severity"
                value={form.min_severity}
                onChange={(e) => setForm({ ...form, min_severity: e.target.value })}
                className="w-full h-8 px-1 bg-white border border-border-light outline-none focus:border-primary"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`alertasRotas.sev.${s}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[12px] space-y-1">
              <span className="text-muted-on-light">{t('alertasRotas.f.channel')}</span>
              <select
                data-testid="route-channel"
                value={form.channel}
                onChange={(e) =>
                  setForm({ ...form, channel: e.target.value, channel_config_ref: '' })
                }
                className="w-full h-8 px-1 bg-white border border-border-light outline-none focus:border-primary"
              >
                {channels.map((c) => (
                  <option key={c.channel} value={c.channel}>
                    {channelLabel(t, c.channel)}
                  </option>
                ))}
              </select>
            </label>

            {channelNeedsConfig && (
              <div
                role="status"
                className="border border-warning/50 bg-warning/5 px-2 py-1.5 flex items-start gap-2 text-[11px] text-text-on-light"
              >
                <AlertTriangle
                  className="w-3.5 h-3.5 mt-0.5 text-warning shrink-0"
                  strokeWidth={1.5}
                />
                <span className="flex-1">{t('alertasRotas.channel_warning')}</span>
              </div>
            )}

            {/* Configurar o canal AQUI: o aviso acima dizia o que está errado
                e deixava o operador sem saída — apontar o webhook exigia editar
                o banco. O gesto é auditado (alert_channel.configured) e o
                segredo volta mascarado. */}
            {selectedChannel && selectedChannel.requires_config && canManage && (
              <div className="border border-border-light p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-on-light">
                    {t('alertasRotas.channel_cfg.title')}
                    {selectedChannel.configured && (
                      <span className="ml-1.5 text-success">
                        · {t('alertasRotas.channel_cfg.current')}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="channel-cfg-toggle"
                    onClick={() => setCfgAberta((v) => !v)}
                    className="h-7 px-2 inline-flex items-center gap-1.5 text-[11px] border border-border-light bg-white hover:border-primary"
                  >
                    <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    {t('alertasRotas.channel_cfg.action')}
                  </button>
                </div>

                {cfgAberta && (
                  <div className="space-y-2">
                    <label className="block text-[12px] space-y-1">
                      <span className="text-muted-on-light">
                        {t('alertasRotas.channel_cfg.url')}
                      </span>
                      <input
                        data-testid="channel-cfg-url"
                        value={cfgUrl}
                        onChange={(e) => setCfgUrl(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full h-8 px-1 bg-white border border-border-light outline-none focus:border-primary font-mono"
                      />
                      <span className="block text-[10px] text-muted-on-light">
                        {t('alertasRotas.channel_cfg.url_hint')}
                      </span>
                    </label>

                    <label className="block text-[12px] space-y-1">
                      <span className="text-muted-on-light">
                        {t('alertasRotas.channel_cfg.username')}
                      </span>
                      <input
                        data-testid="channel-cfg-username"
                        value={cfgNome}
                        onChange={(e) => setCfgNome(e.target.value)}
                        className="w-full h-8 px-1 bg-white border border-border-light outline-none focus:border-primary"
                      />
                    </label>

                    {cfgMsg && (
                      <p
                        role="status"
                        className={`text-[11px] ${cfgErro ? 'text-danger' : 'text-success'}`}
                      >
                        {cfgMsg}
                      </p>
                    )}

                    <button
                      type="button"
                      data-testid="channel-cfg-save"
                      disabled={cfgSalvando || !cfgUrl.trim()}
                      onClick={() => void salvarCanal()}
                      className="h-7 px-2 inline-flex items-center gap-1.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-40"
                    >
                      {cfgSalvando && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      )}
                      {t('common.save')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedChannel && selectedChannel.config_refs.length > 0 && (
              <label className="block text-[12px] space-y-1">
                <span className="text-muted-on-light">{t('alertasRotas.f.config_ref')}</span>
                <select
                  data-testid="route-config-ref"
                  value={form.channel_config_ref}
                  onChange={(e) =>
                    setForm({ ...form, channel_config_ref: e.target.value })
                  }
                  className="w-full h-8 px-1 bg-white border border-border-light outline-none focus:border-primary font-mono"
                >
                  <option value="">{t('alertasRotas.f.config_ref_default')}</option>
                  {selectedChannel.config_refs.map((ref) => (
                    <option key={ref} value={ref}>
                      {ref}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {formErr && (
              <p role="alert" className="text-[11px] text-danger">
                {formErr}
              </p>
            )}

            <footer className="flex items-center justify-end gap-2 pt-2 border-t border-border-light">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="route-submit"
                disabled={busy === 'form'}
                onClick={() => void submitForm()}
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {form.id ? t('common.save') : t('common.create')}
              </button>
            </footer>
          </aside>
        )}
      </div>
    </div>
  );
}
