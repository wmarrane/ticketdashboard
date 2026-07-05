import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateTitles, translateStrict } from '../src/pipeline/translator';
import { config } from '../src/config';

const originalUrl = config.libretranslateUrl;

describe('translateTitles', () => {
  beforeEach(() => {
    config.libretranslateUrl = 'http://libretranslate:5000';
  });

  afterEach(() => {
    config.libretranslateUrl = originalUrl;
    vi.unstubAllGlobals();
  });

  it('retorna [] para entrada vazia sem chamar fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await translateTitles([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sucesso: mapeia o array traduzido de volta na mesma ordem', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: ['Payment error', 'Inventory report'] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await translateTitles(['Erro de pagamento', 'Relatório de estoque']);
    expect(out).toEqual(['Payment error', 'Inventory report']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://libretranslate:5000/translate');
    expect(JSON.parse(init.body)).toEqual({
      q: ['Erro de pagamento', 'Relatório de estoque'],
      source: 'pt', target: 'en', format: 'text',
    });
  });

  it('fetch rejeitado → fallback do glossário para TODOS os títulos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const out = await translateTitles(['erro no webhook', 'relatório de estoque']);
    expect(out).toEqual(['error no webhook', 'report de inventory']);
  });

  it('resposta com formato inesperado → fallback do glossário', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: 'not-an-array' }),
    }));
    const out = await translateTitles(['erro no webhook']);
    expect(out).toEqual(['error no webhook']);
  });

  it('URL não configurada → glossário direto, sem fetch', async () => {
    config.libretranslateUrl = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await translateTitles(['erro no webhook']);
    expect(out).toEqual(['error no webhook']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('translateStrict', () => {
  beforeEach(() => {
    config.libretranslateUrl = 'http://libretranslate:5000';
  });
  afterEach(() => {
    config.libretranslateUrl = originalUrl;
    vi.unstubAllGlobals();
  });

  it('retorna [] para entrada vazia sem chamar fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await translateStrict([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sucesso: retorna o array traduzido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: ['Payment error'] }),
    }));
    expect(await translateStrict(['Erro de pagamento'])).toEqual(['Payment error']);
  });

  it('LANÇA em falha do fetch (sem fallback de glossário)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(translateStrict(['erro no webhook'])).rejects.toThrow();
  });

  it('LANÇA quando a URL não está configurada', async () => {
    config.libretranslateUrl = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(translateStrict(['x'])).rejects.toThrow(/LIBRETRANSLATE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
