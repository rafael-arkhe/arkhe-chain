# LaneIsolation verificado no TLC; incumbent DEV implementado separadamente

27/10/2026. O módulo fornecido foi preservado em formal/LaneIsolation.tla, sem alterar suas ações. Executado TLC real1.7.4/TLC2.19 com Java21, um worker, jar oficial com SHA1 conferido no release e hashes locais no relatório. Adicionados configs e wrapper de testemunha. Não há integração/refinamento Rust, gate de produção novo, holdout real selado nem execução de LLM nesta rodada.

## Resultado formal limitado

|Caso|Parâmetros|Resultado esperado e observado|
|---|---|---|
|safe|MaxVer3, BuggyFALSE|512estados iniciais,8520gerados,5600distintos, profundidade13; nenhum erro nos seis invariantes e AdmitOnlyViaGate|
|leakexec|MaxVer2, BuggyTRUE|Isolation violado: Init → Propose → LeakExec; efeito sem admissão|
|leakholdout|MaxVer2, BuggyTRUE|HoldoutSealed violado: Init → LeakHoldout|
|witness|MaxVer1, BuggyFALSE|NoProdEffects, propositalmente falso, tem contraexemplo Init → Propose → Promote → Admit → ProdExec, com três veredictos verdadeiros|

TLC retorna0para safe e12para contraexemplos esperados. Controle positivo de alcançabilidade evita concluir isolamento apenas por inexistência de execução. Os controles negativos fornecidos exercitam especificamente Isolation/HoldoutSealed; não demonstram sensibilidade independente de cada outro invariante. Deadlock checking foi desativado explicitamente: o modelo permite stuttering e não está sendo usado para demonstrar progresso. Sem fairness/liveness de aprendizagem. A primeira invocação isolada do wrapper teve erro de resolução de módulo; a rodada v2 com cwd explícito concluiu os quatro casos, e o erro anterior não foi contado como contraexemplo.

Artefatos finais: D:/arkhe/output/arc3-lane-isolation-tlc-v2-20261027/report.json e logs. Rodada inicial dos três casos preservada em arc3-lane-isolation-tlc-20261027. Classificação local: LEMMA de model checking finito, não prova parametrizada para todo MaxVer nem theorem de implementação.

## O que o modelo não expressa

- verdict é escolhido em Init e assumido estável/verdadeiro. AdmissionSound verifica a ligação com esse oráculo, não a correção de um avaliador empírico ou do typechecker. A declaração 'desconhecido do pipeline' é comentário: o modelo não formaliza conhecimento ou observabilidade.
- repairReads registra leituras diretas. Não há estado de feedback, observações do veredicto, scheduler adaptativo ou caminho de informação da decisão para futuras versões. Admitir/rejeitar repetidamente pode informar seleção mesmo sem ler linhas de H. HoldoutSealed não é prova de não interferência.
- Dados T/H, sua disjunção, hashes dos conjuntos, scoring path congelado, no-edit control, limiares e orçamento de consultas não aparecem nas variáveis. Nenhum desses componentes fica verificado por esse módulo.
- ver/gateVer ligam rótulos numéricos, não bytes imutáveis de AST, dependências, scorer ou dataset. Não há mutação do conteúdo ou concorrência concretas. A ausência de TOCTOU no Rust não decorre do resultado.
- AdmitOnlyViaGate checa a entrada em ADMITTED, mas sozinho não identifica qual ação causou a transição. A propriedade mais forte depende do conjunto de ações Next.
- Há um único stage/ver. Propose após ADMITTED torna stage CANDIDATE e impede ProdExec do admitido anterior. Isso modela suspensão de produção enquanto DEV evolui; não duas lanes concorrentes com incumbent de produção independente.
- effects é conjunto histórico de versões, sem contagem/payload de efeitos ou validade após revogação. Não existe prova de isolamento de processo, filesystem ou permissões.

O texto natural 'nenhum artefato DEV é visível em PROD' contradiz a própria transferência autorizada do incumbent final. A fronteira deve permitir um artefato congelado identificado e proibir execução de provisórios, não vedar qualquer comunicação.

## Correção dos testes de não interferência propostos

'Permutar H' pode apenas reordenar a mesma amostra, um teste fraco; comparar seleções DEV com H substituído e mesma aleatoriedade/histórico é mais informativo, mas ainda não prova não interferência. No teste do scorer, o programa congelado precisa ficar fixo: se T muda e o programa selecionado muda, seu score em H pode legitimamente mudar. A igualdade de score sob permutação de T, sem fixar o candidato, não é um invariante correto. T com ordem temporal também não deve ser permutado indiscriminadamente.

## Incumbent DEV concreto

Novo dsl_incumbent_dev.run_dev(proposer, dev_episodes, max_attempts) recebe só o painel DEV. Encaminha explicitamente a melhor AST completa, score/hash e contraexemplos ao callback. Avalia todos os pares DEV, com reset de estado por episódio e inputs before reais; seleciona por grades inteiras exatas, desempata por menor AST e depois hash. Retém cópia do melhor candidato quando tentativa seguinte é rejeitada. Orçamento1..5, limite de request preservado. Painel vazio não promove. Usa o mesmo parser/typechecker/runtime, sem relaxar regras.

Não se chama reparo bem-sucedido de aprendizagem do modelo: a demonstração executada usa respostas MANUAL_FIXTURE_NOT_MODEL_SYNTHESIS. Identidade → AST manual correta do clique chega a PROVISIONAL com3/3pares DEV; ratification permanece NOT_EVALUATED e production_effects0. Fixture não é holdout, não é benchmark novo nem modelo descobrindo regras. O loop não tem API de H/PROD, mas Python no mesmo processo não é uma fronteira de segurança adversarial.

Relatório da fixture: D:/arkhe/output/arc3-incumbent-dev-fixture-20261027/report.json.147testes passaram, incluindo carregamento do incumbent/contraexemplo, retenção após rejeição e painel vazio. O loop anterior dsl_proposal_loop já acumulava previous_training_feedback com mismatches para chamadas posteriores: 'Arkhe não usa contraexemplos' e 'toda chamada é independente' eram incorretos. A lacuna concreta era não carregar/rankear explicitamente a melhor AST. As ablações recentes eram independentes por desenho experimental, não prova de ausência de reparo na interface original.

Nenhum gate de admissão com holdout foi integrado nesta rodada. O modelo TLA e o loop DEV não têm prova de refinamento entre si. O protótipo não implementa zero false ratification para candidatos reais; não existe caminho PROD nele. Não criamos scheduler noturno ou automação por causa de um paper citar decisões por noite.

## Literatura e classificação

TWIN: https://arxiv.org/abs/2608.14490 ; Memento3: https://arxiv.org/abs/2610.11794 . Resultados empíricos reportados por autores não são THEOREM de que incumbent ou um componente isolado sempre vence. Diferenças entre harnesses compostos não isolam automaticamente o papel de um único mecanismo. Replay histórico exato não garante transições futuras.

Fonte primária localizada do Goodhart shift: https://huggingface.co/datasets/thaki-AI/daily-paper-2026-08-29-goodhart-shift-self-evolving-harness/blob/main/main.tex . Especifica protocolo com holdout/scorer/controle/limiares, mas declara estudo metodológico sem novas medições longitudinais; resultado analítico depende de seu modelo de transferência/memorização. Não transforma um holdout em oráculo universal nem torna 'uma decisão por noite' requisito geral do Arkhe.

O artigo Zenodo e a frase sobre incumbent 'close to settled' não foram localizados pelas buscas feitas; os anexos não trazem URL, DOI, título completo ou autores. Essa atribuição permanece ECHO/não verificada, não refutada e não fundamento da implementação. Lifting permissivo→DSL permanece hipótese de engenharia não implementada; código livre não foi executado.

Sintaxe/schema, tipagem e comportamento são estágios diferentes. E1/E2 da rodada anterior eram schema-válidos e mal-tipados, não JSON inválido. Métricas continuam separadas: aceitação de schema60/60, tipagem15/60, acurácia semântica condicional0/30células exigidas executadas e ITT0/120no total naquela rodada. Testes locais e controles positivos sustentam esses escopos, não 'verificador universalmente sólido'.
