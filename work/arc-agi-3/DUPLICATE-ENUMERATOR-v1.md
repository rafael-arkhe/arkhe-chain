# Enumerador de consenso: implementação sintética

Implementado duplicate_region_enumerator.py. Recebe opções explícitas por índice da região; NÃO aprende opções dos traces. Essa separação permite testar enumeração/render sem confundir ambiguidades de treino com deltas supervisionados verdadeiros.

Orçamento padrão100000 atribuições completas do produto cartesiano, incluindo inválidas; ordem determinística. Predição somente após esgotar o produto e obter ao menos um candidato admissível com consenso de pixels. Dois resultados diferentes já bastam para abstenção, sem precisar esgotar; complete=false explicita essa interrupção. Atingir orçamento antes do fim gera SEARCH_INCOMPLETE. Reporta total cartesiano bruto, não suposto total admissível.

Todos os grupos participam de cada candidato. Colisões verificam todas as células; saída reconstrói fundo uniforme inferido e todas as regiões, sem persistência implícita. Zero regiões abstém. Bordas são tratadas por limites geométricos das células visíveis; não há oráculo que diga se uma região tocando a borda está clipada.

Canonicalização: JSON UTF8 com chaves ordenadas, separadores compactos e NaN proibido. Igualdade da observação inclui seu payload completo declarado, inclusive estado/progresso se presentes. Não agrupa animações; arquivos com espaços diferentes podem codificar a mesma observação. O helper de conflitos exige que o chamador forneça esse payload completo; não inventa metadados ausentes.

## Controles executados

11 testes: duplicatas estáticas com região móvel; alternativas distintas por região/contexto fornecidas explicitamente; permutações de identidade com render igual; renders divergentes; colisões globais de formas multicélulas; orçamento com prefixo concordante; cena vazia/sem suporte/fora dos limites; imobilidade que vira movimento e movimento que vira imobilidade; conflitos de treino incluindo metadados; consenso de um passo sem equivalência de dois; parâmetros inválidos e clique sem suporte.

O controle com contexto recebe deltas explícitos: não valida aprendizagem nem disambiguador contextual. O controle de dois passos é um contraexemplo construído; NÃO executa rollout. Retenção de hipóteses é implícita nas opções/constraints congeladas, sem escolher identidade; não há estado latente atualizado nem propagação multistep. Os cenários de modo oculto contam previsões divergentes da verdade como erro, em vez de prometer detecção de variáveis ausentes.

## Próxima dependência real

Falta implementar e validar o learner de hipóteses compatíveis com TODAS as correspondências ambíguas no treino. União de deltas por assinatura não pode transformar alternativas de matching em fatos observados independentes. Sem esse learner, aplicar opções artesanais aos traces seria mudar a pergunta e não testar aprendizagem. Nenhum trace real foi executado por este enumerador; os probes anteriores ficam intactos.

Gate permanece cobertura1/acerto1/conflitos0 com consultas não vazias. Concordância no conjunto de hipóteses é condicional à sua completude/correção, não garantia de verdade no ambiente. Não há promoção de política ou submissão Kaggle.
