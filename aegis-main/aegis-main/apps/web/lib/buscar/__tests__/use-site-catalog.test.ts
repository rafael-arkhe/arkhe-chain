/**
 * use-site-catalog.test.ts — prova do hook de CATÁLOGO (FRENTE FE-A).
 *
 * Foco no contrato sem React: cache EM MEMÓRIA por catalog+nsfw (NUNCA
 * localStorage), includeNsfw como chave distinta (refetch), e fail-soft (erro
 * não cacheia → permite retry). fetchSiteCatalog é o núcleo testável.
 */
import { fetchSiteCatalog, __clearSiteCatalogCache } from '../use-site-catalog';

const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const CAT = {
  categories: [{ key: 'social', label: 'Social' }],
  sites: [{ id: 'GitHub', label: 'GitHub', category: 'coding', nsfw: false }],
  total: 1,
};

beforeEach(() => {
  __clearSiteCatalogCache();
  mockApiFetch.mockReset();
});

describe('fetchSiteCatalog — cache em memória por catalog+nsfw', () => {
  it('monta a URL com catalog (sem include_nsfw por padrão)', async () => {
    mockApiFetch.mockResolvedValueOnce(CAT);
    await fetchSiteCatalog('maigret');
    expect(mockApiFetch).toHaveBeenCalledWith('/search/fanout/sites?catalog=maigret');
  });

  it('cache HIT: 2ª chamada do mesmo catalog NÃO refaz a rede', async () => {
    mockApiFetch.mockResolvedValueOnce(CAT);
    const a = await fetchSiteCatalog('maigret');
    const b = await fetchSiteCatalog('maigret');
    expect(a).toEqual(b);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('includeNsfw=true é chave de cache DISTINTA (refetch com include_nsfw)', async () => {
    mockApiFetch.mockResolvedValue(CAT);
    await fetchSiteCatalog('maigret', false);
    await fetchSiteCatalog('maigret', true);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/search/fanout/sites?catalog=maigret');
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      '/search/fanout/sites?catalog=maigret&include_nsfw=true',
    );
  });

  it('normaliza payload parcial (sem categories/sites) p/ listas vazias', async () => {
    mockApiFetch.mockResolvedValueOnce({});
    const r = await fetchSiteCatalog('sherlock');
    expect(r.categories).toEqual([]);
    expect(r.sites).toEqual([]);
  });

  it('fail-soft: erro NÃO cacheia → próxima chamada tenta de novo', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchSiteCatalog('wmn')).rejects.toThrow('boom');
    // retry: cache não reteve a promise rejeitada.
    mockApiFetch.mockResolvedValueOnce(CAT);
    const ok = await fetchSiteCatalog('wmn');
    expect(ok.sites).toHaveLength(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});
