# Métrica sobre todas as chamadas e próximo desenho

Reanálise offline da rodada de quarenta requests. Nenhuma nova chamada ao modelo. Artefatos originais preservados; novos resultados em D:/arkhe/output/arc3-feedback-itt-plan-20261027/.

|Condição|Requests|Células exigidas, todos os requests|Corretas|Falhas operacionais/rejeições|
|---|---:|---:|---:|---:|
|A|10|20|0|4|
|B|10|20|0|0|
|C|10|20|0|4|
|D|10|20|0|0|

Score por chamada atribuída, análogo à intenção de tratar: 0/20 em cada condição, 0/80 no total. São oitenta oportunidades repetidas, não oitenta células distintas. As dezesseis oportunidades adicionais em relação às 64 anteriores pertencem a requests rejeitados/falhos e recebem zero por política de pontuação; não são dezesseis previsões executadas erradas. Não é um ensaio clínico e o desenho anterior não foi randomizado.

Denominadores condicionais não são ilegítimos quando identificados: descrevem comportamento entre programas executáveis. Porém não substituem a taxa global do pipeline e tornam comparação vulnerável a composição diferente dos controles. A tabela original já separava requests e executadas; esta reanálise explicita o desfecho primário sobre todas as chamadas.

## Limites das interpretações novas

Dez repetições de um programa alternativo sustentam concentração empírica de respostas em D. 'Mode collapse induzido por instrução', 'obedece à forma' e 'sem aprender semântica' não são mecanismos internos demonstrados. O efeito observado é ausência de correção dos alvos examinados, mesmo com alteração sintática. Nenhuma equivalência universal foi provada.

Vinte requests com seed fixa também podem repetir respostas; tamanho mínimo não transforma automaticamente o desenho em amostragem independente. Randomizar posição reduz confundimento sistemático por ordem; não elimina cache, estado do serviço, variação do backend ou outros efeitos temporais. Avaliar células exigidas sem grade inteira pode premiar programas que pintam indiscriminadamente: grade exata e alvos estacionários seguem como desfechos secundários obrigatórios e o gate permanece inalterado.

## Plano prospectivo produzido, não executado

randomized-feedback-plan.json contém oitenta posições, vinte por condição A-D, dez por controle. Dez blocos incluem cada combinação feedback/controle uma vez e são embaralhados por seed de randomização 27102026, distinta da seed0 do modelo. Mantém modelo/schema/exemplos/contexto/saída. Falhas não são substituídas. Nenhuma admissão. Limites por chamada iguais aos anteriores; orçamento total seria oitenta, não quarenta.

Esse estágio mede apenas o contraste de feedback. O plano também explicita estágios separados para exemplos e configuração, ainda sem execução nem contraste materializado. Exemplos específicos devem usar demonstrações disjuntas e declarar a informação adicional: entregar a AST da solução do próprio controle transformaria descoberta em cópia. Configuração deve variar um fator por vez; modelo, contexto e teto de saída não são um único tratamento. Nenhum resultado sobre esses fatores é alegado.

A especificação e a reanálise estão concluídas. A rodada de oitenta chamadas não foi executada nesta revisão. Um novo ciclo não é necessário para estabelecer os resultados negativos já observados e seu tamanho, por si só, não garante identificar a causa.
