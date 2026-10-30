import type { WorkshopApp } from '@/lib/workshop/types';

/**
 * Seed local do /briefings — fallback offline da seed data-driven do backend
 * (ontology-module `platform_v23/pages.py` → `_WORKSHOP_SEEDS['briefings']`).
 *
 * Espelha a mesma composição NEUTRA multidomínio (P5 Onda 3): só widgets
 * GENÉRICOS — markdown_v2 + timeline + object_table + map_live. Zero lente
 * militar/eleitoral, zero slide inventado. O briefing real é montado pelo
 * operador no Workshop; aqui é só o esqueleto honesto com estados vazios.
 *
 * `surface='briefing'` e `markings` carregam o NÍVEL armazenado (eixo CBAC):
 * o /briefings deriva a classificação do banner a partir daqui (nunca
 * hardcoded por tela). `restrito` é o default neutro, configurável salvando
 * outro nível.
 */
export const BRIEFING_FALLBACK_SEED: WorkshopApp = {
  id: 'seed.security.briefings',
  external_id: 'seed.security.briefings',
  display: 'Briefing',
  description: 'Briefing operacional — montado por widgets genéricos',
  schema_version: 2,
  surface: 'briefing',
  // Nível ARMAZENADO (eixo de classificação) — banner lê daqui, não hardcode.
  markings: ['restrito'],
  variables: [],
  layout: {
    columns: 20,
    root: [
      {
        id: 'briefings_texto',
        widget: {
          type: 'markdown_v2',
          props: {
            content:
              '## Briefing\n\nResumo do período. Edite este texto no Workshop ou monte o briefing com os widgets ao lado.',
          },
        },
        layout: { col_span: 14, min_height: '320px' },
      },
      {
        id: 'briefings_timeline',
        widget: { type: 'timeline', props: {} },
        layout: { col_span: 6, min_height: '320px' },
      },
      {
        id: 'briefings_tabela',
        widget: { type: 'object_table', props: {} },
        layout: { col_span: 20, min_height: '320px' },
      },
      {
        id: 'briefings_mapa',
        widget: { type: 'map_live', props: {} },
        layout: { col_span: 20, min_height: '360px' },
      },
    ],
  },
};
