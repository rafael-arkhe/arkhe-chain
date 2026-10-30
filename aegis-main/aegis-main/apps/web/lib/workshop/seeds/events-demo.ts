import type { WorkshopApp } from '@/lib/workshop/types';

/**
 * Seed demo do Sprint 2: events + overlay primitive.
 *
 * Mostra o padrão "clica num botão → abre drawer com detalhe". Quando o
 * operador clica em "Ver detalhe", `button_group` emite `click` →
 * action `open_overlay` abre o drawer `detalhe-row`. Drawer tem
 * widgets internos que renderizam o que foi clicado.
 *
 * Educacional + servirá pros testes de Playwright e2e validarem o
 * sistema de eventos.
 */
export const EVENTS_DEMO_SEED: WorkshopApp = {
  id: 'seed.security.demo.events',
  external_id: 'seed.security.demo.events',
  display: 'Demo · Eventos + Overlay',
  description:
    'Exemplo Sprint 2: botão dispara open_overlay e abre drawer com widgets internos. Pra testar/aprender o padrão event-driven.',
  schema_version: 2,
  variables: [],
  layout: {
    columns: 12,
    root: [
      {
        id: 'demo_title',
        widget: {
          type: 'markdown_v2',
          props: {
            title: 'Workshop · Events demo',
            content:
              'Clique no botão abaixo. Ele emite `click` → ação `open_overlay` abre o drawer da direita.',
          },
        },
        layout: { col_span: 12 },
      },
      {
        id: 'demo_buttons',
        widget: {
          type: 'button_group',
          props: {
            title: 'Demo de eventos',
            buttons: [
              {
                label: 'Ver detalhe',
                action_id: '__local_open_detalhe',
                variant: 'primary',
              },
              {
                label: 'Resetar filtro',
                action_id: '__local_reset_filter',
                variant: 'ghost',
              },
            ],
          },
        },
        layout: { col_span: 12 },
        events: [
          {
            trigger: 'click',
            action: 'open_overlay',
            params: { overlay_id: 'detalhe-row' },
          },
        ],
      },
    ],
  },
  overlays: [
    {
      id: 'detalhe-row',
      title: 'Detalhe — overlay drawer',
      variant: 'drawer-right',
      width: 420,
      layout: {
        columns: 12,
        root: [
          {
            id: 'overlay_intro',
            widget: {
              type: 'markdown_v2',
              props: {
                title: 'Conteúdo do drawer',
                content:
                  'Este overlay tem seu **próprio** layout de widgets. Backdrop click ou ESC fecha.',
              },
            },
            layout: { col_span: 12 },
          },
          {
            id: 'overlay_close',
            widget: {
              type: 'button_group',
              props: {
                buttons: [
                  {
                    label: 'Fechar drawer',
                    action_id: '__local_close',
                    variant: 'ghost',
                  },
                ],
              },
            },
            layout: { col_span: 12 },
            events: [
              {
                trigger: 'click',
                action: 'close_overlay',
                params: { overlay_id: 'detalhe-row' },
              },
            ],
          },
        ],
      },
    },
  ],
};
