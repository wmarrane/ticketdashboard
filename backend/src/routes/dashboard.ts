import { getClient } from '../clickhouse.js';

async function rows(query: string): Promise<unknown[]> {
  const rs = await getClient().query({ query, format: 'JSONEachRow' });
  return rs.json();
}

export async function queryGold() {
  const [
    bigNumbersRows, statusDistribution, priorityDistribution,
    priorityLevels, top5Financeiro, top5Estoque,
  ] = await Promise.all([
    rows('SELECT * FROM tickets.gold_big_numbers'),
    rows('SELECT * FROM tickets.gold_status_distribution'),
    rows('SELECT * FROM tickets.gold_priority_distribution'),
    rows('SELECT * FROM tickets.gold_priority_levels'),
    rows('SELECT * FROM tickets.gold_top5_financeiro'),
    rows('SELECT * FROM tickets.gold_top5_estoque'),
  ]);
  return {
    bigNumbers: bigNumbersRows[0],
    statusDistribution,
    priorityDistribution,
    priorityLevels,
    top5Financeiro,
    top5Estoque,
  };
}

export async function listUploads() {
  return rows('SELECT * FROM tickets.load_history ORDER BY loaded_at DESC LIMIT 50');
}
