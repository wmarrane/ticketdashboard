#!/usr/bin/env bash
# Copia as tabelas da VM 192.168.56.127 (ClickHouse aposentado) para o
# ClickHouse local do Compose. Uso único, mas reexecutável: cada tabela é
# truncada antes da cópia. Requer a VM no ar e o schema local já criado.
#
#   VM_PASSWORD='senha-da-vm' ./scripts/migrate-from-vm.sh
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a

VM_HOST="${VM_HOST:-192.168.56.127}"
VM_PORT="${VM_PORT:-9000}"
VM_USER="${VM_USER:-wagner}"
VM_PASSWORD="${VM_PASSWORD:?defina VM_PASSWORD com a senha do ClickHouse da VM}"

# As views gold não são copiadas: são derivadas de silver_tickets.
# silver_tickets entra na lista porque, sem ela, o dashboard fica vazio
# até o próximo upload de planilha.
TABLES=(bronze_tickets_raw load_history silver_tickets title_translations ticket_overrides)

ch() {
  docker compose exec -T clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" "$@"
}

remote_expr() {
  echo "remote('${VM_HOST}:${VM_PORT}', tickets.$1, '${VM_USER}', '${VM_PASSWORD}')"
}

# Lista de colunas da tabela LOCAL, na ordem do setup.sql.
#
# A cópia é feita por NOME, nunca com SELECT *. As tabelas da VM derivaram do
# setup.sql ao longo do tempo: silver_tickets e ticket_overrides têm as mesmas
# colunas em ordem diferente, porque fix_owner, priority_label_en e status
# foram acrescentadas depois com ALTER TABLE ADD COLUMN (que anexa no fim).
# SELECT * é posicional e tentaria inserir priority_label_en em loaded_at.
cols_of() {
  ch --query "SELECT arrayStringConcat(groupArray(name), ',') FROM (SELECT name FROM system.columns WHERE database='tickets' AND table='$1' ORDER BY position)"
}

for t in "${TABLES[@]}"; do
  cols=$(cols_of "$t")
  echo "[migrate] copiando ${t} ..."
  ch --query "TRUNCATE TABLE IF EXISTS tickets.${t}"
  ch --query "INSERT INTO tickets.${t} (${cols}) SELECT ${cols} FROM $(remote_expr "$t")"
done

echo
printf '%-22s %8s %8s  %s\n' TABELA VM LOCAL RESULTADO
divergiu=0
for t in "${TABLES[@]}"; do
  na_vm=$(ch --query "SELECT count() FROM $(remote_expr "$t")")
  local_=$(ch --query "SELECT count() FROM tickets.${t}")
  if [ "$na_vm" = "$local_" ]; then
    printf '%-22s %8s %8s  OK\n' "$t" "$na_vm" "$local_"
  else
    printf '%-22s %8s %8s  DIVERGIU\n' "$t" "$na_vm" "$local_"
    divergiu=1
  fi
done

exit "$divergiu"
