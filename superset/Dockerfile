FROM apache/superset:5.0.0

# O driver ClickHouse é instalado no build, e não por `docker exec` depois de
# subir: assim ele sobrevive a qualquer recriação do container.
#
# A tag é 5.x, não 4.x: os zips em superset/exports/ trazem campos que só o
# Superset 5 conhece (theme_uuid nos dashboards, folders e datetime_format nos
# datasets). No 4.1.4 o import falha na validação com "Unknown field".
#
# O venv é gerenciado por uv e não contém pip — daí o `uv pip --python`.
USER root
RUN uv pip install --python /app/.venv/bin/python clickhouse-connect
USER superset
