/**
 * @jest-environment node
 */
/**
 * GET /api/config — a rota que torna a imagem única possível (F1.2).
 *
 * Ambiente `node` (não jsdom): `next/server` precisa dos globais Web
 * `Request`/`Response`, que o jsdom não expõe. Mesmo padrão do
 * api-proxy-osdk-relay.test.ts.
 */
import { GET } from '@/app/api/config/route';

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  for (const k of [
    'MAPBOX_TOKEN',
    'CESIUM_ION_TOKEN',
    'NEXT_PUBLIC_MAPBOX_TOKEN',
    'NEXT_PUBLIC_CESIUM_ION_TOKEN',
  ]) {
    delete process.env[k];
  }
});

afterAll(() => {
  process.env = { ...ENV_ORIGINAL };
});

async function corpo() {
  const res = GET();
  return { res, json: await res.json() };
}

test('lê os tokens da env do PROCESSO (runtime), não do build', async () => {
  process.env.MAPBOX_TOKEN = 'mb-runtime';
  process.env.CESIUM_ION_TOKEN = 'ion-runtime';

  const { json } = await corpo();

  expect(json).toEqual({ mapboxToken: 'mb-runtime', cesiumIonToken: 'ion-runtime' });
});

test('env não configurada → strings vazias (contrato estável, nunca undefined)', async () => {
  const { json } = await corpo();

  expect(json).toEqual({ mapboxToken: '', cesiumIonToken: '' });
});

test('aceita os nomes NEXT_PUBLIC_* como fallback (caixas já provisionadas)', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'mb-legado';
  process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN = 'ion-legado';

  const { json } = await corpo();

  expect(json).toEqual({ mapboxToken: 'mb-legado', cesiumIonToken: 'ion-legado' });
});

test('o nome sem prefixo vence o legado quando os dois existem', async () => {
  process.env.MAPBOX_TOKEN = 'mb-novo';
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'mb-velho';

  const { json } = await corpo();

  expect(json.mapboxToken).toBe('mb-novo');
});

test('não ecoa outras variáveis de ambiente', async () => {
  process.env.MAPBOX_TOKEN = 'mb';
  process.env.DATABASE_URL = 'postgres://segredo@host/db';
  process.env.VENDOR_PASSWORD = 'nao-vaze-isto';

  const { json } = await corpo();

  expect(Object.keys(json).sort()).toEqual(['cesiumIonToken', 'mapboxToken']);
  expect(JSON.stringify(json)).not.toContain('segredo');
  expect(JSON.stringify(json)).not.toContain('nao-vaze-isto');
});

test('proibido cachear: token novo tem de valer no próximo reload', async () => {
  const { res } = await corpo();

  expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
});
