#!/usr/bin/env python3
"""Adapta um zip de export do Superset para a versão que roda no Compose.

Os zips versionados em superset/exports/ foram gerados pela instância antiga
da VM 192.168.56.128, que rodava um build de desenvolvimento mais novo que a
última release publicada. Importá-los como estão falha em dois pontos:

1. `sqlalchemy_uri` traz a senha mascarada (`XXXXXXXXXX`) e o host da VM
   aposentada. O import valida a conexão antes de gravar e recusa.

2. O bundle carrega campos que a versão alvo não conhece, e o validador do
   Superset rejeita campo desconhecido em vez de ignorá-lo:
       theme_uuid           tema do dashboard
       folders              organização de datasets em pastas
       currency_code_column formatação monetária de coluna
       datetime_format      formato de exibição de coluna de data
       configuration_method forma de configuração da conexão
   Todos são metadados de apresentação: removê-los não afeta os dados, as
   queries nem os charts.

Este script gera uma cópia temporária corrigida. Os zips originais não são
modificados: continuam sendo o artefato versionado e portável, e voltarão a
importar sem adaptação quando a versão do Compose alcançar a de origem.

Uso: patch_export.py <origem.zip> <destino.zip>
"""
import os
import sys
import zipfile
from urllib.parse import quote

import yaml

# Removidos em qualquer profundidade do YAML.
UNKNOWN_FIELDS = {
    "theme_uuid",
    "folders",
    "currency_code_column",
    "datetime_format",
    "configuration_method",
}


def build_uri() -> str:
    user = quote(os.environ["CLICKHOUSE_USER"], safe="")
    password = quote(os.environ["CLICKHOUSE_PASSWORD"], safe="")
    database = os.environ["CLICKHOUSE_DATABASE"]
    return f"clickhousedb://{user}:{password}@clickhouse:8123/{database}"


def strip_unknown(node):
    """Remove recursivamente as chaves que a versão alvo não aceita."""
    if isinstance(node, dict):
        return {k: strip_unknown(v) for k, v in node.items() if k not in UNKNOWN_FIELDS}
    if isinstance(node, list):
        return [strip_unknown(item) for item in node]
    return node


def patch(src: str, dst: str) -> tuple[int, int]:
    uri = build_uri()
    uris_patched = 0
    files_cleaned = 0

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            name = item.filename

            # metadata.yaml define a versão do bundle e não passa pelo validador
            # de modelos — mexer nele só arriscaria quebrar a detecção de versão.
            if name.endswith(".yaml") and not name.endswith("metadata.yaml"):
                doc = yaml.safe_load(data.decode("utf-8"))

                if "/databases/" in name and isinstance(doc, dict):
                    doc["sqlalchemy_uri"] = uri
                    uris_patched += 1

                cleaned = strip_unknown(doc)
                if cleaned != doc:
                    files_cleaned += 1

                data = yaml.safe_dump(
                    cleaned, allow_unicode=True, sort_keys=False, default_flow_style=False
                ).encode("utf-8")

            zout.writestr(item, data)

    return uris_patched, files_cleaned


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)

    uris, cleaned = patch(sys.argv[1], sys.argv[2])
    if uris == 0:
        sys.exit(f"ERRO: nenhuma sqlalchemy_uri encontrada em {sys.argv[1]}")

    print(f"[patch] {os.path.basename(sys.argv[1])}: {uris} URI(s), {cleaned} arquivo(s) adaptados")
