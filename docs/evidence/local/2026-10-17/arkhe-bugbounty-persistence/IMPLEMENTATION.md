# Implementação e execução local — 2026-10-17

Status: IMPLEMENTATION CANDIDATE — NOT FROZEN.

- OperationId v2 exclui parâmetros. O journal compara parameters_digest e retorna
  ParameterMismatch para a mesma identidade com conteúdo diferente (mapeável a 409).
- O alvo é a identidade estável do relatório; o digest do conteúdo fica no contexto
  SourceReport e é vinculado à análise admitida pelo gate.
- PgOperations fornece journal durável com RLS, reserva confirmada antes do envio,
  token de proprietário e log operacional separado com expires_at de 30 dias.
- PgKernel exige WorkerVerifier explícito e grava WER canônico/envelope atomicamente
  no WormGraph. Os testes usam um verificador que fixa hashes de fixtures sintéticas.
- Migrações 09/10 são aditivas; as oito migrações anteriores foram preservadas.
- 19 testes do crate passaram com postgres-integration, incluindo oito testes reais
  de persistência. A suíte padrão do workspace passou; dois testes PostgreSQL legados
  permanecem ignorados nessa invocação padrão. Gates PostgreSQL foram executados
  separadamente num banco isolado, incluindo RLS/privilégios/transições do journal.
- Um probe em processos separados recuperou resposta/evidência depois de reinício
  real do contêiner PostgreSQL. Não foi apenas reconstrução de objetos em memória.
- B0 executado em Besu 26.7.1 com quatro validadores locais. O checkpoint contém
  quatro folhas persistidas de fixtures. WASM verificou a prova MMR e rejeitou
  alteração da folha. O contrato rejeitou conflito, regressão e chamador indevido.
  Endereço, transação e bloco estão em b0-result.json; prova em b0-checkpoint.json.
- Workflow dedicado configurado com PostgreSQL, restart, gate de versão Besu,
  ancoragem e verificação WASM. Não foi executado remotamente nesta rodada.

Operações PREPARED/DISPATCHED sem resposta exigem reconciliação; não há takeover
por expiração de lease nem promessa de exactly-once upstream. A limpeza TTL precisa
de manutenção de deployment. O adaptador HackenProof autenticado, o analyzer real e
o verificador de proveniência de produção permanecem pendentes. B1–B4, C2PA e gates
de deployment não são promovidos por estes resultados locais.

Os quatro validadores foram parados após o teste, preservando seu volume. O banco
local de teste foi devolvido ao estado parado em que estava no início da tarefa.
Falhas anteriores de teste permanecem no histórico results.json; RESULTS.md aponta
para a última execução por gate. Não há Git checkout neste diretório para publicar
uma revisão ou disparar CI remoto a partir daqui.
