/**
 * Tarefa E (2026-06-11) — labels de skill no DISPLAY LAYER com i18n.
 *
 * Débito: o catálogo de skills (GET /governance/agents/skills) devolve
 * label/descrição só em pt-BR (strings do backend). Regra do produto
 * (memórias feedback_i18n_locales + feedback_ui_english_only): pt-BR default
 * + en-US 1ª classe, com tradução na CAMADA DE EXIBIÇÃO — mesmo padrão do
 * aipModelLabel/aipCapabilityKey (lib/aip/modelLabels.ts).
 *
 * Invariantes:
 *  1. dict.ts tem `skills.<key>.label/.desc` para as skills de conector
 *     visíveis hoje (connector.http, connector.singer, camera.detect_tick)
 *     nos 2 locales, com pt-BR IGUAL ao texto do backend (fonte canônica);
 *  2. helper skillLabel/skillDesc: dict vence quando há chave; senão o
 *     label/descrição do catálogo (backend segue fonte p/ skills novas);
 *     senão a key humanizada (label) / '' (desc);
 *  3. form da central (conectores-workspace) mostra o label/descrição do
 *     dict em en-US quando locale=en-US — mesmo com o catálogo entregando
 *     pt-BR — inclusive na linha do conector da listagem.
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DICT } from '@/lib/i18n/dict';
import { skillLabel, skillDesc } from '@/lib/i18n/skill-labels';
import { I18nProvider } from '@/lib/i18n/provider';
import { ConectoresWorkspace } from '@/components/dados/conectores-workspace';

// ── Mocks do harness (iguais aos de conectores-catalogo, MENOS o provider:
//    aqui o I18nProvider é REAL pra exercitar a troca de locale). ──────────
jest.mock('@/components/control-panel/control-panel-shell', () => ({
  CpPageHeader: ({ actions }: any) => <div>{actions}</div>,
}));
jest.mock('@/components/dialog/confirm-dialog', () => ({
  confirmModal: jest.fn(),
}));
// Tarefa H — o workspace agora chama useCan('connectors.manage') p/ exibir o
// botão Configurar; sem o mock, useAuth exigiria <AuthProvider> no render.
jest.mock('@/lib/auth/useAuth', () => ({ useCan: () => true }));
jest.mock('@/lib/api', () => ({
  Connectors: {
    list: jest.fn(), register: jest.fn(), registerSkill: jest.fn(), test: jest.fn(),
    run: jest.fn(), schedulerTick: jest.fn(), syncPreview: jest.fn(), update: jest.fn(),
    runs: jest.fn(), retryRun: jest.fn(),
  },
  Skills: { catalog: jest.fn() },
  Ontology: { listNodeTypes: jest.fn(), objectTypeSchema: jest.fn() },
  Markings: { list: jest.fn() },
  Sources: { list: jest.fn() },
  Datasets: { list: jest.fn() },
  Projects: { list: jest.fn() },
}));

const { Connectors, Skills, Ontology, Markings } = jest.requireMock('@/lib/api') as {
  Connectors: Record<string, jest.Mock>;
  Skills: Record<string, jest.Mock>;
  Ontology: Record<string, jest.Mock>;
  Markings: Record<string, jest.Mock>;
};

// ── Texto CANÔNICO do backend (ontology-module/app/agents_platform/skills):
//    o pt-BR do dict tem que ESPELHAR isso — é a mesma string que o operador
//    vê hoje; o en-US é o par traduzido no display layer. ───────────────────
const BACKEND_PT: Record<string, { label: string; desc: string }> = {
  'connector.http': {
    label: 'Conector HTTP',
    desc:
      'Conecta QUALQUER API HTTP e ingere os registros pra ontologia. Auth ' +
      'none/api_key/bearer/basic/oauth2; paginação page/offset/cursor/link; ' +
      'body+headers; node_type configurável. Genérico/multi-domínio.',
  },
  'connector.singer': {
    label: 'Conector Singer (taps)',
    desc:
      'Roda um Singer tap (tap-github, tap-stripe, tap-postgres, …) e ingere os RECORDs ' +
      'como objetos tipados na ontologia. Um adaptador, todo o ecossistema Singer/Meltano.',
  },
  'camera.detect_tick': {
    label: 'Detecção contínua de câmeras',
    desc:
      "Roda a detecção por IA nas câmeras com 'Detecção ativa' ligada. A cada " +
      'execução agendada, cada câmera elegível vira um job de análise de vídeo ' +
      'na GPU; com envio automático ligado, as detecções entram direto no ' +
      'acervo de evidências.',
  },
};

const tPt = (k: string) => DICT[k]?.['pt-BR'] ?? k;
const tEn = (k: string) => DICT[k]?.['en-US'] ?? k;

describe('dict — skills.<key>.label/.desc (pt-BR espelha o backend + en-US peer)', () => {
  it.each(Object.keys(BACKEND_PT))('%s tem label+desc nos 2 locales', (skill) => {
    for (const suffix of ['label', 'desc'] as const) {
      const entry = DICT[`skills.${skill}.${suffix}`];
      expect(entry).toBeDefined();
      expect(entry['pt-BR'].length).toBeGreaterThan(0);
      expect(entry['en-US'].length).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(BACKEND_PT))('%s · pt-BR é IGUAL ao texto do backend', (skill) => {
    expect(DICT[`skills.${skill}.label`]['pt-BR']).toBe(BACKEND_PT[skill].label);
    expect(DICT[`skills.${skill}.desc`]['pt-BR']).toBe(BACKEND_PT[skill].desc);
  });

  it('a chave antiga connectorStatus.skill.http foi REMOVIDA (substituída pelo helper — nunca deprecar)', () => {
    expect(DICT['connectorStatus.skill.http']).toBeUndefined();
  });
});

describe('skillLabel / skillDesc — dict vence; catálogo é a fonte p/ skills novas', () => {
  it('dict hit: traduz pelo locale, ignorando o label pt-BR do catálogo', () => {
    expect(skillLabel(tEn, 'connector.http', 'Conector HTTP')).toBe(
      DICT['skills.connector.http.label']['en-US'],
    );
    expect(skillLabel(tPt, 'connector.singer')).toBe('Conector Singer (taps)');
    expect(skillLabel(tEn, 'camera.detect_tick', 'Detecção contínua de câmeras')).toBe(
      DICT['skills.camera.detect_tick.label']['en-US'],
    );
  });

  it('dict hit: descrição idem (en-US do dict, não a do catálogo)', () => {
    expect(skillDesc(tEn, 'camera.detect_tick', BACKEND_PT['camera.detect_tick'].desc)).toBe(
      DICT['skills.camera.detect_tick.desc']['en-US'],
    );
    expect(skillDesc(tPt, 'connector.http')).toBe(BACKEND_PT['connector.http'].desc);
  });

  it('skill fora do dict: usa o label/descrição do catálogo (backend segue fonte)', () => {
    expect(skillLabel(tPt, 'connector.sftp', 'Conector SFTP')).toBe('Conector SFTP');
    expect(skillDesc(tPt, 'connector.sftp', 'Lê arquivos via SFTP.')).toBe('Lê arquivos via SFTP.');
  });

  it('skill fora do dict e sem catálogo: label humanizado (nunca a key crua); desc vazia', () => {
    expect(skillLabel(tPt, 'connector.sftp')).toBe('connector sftp');
    expect(skillDesc(tPt, 'connector.sftp')).toBe('');
  });

  it('key vazia → string vazia (o caller decide o placeholder)', () => {
    expect(skillLabel(tPt, '')).toBe('');
    expect(skillDesc(tPt, '')).toBe('');
  });
});

// ── Form + listagem da central em en-US (I18nProvider REAL) ────────────────
// O catálogo entrega o pt-BR do backend; a UI mostra o en-US do dict.
const CATALOG = [
  {
    skill_key: 'connector.http', label: BACKEND_PT['connector.http'].label,
    description: BACKEND_PT['connector.http'].desc,
    category: 'ingestion', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [],
  },
  {
    skill_key: 'camera.detect_tick', label: BACKEND_PT['camera.detect_tick'].label,
    description: BACKEND_PT['camera.detect_tick'].desc,
    category: 'vision', source: 'native', platforms: [], requires_secrets: [],
    param_schema: [],
  },
];

const CONN = {
  id: 'a1', slug: 'cep', display_name: 'API CEP', kind: 'worker', status: 'inactive',
  config: {}, created_at: '', skill_keys: ['connector.http'], schedule: 'hourly',
};

describe('central de conectores em locale=en-US (display layer traduz o catálogo)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    // I18nProvider sincroniza com /api/me/context ao montar; resposta não-ok
    // mantém o initialLocale (en-US) — padrão dos testes i18n existentes.
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    Connectors.list.mockResolvedValue([CONN]);
    Skills.catalog.mockResolvedValue(CATALOG);
    Ontology.listNodeTypes.mockResolvedValue([{ name: 'endereco', label: 'Endereço', count: 1 }]);
    Ontology.objectTypeSchema.mockResolvedValue({
      kind: 'endereco', display_name: 'Endereço', title_property: 'name', count: 1,
      properties: [{ key: 'id', label: 'ID', type: 'string' }], links: [], actions: [],
    });
    Markings.list.mockResolvedValue([{ slug: 'OFICIAL', display_name: 'Oficial', active: true }]);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function renderEn() {
    render(
      <I18nProvider initialLocale="en-US">
        <ConectoresWorkspace />
      </I18nProvider>,
    );
  }

  it('dropdown do form mostra o label do dict em en-US (não o pt-BR do catálogo)', async () => {
    renderEn();
    await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('conectores-novo'));
    await screen.findByTestId('conectores-form');
    await screen.findByRole('option', { name: DICT['skills.camera.detect_tick.label']['en-US'] });
    expect(
      screen.getByRole('option', { name: DICT['skills.connector.http.label']['en-US'] }),
    ).toBeInTheDocument();
    // o pt-BR do catálogo NÃO vaza pro dropdown
    expect(screen.queryByRole('option', { name: 'Detecção contínua de câmeras' })).toBeNull();
  });

  it('descrição da skill selecionada vem do dict em en-US', async () => {
    renderEn();
    await waitFor(() => expect(Connectors.list).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('conectores-novo'));
    await screen.findByTestId('conectores-form');
    await screen.findByRole('option', { name: DICT['skills.camera.detect_tick.label']['en-US'] });
    expect(screen.getByTestId('cf-skill-desc')).toHaveTextContent(
      DICT['skills.connector.http.desc']['en-US'],
    );
    fireEvent.change(screen.getByTestId('cf-skill'), { target: { value: 'camera.detect_tick' } });
    expect(screen.getByTestId('cf-skill-desc')).toHaveTextContent(
      DICT['skills.camera.detect_tick.desc']['en-US'],
    );
  });

  it('linha do conector na listagem mostra o label traduzido, nunca a key crua', async () => {
    renderEn();
    const card = await screen.findByTestId('conector-card-cep');
    expect(card).toHaveTextContent(DICT['skills.connector.http.label']['en-US']);
    expect(card).not.toHaveTextContent('connector.http');
  });
});
