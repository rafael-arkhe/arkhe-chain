# Arkhe — NEAR Agent Market worker

Worker determinístico self-hosted Node 24, sem dependências novas. Reutiliza os
adapters compilados em `integrations/verify-mcp/dist` e o WASM real da raiz.
Não precisa de LLM, webhook, Vercel, porta pública ou acesso à carteira.

`LISTING.md` contém a tagline e a descrição para o painel do proprietário.
`examples/` contém briefs executáveis. O worker não edita/publica a listing.

## Preparar e verificar

Na raiz do workspace:

```powershell
pnpm --filter @arkhe/mcp-server build
node --test integrations/near-agent-market/tests/*.test.mjs
```

O WASM precisa existir em `verification/crates/arkhe-verify-wasm/pkg/`;
se necessário, use `pnpm verify:wasm`. Antes de trabalhar, o CLI valida
o digest BLAKE3 vazio no WASM real; falha de startup impede o consumo.

No Windows, guarde o token com DPAPI no perfil do usuário atual:

```powershell
$taskData = 'D:\arkhe\ops\local\near-agent-market'
New-Item -ItemType Directory -Force $taskData | Out-Null
$taskSecret = Read-Host 'Agent API token' -AsSecureString
[pscredential]::new('near-agent', $taskSecret) | Export-Clixml (Join-Path $taskData 'agent-token.xml')
powershell -NoProfile -File integrations/near-agent-market/run.ps1 -Check
powershell -NoProfile -File integrations/near-agent-market/run.ps1
```

Para instalar e iniciar a tarefa de logon do usuário atual, sem elevação:

```powershell
powershell -NoProfile -File integrations/near-agent-market/install.ps1
Get-ScheduledTaskInfo -TaskName Arkhe-NEAR-Agent-Market
Get-Content ops/local/near-agent-market/status.json
```

O instalador fixa o caminho absoluto do Node em `host.json`. A tarefa inicia
oculta e usa `supervise.ps1`, com logs privados e retomada após falhas transitórias.
Para parar a tarefa e seus processos descendentes, execute
`powershell -NoProfile -File integrations/near-agent-market/stop.ps1`.
Para desinstalar a tarefa, use `Unregister-ScheduledTask` com o mesmo nome.

O token fica cifrado para este usuário/Windows; não aparece nos logs. A pasta
`ops/local/` já está excluída do versionamento. Em outro host use a variável
`NEAR_MARKET_AGENT_TOKEN` com um secret manager e execute `node src/cli.mjs`.
O bearer só é enviado para `https://market.near.ai`, sem redirecionamentos.

`-Check` é somente leitura: verifica WASM e autenticação, conta contratações,
não inicia trabalho nem envia mensagens. `-Once` roda sem supervisor, mas o CLI
continua seu polling normal. Sem parâmetros, o launcher reinicia saídas não
permanentes após 60 segundos. Erros de credenciais/4xx permanentes encerram
com código 78 para intervenção do proprietário.

## Funcionamento

Polling de 30 segundos (backoff até 5 minutos), paginação antes de mutações,
`start`, processamento, `submit` com relatório Markdown inline. SQLite privado
persiste o resultado antes do submit para repetir os mesmos bytes após timeout.
Reenvios idênticos são idempotentes no marketplace. Mensagens de esclarecimento
usam `clientRequestId`. Rework/redo usa o SLA e os campos da entrega como nova
geração, inclusive após reiniciar. O lock impede dois CLIs no mesmo diretório.

Somente contratações diretas com JSON completo são processadas. Dados inválidos,
anexos sem JSON e pedidos fora de escopo recebem esclarecimento, nunca uma
entrega fictícia. Não há auto-bids, entrada em competição, movimentação de fundos,
download de URLs ou execução de instruções presentes no conteúdo do comprador.
Provas inválidas bem formadas são entregas legítimas com resultado negativo.
Não é fornecido atendimento geral por chat; respostas de rework precisam trazer
o JSON completo substituto. O worker não processa perguntas em trabalhos já
submetidos, apenas a fila `in_progress`.

Estado e logs locais: `ops/local/near-agent-market/status.json`, `state.sqlite`,
`worker.lock`, `stdout.log`, `stderr.log`. O estado SQLite contém os resultados
privados dos compradores; preserve-o ao migrar/reiniciar. Não execute instâncias
em hosts diferentes com o mesmo agente. Para parar, encerre o supervisor e
depois o PID do `status.json`; remova/desabilite também a tarefa de logon, se usada.
O host precisa permanecer ligado e conectado para cumprir o SLA. Não há prova
de operação 24/7 ou de um hire real até uma contratação efetiva ocorrer.

## Modo escolhido em 29/10/2026: self-hosted por polling

O consumidor ativo é este worker Windows, com polling a cada 30 segundos e
retomada no logon. Não exige Vercel, cron hospedado, chave NEAR AI, URL pública
ou webhook. No painel do proprietário, selecione Hosting > Self-hosted e deixe
o webhook desativado/sem URL para polling puro. Essa alteração depende da sessão
do proprietário; o token de agente não pode editar a listing. Não use o botão
Connect da Vercel para este modo. Os segredos de webhook guardados ficam inativos.

A correção desta data declara `start` antes da computação do verificador.
O script `stop.ps1` também trata descendentes que podem permanecer vivos depois
de parar a tarefa agendada. O estado SQLite e os segredos DPAPI são preservados
durante uma reinicialização do processo.

## Contrato consultado em 29/10/2026

- https://market.near.ai/llms.txt
- https://market.near.ai/openapi.json
- https://market.near.ai/skill/reference/agent-api.md
- https://market.near.ai/skill/flows/worker-lifecycle.md

Autenticação foi testada por GET, sem criar hires, bids ou gastos. O token de
agente não tem permissão para atualizar listing/preço/publicação. Configure no
painel a categoria Dev Tools, Self-hosted e o preço desejado. O texto distingue
digest/canonicalização, prova de inclusão e assinatura de prova de execução.
