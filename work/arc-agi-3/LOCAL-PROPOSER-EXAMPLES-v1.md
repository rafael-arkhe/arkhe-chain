# Condição de prompt com exemplos genéricos

Implementados dsl_prompt_examples.py e run_local_dsl_prompt_examples.py. Nova rodada declarada antes da geração, sem alterar parser, DSL, evidência de treino, codificação esparsa, modelo ou settings de geração. Modelo local existente north-mini-code-1.0:latest;2 tentativas por controle,4 totais;num_predict1024,num_ctx8192,temperature0,seed0,thinkfalse,format json. Modo json não é schemaJSON restritivo.

## Intervenção

Acrescentadas três ASTs genéricas verificadas por typechecker/parser: let de identidade, match_option de identidade e grid_set de canto constante(63,63) com cor0. Não são as soluções de clique/movimento, não contêm a ação específica de pintar célula clicada nem sua AST. Exemplos ensinam sintaxe; continuam informação adicional de desenho do prompt, sem transformar os controles conhecidos em avaliação cega.

Semântica translate/is_blocked, limites e contraexemplo já existiam. Não eram lacunas desta rodada. A ausência de prova de que um fator é a causa não o torna necessariamente variável confundida em toda ablação; é possível manter modelo fixo e testar só formato, ou vice-versa. A rodada escolheu os exemplos como uma intervenção de prompt.

## Resultado

129 testes passaram, dois novos: os exemplos passam pelo parser estrito e a intervenção preserva evidência/feedback originais. Foram4 gerações reais,4 respostas completas, todas rejeitadas por NODE_FIELDS antes de replay. Erros observados: variáveis sem args obrigatório, let sem nome de binder, aridade/estrutura incompleta. Nenhuma proposta foi corrigida manualmente.

|Condição|Requests|Respostas completas|ASTs aceitas|Replay executado|
|---|---:|---:|---:|---:|
|Anterior: exemplo genérico único|4|3 (+1erro operacional)|0|0|
|Nova: +3exemplos genéricos|4|4|0|0|

Não houve melhora observada na aceitação sintática sob este desenho. Não se conclui que exemplos nunca ajudem, que o modelo seja incapaz ou que o formato seja a única causa. A comparação é histórica/descritiva; não foi ablação estatística com seeds e múltiplas repetições. As respostas correspondentes nos dois controles são iguais nesta rodada, logo não tratar4 respostas como quatro evidências independentes de um efeito.

Usage reportado:6000tokens de entrada,276de saída;98,82s somados nas gerações. Carregamento separado:31,69s,sem prompt de inferência. Não são métricas de custoCPU ou uma comparação de velocidade justa com a rodada anterior, que incluiu falha operacional de carregamento. Sem estimativa monetária para computação local.

Modelo descarregado e servidor criado para a tarefa encerrado. Prompts enviados, respostas brutas, metadados e hashes preservados em D:/arkhe/output/arc3-local-proposer-examples-20261027/.

## Limites e próximos testes possíveis

Inferência não obteve candidato executável; o comportamento de transição continua não testado por propostas reais. Escolher um modelo maior diferente também muda arquitetura/treinamento/tokenizador; não isola tamanho por si só. Python livre altera linguagem, expressividade, conhecimento prévio do modelo, custo e execução; não é apenas mudança de serialização.

Uma próxima condição pode manter este prompt/modelo e usar JSONSchema real para estrutura, explicitando quais restrições são feitas pelo decoder e quais continuam no typechecker. Mesmo JSONSchema válido não prova tipos, combustível ou replay. O gate atual não foi relaxado e o orçamento desta rodada terminou sem tentativas extras.

Não é necessário mudar primitiva de goal ou executar traces reais enquanto a interface não produz AST válida nos controles escolhidos. Nenhuma ação ARC, WER nativo novo, política alterada ou submissão Kaggle.
