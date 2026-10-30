# Run-02 — critérios prospectivos candidatos

Status: **PRELIMINARY / NOT RATIFIED / NOT EXECUTED**. Documento criado antes
de qualquer inferência no corpus externo, após conhecer run-01. Não é um registro
externo de pré-registro, timestamp independente, aprovação de produção ou
critério retroativo para aprovar run-01. Os números abaixo são escolhas propostas
para um piloto local, não limites derivados de norma ou tolerância operacional
aprovada. O responsável humano deve ratificar a versão final antes da execução.

## Unidade e condições de entrada

O alvo continua sendo suporte a uma proposta específica de severidade/Triaged
a partir de um relatório. Não chamar a métrica de detecção autônoma de código.
São necessárias pelo menos 20 fontes externas distintas, com alegações positivas
e negativas revisadas, pelo menos 10 de cada classe no conjunto total e pelo
menos 5 de cada no holdout. Se o tamanho ou composição não bastar, ampliar o
corpus antes da execução; não relaxar o critério após ver resultados.

O pacote inicial expandido contém 24 fontes SmartBugs Curated no commit
`230e649123477eff332742a59a1c7cc6dc286cab`, ainda sem rótulos humanos de proposta.
A divisão candidata agrupa URLs por repositório/site, com ordenação SHA-256
fixada em `REVIEW.json`: 18 fontes de desenvolvimento e 6 reservadas. Esta divisão
precisa de revisão de aliases, duplicatas, forks e variantes. Pares derivados,
controles corrigidos e fontes equivalentes pertencem ao mesmo grupo. Não são
24 negativos/positivos revisados nem um holdout já validado.

O revisor precisa registrar identidade humana real, papel `label_reviewer`, hashes
de `reviewed_artifacts`, data e justificativa. Bloquear inferências enquanto houver
rótulos, proveniência, severidades ou negativos sem revisão. A revisão de
`origin-corrected` é separada do holdout e não integra seu escore. Quem viu a
previsão anterior não pode declarar revisão cega. Nenhuma assinatura será criada
pelo assistente em nome do revisor. Esses controles são condições deste plano;
não há launcher run-02 implementado que os imponha automaticamente.

Retirar dos inputs nomes de categoria, paths e comentários que revelem rótulos,
preservando semântica do código, licenças e mapa de transformação. Registrar
fonte original e hash da versão entregue. O revisor valida a transformação.
Não tratar ausência de anotação como negativo. Não criar fatos de execução ou
impacto financeiro que a fonte não prove. O corpus é público: não há garantia
de ausência no treinamento. Reserva para ajuste não significa revisão cega.

## Protocolo fixado antes de inferir

Congelar hashes do corpus rotulado, split, prompt/template, binário, config do
modelo, digest do modelo, critérios e regra de encaminhamento. Registrar data
e ratificação humana; conservar versões anteriores. Prompt, modelo e regras
não serão ajustados no holdout. Mudança exige nova versão, não reescrita dos
resultados anteriores. Nenhum resultado é descartado por discordar do esperado.

Executar três repetições completas em ordem fixa por ID, temperatura zero, sem
retries ocultos. Retenção inclui falhas, truncamentos, tempos, outputs e execução
ausente. Erros não viram TN. A unidade primária é o caso com decisão majoritária
das três respostas válidas; qualquer resposta inválida deixa o caso como ERROR
na análise primária. Também reportar cada repetição e o total de tentativas.
Não tratar três respostas do mesmo contrato como três amostras independentes.

## Limites candidatos para o piloto

Todos devem valer no holdout revisado; falha ou valor indefinido não é PASS.

| Medida | Limite candidato |
|---|---|
| FPR = FP/(FP+TN), casos com resposta válida | <= 10% |
| Recall = TP/(TP+FN), casos com resposta válida | >= 90% |
| Concordância bruta com rótulo humano fixado | >= 90% |
| Cohen's kappa, duas avaliações binárias | >= 0,80; indefinido = inconclusivo |
| ERROR sobre todos os casos planejados | <= 5% |
| Casos que mudam resposta entre repetições completas | <= 10% |
| Respostas retidas e hashes conferidos | 100% das tentativas |

Reportar sempre a cobertura e o sucesso positivo/negativo sobre todos os rótulos,
para expor erros excluídos de FPR/recall. Intervalos não transformam um piloto
pequeno em validação populacional. Um PASS significa apenas atender aos limites
candidatos ratificados neste corpus; não autoriza agentes, alterações de gate ou
chamadas HackenProof. Se não houver ratificação, o resultado continua descritivo.

## Estatística e estabilidade

Matriz 2x2 por repetição e por caso, com ERROR separado; Wilson 95% para FPR,
precisão e recall como resumo binomial condicionado aos rótulos. Declarar que
dependência de pares/proveniência e seleção por conveniência limitam a leitura.
Para incerteza agrupada futura, reamostrar grupos de proveniência, não respostas
individuais; com poucos grupos, não alegar precisão inferencial.

Para concordância binária, usar proporção de acordo e Cohen's kappa; alpha de
Cronbach e ICC não serão reportados automaticamente como substitutos. São
objetos estatísticos distintos; eventual uso requer modelo de medida justificado.
Documentação dos métodos:
[Wilson](https://www.statsmodels.org/stable/generated/statsmodels.stats.proportion.proportion_confint.html),
[Cohen's kappa](https://www.statsmodels.org/stable/generated/statsmodels.stats.inter_rater.cohens_kappa.html).

Flip rate primário = casos completos com pelo menos uma decisão diferente nas
três repetições / casos completos. Reportar também numerador, denominador e
casos incompletos; não substituí-los por decisão negativa. Não há flip rate
observável em run-01 (uma repetição), nem concordância humana medida.

## Baseline estático e encaminhamento

Comparar regras constantes e, após revisão dos rótulos, Slither no mesmo código
e split, com versão, hash, compilador apropriado e mapeamento prévio
detector/categoria/linhas. A saída estática não avalia a severidade do relatório
da mesma forma: separar detecção da categoria do suporte à proposta. Falha de
compilação = erro, ausência de alerta não prova contrato seguro. Não assumir
taxa universal de FP de SAST. Nesta rodada, Slither, Mythril, solc e forge não
foram encontrados no PATH; baseline estático não foi instalado nem executado.

Regra candidata de encaminhamento: revisão humana em todas as severidades,
confiança sem poder de dispensá-la, nenhuma escrita externa. É regra proposta
de avaliação, não política de produção implementada. Relatar FP bruto, carga
encaminhada e resultados de revisão separadamente. O gate não tem um limiar de
confiança autorizador e não certifica verdade semântica.

Logs de tentativas, stdout/stderr e manifestos são evidência operacional da
medição, não WER admitido, política aprovada ou prova normativa de autorização.
Custos de energia/hardware continuam desconhecidos até serem medidos; reportar
latência e contagem de tokens disponíveis, sem converter inferência local em
custo zero.
