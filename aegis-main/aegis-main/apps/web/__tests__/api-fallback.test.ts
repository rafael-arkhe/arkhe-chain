/**
 * GUARDA DE FALLBACK HONESTO (2026-06-12).
 *
 * Regra de produto: fallback offline mostra ESTADO honesto ('—', vazio,
 * erro) — NUNCA número/conteúdo fabricado que renderize como dado real.
 *
 * Este teste é a guarda anti-regressão: se alguém reintroduzir um KPI
 * numérico, uma timeline inventada ou um corpus demo em
 * lib/api/fallback.ts ou lib/mock-data.ts, ele quebra.
 */
import * as fallback from '@/lib/api/fallback';
import * as mockData from '@/lib/mock-data';
import { FALLBACK_ME_HOME, FALLBACK_NAV } from '@/lib/api/fallback';

describe('fallback honesto (offline)', () => {
  it('fallback.ts só exporta NAV (topologia de rotas) e ME_HOME vazio', () => {
    expect(Object.keys(fallback).sort()).toEqual([
      'FALLBACK_ME_HOME',
      'FALLBACK_NAV',
    ]);
  });

  it('NAV cobre as 3 sections do app operacional', () => {
    const ids = FALLBACK_NAV.sections.map((s) => s.id).sort();
    expect(ids).toEqual(['analise', 'conteudo', 'operacao']);
  });

  it('cada NavItem aponta para rota interna válida e tem perm_key', () => {
    for (const s of FALLBACK_NAV.sections) {
      for (const i of s.items) {
        expect(i.href.startsWith('/')).toBe(true);
        expect(i.perm_key).toBeTruthy();
      }
    }
  });

  it('NAV nunca traz badge/contagem fabricada', () => {
    for (const s of FALLBACK_NAV.sections) {
      for (const i of s.items) expect(i.badge).toBeNull();
    }
  });

  it('NENHUM literal numérico de KPI no fallback da Home — tudo null', () => {
    const kpis = Object.values(FALLBACK_ME_HOME.kpis);
    expect(kpis.length).toBeGreaterThan(0);
    for (const k of kpis) {
      expect(k.value).toBeNull();
      expect(k.delta_pct).toBeNull();
    }
  });

  it('timeline offline é vazia — nunca eventos inventados', () => {
    expect(FALLBACK_ME_HOME.timeline).toEqual([]);
  });

  it('fallbacks fabricados morreram (entities/roles/audit/vídeo/grafo/alerts)', () => {
    for (const dead of [
      'FALLBACK_ALERTS',
      'FALLBACK_AUDIT',
      'FALLBACK_ENTITIES',
      'FALLBACK_ONTOLOGY_EDGES',
      'FALLBACK_ONTOLOGY_NODES',
      'FALLBACK_ROLES',
      'FALLBACK_VIDEO_STREAMS',
      'FALLBACK_VIDEO_TAGS',
    ]) {
      expect(dead in fallback).toBe(false);
    }
  });

  it('lib/mock-data não exporta mais NENHUM dado demo em runtime (só types)', () => {
    const runtimeKeys = Object.keys(mockData).filter((k) => k !== '__esModule');
    expect(runtimeKeys).toEqual([]);
  });
});
