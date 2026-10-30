'use client';

/**
 * ByomModelsCard — modelos de IA que o próprio tenant hospeda (endpoint OpenAI-
 * compatible + chave). A chave vai cifrada para o cofre (Vault) e nunca volta pela
 * API (só `has_credential`). UX explica em linguagem de operador o que é e p/ quê.
 *
 * Regras (memory): ícone AudioLines neutro (sem cor); ZERO nome de fornecedor de
 * terceiros (provider enviado é sempre "custom" — o endpoint é próprio); chave em
 * campo password write-only; capacidades por rótulo i18n. useT().
 */
import * as React from 'react';
import { AudioLines, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { useCan } from '@/lib/auth/useAuth';
import { AIPModels, type ByomModel } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { cn } from '@/lib/cn';

const CAP_KEYS: Record<string, string> = {
  reasoning: 'aip.cap.reasoning',
  vision: 'aip.cap.vision',
  structured_outputs: 'aip.cap.structured_outputs',
  tool_use: 'aip.cap.tool_use',
  audio: 'aip.cap.audio',
  long_context: 'aip.cap.long_context',
};

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] font-medium text-text-on-light">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted-on-light">{hint}</span>}
    </label>
  );
}

export function ByomModelsCard() {
  const t = useT();
  const canWrite = useCan('aip.models.write');
  const [models, setModels] = React.useState<ByomModel[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [ctx, setCtx] = React.useState('');
  const [caps, setCaps] = React.useState<string[]>([]);

  const load = React.useCallback(async () => {
    try {
      setModels(await AIPModels.list());
    } catch (e) {
      setError(humanise(e));
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setName('');
    setEndpoint('');
    setApiKey('');
    setCtx('');
    setCaps([]);
    setOpen(false);
  };

  const submit = React.useCallback(async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await AIPModels.register({
        name: name.trim(),
        provider: 'custom', // endpoint é próprio — sem citar fornecedor de terceiros
        endpoint_url: endpoint.trim() || undefined,
        api_key: apiKey.trim() || undefined,
        context_window: ctx.trim() ? parseInt(ctx, 10) || 0 : 0,
        capabilities: caps,
      });
      reset();
      await load();
    } catch (e) {
      setError(humanise(e));
    } finally {
      setBusy(false);
    }
  }, [name, endpoint, apiKey, ctx, caps, busy, load]);

  const remove = React.useCallback(
    async (m: ByomModel) => {
      if (
        !(await confirmModal({
          title: t('byom.removeTitle').replace('{name}', m.name),
          description: t('byom.removeDesc'),
          tone: 'danger',
          confirmLabel: t('byom.remove'),
        }))
      )
        return;
      try {
        await AIPModels.unregister(m.id);
        await load();
      } catch (e) {
        setError(humanise(e));
      }
    },
    [load, t],
  );

  const inputCls =
    'w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none';

  return (
    <div className="border border-border-light bg-white" data-testid="byom-models-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-light">
        <AudioLines className="w-4 h-4 text-text-on-light shrink-0" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-text-on-light">{t('byom.title')}</div>
          <div className="text-[11px] text-muted-on-light leading-snug">{t('byom.subtitle')}</div>
        </div>
        {canWrite && !open && (
          <Button size="sm" onClick={() => setOpen(true)} className="h-7" data-testid="byom-add">
            <Plus className="w-3 h-3 mr-1" strokeWidth={1.5} />
            {t('byom.add')}
          </Button>
        )}
      </div>

      {error && (
        <p className="px-4 py-2 text-[11px] font-mono text-danger" data-testid="byom-error">
          {error}
        </p>
      )}

      {/* Explicação em linguagem de operador. */}
      {!open && (
        <p className="px-4 py-2.5 text-[11px] text-muted-on-light leading-relaxed border-b border-border-light">
          {t('byom.intro')}
        </p>
      )}

      {open && canWrite && (
        <div className="px-4 py-3 space-y-3 border-b border-border-light bg-canvas-light" data-testid="byom-form">
          <Field label={t('byom.name')} hint={t('byom.nameHint')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('byom.namePlaceholder')}
              className={cn(inputCls, 'font-mono')}
              data-testid="byom-name"
            />
          </Field>
          <Field label={t('byom.endpoint')} hint={t('byom.endpointHint')}>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://…/v1"
              className={cn(inputCls, 'font-mono')}
              data-testid="byom-endpoint"
            />
          </Field>
          <Field
            label={t('byom.apiKey')}
            hint={t('byom.apiKeyHint')}
          >
            <div className="relative">
              <KeyRound className="w-3.5 h-3.5 text-muted-on-light absolute left-2 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('byom.apiKeyPlaceholder')}
                autoComplete="new-password"
                className={cn(inputCls, 'pl-7 font-mono')}
                data-testid="byom-api-key"
              />
            </div>
          </Field>
          <Field label={t('byom.context')} hint={t('byom.contextHint')}>
            <input
              value={ctx}
              onChange={(e) => setCtx(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="32768"
              inputMode="numeric"
              className={cn(inputCls, 'font-mono w-40')}
              data-testid="byom-context"
            />
          </Field>
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-text-on-light">{t('byom.capabilities')}</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CAP_KEYS).map(([c, k]) => {
                const on = caps.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCaps((s) => (on ? s.filter((x) => x !== c) : [...s, c]))}
                    className={cn(
                      'text-[11px] px-2 py-0.5 border',
                      on ? 'border-primary text-primary bg-primary/5' : 'border-border-light text-muted-on-light',
                    )}
                    data-testid={`byom-cap-${c}`}
                  >
                    {t(k)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={busy || !name.trim()} className="h-8 text-[12px]" data-testid="byom-save">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : null}
              {t('byom.save')}
            </Button>
            <Button variant="ghost" onClick={reset} className="h-8 text-[12px]" data-testid="byom-cancel">
              {t('byom.cancel')}
            </Button>
          </div>
        </div>
      )}

      {models.length > 0 && (
        <div className="divide-y divide-border-light">
          {models.map((m) => (
            <div key={m.id} className="px-4 py-2 flex items-center gap-3" data-testid={`byom-row-${m.id}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-mono text-text-on-light truncate">{m.name}</div>
                {m.endpoint_url && (
                  <div className="text-[10px] font-mono text-muted-on-light truncate">{m.endpoint_url}</div>
                )}
              </div>
              {m.has_credential && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-muted-on-light border border-border-light px-1.5 py-0.5"
                  data-testid={`byom-cred-${m.id}`}
                >
                  <KeyRound className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {t('byom.credentialed')}
                </span>
              )}
              {canWrite && (
                <button
                  onClick={() => remove(m)}
                  className="w-7 h-7 text-muted-on-light hover:text-danger flex items-center justify-center"
                  title={t('byom.remove')}
                  data-testid={`byom-remove-${m.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
