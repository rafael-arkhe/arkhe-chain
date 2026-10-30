/**
 * Quais FONTES o /buscar OFERECE — controle por tenant pelo VENDOR/admin.
 *
 * REGRA MULTI-DOMÍNIO: o default é NEUTRO — TODAS as fontes do SOURCE_CATALOG.
 * Nenhum viés de vertical (não esconde threat-intel para "investigação" nem
 * empresa-BR para "segurança"); o catálogo inteiro aparece até o admin decidir
 * o contrário. Espelha a regra de access-purposes (default neutro, configurável).
 *
 * A lista é CONFIGURÁVEL por domínio/tenant via a MESMA WorkshopVariable static
 * `source_overrides` do app `security.buscar-config` (editável no painel visual
 * de variáveis — VariablesPanel). Escopo por tenant vem de graça: o app é
 * resolvido honrando o ORG ATIVO (useResolvedApp). Ver use-enabled-sources.ts.
 *
 * O VALOR é DADO, nunca texto livre: as chaves são `SourceDef.key` (identificador
 * estável da fonte = `tool` do MCP ou `entities`/`cameras`). Shape canônico:
 *   { "hidden": ["maigret_username@v1"], "pinned": ["entity_dossier@v1"] }
 * Também aceita allowlist `enabled` (só estas + alwaysOn ficam visíveis).
 */
import { BUSCAR_CONFIG_SLUG } from './access-purposes';
import type { SourceDef } from './types';

// Reexport p/ o hook irmão e testes — mesmo app de configuração do /buscar.
export { BUSCAR_CONFIG_SLUG };

/** external_id da variável (no app security.buscar-config) que guarda os overrides. */
export const SOURCE_OVERRIDES_VAR = 'source_overrides';

export interface SourceOverrides {
  /** Chaves (SourceDef.key) ESCONDIDAS — somem do painel e NÃO viram busca. */
  hidden: string[];
  /** Chaves FIXADAS no topo do painel de fontes. */
  pinned: string[];
  /**
   * Allowlist opcional: quando NÃO-vazia, SÓ estas chaves (+ as `alwaysOn`)
   * ficam visíveis — todo o resto é escondido. `null` = sem allowlist (tudo).
   */
  enabled: string[] | null;
}

export const EMPTY_OVERRIDES: SourceOverrides = { hidden: [], pinned: [], enabled: null };

/** Extrai chaves de fonte de uma lista crua. Aceita strings OU `{key|value}`. */
function coerceKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const s = item.trim();
      if (s) out.push(s);
    } else if (item && typeof item === 'object') {
      const o = item as { key?: unknown; value?: unknown };
      const k =
        typeof o.key === 'string'
          ? o.key.trim()
          : typeof o.value === 'string'
            ? o.value.trim()
            : '';
      if (k) out.push(k);
    }
  }
  return out;
}

/**
 * Normaliza a config crua da variável para SourceOverrides. Aceita:
 *  - `{ hidden:[...], pinned:[...], enabled:[...] }`     (shape canônico)
 *  - `{ hidden:[...] }`                                  (campos parciais)
 *  - `{ enabled_sources:[...] }`                          (alias da allowlist)
 *  - `["entities", "maigret_username@v1"]`               (array nu → allowlist)
 * Qualquer outra coisa (vazio, null, número, string) → EMPTY (default = tudo).
 */
export function coerceSourceOverrides(raw: unknown): SourceOverrides {
  if (Array.isArray(raw)) {
    const enabled = coerceKeys(raw);
    return { hidden: [], pinned: [], enabled: enabled.length ? enabled : null };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as {
      hidden?: unknown;
      pinned?: unknown;
      enabled?: unknown;
      enabled_sources?: unknown;
    };
    const hidden = coerceKeys(o.hidden);
    const pinned = coerceKeys(o.pinned);
    const enabledKeys = coerceKeys(o.enabled ?? o.enabled_sources);
    return { hidden, pinned, enabled: enabledKeys.length ? enabledKeys : null };
  }
  return { hidden: [], pinned: [], enabled: null };
}

/**
 * Aplica os overrides ao catálogo de fontes → catálogo OFERECIDO:
 *  - `alwaysOn` NUNCA é escondida (entities/ontologia local é núcleo).
 *  - `enabled` (allowlist) não-vazia: só essas chaves (+ alwaysOn) sobrevivem.
 *  - `hidden`: remove sempre (precedência sobre a allowlist).
 *  - `pinned`: reordena pro topo (estável — preserva ordem original entre fixadas).
 * MULTIDOMÍNIO: sem overrides → devolve o catálogo inteiro, sem viés de vertical.
 */
export function applySourceOverrides(
  catalog: SourceDef[],
  ov: SourceOverrides,
): SourceDef[] {
  const hidden = new Set(ov.hidden);
  const allow = ov.enabled && ov.enabled.length ? new Set(ov.enabled) : null;
  const visible = catalog.filter((s) => {
    if (s.alwaysOn) return true; // núcleo local nunca some
    if (hidden.has(s.key)) return false;
    if (allow && !allow.has(s.key)) return false;
    return true;
  });
  if (!ov.pinned.length) return visible;
  const pinnedSet = new Set(ov.pinned);
  const pinned = visible.filter((s) => pinnedSet.has(s.key));
  const rest = visible.filter((s) => !pinnedSet.has(s.key));
  return [...pinned, ...rest];
}
