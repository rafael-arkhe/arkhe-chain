/**
 * Config de RUNTIME (F1.2 do plano de frota).
 *
 * O contrato que estes testes travam: uma ÚNICA imagem do security-app serve
 * qualquer cliente, porque os tokens de mapa chegam por env do container e são
 * lidos via /api/config em tempo de execução — nunca inlinados no bundle.
 */
import {
  carregarConfig,
  resetarConfigCache,
  CONFIG_VAZIA,
} from '@/lib/config/runtime';

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  resetarConfigCache();
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  delete process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  global.fetch = undefined as unknown as typeof fetch;
});

afterAll(() => {
  process.env = { ...ENV_ORIGINAL };
});

function fetchRespondendo(corpo: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    json: async () => corpo,
  }) as unknown as typeof fetch;
}

// ── Caminho de produção: sem NEXT_PUBLIC_*, a config vem do servidor ────────

test('sem env de build, busca em /api/config e devolve os tokens do servidor', async () => {
  global.fetch = fetchRespondendo({ mapboxToken: 'mb-do-servidor', cesiumIonToken: 'ion-do-servidor' });

  const cfg = await carregarConfig();

  expect(cfg).toEqual({ mapboxToken: 'mb-do-servidor', cesiumIonToken: 'ion-do-servidor' });
  expect(global.fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ cache: 'no-store' }));
});

test('a busca acontece UMA vez, mesmo com chamadas concorrentes', async () => {
  global.fetch = fetchRespondendo({ mapboxToken: 'mb', cesiumIonToken: 'ion' });

  const [a, b, c] = await Promise.all([carregarConfig(), carregarConfig(), carregarConfig()]);

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(a).toBe(b);
  expect(b).toBe(c);
});

// ── Degradação: nunca explodir a tela por causa de config ──────────────────

test('servidor fora do ar → config vazia (a tela decide o que dizer), sem lançar', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('rede fora')) as unknown as typeof fetch;

  await expect(carregarConfig()).resolves.toEqual(CONFIG_VAZIA);
});

test('resposta não-ok → config vazia', async () => {
  global.fetch = fetchRespondendo({ detail: 'boom' }, false);

  await expect(carregarConfig()).resolves.toEqual(CONFIG_VAZIA);
});

test('resposta com forma inesperada → config vazia (não confia em JSON alheio)', async () => {
  global.fetch = fetchRespondendo({ mapboxToken: 42, outraCoisa: true });

  await expect(carregarConfig()).resolves.toEqual(CONFIG_VAZIA);
});

test('falha NÃO fica cacheada — a chamada seguinte tenta de novo', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('rede fora')) as unknown as typeof fetch;
  await carregarConfig();

  global.fetch = fetchRespondendo({ mapboxToken: 'mb-depois', cesiumIonToken: '' });
  const cfg = await carregarConfig();

  expect(cfg.mapboxToken).toBe('mb-depois');
});

test('sem fetch nenhum no ambiente → config vazia, sem lançar', async () => {
  await expect(carregarConfig()).resolves.toEqual(CONFIG_VAZIA);
});

// ── Escape hatch de desenvolvimento: NEXT_PUBLIC_* curto-circuita ──────────

test('com NEXT_PUBLIC_* setado (dev/jest), usa o env e NÃO chama a rede', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'mb-do-env';
  process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN = 'ion-do-env';
  global.fetch = fetchRespondendo({ mapboxToken: 'nao-deveria-usar', cesiumIonToken: 'nao' });

  const cfg = await carregarConfig();

  expect(cfg).toEqual({ mapboxToken: 'mb-do-env', cesiumIonToken: 'ion-do-env' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('env parcial (só Mapbox) também curto-circuita; o que falta fica vazio', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'so-mapbox';
  global.fetch = fetchRespondendo({ mapboxToken: 'x', cesiumIonToken: 'y' });

  const cfg = await carregarConfig();

  expect(cfg).toEqual({ mapboxToken: 'so-mapbox', cesiumIonToken: '' });
  expect(global.fetch).not.toHaveBeenCalled();
});
