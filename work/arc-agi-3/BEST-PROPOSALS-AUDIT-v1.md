# Best existente e cinco propostas verificadas

27/10/2026. O anexo recomenda criar um modelo de melhoria que já foi implementado e verificado em LaneIncumbent.tla. Para testar suas novas alegações, criado LaneIsolationWithBest.tla como fachada EXTENDS LaneIncumbent, sem duplicar estado, e LaneProposeGuard.tla sobre matrix-v3. Nenhuma alteração do runtime DEV/Rust e zero chamadas ao modelo.

## Resultados finais

|Teste|Escopo|Resultado TLC|
|---|---|---|
|BestIsAdmissible proposto|Modelo best, MaxVer2, Fault0|PASS|
|BestAlreadyAdmitted: best bom já pertence a admitted|Mesmo modelo|FALSIFIED: avaliação pode anteceder admissão|
|AlwaysLatestBest: best ausente ou igual a ver|Mesmo modelo|FALSIFIED: best1permanece ao gerar ver2|
|Existe Good ⇒ eventualmente alguma admissão|Mesmo modelo + fairness de geração e avaliação|FALSIFIED: empate DEV retém candidato que falha em H|
|Live2 com guard somente em Propose|Modelo original novo, MaxVer3, incluindo WF(Repair)|FALSIFIED: Repair ainda abandona a versão boa|

Os cinco resultados esperados foram confirmados; artefatos finais em D:/arkhe/output/arc3-best-proposals-tlc-v2-20261027/report.json e logs/configs explícitos. Verificação finita local, não teorema parametrizado ou prova de refinamento.

## O que cada resultado significa

**Guard incompleto.** Propose e Repair usam NewVersion. Guardar só Propose não impede Repair da versão2boa para versão3ruim. Além disso, um guard que lê todos os veredictos, inclusive hold, introduz um canal do holdout para decisões DEV. Não é um fix neutro para o protocolo de dados selados.

**Best não garante admissão.** No contraexemplo ambos os candidatos são tipados e têm scoreDEV2. Hold1é falso e hold2verdadeiro. Evaluate preserva o primeiro no empate, como a política declara. Ambas as versões são geradas/avaliadas sob fairness; Promote congela1e Admit não habilita. Uma versão boa existe, mas não é selecionada. Resolver isso escolhendo por H seria mudar a política e expor seleção ao holdout; não foi implementado.

**BestIsAdmissible não mede progresso.** Pela AdmissionSound do modelo correto, toda versão admitida tem score2; bestScore está entre0e2. Assim, se admitted é não vazio, alguma versão já admitida tem score>=bestScore. A segunda alternativa do predicado já basta, independentemente de o best atual ter sido promovido. O PASS não estabelece admissão eventual. A propriedade temporal condicionada existente FinalBestEventuallyAdmitted continua sendo a que mede esse progresso no modelo apropriado.

**Admissão imediata é forte demais.** Exigir best bom já admitido em todo estado rejeita estados legais entre avaliação, promoção e decisão de admissão. O contraexemplo não é bug do protocolo. Safety sobre vínculo de artefato e liveness condicionada são requisitos diferentes.

**Best pode ser antigo.** O resultado AlwaysLatestBest demonstra que o modelo não mantém obrigatoriamente a versão mais recente. O vínculo correto é gateVer=frozen quando o estágio está ADMITTED, e não gateVer=ver. O contador ver pode avançar em DEV enquanto a versão congelada/ativa é outra. Essa distinção já estava modelada em LaneIncumbent; a tabela proposta no anexo não a preservava.

## Configuração: erro encontrado e corrigido

A primeira execução do executor desta rodada pôs três predicados de estado em PROPERTY sem um operador temporal []. Isso verificava somente sua condição inicial e produziu PASS indevidos para dois testes que deveriam ter contraexemplos. O verificador de resultados marcou a rodada inesperada. Corrigida a configuração desses três casos para INVARIANT e repetidos os cinco testes na pasta v2; ambos os contraexemplos então apareceram. A rodada inicial foi preservada, não utilizada como evidência de validade em todos os estados.

## Correções restantes ao anexo

- UpdateBest/IncumbentIsBest copiados repetem os problemas anteriores: falta domínio de avaliados/elegíveis, estado de avaliação concluída, seleção inicial com score0 e registro de pai. LaneIncumbent já usa atualização atômica com Evaluate e parent[nova]=best.
- Scores de versões futuras em Init não devem entrar no máximo observado. Saber o máximo futuro é informação de oráculo, não política de busca.
- O modelo abstrato ainda recebe scores/hold/tipos por tabelas fixas; não verifica avaliadores, ASTs imutáveis ou não interferência de dados. Python tem desempate tamanho/hash e o TLA preserva empate anterior: não alegamos equivalência operacional exata.
- Kani pode verificar invariantes Rust locais independentemente de existir incumbent em Python ou de os modelos serem textualmente iguais. Priorizar o modelo de melhoria foi uma escolha de escopo, não prova de que qualquer verificação Kani atual examinaria componente errado. Nenhum harness Kani foi executado nesta rodada.
- A fonte ModelChecker.java já foi consultada na rodada -continue, com versão/linhas e evidência registrada. A alegação de que não foi verificada mistura novamente rodadas anteriores.
- TWIN e diferenças entre harnesses compostos não isolam automaticamente incumbent como mecanismo vencedor. A citação Zenodo permanece sem URL/DOI localizado. A decisão de reter best não depende de promover essa atribuição a THEOREM.

## Estado

Fachada LaneIsolationWithBest materializada sobre modelo best já existente; testes de propriedades novas concluídos, sem relaxar admissão. Nenhum ganho de síntese de modelo local foi demonstrado nesta rodada. Não substituir garantias condicionadas por 'best faz Live2 passar' ou por 'guard em Propose é suficiente'.
