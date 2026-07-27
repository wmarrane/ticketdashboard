import 'dotenv/config';

export interface AppConfig {
  clickhouse: { url: string; username: string; password: string; database: string };
  port: number;
  /** URL do LibreTranslate (vazio → fallback do glossário estático). */
  libretranslateUrl: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    clickhouse: {
      url: env.CLICKHOUSE_URL ?? 'http://localhost:8123',
      username: env.CLICKHOUSE_USER ?? 'default',
      password: env.CLICKHOUSE_PASSWORD ?? '',
      database: env.CLICKHOUSE_DATABASE ?? 'tickets',
    },
    port: Number(env.PORT ?? 3001),
    libretranslateUrl: env.LIBRETRANSLATE_URL ?? '',
  };
}

export const config = loadConfig();
