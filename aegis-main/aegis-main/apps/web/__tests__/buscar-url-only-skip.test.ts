/**
 * #3b / Onda 1 — fontes URL-only (osint_extract, crawl4ai, playwright, …) NÃO
 * disparam o adapter quando a query não é URL: o worker PULA com sinal EXPLÍCITO
 * (`FonteRequerUrlError`) em vez de retornar [] em silêncio (que aparecia como
 * "0 resultados · 14ms" e confundia o operador). O orchestrator marca o item
 * como `skipped` (neutro), não `error`.
 *
 * Também cobre: o shotgun do searchMcp passa a enviar a chave `channel`
 * (handle normalizado) — conserta o YouTube canal, que falhava 100%.
 */
import { runWorker, FonteRequerUrlError } from '@/lib/buscar/workers';
import type { SourceDef } from '@/lib/buscar/types';

jest.mock('@/lib/api/mcp', () => ({
  Mcp: { invoke: jest.fn().mockResolvedValue({ result: { items: [] } }) },
}));
jest.mock('@/lib/api', () => ({ Entities: { list: jest.fn() } }));
jest.mock('@/lib/api/cctv', () => ({
  Cctv: { streams: { list: jest.fn(), detections: jest.fn() } },
  detectionFrameUrl: () => undefined,
  nonAggregate: () => true,
}));

const { Mcp } = jest.requireMock('@/lib/api/mcp') as { Mcp: { invoke: jest.Mock } };

const osintExtract: SourceDef = {
  key: 'osint_extract@v1',
  label: 'OSINT · extrator',
  category: 'osint-pessoa',
  mcpTool: 'osint_extract@v1',
};

const youtubeSearch: SourceDef = {
  key: 'youtube_search@v1',
  label: 'YouTube · busca',
  category: 'osint-pessoa',
  mcpTool: 'youtube_search@v1',
};

const youtubeChannel: SourceDef = {
  key: 'youtube_channel@v1',
  label: 'YouTube · canal',
  category: 'osint-pessoa',
  mcpTool: 'youtube_channel@v1',
};

const crawl: SourceDef = {
  key: 'crawl_markdown@v1',
  label: 'Crawl4AI · markdown',
  category: 'scrape',
  mcpTool: 'crawl_markdown@v1',
};

describe('runWorker — fonte URL-only genuína (crawl4ai)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('query que NÃO é URL → lança FonteRequerUrlError sem invocar o adapter', async () => {
    await expect(runWorker(crawl, 'safecoretech')).rejects.toBeInstanceOf(FonteRequerUrlError);
    expect(Mcp.invoke).not.toHaveBeenCalled();
  });

  it('query que É URL → invoca normalmente', async () => {
    await runWorker(crawl, 'https://exemplo.com/pagina');
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('runWorker — OSINT extrator aceita URL OU username (fan-out)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('username (handle) → INVOCA o fan-out (não pula mais)', async () => {
    await runWorker(osintExtract, 'safecoretech');
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });

  it('@handle → invoca', async () => {
    await runWorker(osintExtract, '@safecoretech');
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });

  it('URL → invoca', async () => {
    await runWorker(osintExtract, 'https://instagram.com/safecoretech');
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });

  it('nome com espaços (nem URL nem handle) → pula com FonteRequerUrlError', async () => {
    await expect(runWorker(osintExtract, 'fulano da silva')).rejects.toBeInstanceOf(
      FonteRequerUrlError,
    );
    expect(Mcp.invoke).not.toHaveBeenCalled();
  });

  it('fonte NÃO-url-only (youtube busca) → invoca com qualquer texto', async () => {
    await runWorker(youtubeSearch, 'safecoretech');
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('searchMcp — chave `channel` do YouTube canal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('handle com @ → envia channel normalizado (sem @)', async () => {
    await runWorker(youtubeChannel, '@globonews');
    expect(Mcp.invoke).toHaveBeenCalledTimes(1);
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.channel).toBe('globonews');
  });

  it('handle simples → envia channel', async () => {
    await runWorker(youtubeChannel, 'globonews');
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.channel).toBe('globonews');
  });

  it('query com espaço (não-handle) → NÃO envia channel', async () => {
    await runWorker(youtubeChannel, 'jornal nacional');
    const params = Mcp.invoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.channel).toBeUndefined();
  });
});
