# Prioridade de ancoragem, bloco independente e roteamento por operador

Estado: TESTED nos cenários locais descritos, IMPLEMENTATION CANDIDATE. Não se promove adequação ao bug bounty real a THEOREM. Nenhuma fonte externa foi pesquisada, nem citação de Enzyme/Frax/registries usada como premissa de implementação.

## Prioridade anterior à ordem de chamadas

A API pública PayoutJournal::pay agora exige AnchoredClaim e ClosedPriority. Não há mais entrada pública de payout sem prioridade. O antigo caminho de bookkeeping só é acessível internamente, com helper exclusivo de testes unitários históricos.

AnchorSource é uma dependência confiável de integração, sem implementação permissiva padrão. Ela deve verificar inclusão no log, compromisso/abertura e vínculo ao relatório e destinatário, timestamp/altura, elegibilidade e completude da lista no cutoff finalizado. Não pode tomar a palavra do pesquisador como verificação. Nos testes ela é uma fixture explicitamente sintética.

ClosedPriority::resolve exige snapshot finalizado e não vazio para o vulnerability_id exato, log não nulo, claims consistentes do mesmo log e timestamps não posteriores ao cutoff. Rejeita posições ou compromissos repetidos/ambíguos. Ordena por (anchored_at, log_position, commitment), sem depender da ordem do vetor, da RPC ou de quem chamou pay primeiro. O desempate assume uma posição total e autenticada em um único log; não define uma ordem global entre logs distintos.

pay recusa qualquer claim que não seja o vencedor exato e confere o destinatário. Alterar anchored_at no objeto recebido não altera o vencedor. O digest de parâmetros `ARKHE/PAYOUT-PARAMS/v3` agora inclui a identidade da prioridade fechada, além de vulnerabilidade, destinatário e valor. Mudar o snapshot/cutoff sob a mesma operação não é replay: retorna ParameterMismatch.

Por que um snapshot fechado: somente passar um anchored_at para pay não permite conhecer um relatório anterior ainda não apresentado. A política/adaptador deve definir uma janela de reivindicação e autenticar a lista completa de relatórios elegíveis até seu fechamento. Este módulo não cria essa completude nem uma janela de divulgação arbitrária. Se a fonte mentir/omitir participantes ou a política não estiver finalizada, a prioridade não está demonstrada; não se deve pagar. Não há rollback de pagamento para resolver uma corrida já liquidada.

## Origem do submission_block

ResolvedPocPolicy::evaluate_admitted agora exige AnchorSource e obtém o registro de ancoragem do digest exato do relatório. Confere log e compromisso não nulos, relatório, chain e igualdade da altura declarada com a altura verificada. Um bloco divergente é erro de binding mesmo quando o WER dessas medições foi admitido. O predicado final usa a altura obtida da fonte externa.

A verificação da fonte deve ligar a altura ao commit na chain correta ou a uma leitura independente autenticada. Timestamp de um log não determina sozinho altura de uma blockchain. No adaptador futuro, mapear tempo para bloco exige prova/consulta independente e finalização/reorg policy. Não se aceita uma altura fornecida pelo pesquisador por conveniência.

O evaluate_poc de baixo nível permanece um predicado sem I/O sobre valores recebidos; não é uma fronteira de confiança nem autorização. A entrada integrada evaluate_admitted é a que exige origem externa. Manter o campo declarado permite detectar divergência com o output assinado do harness; não o torna fonte de verdade.

## independent_operators ligado ao router candidato

Adicionado review::votes::route_with_registry, que recebe RegisteredVote com vote e signing_key_id. Cada voto deve corresponder à entrada válida/ativa/não revogada no nível mínimo. Voto desconhecido, chave errada, validade vencida ou nível insuficiente obriga revisão, sem fallback ao router bruto.

O resultado base continua vindo de route. Para AutoAccept em High/Critical, a função chama VerifierRegistry::independent_operators sobre confirmações não Model. Dois IDs ou duas chaves sob o mesmo operador não satisfazem quórum dois. Foi adicionada rejeição de key_id repetido em identidades diferentes do registry, para evitar contar a mesma chave sob operadores declarados diferentes.

Esta integração é de metadados do registry candidato, não verificação de assinatura. RegisteredVote é dado que o adaptador confiável deve construir somente depois de verificar recibos, proveniência, binding da execução à análise e a distribuição do registry. operator_id distinto não comprova independência de custódia real. Nenhum nível Hardware foi habilitado, conforme a infraestrutura indisponível informada pelo usuário.

A API pura route permanece para simulação sem registry; não possui conversão de autorização. O fluxo ativo protegido de triagem continua exigindo revisão High/Critical. A nova rota não relaxa esse gate nem executa alterações remotas.

## Hash, nonce, severidade e persistência

O SHA-256 manual já havia sido substituído por sha2 na integração anterior. Foi explicitado HASH_PROFILE=`ARKHE-BOUNTY-SHA256-LP-v1`: SHA-256 e framing de domínio/partes com comprimentos u64 big-endian, preservando os bytes de commit. Isso não altera as identidades BLAKE3 canônicas do Arkhe. Segurança de hiding depende do nonce externo secreto e imprevisível de 32 bytes; o módulo não infere entropia dos bytes recebidos.

PayoutJournal permanece simulação em memória, sem transferência ou persistência transacional de reserva/settlement, e sem garantia exactly-once remota. Canonicalização semântica de vulnerability_id, moeda/chain/tenant do payout, regulação e classificação de severidade do PoC continuam fora do candidato. Não foi adicionada severity fictícia nem inferida pelo ganho. O journal PostgreSQL da triagem existente não é apresentado como ledger de payout.

## Testes e limites executados

`tests/anchor_priority.rs` testa tentativa de pagar o segundo a ancorar, ordem inversa de requisições, desempate por posição, timestamp forjado, snapshot não finalizado/duplicado, mudança de prioridade em retry, vulnerabilidade divergente e roteamento com operadores repetidos/distintos, chave errada, expiração, nível insuficiente, revogação e chave reutilizada.

`tests/poc_policy.rs` testa submission_block forjado mesmo com WER admitido e o caso de uma altura real fora da janela sendo substituída por altura forjada dentro da janela. A divergência é rejeitada; usando a altura real, retorna ForkOutsideWindow.

As fontes de log, registry, governança e admissão nesses testes são fixtures locais. Sem log/chain/TEE reais, pagamento, PoC, inferência ou pesquisa nesta rodada. Registros e hashes: `docs/evidence/local/2026-10-18/anchor-priority-operator-routing/RESULTS.md`. Produção não autorizada.

Resultado local final: 123 testes do workspace passaram; formatação e arquitetura passaram. A primeira tentativa parou por import não utilizado no teste, foi corrigida e permanece no histórico. Os três resultados finais PASS preservaram o hash de fonte antes/depois; os hashes dos logs foram conferidos.
