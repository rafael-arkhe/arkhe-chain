# Melhor candidato avaliado, vínculo de pai e progresso condicionado

Implementado formal/LaneIncumbent.tla como novo modelo abstrato, preservando LaneIsolation.tla. Executado check_lane_incumbent.py: seis configurações, todas com resultado esperado na rodada final. Nenhuma chamada ao modelo, nenhuma alteração do loop DEV ou Rust nesta rodada.

## Correções ao patch do anexo

1. IncumbentIsBest deve quantificar apenas candidatos já avaliados e elegíveis, não Versions inteiro. No patch proposto, scores de versões futuras podem invalidar o invariante antes de qualquer avaliação dessas versões.
2. UpdateBest separado da avaliação permite estados em que há candidato avaliado melhor e o update ainda não ocorreu. O novo modelo incorpora avaliação e atualização do melhor atomicamente. Outra solução seria modelar explicitamente um estado pendente e restringir o invariante a pontos de seleção concluída.
3. RepairFromBest do anexo não usa best em nenhuma atualização além de guardá-lo; não registra o pai. O novo modelo grava parent[novaVersao]=best e verifica RepairUsesBest como propriedade de ação. Isso verifica metadados de proveniência no modelo, não que uma AST real foi uma edição semanticamente derivada do pai.
4. Best de score zero precisa ser selecionável quando não há incumbent. O modelo usa best=0 para ausência, mas seleciona o primeiro candidato tipado mesmo com score0. Desempates preservam o anterior. O Python desempata também por tamanho/hash; não alegamos refinamento exato desse ranking.
5. Adicionar UNCHANGED repairReads a NewVersion no módulo original não seria cosmético: em Repair, NewVersion se conjuga com repairReads'=repairReads ∪ {dev}. No primeiro reparo isso entraria em contradição e desabilitaria a ação. A relação parcial original é intencional e foi preservada.
6. Não ser falsificado pelos dois mutantes originais não significa que um invariante seja vacuamente verdadeiro. A testemunha positiva anterior já alcançava admissão e efeito. Sensibilidade a falhas distintas e não-vacuidade são verificações diferentes; acrescentamos mutantes específicos sem reinterpretar os anteriores.
7. Uma versão boa existir na tabela não implica ser gerada, avaliada, selecionada e admitida. Seleção por score DEV pode inclusive preferir uma versão que falha em H. Fairness não inventa uma versão boa nem corrige seleção inadequada.

## Modelo novo

Tipagem, scores0..2 e veredictos hold são tabelas finitas fixadas em Init, não avaliadores implementados. evaluated registra avaliações concluídas. Eligible contém somente avaliados tipados; best/bestScore retêm o máximo observado. NewVersion registra pai e reinicia o estágio DEV. Promote congela o best com score máximo2; Admit consulta Good(frozen), que inclui tipagem, score máximo e hold verdadeiro.

gateVer representa a versão ativa em produção; frozen é o candidato congelado em avaliação. Produção pode continuar com o último gateVer admitido enquanto ver evolui em DEV. Isso elimina a suspensão incidental do modelo original. effects continua sendo conjunto histórico, não contador de ações.

IncumbentIsBest garante máximo DEV entre elegíveis. Não garante melhoria estrita: scores podem permanecer0, e nenhum candidato pode alcançar2. A escolha DEV não usa hold; isso é estrutura das ações, não prova de não interferência contra todos os canais de informação.

## Safety, controles e liveness

Caso correto: MaxVer2, Fault0,144estados iniciais,1286gerados,1000distintos, profundidade9. Invariantes TypeOK, IncumbentIsBest, Isolation, AdmissionSound, AdmissionBinding e EffectsAreVerified verificados. Propriedades AdmitOnlyViaGate, RepairUsesBest e FinalBestEventuallyAdmitted explicitamente incluídas no cfg.

|Config|Mutação/hipótese|Resultado TLC|
|---|---|---|
|safe|Fault0, fairness de Promote e Admit|Sem erro|
|admission|Insere versão não Good em admitted|AdmissionSound violado|
|binding|Entra ADMITTED sem gateVer vinculado|AdmissionBinding violado|
|shortcut|CANDIDATE → ADMITTED|AdmitOnlyViaGate violado|
|best|Substitui best por avaliado com score menor|IncumbentIsBest violado|
|nofair|Mesmo modelo correto sem fairness|FinalBestEventuallyAdmitted violado por stuttering|

Liveness escolhida: após todas as versões limitadas serem avaliadas, se o best final satisfizer todos os gates, então eventualmente gateVer=best. FairSpec adiciona WF(Promote) e WF(Admit). Não há promessa de gerar todas as versões, encontrar solução ou admitir uma versão só porque alguma Good existe em Init. Não adotamos []<>(stage=ADMITTED) sem essas hipóteses.

O wrapper de resultados inicialmente procurava a mensagem genérica de falha temporal no teste shortcut. TLC reporta especificamente 'Action property AdmitOnlyViaGate is violated'; a primeira execução foi marcada inesperada por esse erro do verificador de logs, não por ausência do contraexemplo. A rodada v2 corrigiu apenas a mensagem esperada, preservando o modelo e as propriedades, e confirmou os seis casos. Logs iniciais preservados.

## Escopo e evidências

Artefatos finais D:/arkhe/output/arc3-lane-incumbent-tlc-v2-20261027/report.json e logs; configs formal/LaneIncumbent-*.cfg. Java/TLC oficiais já fixados e conferidos na rodada anterior. Verificação finita local: LEMMA. Não prova parametrizada para todo MaxVer, ausência de bugs em Rust/Python, correção dos scores ou dos gates, imutabilidade real de artefatos, selagem real de holdout, nem progresso científico.

O Python já tinha best/ranking no turno anterior; a lacuna tratada agora é sua representação abstrata no novo modelo, não ausência de incumbent no runtime DEV. O artigo Zenodo sem DOI/URL continua não localizado; a expressão 'estratégia vencedora' não fundamenta uma garantia universal. Reter melhor candidato é a política modelada, cujo ganho empírico com o modelo local permanece não testado.
