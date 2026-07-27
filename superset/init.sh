#!/usr/bin/env bash
# Bootstrap one-shot do Superset: metastore, admin, dashboards e conexão.
# Roda como serviço `superset-init` do Compose, antes do `superset`.
set -euo pipefail

superset db upgrade

superset fab create-admin \
  --username "${SUPERSET_ADMIN_USER}" \
  --firstname Admin --lastname Superset \
  --email "${SUPERSET_ADMIN_EMAIL}" \
  --password "${SUPERSET_ADMIN_PASSWORD}" \
  || echo "[init] admin já existe, seguindo"

superset init

# Os zips versionados vieram de um build mais novo que a release do Compose:
# trazem a senha mascarada, o host da VM aposentada e campos que o validador
# da versão alvo recusa. patch_export.py gera uma cópia temporária adaptada;
# os originais ficam intactos.
#
# Import é a etapa frágil: falha aqui é NÃO-FATAL e cai no procedimento
# manual documentado em superset/README.md.
for zip in /exports/dashboard_tickets_pt.zip /exports/dashboard_tickets_en.zip; do
  patched="/tmp/$(basename "$zip")"
  if /app/.venv/bin/python /patch_export.py "$zip" "$patched" \
     && superset import-dashboards -p "$patched" -u "${SUPERSET_ADMIN_USER}"; then
    echo "[init] importado: $zip"
  else
    echo "[init] AVISO: falha ao importar $zip — importe manualmente (superset/README.md)"
  fi
  rm -f "$patched"
done

# Depois do import, nunca antes: os zips carregam dentro deles o host antigo
# 192.168.56.127 e nenhuma senha, e sobrescreveriam uma URI registrada antes.
superset set_database_uri \
  -d "ClickHouse Tickets" \
  -u "clickhousedb://${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}@clickhouse:8123/${CLICKHOUSE_DATABASE}" \
  || echo "[init] AVISO: não foi possível ajustar a URI da conexão"

echo "[init] concluído"
