import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { config } from './config.js';

let client: ClickHouseClient | undefined;

export function getClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: config.clickhouse.url,
      username: config.clickhouse.username,
      password: config.clickhouse.password,
    });
  }
  return client;
}
