'use client';

/**
 * AipChatPrefsProvider + useAipChatPrefs() — Sprint 9 Onda 5 (Frentes C+D).
 *
 * Preferências do AIP Chat do operador, espelhando AssistantPrefProvider:
 *   - `metaMode` ('default' | 'advanced') — dev-mode dos metadados por mensagem
 *     (padrão = só o modelo; avançada = modelo · tokens · ms + args dos tool-calls);
 *   - `tone` (key de preset, ou '') — tom de voz do AIP Chat;
 *   - `presets` — catálogo de tons (GET /agent/personas), para o seletor.
 *
 * Persistência: server-side (User.metadata_.context.aip_chat_meta_mode /
 * .aip_chat_tone) via PUT /api/me/context. ZERO localStorage (régua
 * feedback_no_localstorage_for_persistence). `ready` evita flash antes da 1ª sync.
 *
 * Fallback sem provider: { metaMode:'default', tone:'' } — nada quebra fora dele.
 */
import * as React from 'react';
import { useMeContext } from '@/lib/data/me-context-store';

export type MetaMode = 'default' | 'advanced';
export interface TonePreset { key: string; label: string; description: string; domain: string }

interface AipChatPrefsValue {
  metaMode: MetaMode;
  setMetaMode: (next: MetaMode) => Promise<void>;
  tone: string;
  setTone: (next: string) => Promise<void>;
  presets: TonePreset[];
  ready: boolean;
}

const Ctx = React.createContext<AipChatPrefsValue | null>(null);

async function putContext(patch: Record<string, unknown>) {
  try {
    await fetch('/api/me/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    /* rede: estado local permanece, server defasa */
  }
}

export function AipChatPrefsProvider({ children }: { children: React.ReactNode }) {
  const [metaMode, setMetaModeState] = React.useState<MetaMode>('default');
  const [tone, setToneState] = React.useState('');
  const [presets, setPresets] = React.useState<TonePreset[]>([]);

  // metaMode/tone vêm do store COMPARTILHADO de /me/context (#12) — dedupado
  // com os outros providers. `ready` = o GET assentou (mesma semântica do
  // antigo `.finally`). Semeia uma vez; trocas locais prevalecem (`touched`
  // evita que o GET — que pode resolver DEPOIS — sobrescreva a escolha local).
  const { data: ctx, ready } = useMeContext();
  const seeded = React.useRef(false);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || touched.current || !ctx) return;
    if (ctx.aip_chat_meta_mode === 'advanced' || ctx.aip_chat_meta_mode === 'default') {
      setMetaModeState(ctx.aip_chat_meta_mode);
    }
    if (typeof ctx.aip_chat_tone === 'string') setToneState(ctx.aip_chat_tone);
    seeded.current = true;
  }, [ctx]);

  // catálogo de tons (proxy /api → backend /agent/personas) — rota PRÓPRIA,
  // independente do /me/context; segue como fetch local.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/agent/personas')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && Array.isArray(d.presets)) setPresets(d.presets); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setMetaMode = React.useCallback(async (next: MetaMode) => {
    touched.current = true;
    setMetaModeState(next);
    await putContext({ aip_chat_meta_mode: next });
  }, []);
  const setTone = React.useCallback(async (next: string) => {
    touched.current = true;
    setToneState(next);
    await putContext({ aip_chat_tone: next });
  }, []);

  const value = React.useMemo(
    () => ({ metaMode, setMetaMode, tone, setTone, presets, ready }),
    [metaMode, setMetaMode, tone, setTone, presets, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAipChatPrefs(): AipChatPrefsValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    return {
      metaMode: 'default', setMetaMode: async () => {},
      tone: '', setTone: async () => {}, presets: [], ready: false,
    };
  }
  return ctx;
}
