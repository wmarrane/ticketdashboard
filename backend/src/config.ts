import 'dotenv/config';

export interface AppConfig {
  clickhouse: { url: string; username: string; password: string; database: string };
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    clickhouse: {
      url: env.CLICKHOUSE_URL ?? 'http://192.168.56.127:8123',
      username: env.CLICKHOUSE_USER ?? 'default',
      password: env.CLICKHOUSE_PASSWORD ?? '',
      database: env.CLICKHOUSE_DATABASE ?? 'tickets',
    },
    port: Number(env.PORT ?? 3001),
  };
}

export const config = loadConfig();
