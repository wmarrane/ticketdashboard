import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('lê valores do ambiente com defaults', () => {
    const cfg = loadConfig({
      CLICKHOUSE_URL: 'http://clickhouse:8123',
      CLICKHOUSE_USER: 'wagner',
      CLICKHOUSE_PASSWORD: 'x',
      CLICKHOUSE_DATABASE: 'tickets',
      PORT: '3001',
      LIBRETRANSLATE_URL: 'http://libretranslate:5000',
    });
    expect(cfg.clickhouse.url).toBe('http://clickhouse:8123');
    expect(cfg.clickhouse.username).toBe('wagner');
    expect(cfg.port).toBe(3001);
    expect(cfg.libretranslateUrl).toBe('http://libretranslate:5000');
  });

  it('usa defaults quando variáveis ausentes', () => {
    const cfg = loadConfig({});
    expect(cfg.clickhouse.url).toBe('http://localhost:8123');
    expect(cfg.clickhouse.database).toBe('tickets');
    expect(cfg.port).toBe(3001);
    expect(cfg.libretranslateUrl).toBe('');
  });
});
