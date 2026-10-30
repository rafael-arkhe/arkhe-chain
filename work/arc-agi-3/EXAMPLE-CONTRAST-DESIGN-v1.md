# E0/E1/E2 materializados, sem chamadas ao modelo

Atualização posterior: a rodada de60chamadas foi executada e está em EXAMPLE-PACKAGES-RESULT-v1.md. O texto abaixo preserva o estado do desenho antes da coleta.

27/10/2026. Implementado dsl_example_contrast.py. Gerados seis prompts finais compactados, três demonstrações completas com AST e recibos de replay, hashes de treino e cronograma randomizado em D:/arkhe/output/arc3-example-contrast-design-20261027/. Nenhuma geração nova, admissão, ação ARC ou submissão.

E0 reproduz exatamente o prompt atual com exemplos genéricos e feedback ausente. E1 substitui o pacote inteiro de exemplos, inclusive a identidade interna, pelas três demonstrações auxiliares. E2 usa as mesmas demonstrações/ASTs e acrescenta previsão identidade, indicação de acerto/erro e células que exigem mudança. Feedback permanece ausente nas três condições; treino alvo, modelo e limites são constantes. Trocar o pacote inclui quantidade/comprimento/framing: o contraste E0/E1 não é uma estimativa pura de 'especificidade'. E1/E2 também difere em comprimento do prompt, sem controle de comprimento.

## Demonstrações verificadas

1. Sprite cor8 em (40,40), ação esquerda, próxima posição (39,40); programa move o primeiro objeto uma célula à esquerda se não bloqueado.
2. Sprite cor8 em (0,40), ação esquerda, grade inalterada pela borda. Mesmo programa; identidade correta neste input.
3. Grade vazia, clique (48,45), pinta cor9; programa condicional CLICK e cor9, diferente da cor5 exigida no alvo.

Todas as ASTs passam parser/tipagem, limite24 nós e replay com combustível10000. Pares before/action não coincidem com nenhum par alvo. Cada programa fornecido falha no replay completo do controle alvo correspondente. São controles sintéticos, não outros levels reais. O movimento auxiliar é uma regra fixa à esquerda; não é um mapeador genérico de todas as ações.

A primeira versão do controle bloqueado colocava um obstáculo antes do sprite na ordem de descoberta de objetos. O replay detectou que o programa movia outro objeto; a demonstração foi corrigida para bloqueio pela borda antes de materializar os prompts finais. Nenhum exemplo inválido foi enviado a modelo.

Disjunção de coordenadas/pairs não implica ausência de transferência algorítmica: o leitor recebe quase toda a estrutura de um programa relacionado. Isto é um teste de adaptação em contexto com algoritmos auxiliares fornecidos, não descoberta independente sem regras. Não alegar 'sem leakage' de modo absoluto.

## Plano, não execução

Sessenta requests prospectivos: vinte por condição, dez por controle, dez blocos completos de seis combinações, embaralhados por seed27102027. Modelo north-mini-code-1.0:latest, seed0/temperature0, contexto8192, saída1024, timeout180s; schema atual e gate inalterados. Falhas não são substituídas, admissão desativada.

Primária: células exigidas corretas / células exigidas em todos os requests atribuídos. Secundárias globais: grade inteira exata e alvos estacionários corretos; cada falha/rejeição recebe zero nos denominadores aplicáveis. Diagnósticas condicionais separadas: tipo/schema, identidade empírica e hash; ausência de executáveis deixa a taxa condicional indefinida. Não premiar pintura indiscriminada apenas por acertar células exigidas.

Sucesso de E2 não prova necessidade de contraste nem identifica mecanismo interno. Falha de E1/E2 não localiza causa em capacidade ou representação: prompts, exemplos selecionados, orçamento e configuração continuam possibilidades. Vinte requests por condição não garantem independência. 'Mais informativo' é uma decisão de pesquisa, não LEMMA experimental. A execução permanece pendente; os prompts e o desenho estão concretos e verificáveis.
