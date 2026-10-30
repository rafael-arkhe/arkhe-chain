# Probe contextual v1

Hipótese: o deslocamento de uma região de cor/forma depende da ação e dos valores da paleta na vizinhança de oito direções do seu contorno. Não usa identificação semântica de sprite, obstáculo ou HUD; todas as regiões únicas são candidatas. Bordas são um token separado. Aprende contagens de deslocamento, exige suporte mínimo 2 e um único resultado por chave. Aceita deslocamento zero. Cliques permanecem sem suporte.

A implementação context_transition_probe.py é separada do probe histórico, da política e do gate nativo. Não modifica modelos existentes. O preditor exige suporte consistente para todas as regiões e rejeita identidades ambíguas, destinos fora do tabuleiro e sobreposições. Essa regra conservadora é uma mudança adicional à contextualização; a comparação não isola causalmente apenas o efeito da vizinhança.

## Controles

O controle positivo usa tabuleiro 10x10 com sprite e obstáculo de uma célula: direita avança até a coluna 6, diante do obstáculo na 7. Duas posições verticais de treino, repetindo cada contexto para suporte 2, e outra posição vertical de teste. Resultado: treino 16/16, teste 4/4; translação sem contexto emite zero nas mesmas quatro consultas.

Durante desenvolvimento, uma parede vertical inteira causou abstenção na posição nova: o contexto da própria parede mudava com a posição do sprite, e todas as regiões exigem suporte. Esse controle mais exigente não foi resolvido. O controle positivo final traduz a configuração local inteira (sprite e obstáculo), validando apenas a transferência espacial dessa configuração. Não demonstra generalização para obstáculos com geometrias novas.

Controle negativo: o mesmo frame e ação têm duas saídas por um modo oculto; a chave fica conflitante e o modelo abstém-se. Modelo vazio também reprova. Ausência de obstáculos, por si só, não seria controle negativo da suficiência do contexto.

## Avaliação

Mesmo conjunto histórico do probe original: quatro traces seed0 de 5000 ações, prefixo2500 e sufixo2500; RESET excluído, modelos separados por trace. Treino de regras exclui mudanças de nível/estado; métricas de treino incluem todas as consultas elegíveis, deixando explícita essa limitação. Modelos congelados e hashes comparados antes/depois; lookup e contexto avaliados separadamente em pares raw vistos/não vistos, conservando coordenadas de cliques na chave raw.

Gate histórico exato exige todas as consultas de treino respondidas e corretas. Reporta coverage, hit_rate, conditional_error e abstention_rate; zero abstenções não substitui acerto. Sem consultas ou abstenção total resulta FAIL. É uma escolha explícita mais estrita que limiares arbitrários 0,5/0,9. Não é teste de replay com reset e restauração do ambiente. Resultados futuros de modelos reprovados são diagnósticos, sem admissão nem alegação de capacidade.

64 testes passaram. Saída: D:/arkhe/output/arc3-context-probe-v1-20261027/.

## Correções ao anexo

A afirmação de que 83,07 versus100,00 seria comparação com o mesmo modelo-base volta a contradizer a fonte Tycho consultada anteriormente: a comparação controlada Opus4.8 obtém88,49 para delegação;100,00 refere-se às execuções GPT5.6Sol/Opus5. Não foi feita nova comparação bibliográfica neste probe.

2481 transições não garantem suporte para uma regra, e tamanho total não garante poder para detectar sinal. 134 chaves estacionárias não significam 134 sprites imóveis; são chaves região/ação com deslocamentos observados zero. Zero cobertura contextual não provaria dependência global: tracking, definição da vizinhança, suporte, ações não suportadas e conservadorismo podem explicar o resultado. Erro alto não prova adivinhação. Resultado positivo no mesmo jogo não comprova bissimulação nem generalização entre jogos. Execução local segue LEMMA; não se promove a THEOREM por ter sido executada. O número26 de testes era histórico; a suíte atual contém64.

Nenhuma ação nova no ambiente, submissão Kaggle ou promoção da política.

## Resultado real executado

Quatro traces concluídos, quatro gates de treino FAIL, 8687 consultas raw não vistas e zero previsões. Todos os hashes de modelos permaneceram iguais. Em ls20, as 4244 consultas não vistas são rejeitadas por identidades ambíguas (ou cena vazia, código de razão conjunto); em vc33, as 4443 são cliques sem suporte. Assim, o resultado não avalia a suficiência da ocupação: os bloqueios de representação e ação impedem a emissão antes disso. Não há erro condicional definido nem modelo admitido. A restrição de exigir todas as regiões únicas torna esta variante mais conservadora que a anterior. O próximo diagnóstico é separar a identidade da região candidata das regiões estáticas/contextuais, sem assumir que qualquer uma seja sprite ou obstáculo sem validação.
