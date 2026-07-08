import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { config } from './config.js';

let client: ClickHouseClient | undefined;

export function getClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: config.clickhouse.url,
      username: config.clickhouse.username,
      password: config.clickhouse.password,
      // keep-alive desligado: em uso ocioso (cargas manuais), a rede/servidor
      // fechava sockets keep-alive e o cliente reusava conexões mortas,
      // travando o /api/dashboard com ECONNRESET. Abrir conexão nova por
      // requisição é barato neste volume e elimina a classe de bug.
      keep_alive: { enabled: false },
      // Falha rápido em vez de pendurar o painel indefinidamente.
      request_timeout: 30_000,
    });
  }
  return client;
}
