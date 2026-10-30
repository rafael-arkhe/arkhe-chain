# Banco equilibrado: três escolhas corretas no DEV, probes congelados separados

27/10/2026. Executada nova condição exploratória, não ablação de um fator: quatro cores, quatro deslocamentos, identidade, nova ordem e IDs e detalhe explícito de mismatch disponível para reparo. Modelo north-mini-code-1.0:latest, seed0/temperature0, contexto8192, saída1024, timeout180s. Orçamento máximo4chamadas: clique2,direita1,esquerda1. Nenhuma mudança de parser/DSL/gate, nenhuma escrita de código pelo modelo.

## Banco e controles

Usadas cores2,5,8,9; cor7sugerida no anexo não é literal válido no backend atual. As quatro cores e os quatro movimentos são algoritmos manuais já tipados, com os mesmos limites anteriores. Banco compartilhado de9candidatos, ordem congelada após shuffle seed27102030. IDs B00..B08 identificam esta revisão e não devem ser confundidos com H00..H13da anterior.

Clique e direita usam os controles conhecidos anteriores. Esquerda usa sprite(3,3)→(2,3)e bloqueio pela borda emx0. Evita colocar um obstáculo à esquerda que seria detectado antes do sprite e mudaria o significado de 'primeiro objeto'. Cada tarefa tem exatamente um candidato com fit total no banco.

## Resultado real

|Controle|Escolha|Grades DEV exatas|Células exigidas corretas|Estacionários corretos|
|---|---|---:|---:|---:|
|Clique|B02, pinta cor5|3/3|2/2|1/1|
|Direita|B05, dx1,dy0|2/2|2/2|1/1|
|Esquerda|B06, dx-1,dy0|2/2|2/2|1/1|

Três chamadas completas, uma por controle, todas seleções válidas, tipadas e executadas. Todos chegaram a PROVISIONAL; ratification NOT_EVALUATED. O clique acertou de início, encerrando antes da segunda chamada. A condição de feedback explícito **não foi exercitada**, não pode explicar o acerto nem ser declarada eficaz. Orçamento não consumido não entra no denominador de falhas.

Por requests efetivamente feitos:6/6células exigidas,7/7grades inteiras e3/3estacionários. Globais e condicionais coincidem porque todas as chamadas executaram. Não são sete transições de ARC independentes, nem3jogos resolvidos. Algoritmos foram fornecidos nas descrições; não houve síntese livre ou aprendizagem de representação.

As escolhas estavam nas posições6,1e5da lista embaralhada. Isso não corresponde a repetir sempre o primeiro item nesses três requests, mas não mede um viés geral de posição. A escolha à esquerda mostra seleção distinta diante do controle invertido, não prova de qual pista foi usada: direção da ação, deslocamento observado ou ambos.

## Candidato antigo congelado: probes sem reparo

O H10selecionado na rodada anterior foi lido do report original e seu hash conferido, sem reconstruir/trocar sua AST. Foram definidos novos casos sintéticos antes destas novas gerações e mantidos fora dos prompts. São validação pós-hoc de um candidato já escolhido, não holdout selado, teste probabilístico independente ou admissão.

|Conjunto de probes do H10antigo|Grade exata|Escopo|
|---|---:|---|
|Família direita: sprite cor8em(12,14), objeto de duas células bloqueado pela borda, grade vazia|3/3|Extensões sintéticas da regra fornecida|
|Desafio NOOP em grade com objeto|0/1|A regra fixa move mesmo sem ação de movimento|

O desafio NOOP não contradiz a descrição do H10, que explicitamente ignora a ação. Contradiz uma interpretação mais ampla de que ele teria aprendido uma dinâmica action-conditioned. Não houve reparo/admissão baseado nesses probes; stage do registro anterior não foi alterado.

## Correções ao anexo

- O banco anterior tinha14candidatos compartilhados, com exatamente um vencedor por controle. Sob a hipótese artificial de sorteio uniforme sobre a lista completa, a chance seria1/14em ambos, com13distratores. Se a família correta já estivesse identificada e identidade excluída, seriam1/9e1/4. Incluindo identidade nos subconjuntos, seriam1/10e1/5. Não confundir esses universos e não assumir que o LLM amostra uniformemente.
- Igualar tamanhos de família não isola dificuldade. Comprimento, descrição, parâmetros, dados, posição e interface continuam diferentes. A nova condição também mudou IDs e ordem: não atribuímos o acerto do clique a 'menos distratores'.
- H10não é função constante da grade. Ele depende de objetos, posições, formas, limites e bloqueio; o deslocamento é que é fixo e independente da ação. A descrição sozinha não informa qual das quatro direções reproduz o treino. H06também tem parâmetro fixo, a cor. As diferenças de complexidade são hipóteses, não explicação demonstrada do contraste anterior.
- H03era o quarto candidato da lista completa anterior e não o primeiro. A repetição não demonstra preferência pelo primeiro item, ausência de leitura ou incapacidade. A escolha errada não permite inferir a estratégia interna.
- O request2antigo já continha expected[2,3]=5e predicted[2,3]=2 no contraexemplo compacto. A hipótese 'feedback não chegou ao prompt' foi verificada e não se aplica àquele request. O novo resumo escalar é outra apresentação possível, mas seu efeito não foi testado porque não houve retry nesta rodada.
- 'Não demonstrado' não equivale a 'refutado'. Não afirmamos incapacidade geral, ausência de entendimento ou causa única com essas amostras.

## Verificação e estado

163testes passaram, incluindo cores/contagens, unicidade de fit e derivação do detalhe de feedback exclusivamente de DEV. Recibo final confere os mesmos bancos nos três prompts, ausência dos probes nos prompts, schemas válidos, ramo de feedback vazio nas chamadas e contraexemplo do request2antigo. Uso reportado:1924tokens de entrada,27de saída,51,88segundos somados de walltime. Modelo descarregado e servidor iniciado pela tarefa encerrado.

Artefatos: D:/arkhe/output/arc3-balanced-selection-20261027/plan.json, report.json, summary.json, verification-receipt.json e pastas de requests/respostas/usage. Nenhum efeito em produção, ação ARC ou submissão Kaggle. Classificação LEMMA de seleção/fit nos controles fornecidos e probes sintéticos; causa do contraste entre rodadas e generalização fora do banco permanecem abertas.
