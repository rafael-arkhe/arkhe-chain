# Identidades e monotonicidade do router por votos

Atualização de `integration/arkhe-bugbounty/src/review/votes.rs`. O router continua IMPLEMENTATION CANDIDATE, sem promoção a THEOREM ou habilitação de produção.

## Identidade distinta

Vote agora exige `verifier_id: [u8; 32]`. O quórum High/Critical conta IDs distintos com Confirmed e categoria não Model, usando BTreeSet sem estado de hash aleatório. Repetições do mesmo verificador não aumentam o quórum. Dois Replay com IDs diferentes podem satisfazer quórum dois; não há mais limite artificial de duas categorias.

ID nulo e uma identidade reivindicando categorias diferentes causam ReviewRequired/VerifierIdentityInvalid. Confirmação e refutação com a mesma identidade/categoria continuam sendo conflito e causam revisão. A ordem dos votos não altera a decisão.

Isso garante unicidade dos IDs fornecidos, não autenticidade ou independência física. Inventar dois hashes não é prova de dois verificadores. Antes de integrar votos à autoridade, o adaptador deve obter IDs de um registro aprovado e verificar a proveniência dos resultados admitidos, bindings ao relatório/operação/parâmetros/artefato e as condições de custódia/correlação da política. O módulo puro não faz essa validação e não renomeia IDs distintos como custódia independente.

## Ordem estrita de resultados

O teste usa AutoAccept=0, ReviewRequired=1, AutoReject=2. Os limiares permanecem limitados e não decrescentes. O caso do anexo Low/AutoReject → High/ReviewRequired não é executável na ordem de regras atual: R4 retorna AutoReject antes de R6, independentemente da severidade e da confiança. Foi acrescentado teste de regressão que mantém AutoReject para refutação não Model em todas as cinco severidades e nos 1001 valores válidos de confiança.

O teste de propriedades de 810810 casos-base agora usa a ordem estrita dos três resultados. Ele continua delimitado a dois votos com IDs fixados por categoria, política monotônica especificada, orçamento disponível e flags de aceite variáveis. Não se apresenta como prova formal de todo vetor/política possível. Duplicação, IDs diferentes da mesma categoria, IDs inválidos, conflito de identidade e permutação são cobertos por regressões separadas.

## Integração e autoridade

Não foi conectado um conjunto de IDs não autenticados ao executor. O router ativo, a API recommend_for_review, a fila durável local e os controles humanos existentes continuam separados do candidato por votos. ReviewDecision de votos não possui conversão de autorização. O fluxo protegido continua exigindo revisão para High/Critical.

O caso histórico origin-corrected já é o primeiro item da fila em `docs/evidence/local/2026-10-18/review-router/queue.json`; não foi reinserido, sobrescrito ou descrito como revisão humana concluída. A integração de votos autenticados ao TriageExecutor permanece pendente desse contrato de proveniência. source_budget_available continua sendo sinal do chamador, não rate limiter.

## Verificação

Suíte completa, formatação e arquitetura com registros em `docs/evidence/local/2026-10-18/vote-router-identities/RESULTS.md`. Não há nova inferência, chamada HackenProof, PoC, atestação TEE nem ratificação humana nesta rodada.

Resultado local: 102 testes do workspace passaram, incluindo 810810 casos-base sob ordem estrita e a regressão de refutação em 5005 combinações severidade/confiança. Formatação e arquitetura passaram. Os três comandos registrados mantiveram os hashes de fonte antes/depois; os hashes dos logs foram conferidos.
