/**
 * per-source-fields.ts — monta os PARÂMETROS POR-FONTE da Busca avançada (FE-B).
 *
 * Cada fonte (adapter) pode declarar `ui_fields` no `/mcp-adapters/list`:
 *   maigret_username@v1 → { timeout:{kind:'duration',min:5,max:240,…},
 *                           sites:{kind:'multiselect',catalog:'maigret',…},
 *                           nsfw:{kind:'toggle',nsfwGated:true}, … }
 *
 * Diferente dos refiners (que COLAPSAM accepts equivalentes entre fontes num
 * campo canônico — `doc`, `username`), os parâmetros por-fonte são
 * NAMESPACED: os `sites` do maigret são DIFERENTES dos `sites` do sherlock,
 * então a chave é `<toolBase>__<propKey>` (ex.: `maigret_username__sites`).
 * Essa chave casa EXATAMENTE com a serialização `p_<key>=<v>` do
 * `Mcp.fanoutStreamUrl` (o backend faz `rsplit('__',1)` → tool + prop).
 *
 * Multi-domínio: 100% derivado do `ui_fields` do adapter — zero hardcode de
 * fonte/vertical. Um adapter novo que declare `ui_fields` ganha os campos
 * sem tocar esta função nem a UI.
 */
import { toolBase } from './store';
import type { SourceDef } from './types';
import type { McpAdapter, UiFieldSpec } from '@/lib/api/mcp';

/** Um campo de parâmetro por-fonte, pronto p/ a UI renderizar. */
export interface PerSourceField {
  /** Chave NAMESPACED no estado: `<toolBase>__<propKey>` (= chave do SSE `p_`). */
  key: string;
  /** Tool completo da fonte (ex.: `maigret_username@v1`). */
  tool: string;
  /** Base do tool sem `@vN` (ex.: `maigret_username`). */
  toolBase: string;
  /** Nome da propriedade declarada no `ui_fields` (ex.: `sites`). */
  propKey: string;
  /** Spec de UI declarado pelo adapter. */
  ui: UiFieldSpec;
  /** Catálogo do multiselect (atalho de `ui.catalog`). */
  catalog?: string;
}

/** Um grupo de campos por fonte — agrupado p/ a UI (título = label da fonte). */
export interface PerSourceGroup {
  /** Chave da fonte (= SourceDef.key). */
  sourceKey: string;
  /** Rótulo amigável da fonte (NUNCA o tool cru). */
  sourceLabel: string;
  /** Base do tool (p/ casar o toggle nsfw irmão). */
  toolBase: string;
  /** Campos por-fonte (na ordem declarada no `ui_fields`). */
  fields: PerSourceField[];
}

/**
 * Monta os grupos de parâmetros por-fonte das fontes que VÃO rodar
 * (alwaysOn/selecionadas E disponíveis). Casa cada SourceDef ao seu McpAdapter
 * (por tool, com/sem @vN) e expande o `ui_fields` em campos namespaced.
 *
 * @param sources  fontes que serão consultadas (já filtradas pela página).
 * @param adapters lista de adapters do `/mcp-adapters/list`.
 */
export function buildPerSourceFields(
  sources: SourceDef[],
  adapters: McpAdapter[],
): PerSourceGroup[] {
  // index adapter por base do tool (tolera divergência de @vN).
  const adapterByBase = new Map<string, McpAdapter>();
  for (const a of Array.isArray(adapters) ? adapters : []) {
    if (a?.tool) adapterByBase.set(toolBase(a.tool), a);
  }

  const groups: PerSourceGroup[] = [];
  for (const s of sources) {
    if (!s.mcpTool) continue; // fontes builtin (entities/cameras) não têm ui_fields
    const base = toolBase(s.mcpTool);
    const adapter = adapterByBase.get(base);
    const uiFields = adapter?.ui_fields;
    if (!uiFields || typeof uiFields !== 'object') continue;

    const fields: PerSourceField[] = [];
    for (const [propKey, ui] of Object.entries(uiFields)) {
      if (!ui || typeof ui !== 'object') continue;
      fields.push({
        key: `${base}__${propKey}`,
        tool: s.mcpTool,
        toolBase: base,
        propKey,
        ui,
        catalog: ui.catalog,
      });
    }
    if (fields.length === 0) continue;

    groups.push({
      sourceKey: s.key,
      sourceLabel: s.label,
      toolBase: base,
      fields,
    });
  }
  return groups;
}

/**
 * Chave do toggle NSFW IRMÃO de um campo (mesma fonte): `<toolBase>__nsfw`.
 * O multiselect só pede o catálogo COM NSFW quando esse toggle está ligado
 * (gate `nsfwGated`). Centralizado aqui p/ a UI e o teste casarem.
 */
export function nsfwSiblingKey(toolBaseName: string): string {
  return `${toolBaseName}__nsfw`;
}

/** Lê o estado canônico do toggle NSFW irmão ('1' = ligado). */
export function isNsfwOn(
  fields: Record<string, string> | undefined,
  toolBaseName: string,
): boolean {
  return (fields?.[nsfwSiblingKey(toolBaseName)] ?? '') === '1';
}
