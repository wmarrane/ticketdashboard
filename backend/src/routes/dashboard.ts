import { getClient } from '../clickhouse.js';

async function rows(query: string): Promise<unknown[]> {
  const rs = await getClient().query({ query, format: 'JSONEachRow' });
  return rs.json();
}

export async function queryGold() {
  const [bigNumbers] = await rows('SELECT * FROM tickets.gold_big_numbers');
  return {
    bigNumbers,
    statusDistribution: await rows('SELECT * FROM tickets.gold_status_distribution'),
    priorityDistribution: await rows('SELECT * FROM tickets.gold_priority_distribution'),
    priorityLevels: await rows('SELECT * FROM tickets.gold_priority_levels'),
    top5Financeiro: await rows('SELECT * FROM tickets.gold_top5_financeiro'),
    top5Estoque: await rows('SELECT * FROM tickets.gold_top5_estoque'),
  };
}

export async function listUploads() {
  return rows('SELECT * FROM tickets.load_history ORDER BY loaded_at DESC LIMIT 50');
}
