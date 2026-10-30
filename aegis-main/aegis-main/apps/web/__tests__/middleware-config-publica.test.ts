/**
 * @jest-environment node
 */
/**
 * /api/config tem de passar SEM cookie de sessão (F1.2).
 *
 * As superfícies de convidado (/m/<token> e a SPA /visitante) renderizam mapa
 * anonimamente. Se o gate de auth barrasse a config, o mapa do convidado
 * ficaria sem token — que é justamente a regressão que este teste trava.
 */
import { NextRequest } from 'next/server';

import { middleware } from '../middleware';

function req(path: string, comCookie = false) {
  const r = new NextRequest(new URL(`http://app.test${path}`));
  if (comCookie) r.cookies.set('aegis_access', 'token-qualquer');
  return r;
}

test('/api/config passa sem cookie (não 401, não redirect)', () => {
  const res = middleware(req('/api/config'));

  expect(res.status).toBe(200);
  expect(res.headers.get('location')).toBeNull();
});

test('/api/config continua passando COM cookie', () => {
  const res = middleware(req('/api/config', true));

  expect(res.status).toBe(200);
});

test('guarda: uma rota qualquer de /api ainda exige credencial (o gate não caiu)', async () => {
  const res = middleware(req('/api/ontology/objects'));

  expect(res.status).toBe(401);
  await expect(res.json()).resolves.toEqual({ detail: 'unauthenticated' });
});

test('guarda: o prefixo não abre vizinhos com o mesmo começo', () => {
  const res = middleware(req('/api/configuracoes-secretas'));

  expect(res.status).toBe(401);
});

test('/api/v1/edge/pair passa sem cookie E sem Bearer (pareamento)', () => {
  const res = middleware(req('/api/v1/edge/pair'));

  expect(res.status).toBe(200);
});

// 🔴 O Desktop posta `{base}/api/v1/edge/pair` com a base já terminando em
// `/api` (config.rs normalizar_base) → o pathname real é o duplo. Sem isto o
// gate devolvia 401 antes do proxy e o pareamento virava "Could not pair".
test('/api/api/v1/edge/pair (duplo /api, path real do Desktop) passa sem cookie', () => {
  const res = middleware(req('/api/api/v1/edge/pair'));

  expect(res.status).toBe(200);
});

test('/api/v1/connectors/pair passa sem cookie E sem Bearer (pareamento)', () => {
  const res = middleware(req('/api/v1/connectors/pair'));

  expect(res.status).toBe(200);
});

// 🔴 PROBE de base do Desktop: sem /api/health público, o app escolhia a base
// SEM /api e TODO o trilho edge (heartbeat/dispositivos/stream) virava forma
// simples → 404 no backend ("Nunca conectou"). (2026-08-20)
test('/api/health passa sem cookie (probe de base do AEGIS Desktop)', () => {
  const res = middleware(req('/api/health'));

  expect(res.status).toBe(200);
});

test('/api/api/v1/connectors/pair (duplo /api) passa sem cookie', () => {
  const res = middleware(req('/api/api/v1/connectors/pair'));

  expect(res.status).toBe(200);
});

test('guarda: pairing-codes (operador) continua exigindo credencial', () => {
  const res = middleware(req('/api/v1/edge/pairing-codes'));

  expect(res.status).toBe(401);
});

test('Bearer edge_… (sem cookie) passa no gate (quem valida é o backend)', () => {
  const r = new NextRequest(new URL('http://app.test/api/v1/edge/nodes'));
  r.headers.set('authorization', 'Bearer edge_teste');
  const res = middleware(r);

  expect(res.status).toBe(200);
});

test('guarda: /api sem cookie e sem Bearer continua 401 (o gate não caiu)', async () => {
  const res = middleware(req('/api/v1/edge/nodes'));

  expect(res.status).toBe(401);
  await expect(res.json()).resolves.toEqual({ detail: 'unauthenticated' });
});
