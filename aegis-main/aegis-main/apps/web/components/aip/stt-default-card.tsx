'use client';

/**
 * SttDefaultCard — serviço de TRANSCRIÇÃO (STT) padrão do tenant. Vive ao lado do
 * ModelDefaultsCard em `/painel-de-controle/dados?aba=modelos`. STT não é um LLM de
 * chat (Whisper não está no catálogo de modelos), por isso tem card próprio com
 * opções fixas — Desligado / Groq Whisper / OpenAI Whisper — em vez do ModelSelect.
 *
 * Reuso TOTAL do mesmo sistema de defaults: lê `AIPModels.defaults()` (entry
 * purpose==='stt') e grava com `AIPModels.setDefault({purpose:'stt', ...})` — sem
 * rota/perm nova. A chave do provedor (GROQ_API_KEY) NUNCA passa por aqui; só se
 * escolhe QUAL serviço. Mostrar 'Groq'/'OpenAI' por nome é aceitável (catálogo
 * admin). Ícone AudioLines neutro; cantos retos; dados em JetBrains Mono.
 */
import * as React from 'react';
import { AudioLines, Loader2, CheckCircle2 } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { InfoTip } from '@/components/ui/info-tip';
import { AIPModels, type AipModelDefault } from '@/lib/api';

// Opções fixas de STT. `key` é só para o <select>; provider/model são o que vai ao
// backend (finalidade 'stt'). `juris` = jurisdição honesta exibida como selo.
type SttOption = {
  key: 'stub' | 'groq' | 'openai';
  provider: string;
  model: string;
  labelKey: string;
  juris?: string; // i18n key do selo de jurisdição
};

const STT_OPTIONS: readonly SttOption[] = [
  { key: 'stub', provider: 'stub', model: 'stub', labelKey: 'stt.off' },
  { key: 'groq', provider: 'groq', model: 'whisper-large-v3', labelKey: 'stt.groq', juris: 'stt.usa' },
  { key: 'openai', provider: 'openai', model: 'whisper-1', labelKey: 'stt.openai', juris: 'stt.usa' },
] as const;

function optionForDefault(def: AipModelDefault | undefined): SttOption {
  const provider = (def?.provider || '').toLowerCase();
  return STT_OPTIONS.find((o) => o.key === provider) ?? STT_OPTIONS[0];
}

export function SttDefaultCard() {
  const t = useT();
  const [def, setDef] = React.useState<AipModelDefault | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await AIPModels.defaults();
      setDef(all.find((d) => d.purpose === 'stt'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const current = optionForDefault(def);

  const onPick = React.useCallback(
    async (key: SttOption['key']) => {
      const opt = STT_OPTIONS.find((o) => o.key === key) ?? STT_OPTIONS[0];
      setSaving(true);
      setSaved(false);
      setError(null);
      try {
        const updated = await AIPModels.setDefault({
          purpose: 'stt',
          provider: opt.provider,
          model: opt.model,
        });
        setDef(updated);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return (
    <div className="border border-border-light bg-white" data-testid="stt-default-card">
      <div className="flex items-start gap-2 px-4 py-3 border-b border-border-light">
        <AudioLines className="w-4 h-4 text-text-on-light shrink-0 mt-0.5" strokeWidth={1.5} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text-on-light">{t('stt.title')}</div>
          <div className="text-[11px] text-muted-on-light leading-snug">{t('stt.subtitle')}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[12px] text-muted-on-light">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
        </div>
      ) : (
        <div
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          data-testid="stt-default-row"
        >
          {/* finalidade à esquerda */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-text-on-light">{t('stt.label')}</span>
              {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-on-light" strokeWidth={1.5} />}
              {saved && (
                <CheckCircle2
                  className="w-3 h-3 text-primary"
                  strokeWidth={2}
                  data-testid="stt-default-saved"
                />
              )}
            </div>
            <div className="text-[11px] text-muted-on-light leading-tight">{t('stt.hint')}</div>
          </div>

          {/* controles à direita — serviço + jurisdição (selo honesto) */}
          <div className="w-full shrink-0 sm:w-[340px]">
            <select
              value={current.key}
              onChange={(e) => onPick(e.target.value as SttOption['key'])}
              disabled={saving}
              className="h-8 w-full bg-white border border-border-light px-2 text-[12px] text-text-on-light rounded-none outline-none focus:border-primary disabled:opacity-60"
              data-testid="stt-default-select"
              aria-label={t('stt.label')}
            >
              {STT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {t(o.labelKey)}
                  {o.key !== 'stub' ? ` · ${o.model}` : ''}
                </option>
              ))}
            </select>
            <div className="mt-1 flex items-center gap-1.5">
              {current.juris ? (
                <span
                  className="text-[10px] font-mono text-muted-on-light"
                  data-testid="stt-default-jurisdiction"
                >
                  {t('stt.sovereignty')}: {t(current.juris)}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-muted-on-light" data-testid="stt-default-jurisdiction">
                  {t('stt.offJuris')}
                </span>
              )}
              <InfoTip text={t('stt.help')} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="px-4 py-2 text-[11px] font-mono text-danger" data-testid="stt-default-error">
          {error}
        </p>
      )}
    </div>
  );
}
