# Arkhe — plano de validação de 90 dias

Estado: EM EXECUÇÃO para E01; demais frentes PROPOSTAS. Dias relativos ao início efetivamente acordado; sem presumir
ingresso em programa, parceria, cliente contratado ou data de Pitch Day.
Origem: texto fornecido em 19/10/2026. Responsáveis abaixo são papéis a designar.
Este plano não autoriza pagamentos, publicação, contato com terceiros ou mainnet.
Em 19/10/2026, o usuário autorizou continuar o ensaio e provisionou SOL de
devnet. O smoke foi finalizado; a matriz v1 parou com 74 finalizações em 75
tentativas emitidas de 90 planejadas. O deadline da tentativa 75 foi preservado,
com 15 não executadas; G30 continua parcial. Não há aprovação de parceiros,
mainnet ou execução de operações financeiras por esse avanço.

Atualização do E01 em 19/10/2026: após a v2 parar por erro de journal, a v3
concluiu 90/90 finalizações, conferidas por dois operadores RPC. O ensaio
separado de descarte local do primeiro envio também foi recuperado e conferido,
sem nova assinatura. As corridas anteriores permanecem no histórico. Essa
entrega fecha a matriz de ancoragem desse perfil sintético de devnet, mantendo
G30 global parcial: onboarding, browser, custos USD/mainnet e revisão em
ambiente limpo não foram concluídos. Não constitui validação de TEE ou AGI.

## Ponto de partida e decisões

Há verificação MMR via WASM/MCP e calibração histórica com testes sintéticos.
Não há aprovação completa de contenção, RSI geral demonstrado ou ingestão
histórica integrada ao host. Consultar `config/capability-status.json` e o backlog.
O caminho crítico é uma PoC estreita e reproduzível, não implementar toda a AGI.

O teste inicial usa dados sintéticos e devnet. Custo em USD, latência e adoção
são hipóteses, sem resultados presumidos. Taxas de devnet não comprovam custo
real de mainnet. Ancorar um compromisso não prova correção dos dados, autorização
da decisão ou conformidade legal. Um recebimento RPC não equivale a finalização.
TEE será uma trilha opcional com threat model próprio, sem bloquear o piloto.

## Cronograma e gates

| Dias | Entrega | Responsável | Critério de saída |
| --- | --- | --- | --- |
| 1–7 | Congelar protocolo do experimento E01, baseline e fixtures; escolher mecanismo de ancoragem | Engenharia/verificação | Manifesto com fontes, ferramentas, parâmetros, perfil MMR, máquina, seeds e controles negativos |
| 8–14 | Adaptador devnet e leitura independente da transação; ensaio pequeno | Engenharia/infra | Raiz publicada e recuperada byte a byte; rede errada e conteúdo adulterado rejeitados; nenhum segredo no relatório |
| 15–21 | Matriz 1k/5k/10k, benchmarks Rust/WASM e evidências | Verificação | Resultados por tentativa, falhas incluídas, controles e repetição independente |
| 22–30 | Teste de onboarding e revisão do gate G30 | Produto + verificação | Relatório E01; cinco participantes externos à implementação, ou recrutamento pendente explicitado |
| 31–40 | Selecionar parceiro e uma jornada sintética de admissão de proposta | Produto + engenharia | Escopo, responsável do parceiro, baseline e critérios de aceite acordados; sem parceiro, rotular demonstração interna |
| 41–50 | Ponte Intra/host/admissão/journal para essa jornada | Engenharia | Fluxos permitidos/negados, tenant/ator, replay, conflito de parâmetros e reinício testados |
| 51–60 | Execução assistida da PoC e revisão G60 | Parceiro + verificação | Aceite ou rejeição documentada com dados, limitações e incidentes; nenhum efeito financeiro real necessário |
| 61–70 | Carga de 100k eventos e recuperação operacional | Engenharia/infra | Latência, throughput, tamanho, plano de consultas, concorrência e restauração medidos |
| 71–80 | Entrevistas de preço/licença e propostas comerciais | Produto/comercial + responsável jurídico | Evidência de entrevistas e decisões, sem alterar licenças existentes por inferência |
| 81–90 | Replicação independente e pacote de demonstração G90 | Verificação + produto | Demo reproduzível, métricas rastreáveis e LOI/contrato somente se efetivamente assinado |

Cadência: revisão semanal de hipóteses e bloqueios; demonstração quinzenal;
gate mensal com decisão PROSSEGUIR, AJUSTAR ou INTERROMPER. O responsável pela
avaliação não deve ser o único autor da implementação. Sem equipe suficiente,
registrar a ausência de independência em vez de anunciá-la.

## Hipóteses, amostras e critérios

| ID | Experimento | Critério proposto, a congelar antes da coleta |
| --- | --- | --- |
| H01 | Ancoragem em lote | 30 tentativas por tamanho 1k/5k/10k; 100% das transações marcadas finalizadas devem corresponder ao compromisso esperado; reportar taxa de sucesso e p50/p95 separadamente |
| H02 | Custo | Hipótese < USD 0,01/lote; medir taxas em lamports e SOL, conversão com fonte/data e custos RPC/infra separados; resultado econômico mainnet permanece NÃO AVALIADO sem medição apropriada |
| H03 | Verificador local | 100 provas por tamanho, positivas e adulteradas, Rust/WASM concordantes; p95 < 50 ms como alvo, com inicialização fria separada e verificação de ausência de rede no caminho de verificação |
| H04 | Onboarding | Cinco pessoas sem assistência; pelo menos quatro concluem instalação + verificação correta em até 15 minutos; registrar desistências e intervenções |
| H05 | Gate do piloto | Todos os casos negativos pré-registrados negados, positivos admitidos, sem duplicação de efeitos em retries/reinício; ausência de efeito externo não deve ser confundida com execução autorizada |
| H06 | Valor para o parceiro | Comparar a mesma tarefa manual/assistida; tempo, erros e revisão humana registrados. Com um parceiro, conclusões permanecem estudo de caso |
| H07 | Escala SQL | Medir 1k/10k/100k eventos com queries e índices fixados; comparar p95 e planos EXPLAIN. Não deduzir complexidade O(log n) de uma medição finita |
| H08 | Preço/licença | Cinco entrevistas com compradores-alvo; registrar faixa aceita, objeções e orçamento. USD 100–500/2.000+, 10% e R$ 120 mil são hipóteses comerciais, não ofertas aprovadas |

A amostra de cinco pessoas é exploratória, não demonstra adoção ampla. Não mudar
limiares após ver resultados sem criar nova versão do protocolo. Métricas de
tempo de venda só podem ser comparadas com baseline e janela observável; LOI
não é receita e interesse declarado não é disposição a pagar comprovada.

## Primeiro experimento E01 — ancoragem de raiz MMR

### Escopo

Demonstrar que um compromisso do perfil MMR existente pode ser publicado e
recuperado em devnet e usado como raiz de referência na verificação local.
O mecanismo de transporte (por exemplo payload de transação ou conta dedicada)
deve ser escolhido e documentado antes do build; nenhum programa é implantado
por este documento. Confirmar APIs e limites na documentação oficial ao implementar.

### Protocolo

1. Congelar fontes, lockfiles, versões Rust/WASM/cliente/RPC, hardware/SO,
   relógio monotônico, endpoint e identidade do cluster. Registrar versão e
   digest do perfil de `verification/docs/MMR-PROFILE.md`.
2. Gerar bytes sintéticos determinísticos com seed pública para lotes de 1.000,
   5.000 e 10.000 folhas. Preservar dataset, contagem de folhas, raiz e provas.
   Não inserir documentos de clientes, PII ou credenciais na cadeia.
3. Recomputar raiz e provas no verificador local. Alterar folha, caminho, raiz
   e contagem em controles negativos. Uma prova de inclusão isolada não
   autentica a origem do checkpoint.
4. Construir compromisso versionado com identificador Arkhe, versão do payload,
   identidade do cluster, identificador único do ensaio/lote, ProfileRef,
   leaf_count e raiz. Congelar encoding e bytes antes de assinar. Manifesto
   externo vincula o digest desses bytes ao dataset e às provas preservadas.
5. Simular e enviar usando carteira descartável exclusiva de devnet, provisionada
   pelo operador. Não ler carteiras existentes nem exportar chaves. Manter seed
   secreta fora das evidências; identidade pública pode constar do manifesto.
6. Medir construção MMR, geração de prova, assinatura, envio, confirmação e
   observação de finalização separadamente. Registrar assinatura da transação,
   slot, commitment observado, horários, erros e taxas reais retornadas.
7. Recuperar a transação por um leitor separado do emissor; preferir outro
   endpoint e registrar se compartilha operador/infra. Comparar bytes, rede e
   identidade esperados. Discordância ou indisponibilidade produz FAIL/INCOMPLETE,
   nunca sucesso presumido. A confiança no RPC deve constar das limitações.
8. Executar 30 tentativas por tamanho, intercalando tamanhos com seed fixa.
   Definir timeout e retries antes da coleta; incluir tentativas falhas no
   denominador e contabilizar o custo de todas as tentativas.
9. Testar retries, resposta RPC ausente e blockhash expirado. Distinguir reenvio
   da mesma transação de criação de outra; reconciliar resultado on-chain antes
   de reemitir. Não alegar idempotência on-chain sem mecanismo que a imponha.
10. Repetir verificação offline em ambiente limpo. Publicar apenas relatório
    revisado e sem segredos; nenhuma publicação automática faz parte do ensaio.

### Evidência mínima e decisão G30

Pacote local: `manifest.json`, `attempts.jsonl`, `summary.json`, fixtures/provas,
payloads, respostas RPC expurgadas, logs, `REPORT.md` e `SHA256SUMS`. Cada tentativa
inclui run_id, tamanho, digest do dataset, raiz, bytes/digest do compromisso,
rede, assinatura/slot quando disponíveis, latências, custo, resultado e motivo.
Hashes preservam integridade; não substituem assinatura, proveniência ou auditoria.

G30 técnico: todas as verificações positivas corretas, negativas rejeitadas,
nenhuma divergência silenciosa, pelo menos uma finalização recuperada por tamanho
e relatório completo de todas as 90 tentativas. Relatar sucesso parcial e
distribuição de falhas mesmo que esse mínimo seja atingido. Os alvos de custo,
latência e onboarding recebem decisão própria; não são aprovados automaticamente
pelo sucesso da ancoragem. Sem execução, estado PLANNED/NOT_RUN.

## Piloto, TEE e demonstração final

Escolher uma decisão de proposta de crédito com dados sintéticos ou autorizados,
sem movimentação real. Definir ameaça, ator, tenant, política e rollback antes
de conectar a ponte nativa. Testar política ausente, evidência inválida, tentativa
entre tenants, parâmetros conflitantes, replay e falha entre journal/admissão.
Conformidade jurídica exige análise própria; testes do gate não a certificam.

TEE exige operador, orçamento, hardware e protocolo de atestação definidos.
Antes de incluir no pitch: demonstrar identidade/medição, binding do artefato,
freshness, política de liberação de chave e rejeição de atestação inválida.
Se isso faltar, marcar NÃO AVALIADO e demonstrar o piloto sem alegação de TEE.

G60 exige evidência de cliente real para chamar o resultado de PoC corporativa.
G90 exige separar métricas observadas, estimativas e trabalho futuro no deck.
LOIs, assinaturas, contatos e negociações dependem de pessoas autorizadas; este
plano prepara os materiais e não os realiza. Nenhum gate altera `runtime_verified`
ou transfere resultados para outro perfil, imagem ou runtime.
