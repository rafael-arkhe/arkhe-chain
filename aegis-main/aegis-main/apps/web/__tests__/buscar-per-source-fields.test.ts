/**
 * FE-B — parâmetros POR-FONTE namespaced + serialização p/ o SSE.
 *
 * Prova:
 *   1. buildPerSourceFields gera a chave NAMESPACED certa (`<toolBase>__<propKey>`)
 *      a partir do `ui_fields` de cada fonte selecionada — sem colapsar entre
 *      fontes (sites do maigret ≠ sherlock) e ignorando builtins/sem ui_fields.
 *   2. As chaves namespaced fluem até a URL do SSE como `p_…` (Mcp.fanoutStreamUrl),
 *      enquanto os refiners colapsados (sem `__`) viram `f_…`.
 *   3. O gate NSFW (isNsfwOn) lê o toggle irmão da MESMA fonte.
 */
import {
  buildPerSourceFields,
  isNsfwOn,
  nsfwSiblingKey,
} from '@/lib/buscar/per-source-fields';
import { Mcp, type McpAdapter } from '@/lib/api/mcp';
import type { SourceDef } from '@/lib/buscar/types';

function src(key: string, label: string, mcpTool: string | null): SourceDef {
  return { key, label, category: 'username', mcpTool };
}

const MAIGRET: McpAdapter = {
  tool: 'maigret_username@v1',
  version: 'v1',
  ui_fields: {
    timeout: { kind: 'duration', min: 5, max: 240, unitKey: 'unit.seconds', default: 20 },
    sites: { kind: 'multiselect', catalog: 'maigret', labelKey: 'buscar.maigret.sites' },
    nsfw: { kind: 'toggle', default: false, nsfwGated: true },
  },
};
const SHERLOCK: McpAdapter = {
  tool: 'sherlock_username@v1',
  version: 'v1',
  ui_fields: {
    timeout: { kind: 'duration', min: 5, max: 240, unitKey: 'unit.seconds', default: 20 },
    sites: { kind: 'multiselect', catalog: 'sherlock' },
    nsfw: { kind: 'toggle', nsfwGated: true },
  },
};
const HOLEHE: McpAdapter = {
  tool: 'holehe_email@v1',
  version: 'v1',
  ui_fields: { timeout: { kind: 'duration', min: 5, max: 240 } },
};
const NO_UI: McpAdapter = { tool: 'camara_deputados@v1', version: 'v1' };

describe('buildPerSourceFields — chave namespaced por fonte', () => {
  const groups = buildPerSourceFields(
    [
      src('maigret_username@v1', 'Maigret · username', 'maigret_username@v1'),
      src('sherlock_username@v1', 'Sherlock · username', 'sherlock_username@v1'),
    ],
    [MAIGRET, SHERLOCK],
  );

  it('1 grupo por fonte com ui_fields', () => {
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.sourceKey)).toEqual([
      'maigret_username@v1',
      'sherlock_username@v1',
    ]);
  });

  it('chave = <toolBase>__<propKey> (SEM @vN no base)', () => {
    const maigret = groups[0];
    const keys = maigret.fields.map((f) => f.key);
    expect(keys).toContain('maigret_username__sites');
    expect(keys).toContain('maigret_username__timeout');
    expect(keys).toContain('maigret_username__nsfw');
    expect(keys.every((k) => !k.includes('@v'))).toBe(true);
  });

  it('NÃO colapsa entre fontes: sites do maigret ≠ sites do sherlock', () => {
    const maigretSites = groups[0].fields.find((f) => f.propKey === 'sites');
    const sherlockSites = groups[1].fields.find((f) => f.propKey === 'sites');
    expect(maigretSites!.key).toBe('maigret_username__sites');
    expect(sherlockSites!.key).toBe('sherlock_username__sites');
    expect(maigretSites!.catalog).toBe('maigret');
    expect(sherlockSites!.catalog).toBe('sherlock');
  });

  it('carrega ui (kind/min/max/catalog) e o tool completo', () => {
    const timeout = groups[0].fields.find((f) => f.propKey === 'timeout')!;
    expect(timeout.ui.kind).toBe('duration');
    expect(timeout.ui.min).toBe(5);
    expect(timeout.ui.max).toBe(240);
    expect(timeout.tool).toBe('maigret_username@v1');
    expect(timeout.toolBase).toBe('maigret_username');
  });
});

describe('buildPerSourceFields — ignora builtin/sem ui_fields e casa por base @vN', () => {
  it('fonte builtin (mcpTool null) e adapter sem ui_fields não viram grupo', () => {
    const groups = buildPerSourceFields(
      [
        src('entities', 'Entidades locais', null),
        src('camara_deputados@v1', 'Câmara', 'camara_deputados@v1'),
        src('holehe_email@v1', 'Holehe', 'holehe_email@v1'),
      ],
      [NO_UI, HOLEHE],
    );
    expect(groups.map((g) => g.sourceKey)).toEqual(['holehe_email@v1']);
    expect(groups[0].fields).toHaveLength(1); // só timeout
  });

  it('casa adapter por BASE quando a versão diverge', () => {
    const groups = buildPerSourceFields(
      [src('maigret_username@v2', 'Maigret', 'maigret_username@v2')],
      [MAIGRET], // adapter é @v1
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].fields.find((f) => f.propKey === 'sites')!.key).toBe(
      'maigret_username__sites',
    );
  });
});

describe('isNsfwOn — gate do multiselect lê o toggle irmão da MESMA fonte', () => {
  it('nsfwSiblingKey = <toolBase>__nsfw', () => {
    expect(nsfwSiblingKey('maigret_username')).toBe('maigret_username__nsfw');
  });
  it("'1' liga; vazio/ausente desliga; é por-fonte", () => {
    const fields = { maigret_username__nsfw: '1', sherlock_username__nsfw: '' };
    expect(isNsfwOn(fields, 'maigret_username')).toBe(true);
    expect(isNsfwOn(fields, 'sherlock_username')).toBe(false);
    expect(isNsfwOn(fields, 'wmn_username')).toBe(false);
    expect(isNsfwOn(undefined, 'maigret_username')).toBe(false);
  });
});

describe('Mcp.fanoutStreamUrl — chaves namespaced viram p_, refiners viram f_', () => {
  it('p_maigret_username__sites=GitHub,GitLab (per-source, CSV)', () => {
    const url = Mcp.fanoutStreamUrl('alvo', ['maigret_username@v1'], {
      maigret_username__sites: 'GitHub,GitLab',
    });
    // CSV é encodado (vírgula vira %2C); confere a chave + ambos os ids.
    expect(url).toContain('p_maigret_username__sites=');
    expect(decodeURIComponent(url)).toContain('p_maigret_username__sites=GitHub,GitLab');
  });

  it('toggle ligado vira p_…=1; desligado ("") NÃO é emitido', () => {
    const url = Mcp.fanoutStreamUrl('alvo', ['maigret_username@v1'], {
      maigret_username__nsfw: '1',
      sherlock_username__nsfw: '',
    });
    expect(url).toContain('p_maigret_username__nsfw=1');
    expect(url).not.toContain('sherlock_username__nsfw');
  });

  it('refiner colapsado (sem __) vira f_ — não confunde com per-source', () => {
    const url = Mcp.fanoutStreamUrl('alvo', ['maigret_username@v1'], {
      doc: '11144477735',
      maigret_username__timeout: '30',
    });
    expect(url).toContain('f_doc=11144477735');
    expect(url).toContain('p_maigret_username__timeout=30');
  });
});
