# ReviewRouter e fila de revisão

## Implementação

`integration/arkhe-bugbounty/src/review.rs` separa roteamento de autorização.
`ReviewRouter::decide` combina sinais e retorna um `ReviewDecision` tipado:

| Prioridade | Sinal | Destino |
|---|---|---|
| 1 | Exceção de política | ReviewRequired |
| 2 | Irreversibilidade ou severidade Critical/High | ReviewRequired, qualquer confiança |
| 3 | Confiança ausente/inválida ou abaixo do limiar por severidade | ReviewRequired |
| 4 | Ambiguidade ou divergência textual presente/desconhecida | ReviewRequired |
| 5 | Rejeição explícita sem os riscos anteriores | AutoReject operacional |
| 6 | Suporte sem riscos, com configuração aprovada e modelo correspondente | AutoAccept, ainda sujeito ao kernel |

7500 para Medium e 6000 para Low/Info são valores candidatos ilustrativos, não
limiares calibrados, normas externas ou uma estimativa de custo esperado. Não há
garantia estatística de segurança nem desempenho de active learning. A confiança
é autorrelatada pelo modelo, não probabilidade calibrada. Nenhuma taxa ou ganho
percentual da pesquisa anexada foi assumido como resultado deste sistema.

**Padrão: automação desabilitada e todos os casos encaminhados para revisão.**
Ambiguidade e divergência desconhecidas não são tratadas como false. Não há
classificador automático de contradição textual nesta rodada: esses sinais vêm
do host/revisor e sua origem precisa ser avaliada. Relatórios não podem definir
a política ou conceder autoridade. Critical/High não têm caminho AutoAccept.

## Fluxo integrado

O novo `TriageExecutor::execute_triage_reviewed` faz preflight de relatório/escopo,
avalia a política, obtém análise e compõe os sinais. A confiança usada é a do WER
candidato, não um score alternativo fornecido ao método. Ollama preserva opiniões
negativas em `analyze_for_review` sem apresentá-las como suporte positivo; o
método legado `analyze` continua rejeitando propostas não sustentadas.

ReviewRequired grava um caso operacional e retorna `Error::ReviewRequired` antes
de reservar o despacho no journal. Retry de caso pendente reaproveita a análise
apenas se relatório, parâmetros e políticas permanecerem iguais, sem nova inferência.
Riscos já registrados não são removidos simplesmente por repetir o pedido.
Mudança de parâmetros gera conflito; mudança de snapshot/política exige nova revisão.
Caso sem análise válida é retido para investigação; ele não pode executar só por
ter sido enfileirado ou por receber um texto de aprovação.

AutoReject gera log, sem WER de execução ou escrita externa. AutoAccept apenas
prossegue para as verificações de admissão e governança: não autoriza a operação.

`ContainmentGate::authorize_routed_admitted` recebe ReviewDecision e exige,
quando necessário, `HumanReviewEvidence`. O HumanReviewRecord vincula solicitante,
operation_id, parâmetros, análise, política, decisão de roteamento, revisor,
aprovação e validade temporal. Um worker de verificação humana deve atestar esse
registro após verificar identidade, papel e aprovação reais. Sua atestação WER
precisa de assinatura de raiz autorizada e admissão independente; um JSON com
nome de revisor não é aprovação. O gate verifica módulo humano permitido, operação,
hashes, pai de análise, contexto, prazo e evidência admitida. A governança continua
sendo consultada: revisão humana não converte Deny em Allow.

Nenhuma raiz humana foi provisionada nem aprovação humana real criada. Os testes
de aprovação usam **fixtures sintéticas declaradas**, não assinaturas de uma pessoa.
O relógio e os sinais de impacto/exceção são inputs confiáveis do host, nunca do LLM.

## Ativação e compatibilidade

Use `ReviewProtectedPolicy<R>` ao configurar o gate do executor revisado. Ele
preserva a política base e rejeita o método legado de autorização sem roteamento.
O caminho `execute_triage` original permanece para compatibilidade e qualificações
históricas; não é o entry point da política protegida por revisão. Não se alteraram
silenciosamente perfis assinados ou registros históricos.

A configuração ReviewPolicy é fornecida pelo host; seu digest vincula a decisão.
`automation_approved=true` sozinho não ativa automação: o wrapper conservador
nega bypass automático e o gate exige aprovação independente de governança via
`PolicyResolver::automatic_review_approved`. Não foi instalado um resolver que
conceda essa aprovação. Implantar revisão exige usar o entry point e o wrapper
novos; esta mudança não declara que todos os chamadores legados migraram.

## Fila e prioridade

`FileReviewQueue` é armazenamento operacional local. Ordena por severidade,
confiança crescente (ausente/inválida conservadoramente primeiro), divergência e
ID estável. A prioridade é uma heurística determinística, não cálculo de KL,
valor esperado de informação ou classificação econômica dos erros.

Um lock criado com create_new exclui escritores concorrentes; gravação usa arquivo
temporário, sync do arquivo e rename. JSON inválido, lock existente, conflito de
snapshot e capacidade excedida falham fechados. Crash pode deixar lock e arquivo
temporário: investigar o proprietário e o estado antes de recuperação manual,
sem takeover automático. Não se atesta durabilidade contra perda de energia nem
sincronização de diretório, banco distribuído, ACL/criptografia ou trilha append-only.
O arquivo contém análises sensíveis e precisa de proteção pelo operador.

Após execução autorizada, a fila retém análise, evidência de revisão e hash da
execução, retirando o caso da lista de pendentes. O journal independente continua
impedindo repetição de escrita. Alterar a fila não produz evidência assinada nem
concede autorização; candidatos guardados continuam sujeitos à verificação.
Erros depois de reservar/despachar preservam a reconciliação conservadora existente.

```powershell
cargo run -p arkhe-bugbounty --bin review_queue -- seed-origin docs/evidence/local/2026-10-18/review-router/queue.json docs/evidence/local/2026-10-17/triage-evaluation/run-01
cargo run -p arkhe-bugbounty --bin review_queue -- list docs/evidence/local/2026-10-18/review-router/queue.json
```

O seed verifica os digests do relatório e dos parâmetros contra o stdout histórico.
`origin-corrected` entra como primeiro item, High, com a confiança histórica e
suspeita de divergência indicada pela auditoria do usuário. **Essa suspeita não é
um veredicto humano validado.** O seed não cria WER, aprovação, chave, assinatura,
calibração, novo rótulo ou inferência. Os artefatos históricos não são alterados.

## Feedback e limites

A rodada seguinte acrescenta métricas de carga e comparação somente em sombra;
ver [definições, denominadores e comandos](REVIEW-SHADOW-METRICS-2026-10-18.md).
Não confundir a fração observada de revisão com a ΓArea formal de SA-ROC.

`propose_threshold_update` gera somente proposta de governança conservadora,
vinculada ao digest da política e às referências dos feedbacks. Não valida a
proveniência deles nem os transforma em verdade por presença; o host deve exigir
evidência humana válida. Correções podem elevar limiares candidatos e desabilitam
automação na proposta. Casos sem correções não relaxam controles automaticamente.
Não há aprendizado online ou recalibração validada. Qualquer ativação/relaxamento
exige nova política aprovada e avaliação prospectiva, sem ajustar o holdout.

Produção e FROZEN continuam pendentes de chaves/custódia, política ratificada,
identidade humana, validação do runtime e contrato HackenProof real. Os perfis
existentes não foram declarados aprovados por este módulo. Run-02 continua
PRELIMINARY / NOT RATIFIED / NOT EXECUTED. Nenhuma revisão pode garantir detectar
comprometimento simultâneo de chaves ou provar integridade do daemon.

## Validação

As evidências desta rodada ficam em
`docs/evidence/local/2026-10-18/review-router/RESULTS.md`.
Execução observada: **79 testes passaram, zero falhas e zero ignorados**.
Seed e listagem da fila, formatação, arquitetura, fronteiras de autoridade e
build WebAssembly também passaram. A fila contém inicialmente um caso pendente:
origin-corrected, ReviewRequired, confiança histórica 10000, sem análise admitida
ou aprovação humana fornecida. Não houve nova inferência ou escrita HackenProof.
Testes cobrem regras por severidade/limiar, sinais desconhecidos, prioridade,
fila persistida/lock/conflito, feedback sem ativação, retomada com análise guardada,
conflito de parâmetros, remoção de pendentes concluídos, aprovação expirada ou
incompatível e bloqueio de AutoAccept sem governança/evidência.
