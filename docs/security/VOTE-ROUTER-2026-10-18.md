# ReviewRouter por votos: candidato puro v0.1

Nota de versão: esta página registra a integração inicial por categorias. A versão atual usa IDs distintos e ordem estrita de resultados; veja [atualização de identidades](VOTE-ROUTER-IDENTITIES-2026-10-18.md).

O código enviado foi integrado em `integration/arkhe-bugbounty/src/review/votes.rs`, exportado como `arkhe_bugbounty::review::votes`. É um candidato puro e separado do ReviewRouter protegido existente. Não substitui a política ativa, não faz I/O e não recebe autoridade de execução. Não há conversão automática de seu ReviewDecision para o tipo admitido pelo kernel.

## Comportamento preservado

`route(assessment, votes, policy, source_budget_available)` retorna AutoAccept, ReviewRequired ou AutoReject e ecoa o digest de política. Assessment ausente ou confiança acima de 1000, orçamento indisponível e conflito encaminham para revisão. Aceite e rejeição automáticos dependem das flags explícitas correspondentes. High/Critical exigem confirmação de categoria não Model. Nenhuma confirmação implica revisão. Confiança é permilagem inteira, enquanto o router ativo usa basis points; não existe conversão implícita entre os dois.

A Severity existente foi reutilizada com ranking explícito Info→Critical. Sua ordem de declaração e seu formato serializado não foram alterados. O tipo Assessment desta API é próprio do módulo de votos, não substitui `ollama::Assessment`.

## Correções sobre o trecho recebido

1. Políticas com limiares fora de 0..1000 ou decrescentes por severidade são rejeitadas como PolicyInvalid. Sem a condição de monotonia dos limiares, P5 era falsa para políticas arbitrárias. Digest de política nulo também é rejeitado. O default desabilita ambas as ações e fica em revisão, sem gerar identidade de política fictícia.
2. Confirmações repetidas da mesma categoria não aumentam o quórum. Contam-se no máximo duas categorias: Deterministic e Replay. Não usamos IDs livres para simular independência. Um quórum maior que dois não é satisfeito e permanece em revisão. Duplicação não oculta conflitos.
3. O teste original amostrava confiança em passos de 50. O teste integrado percorre todos os 1001 valores inteiros, cinco severidades, nove combinações kind/outcome para cada um de dois votos e ambas as flags de aceite: 810810 casos-base. Verifica P2/P3/P4 e compara severidades superiores para P5. Isso é exaustivo nesse domínio delimitado, não sobre políticas arbitrárias, vetores de tamanho arbitrário, orçamento esgotado ou ausência de Assessment. Esses últimos comportamentos têm testes específicos.
4. Default explicitamente fechado, políticas inválidas, duplicação e invariância à ordem têm testes adicionais. A definição de strictness do trecho foi preservada: revisão e rejeição têm o mesmo nível. Isso não prova ordenação estrita entre os dois resultados.

## Limites de confiança e integração

Vote é uma afirmação do chamador. O enum Deterministic/Replay não comprova execução, independência entre implementações ou custódia, nem proveniência. O digest da política é ecoado; o módulo não resolve nem verifica ResolvedPolicyArtifact. Um adaptador futuro precisará verificar registros admitidos vinculados ao relatório, parâmetros, artefato e política antes de formar votos. Quantidade de categorias não é prova de independência real.

`source_budget_available` é um sinal de entrada, não contador durável, rate limit por tenant/protocolo ou proteção efetiva contra inundação. Relógio, janela de divulgação, reservas concorrentes e estado compartilhado não foram inventados nesta função pura.

O candidato admite recomendar AutoAccept de High/Critical com votos não Model e política explícita, como no código enviado. Isso não foi conectado ao fluxo ativo: High/Critical continuam exigindo revisão no ReviewRouter protegido. O kernel continua responsável pela admissão, proveniência, revisão e autorização. Não há PoC, Slither/Aderyn, RISC Zero ou zkpoex novo implementado, nem habilitação de escrita automática. Produção permanece não autorizada.

## Verificação

Comandos, logs e hashes de fonte em `docs/evidence/local/2026-10-18/vote-router/RESULTS.md`. Nenhuma inferência Ollama, chamada HackenProof ou modificação da fila histórica é necessária para qualificar esta função pura.

Resultado local: 100 testes do workspace passaram, incluindo os 810810 casos-base do teste de propriedades. Formatação e arquitetura passaram. Os três comandos registrados preservaram o hash de fonte antes/depois; hashes dos logs foram conferidos.
