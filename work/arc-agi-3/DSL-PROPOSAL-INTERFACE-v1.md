# Interface de propostas e reparo pelo treino

Implementado dsl_proposal_loop.py. Interface genérica proposer(request_string)->response_string; nenhum cliente de provedor/LLM foi configurado ou chamado. O módulo conecta proposta externa a parsing estrito, typechecker, interpretador e replay one-step teacher-forced com memória resetada por episódio. Não muda o DSL nem executa Python gerado.

Prompt gerado a partir das assinaturas/literais atuais, formato AST, semântica declarada, orçamento e episódios de TREINO fornecidos pelo chamador. Não enumera40 primitivas de uma prosa desatualizada. Inclui esquema de nós/binders e contrato de saída; não inclui as ASTs de solução dos controles. Conteúdo de treino não é interpretado como instrução operacional do executor. Callback/provedor ainda deve implementar sua própria disciplina de isolamento e budget de tokens.

## Limites de interface

Até5 propostas, request262144bytes, response65536bytes, AST24nós, combustível10000por execute. Não são budgets em tokens nem previsão de preço. JSON estrito: sem fences, sem NaN, sem chaves duplicadas, envelope apenas uses_memory/ast e campos de nó conhecidos. Verifica nomes curtos, tipos, aridade, domínio de literais e limite de nós antes do replay. Erro de proposer ou execução inesperado é RUN_INCOMPLETE, não evidência contra uma família científica.

Reparo recebe erro de parser/tipo ou primeiro contraexemplo de treino. A cada episódio o state começa{}. Só passa treino se TODAS as consultas respondem exatamente. Congela digest da proposta após sucesso; não ratifica automaticamente. Sufixo, modelos de meta, game source e holdout não são parâmetros dessa interface. A separação de dados depende também de o chamador fornecer apenas treino; o código não certifica a origem das entradas.

## Controle de integração executado

Respostas de fixture conhecidas: identidade e depois AST manual do clique. Primeira falha no treino; o segundo request contém o contraexemplo e a segunda proposta passa. Isso testa o caminho de feedback, não se o callback inventou ou aprendeu a proposta. Resultado marcado FIXTURE_HAND_AUTHORED_KNOWN_CONTROL_NOT_LLM_SYNTHESIS; zero chamadas remotas. 125 testes passaram, quatro novos cobrindo reparo, JSON estrito, orçamento e falha operacional de provider. Nenhum score de LLM ou taxa de síntese foi medido.

## Precisões ao anexo

Os sistemas citados exemplificam LLMs com verificação; a lista não demonstra que nenhum sistema bem-sucedido usa enumeração pura. O documento GP250 também descreve enumeração primeiro e mutador LLM por evento de limite da gramática. Ele não deve ser apresentado como score ARC validado equivalente aos artigos.

A busca local terminou sob limites de perfil e geração. Não prova teto universal da enumeração em20nós, nem inevitável inferioridade perante LLM. Esta interface é uma alternativa experimental; a busca anterior permanece baseline.

Narcissus: https://arxiv.org/abs/2608.25657 sustenta a técnica de propostas como árvores e resultados40%/13% nos problemas ARC daquele experimento. Não transfere taxa, custo ou quantidade de chamadas para o Arkhe; sem chamadas durante busca não significa somente uma chamada inicial em qualquer configuração.

TWIN: https://arxiv.org/abs/2608.14490 sustenta coding-agent/world-model/replay, mas não implica uma única chamada ao modelo por tentativa. Grátis na métrica de ações não é orçamento computacional gratuito. Uma gramática restrita facilita validação sintática, mas não demonstra desempenho superior ou corretude do mundo.

Goal não surge por adicionar uma primitiva goal_reached. Exige uma hipótese/predicado separado e evidência de progresso/terminal, incluindo falsos positivos e negativos. Um sucesso em nível não valida o predicado em todos os estados. Não há módulo de goal implementado aqui.

## Estado pendente

Falta ligar um proposer real, fixar modelo/configuração/budget de chamadas/tokens e avaliar controles a partir de respostas realmente geradas. São controles conhecidos nesta conversa, portanto não seriam uma avaliação cega. Traces ARC, holdout, ratificação no kernel e ações de jogo permanecem fora desta execução. Não há assinatura ou ancoragem externa dos hashes do journal.

Relatórios: D:/arkhe/output/arc3-dsl-proposal-interface-20261027/fixture-report.json e prompt-contract-example.json.

## Adendo: adapter real implementado posteriormente

OllamaProposer foi ligado a um modelo local já instalado. Quatro chamadas reais,3respostas inválidas estruturalmente e1erro operacional; nenhum candidato chegou a replay. Ver LOCAL-PROPOSER-v1.md. A seção anterior sobre provider pendente descreve a rodada de fixtures, não o estado atual.
