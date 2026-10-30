/**
 * normalize-rich.test.ts — P2 ELO 1: NÚCLEO RICO POR SHAPE.
 *
 * Prova que `normalizeResult` enriquece por FORMA do dado (mídia / fields /
 * items), NUNCA pelo nome da fonte. Fixtures = ENVELOPES REAIS capturados na
 * auditoria. Cada bloco prova um SHAPE distinto, e o último bloco garante que os
 * fact-extractors curados (CNPJ) seguem ganhando (facts intactos) + somam sócios.
 *
 * Regra dura honrada nos asserts: links são URLs http(s) (a UI abre em nova aba
 * com rel=noopener), mídia só http(s) absoluto (nunca vaza host de túnel),
 * substantivos NEUTROS (N itens), zero `if tool === 'x'`.
 */
import { normalizeResult, extractItems, recordToFields, prettifyKey } from '../normalize';
import type { NormalizedResult } from '../types';

const findField = (r: NormalizedResult | undefined, value: string) =>
  r?.fields?.find((f) => f.value === value);

/* ────────────────────────────────────────────────────────────────────────
 * maigret/sherlock/wmn — COLEÇÃO de sites (FIX do "onde")
 * ──────────────────────────────────────────────────────────────────────── */
describe('maigret/sherlock/wmn → 1 resultado-coleção com items[] (cada site + link)', () => {
  const raw = {
    username: 'fulano',
    found_count: 3,
    found: [
      { site: 'GitHub', url: 'https://github.com/fulano' },
      { site: 'Reddit', url: 'https://reddit.com/u/fulano' },
      { site: 'Telegram', url: 'https://t.me/fulano' },
    ],
  };
  const [r] = normalizeResult('maigret_username@v1', raw, 'fulano');

  it('é UM resultado (registro com identidade no topo), não N cards', () => {
    expect(normalizeResult('maigret_username@v1', raw, 'fulano')).toHaveLength(1);
  });
  it('items[] tem os N sites, cada um com nome do site e link (http)', () => {
    expect(r.items).toHaveLength(3);
    expect(r.count).toBe(3);
    expect(r.items?.[0].name).toBe('GitHub');
    expect(r.items?.[0].url).toBe('https://github.com/fulano');
    expect(r.items?.every((it) => /^https?:\/\//.test(it.url ?? ''))).toBe(true);
  });
  it('subtitle = "N itens" (substantivo NEUTRO, multidomínio)', () => {
    expect(r.subtitle).toBe('3 itens');
    expect(r.shape).toBe('collection');
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * reddit OAuth — listagem aninhada (data.data.children) → cards com thumb+fields
 * ──────────────────────────────────────────────────────────────────────── */
describe('reddit → cards (data.data.children), cada um com thumbnail + fields + link', () => {
  const raw = {
    status: 'ok',
    data: {
      kind: 'Listing',
      data: {
        children: [
          {
            kind: 't3',
            data: {
              title: 'Notícia importante',
              url: 'https://example.com/post',
              thumbnail: 'https://img.reddit.com/thumb.jpg',
              permalink: '/r/brasil/comments/abc',
              score: 142,
              num_comments: 27,
              author: 'op_user',
              subreddit: 'brasil',
              selftext: 'corpo do post',
              is_video: false,
            },
          },
        ],
      },
    },
  };
  const out = normalizeResult('reddit_search@v1', raw, 'noticia');

  it('extrai os children (aninhamento data.data.children)', () => {
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Notícia importante');
    expect(out[0].url).toBe('https://example.com/post');
  });
  it('thumbnail http + fields de métricas (comentários, comunidade)', () => {
    expect(out[0].thumbnail).toBe('https://img.reddit.com/thumb.jpg');
    expect(findField(out[0], '27')).toBeDefined(); // num_comments
    expect(findField(out[0], 'brasil')).toBeDefined(); // subreddit
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * instaloader_profile — PERFIL (avatar + fields de métricas)
 * ──────────────────────────────────────────────────────────────────────── */
describe('instaloader_profile → PERFIL com avatar + fields de métricas', () => {
  const raw = {
    username: 'fulano',
    full_name: 'Fulano de Tal',
    biography: 'bio aqui',
    followers: 12000,
    followees: 300,
    mediacount: 87,
    is_private: false,
    is_verified: true,
    external_url: 'https://site.com',
    profile_pic_url: 'https://cdn.ig.com/avatar.jpg',
  };
  const [r] = normalizeResult('instaloader_profile@v1', raw, 'fulano');

  it('nome humano = full_name; avatar como thumbnail', () => {
    expect(r.name).toBe('Fulano de Tal');
    expect(r.thumbnail).toBe('https://cdn.ig.com/avatar.jpg');
    expect(r.shape).toBe('profile');
  });
  it('fields de métricas (seguidores/seguindo/publicações) + verificado tone ok', () => {
    expect(findField(r, '12000')).toBeDefined(); // followers
    expect(findField(r, '300')).toBeDefined(); // followees
    const verificado = r.fields?.find((f) => f.label === 'buscar.campo.k.is_verified');
    expect(verificado?.tone).toBe('ok');
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * instaloader_posts / facebook_page — COLEÇÃO com mídia + métricas por item
 * ──────────────────────────────────────────────────────────────────────── */
describe('instaloader_posts → items[] com mídia (vídeo c/ capa) + fields', () => {
  const raw = {
    username: 'fulano',
    post_count: 1,
    posts: [
      {
        shortcode: 'ABC123',
        url: 'https://instagram.com/p/ABC123',
        caption: 'legenda',
        likes: 540,
        comments: 12,
        date_utc: '2026-06-01',
        is_video: true,
        video_view_count: 9000,
        display_url: 'https://cdn.ig.com/cover.jpg',
        video_url: 'https://cdn.ig.com/clip.mp4',
      },
    ],
  };
  const [r] = normalizeResult('instaloader_posts@v1', raw, 'fulano');

  it('item com mídia de vídeo (capa = display_url) e link do post', () => {
    const it = r.items?.[0];
    expect(it?.url).toBe('https://instagram.com/p/ABC123');
    expect(it?.media?.some((m) => m.kind === 'video' && m.url === 'https://cdn.ig.com/clip.mp4')).toBe(true);
    expect(it?.media?.[0].thumbnail).toBe('https://cdn.ig.com/cover.jpg');
  });
  it('item com fields de métricas (curtidas/comentários/views)', () => {
    expect(findField(r.items?.[0], '540')).toBeDefined();
    expect(findField(r.items?.[0], '9000')).toBeDefined();
  });
});

describe('facebook_page → items[] com link = post_url (não "url") + mídia image/video', () => {
  const raw = {
    page: 'https://facebook.com/pagina',
    post_count: 1,
    posts: [
      {
        post_id: 'p1',
        post_url: 'https://facebook.com/pagina/posts/p1',
        text: 'texto do post',
        time: '2026-06-02',
        likes: 10,
        comments: 2,
        shares: 1,
        image: 'https://fb.com/photo.jpg',
        video: 'https://fb.com/video.mp4',
      },
    ],
  };
  const [r] = normalizeResult('facebook_page@v1', raw, 'pagina');

  it('link do item vem de post_url', () => {
    expect(r.items?.[0].url).toBe('https://facebook.com/pagina/posts/p1');
  });
  it('mídia detectada (vídeo com capa de imagem) + fields de métricas', () => {
    expect(r.items?.[0].media?.some((m) => m.kind === 'video')).toBe(true);
    expect(findField(r.items?.[0], '10')).toBeDefined(); // likes
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * searx_images — galeria (img_src) ; gdelt — web (socialimage)
 * ──────────────────────────────────────────────────────────────────────── */
describe('searx_images → cards com media[] (img_src)', () => {
  const raw = {
    data: {
      results: [
        {
          title: 'Foto',
          url: 'https://site.com/pagina',
          content: 'descrição',
          engine: 'bing',
          publishedDate: '2026-05-01',
          thumbnail: 'https://px.searx.com/thumb.jpg',
          img_src: 'https://site.com/full.jpg',
        },
      ],
    },
  };
  const out = normalizeResult('searx_images@v1', raw, 'foto');

  it('cada card tem media[] de imagem (img_src + thumbnail)', () => {
    expect(out).toHaveLength(1);
    const urls = out[0].media?.map((m) => m.url) ?? [];
    expect(urls).toContain('https://site.com/full.jpg');
    expect(out[0].media?.every((m) => m.kind === 'image')).toBe(true);
  });
});

describe('gdelt_doc → cards web com thumb (socialimage) + fields', () => {
  const raw = {
    data: {
      articles: [
        {
          title: 'Manchete',
          url: 'https://news.com/a',
          seendate: '20260601T120000Z',
          domain: 'news.com',
          socialimage: 'https://news.com/social.jpg',
          language: 'Portuguese',
        },
        { title: 'Outra', url: 'https://news.com/b', domain: 'news.com' },
      ],
    },
  };
  const out = normalizeResult('gdelt_doc_search@v1', raw, 'tema');

  it('N cards web, cada um com link', () => {
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Manchete');
    expect(out[0].url).toBe('https://news.com/a');
    expect(out[0].thumbnail).toBe('https://news.com/social.jpg');
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * GeoJSON / focos — shape geo (lat/lon)
 * ──────────────────────────────────────────────────────────────────────── */
describe('inpe focos / GeoJSON → shape geo com lat/lon', () => {
  it('focos:[{lat,lon}] → cards geo', () => {
    const out = normalizeResult('inpe_queimadas@v1', { focos: [{ lat: -3.1, lon: -60.0, satelite: 'AQUA' }] }, 'amazonia');
    expect(out).toHaveLength(1);
    expect(out[0].shape).toBe('geo');
    expect(findField(out[0], '-3.1')).toBeDefined();
  });
  it('GeoJSON features → geometry.coordinates vira lat/lon', () => {
    const out = normalizeResult(
      'inpe_deter@v1',
      { features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-60.0, -3.1] }, properties: { nome: 'Polígono 1' } }] },
      'x',
    );
    expect(out[0].shape).toBe('geo');
    expect(out[0].name).toBe('Polígono 1');
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * truthbrush — perfil/post Mastodon (account + media_attachments + HTML)
 * ──────────────────────────────────────────────────────────────────────── */
describe('truthbrush → statuses com account (avatar/nome) + media_attachments', () => {
  const raw = {
    statuses: [
      {
        content: '<p>Olá mundo</p>',
        account: { avatar: 'https://truth.com/avatar.png', display_name: 'Pessoa Pública' },
        media_attachments: [{ url: 'https://truth.com/img.jpg', preview_url: 'https://truth.com/prev.jpg', type: 'image' }],
        favourites_count: 50,
        reblogs_count: 8,
      },
    ],
  };
  const out = normalizeResult('truthbrush_user@v1', raw, 'pessoa');

  it('nome/avatar vêm do wrapper account; mídia do media_attachments', () => {
    expect(out[0].name).toBe('Pessoa Pública');
    expect(out[0].thumbnail).toBe('https://truth.com/avatar.png');
    const anexo = out[0].media?.find((m) => m.url === 'https://truth.com/img.jpg');
    expect(anexo).toBeDefined();
    expect(anexo?.thumbnail).toBe('https://truth.com/prev.jpg');
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * CNPJ curado — facts INTACTOS + sócios somados (ADD-alongside)
 * ──────────────────────────────────────────────────────────────────────── */
describe('mr_cnpj/opencnpj → facts curados intactos + items[] de sócios (qsa)', () => {
  const raw = {
    razao_social: 'EMPRESA EXEMPLO LTDA',
    situacao_cadastral: 'ATIVA',
    cnae_fiscal_descricao: 'Comércio varejista',
    capital_social: '100000',
    municipio: 'São Paulo',
    uf: 'SP',
    qsa: [
      { nome_socio: 'Sócio Um', qualificacao_socio: 'Administrador', data_entrada_sociedade: '2010-01-01' },
      { nome_socio: 'Sócio Dois', qualificacao_socio: 'Sócio', data_entrada_sociedade: '2012-05-01' },
    ],
  };
  const [r] = normalizeResult('mr_cnpj@v1', raw, '11222333000181');

  it('facts curados seguem (situação ATIVA tone ok) — nada quebrado', () => {
    const sit = r.facts?.find((f) => f.label === 'buscar.fato.situacao');
    expect(sit?.value).toBe('ATIVA');
    expect(sit?.tone).toBe('ok');
  });
  it('items[] = sócios (qsa), com nome do sócio + qualificação + data de entrada', () => {
    expect(r.items).toHaveLength(2);
    expect(r.items?.[0].name).toBe('Sócio Um');
    expect(r.items?.[0].subtitle).toBe('Administrador'); // qualificacao_socio
    expect(findField(r.items?.[0], '2010-01-01')).toBeDefined(); // data_entrada_sociedade
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Compat — caminho LISTA genérico (Câmara) inalterado + helpers
 * ──────────────────────────────────────────────────────────────────────── */
describe('compat — lista genérica (Câmara) segue FLAT, sem facts', () => {
  const raw = { status: 200, data: { dados: [{ id: 100, nome: 'Fulano', siglaPartido: 'XPTO', siglaUf: 'SP' }] } };
  const out = normalizeResult('camara_deputados@v1', raw, 'fulano');

  it('1 card flat por elemento; facts undefined (lista genérica)', () => {
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Fulano');
    expect(out[0].subtitle).toBe('XPTO');
    expect(out[0].facts).toBeUndefined();
  });
});

describe('helpers — extractItems compat, prettifyKey, recordToFields', () => {
  it('extractItems mantém o contrato: registro escalar → [obj]', () => {
    expect(extractItems({ a: 1 })).toEqual([{ a: 1 }]);
    expect(extractItems({ data: { results: [1, 2] } })).toEqual([1, 2]);
  });
  it('prettifyKey → Title Case genérico (camel/snake)', () => {
    expect(prettifyKey('found_count')).toBe('Found Count');
    expect(prettifyKey('videoViewCount')).toBe('Video View Count');
  });
  it('recordToFields humaniza escalares, dedupa por valor consumido e marca tom de risco', () => {
    const fields = recordToFields(
      { followers: 10, blacklist: true, ignorar: 'x' },
      new Set(['x']), // 'ignorar' deduplicado por valor
    );
    expect(fields.find((f) => f.value === 'x')).toBeUndefined();
    const risco = fields.find((f) => f.label === 'buscar.campo.k.blacklist' || /blacklist/i.test(f.label));
    expect(risco?.tone).toBe('warn');
  });
});
