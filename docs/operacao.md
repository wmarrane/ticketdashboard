# Guia de Operação

## 1. Exportar das fontes

O parser espera os cabeçalhos da planilha padrão (qualquer ordem; comparação sem distinção de maiúsculas): **ID Netsoft / Oracle**, **Status**, **Nome da Tarefa**, **Nome da Tarefa - ENG**, **Data de Vencimento**, **Responsável Cliente**, **Prioridade**, **Priority**, **Resumo**, **Provedor**. Colunas extras são ignoradas; apenas a primeira aba do arquivo é lida.

### Wrike
1. Abra o board/tabela dos tickets no Wrike.
2. Menu **⋯ → Export → Excel**.
3. Salve o `.xlsx` gerado.

### Microsoft Loop
1. Abra a tabela de tickets no Loop.
2. Selecione a tabela inteira e copie (Ctrl+C).
3. Cole em uma planilha Excel em branco, mantendo a primeira linha como cabeçalho.
4. Salve como `.xlsx` (ou `.csv`).

### Office 365
A planilha já vive no SharePoint/OneDrive da equipe: abra no Excel e salve uma cópia local em `.xlsx` (ou baixe direto). Não é necessário reformatar, desde que os cabeçalhos acima estejam presentes.

## 2. Fazer upload

1. Acesse **http://192.168.56.132** e abra a página **Upload**.
2. Selecione a **fonte** no seletor: Wrike, Loop ou Office 365. *(A fonte marca a origem dos dados na bronze e controla a deduplicação — selecione a fonte correta.)*
3. Selecione o **arquivo** (`.xlsx` ou `.csv`, máx. 20 MB) e clique em **Enviar**.
4. O resultado mostra linhas aceitas/rejeitadas; o histórico de cargas na mesma página é atualizado (data, fonte, arquivo, aceitas, rejeitadas, status).

A cada upload o backend grava a bronze (append-only) e reconstrói a silver usando **a última carga de cada fonte** — dashboard e Superset refletem imediatamente.

## 3. Interpretar linhas rejeitadas

Linhas rejeitadas **não entram no banco**. A tabela de rejeições mostra o número da linha na planilha (contando o cabeçalho como linha 1) e o motivo:

| Motivo | Significado | Correção |
|---|---|---|
| `ticket_id ausente` | Coluna "ID Netsoft / Oracle" vazia | Preencher o ID na planilha e reenviar |
| `status ausente` | Coluna "Status" vazia | Preencher o status e reenviar |

Linhas totalmente vazias são ignoradas silenciosamente (não contam como rejeição). Erros de requisição (fonte inválida, extensão não suportada, arquivo ausente) bloqueiam o upload inteiro e aparecem como mensagem de erro. Uma planilha **sem nenhuma linha válida** (só cabeçalho, ou todas as linhas rejeitadas) é recusada com HTTP 400 (`Planilha sem linhas válidas.`) **antes de qualquer escrita no banco** — os dados existentes da fonte não são apagados.

## 4. Ajustar regras de área (Financeiro/Estoque)

As regras estão em `config/area-rules.json` (versionado no repo):

- Cada área tem uma lista de palavras-chave, comparadas por **substring, sem distinção de maiúsculas**, contra o título da tarefa (`task_name`).
- **Financeiro é avaliado antes de Estoque**; sem correspondência, o ticket vai para `Outros`.

Para alterar:

1. Edite `config/area-rules.json` e commit.
2. **Rebuild e redeploy do backend** (o arquivo é embutido na imagem):
   ```bash
   # no servidor 192.168.56.132, raiz do repo atualizado
   docker compose up -d --build backend
   ```
3. **Reprocesse** (seção 5) para reclassificar os tickets já carregados — a área é calculada no rebuild da silver, não retroativamente.

## 5. Reprocessar

Não há botão de reprocessamento: a silver é reconstruída a cada upload. Para forçar um reprocessamento (ex.: após mudar as regras de área):

1. Reenvie **o último arquivo de cada fonte** que possua dados carregados (confira no histórico da página Upload qual foi o último arquivo por fonte).
2. Cada reenvio gera uma nova carga na bronze (nada é perdido) e dispara o rebuild da silver com as regras vigentes.

> Basta reenviar 1 arquivo se apenas uma fonte tem dados; a silver usa a última carga bem-sucedida **de cada fonte** existente no histórico.

## 6. Onde ver os resultados

- **Frontend:** http://192.168.56.132 — página Dashboard (toggle PT/EN no topo).
- **Superset:** http://192.168.56.128:8088 — dashboards "Acompanhamento de Tickets (PT)" e "Ticket Tracking (EN)". Basta recarregar; as views gold refletem a silver.
