/**
 * rich-render.test.tsx — P2 ELO 2: RENDERIZAÇÃO RICA.
 *
 * Prova que a CAMADA DE EXIBIÇÃO consome a riqueza do ELO 1 (media/items/fields/
 * count) por SHAPE, nunca por nome de fonte:
 *   - ResultadoCard de COLEÇÃO (maigret) mostra a contagem NEUTRA ("N itens");
 *   - ResultadoCard com MÍDIA (searx_images) renderiza a tira de galeria;
 *   - DetalheObjeto com items+media+fields renderiza as 3 seções, com links em
 *     NOVA ABA (target=_blank rel=noopener) e tom (warn=danger / ok=primária).
 *
 * Fixtures de coleção/mídia derivam de ENVELOPES REAIS via `normalizeResult`
 * (mesmo contrato do ELO 1); o detalhe usa um NormalizedResult co-localizado que
 * exercita os três eixos numa só seleção. jsdom.
 */
import * as React from 'react';
import { render, screen, within } from '@testing-library/react';

// next/link (em resultados/detalhe) e useRouter (no PersonalizarResultadoButton).
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/buscar',
  useSearchParams: () => new URLSearchParams(),
}));

// PersonalizarResultadoButton chama useCan/useAuth; sem perm → retorna null.
jest.mock('@/lib/auth/useAuth', () => ({
  useCan: () => false,
  useAuth: () => ({ principal: null, loading: false }),
}));

import { Resultados } from '@/components/buscar/resultados';
import { DetalheObjeto } from '@/components/buscar/detalhe';
import { MediaGallery } from '@/components/buscar/media-gallery';
import { ItemsList } from '@/components/buscar/items-list';
import { normalizeResult } from '@/lib/buscar/normalize';
import {
  SOURCE_CATALOG,
  type FilaItem,
  type NormalizedResult,
  type SourceDef,
} from '@/lib/buscar/types';

function sourceFor(key: string): SourceDef {
  return (
    SOURCE_CATALOG.find((s) => s.key === key) ?? {
      key,
      label: key,
      category: 'osint-pessoa',
      mcpTool: key,
    }
  );
}

function fila(source: SourceDef, query: string, results: NormalizedResult[]): FilaItem {
  return {
    id: `${source.key}-${query}`,
    query,
    source,
    status: 'done',
    results,
    queuedAt: Date.now(),
  };
}

const noop = () => {};

/* ────────────────────────────────────────────────────────────────────────
 * ResultadoCard — COLEÇÃO (maigret): contagem NEUTRA "N itens"
 * ──────────────────────────────────────────────────────────────────────── */
describe('ResultadoCard — coleção (maigret) mostra contagem neutra', () => {
  const raw = {
    username: 'fulano',
    found_count: 3,
    found: [
      { site: 'GitHub', url: 'https://github.com/fulano' },
      { site: 'Reddit', url: 'https://reddit.com/u/fulano' },
      { site: 'Telegram', url: 'https://t.me/fulano' },
    ],
  };
  const results = normalizeResult('maigret_username@v1', raw, 'fulano');

  it('renderiza o badge de contagem "3 itens" (substantivo NEUTRO)', () => {
    render(
      <Resultados
        items={[fila(sourceFor('maigret_username@v1'), 'fulano', results)]}
        selectedKey={null}
        onSelect={noop}
        onEnriquecer={noop}
        onCriar={noop}
      />,
    );
    const contagem = screen.getByTestId('buscar-resultado-contagem');
    expect(contagem).toHaveTextContent('3 itens');
    // O subtitle auto ("3 itens") NÃO aparece duplicado fora do badge.
    expect(screen.getAllByText('3 itens')).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * ResultadoCard — MÍDIA (searx_images): tira de galeria
 * ──────────────────────────────────────────────────────────────────────── */
describe('ResultadoCard — com mídia (searx_images) mostra a galeria', () => {
  const raw = {
    data: {
      results: [
        {
          title: 'Foto',
          url: 'https://site.com/pagina',
          content: 'descrição',
          engine: 'bing',
          thumbnail: 'https://px.searx.com/thumb.jpg',
          img_src: 'https://site.com/full.jpg',
        },
      ],
    },
  };
  const results = normalizeResult('searx_images@v1', raw, 'foto');

  it('o card renderiza a tira de galeria (buscar-galeria)', () => {
    expect(results[0].media && results[0].media.length).toBeTruthy();
    render(
      <Resultados
        items={[fila(sourceFor('searx_images@v1'), 'foto', results)]}
        selectedKey={null}
        onSelect={noop}
        onEnriquecer={noop}
        onCriar={noop}
      />,
    );
    expect(screen.getByTestId('buscar-galeria')).toBeInTheDocument();
    // Miniatura LAZY + http(s) (nunca vaza host de túnel).
    const img = screen.getByTestId('buscar-galeria').querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img?.getAttribute('src')).toMatch(/^https?:\/\//);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * DetalheObjeto — items + media + fields → 3 seções + links nova aba + tom
 * ──────────────────────────────────────────────────────────────────────── */
describe('DetalheObjeto — galeria + itens + campos', () => {
  const richResult: NormalizedResult = {
    externalId: 'perfil-1',
    name: 'Perfil Exemplo',
    kind: 'profile',
    shape: 'profile',
    subtitle: 'identidade pública',
    thumbnail: 'https://cdn.example.com/avatar.jpg',
    media: [
      { url: 'https://cdn.example.com/foto.jpg', kind: 'image', caption: 'foto' },
      {
        url: 'https://cdn.example.com/clip.mp4',
        kind: 'video',
        thumbnail: 'https://cdn.example.com/cover.jpg',
      },
    ],
    items: [
      { externalId: 's1', name: 'GitHub', kind: 'site', url: 'https://github.com/fulano' },
      { externalId: 's2', name: 'Reddit', kind: 'site', url: 'https://reddit.com/u/fulano' },
    ],
    count: 2,
    fields: [
      { label: 'buscar.campo.k.followers', value: '12000' },
      { label: 'buscar.campo.k.is_verified', value: 'Sim', tone: 'ok' },
      { label: 'Blacklist', value: 'Listado', tone: 'warn' },
      { label: 'External Url', value: 'site.com', href: 'https://site.com', },
    ],
    raw: { username: 'fulano' },
  };

  function renderDetalhe() {
    render(
      <DetalheObjeto
        selecionado={{
          result: richResult,
          source: sourceFor('instaloader_profile@v1'),
          query: 'fulano',
        }}
        onEnriquecer={noop}
        onCriar={noop}
      />,
    );
  }

  it('renderiza as 3 seções (Galeria, Itens, Campos) + payload bruto', () => {
    renderDetalhe();
    expect(screen.getByText('Galeria')).toBeInTheDocument();
    expect(screen.getByText('Campos')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-galeria')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-itens')).toBeInTheDocument();
    expect(screen.getByText('Payload bruto')).toBeInTheDocument();
  });

  it('itens são sub-resultados com link em NOVA ABA (rel=noopener)', () => {
    renderDetalhe();
    expect(screen.getByTestId('buscar-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-item-1')).toBeInTheDocument();
    const gh = screen.getByRole('link', { name: 'GitHub' });
    expect(gh).toHaveAttribute('href', 'https://github.com/fulano');
    expect(gh).toHaveAttribute('target', '_blank');
    expect(gh).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('campos: rótulo i18n resolvido, valor mono, tom (warn=danger) e href nova aba', () => {
    renderDetalhe();
    // followers → "Seguidores" (chave i18n resolvida via t())
    expect(screen.getByText('Seguidores')).toBeInTheDocument();
    expect(screen.getByText('12000')).toBeInTheDocument();
    // verificado → tom ok = primária
    expect(screen.getByText('Sim')).toHaveClass('text-primary');
    // risco → tom warn = danger (label "Blacklist" passa intacto pelo t())
    expect(screen.getByText('Blacklist')).toBeInTheDocument();
    expect(screen.getByText('Listado')).toHaveClass('text-danger');
    // href → link em NOVA ABA
    const link = screen.getByRole('link', { name: /site\.com/ });
    expect(link).toHaveAttribute('href', 'https://site.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Componentes novos isolados — MediaGallery + ItemsList
 * ──────────────────────────────────────────────────────────────────────── */
describe('MediaGallery — lazy, http(s) only, vídeo com badge, link nova aba', () => {
  it('filtra não-http, respeita max e abre em nova aba', () => {
    render(
      <MediaGallery
        media={[
          { url: 'https://cdn.example.com/a.jpg', kind: 'image' },
          { url: 'https://cdn.example.com/b.mp4', kind: 'video', thumbnail: 'https://cdn.example.com/b.jpg' },
          { url: 'blob:should-be-dropped', kind: 'image' }, // nunca vaza host de túnel/relativo
          { url: 'https://cdn.example.com/c.jpg', kind: 'image' },
        ]}
        max={2}
      />,
    );
    const galeria = screen.getByTestId('buscar-galeria');
    const links = within(galeria).getAllByRole('link');
    expect(links).toHaveLength(2); // max respeitado, blob filtrado
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
    }
  });

  it('retorna null (não renderiza) quando não há mídia http(s)', () => {
    const { container } = render(
      <MediaGallery media={[{ url: '/relativo.jpg', kind: 'image' }]} />,
    );
    expect(container.querySelector('[data-testid="buscar-galeria"]')).toBeNull();
  });
});

describe('ItemsList — username-enum compacto (site + url clicável)', () => {
  it('cada item vira linha com link em nova aba', () => {
    render(
      <ItemsList
        items={[
          { externalId: 's1', name: 'GitHub', kind: 'site', url: 'https://github.com/x' },
          { externalId: 's2', name: 'Reddit', kind: 'site', url: 'https://reddit.com/u/x' },
        ]}
      />,
    );
    expect(screen.getByTestId('buscar-itens')).toBeInTheDocument();
    expect(screen.getByTestId('buscar-item-0')).toBeInTheDocument();
    const gh = screen.getByRole('link', { name: 'GitHub' });
    expect(gh).toHaveAttribute('href', 'https://github.com/x');
    expect(gh).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
