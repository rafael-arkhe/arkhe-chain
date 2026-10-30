# Protocolo de anotação — Arkhe v1 (candidato)

Data: 2026-10-29. Status: protocolo e pacote público preparados; anotação,
adjudicação e revisão independente não realizadas. Nenhum avaliador promovido.

## 1. Finalidade e baseline

Definir referências para avaliar entidades, eventos, relações, qualificadores e
suporte a Claims como tarefas distintas. Manter o GLiNER2.5 Multi e sua configuração
atual como baseline, inclusive os resultados negativos de modalidade. Não justificar
troca de modelo ou treinamento a partir de outro benchmark.

O [pacote público](../../tests/provenance-broker/annotation-pilot-v1/README.md)
congela os hashes da configuração e do relatório existentes, além do checkpoint
`fastino/gliner2.5-multi-v1@cf5593a5d45e3bbf204b9df621b13b1c0cf25ee3`.
Anotações são dados novos, não substituições retroativas dos rótulos ou oráculos.

## 2. Material de trabalho e unidade

Uma tarefa contém uma Claim explícita e o conjunto de fontes necessário para
examiná-la. Fontes idênticas são deduplicadas por SHA-256 dos bytes UTF-8. A mesma
fonte pode servir a Claims distintas; isso não cria exemplos independentes novos.
O pacote tem duas unidades de trabalho:

- **Fonte**: anotar menções, triggers, eventos, relações e escopos uma vez por fonte.
- **Claim + conjunto de fontes**: julgar suporte à Claim e conflitos entre fontes.

O schema serializado combina as duas partes por tarefa neste piloto. Ao agregar
métricas por fonte, deduplicar e conservar divergências de anotações repetidas;
não escolher silenciosamente a anotação que favorece o modelo.

O pacote não inclui predições, scores, outcomes congelados ou expected_output.
O corpus é público e conhecido pelo autor. Essa omissão reduz viés de apresentação,
mas não garante cegamento se o revisor tiver acesso ao restante do repositório.
Registrar a exposição declarada; isolamento dos revisores precisa ser organizado.

## 3. Unidades de anotação

| Unidade | Conteúdo obrigatório | O que não implica |
|---|---|---|
| Span | Fonte, intervalo UTF-8, texto exato, tipo e label | Não é evidência de verdade |
| Menção de entidade | Span(s) e classe: service, database, organization, person ou other | Não resolve automaticamente identidade entre documentos |
| Evento | Trigger(s), argumentos e fonte enunciativa | Não comprova que ocorreu |
| Relação | Predicado, pontas, eventos e qualificadores associados | Relação expressa não equivale a fato afirmativo |
| Pista | Negação, modalidade, correção ou outro qualificador, com escopo explícito | Uma pista não se aplica a todo o documento por omissão |
| Suporte | Outcome relativo à Claim inteira e às fontes, com referências e justificativa | Não autoriza o broker a liberar conteúdo |

Spans são semiabertos `[byte_offset, byte_offset + byte_length)`, com u64,
fronteiras UTF-8 válidas e texto exatamente correspondente. Não normalizar acentos,
caixa, espaços ou pontuação. O hash bruto da fonte é distinto dos digests com
domínio dos registros do broker; ambos são identificados nos metadados da tarefa.

O predicado da relação é separado da polaridade e modalidade. Predicados iniciais:
`migrated_to`, `operates`, `works_for` e `other`. Marcar `other` com descrição literal;
não forçar um dos três predicados. “Não migrou” expressa uma proposição de migração
negada; não deve desaparecer da anotação por não ser uma migração afirmada.

Eventos anotam dimensões separadas:

- Polaridade: Positive, Negative, Underspecified.
- Certeza atribuída à fonte: Certain, Probable, Possible, Underspecified.
- Tempo: Past, Present, Future, Underspecified.
- Modalidade: Unmarked, Possibility, Necessity, Obligation, Desire, Conditional,
  Underspecified. Unmarked/Underspecified são exclusivos dos demais labels.

A certeza e a factualidade são linguísticas: compromisso de uma fonte enunciativa,
não checagem da verdade no mundo. Identificar narrador, fonte explicitamente citada
ou fonte não resolvida. Um modal pode ter escopo sobre outro evento; nesse caso,
registrar o alvo em vez de propagar seu valor para todos os eventos.

## 4. Critérios de suporte

Julgar a Claim fornecida, sem repará-la silenciosamente. Considerar suas pontas,
predicado, polaridade, modalidade, tempo e condições. A presença das pontas não
estabelece a relação. Um enunciado possível pode sustentar uma Claim possível,
sem sustentar a mesma Claim apresentada como ocorrência certa.

| Outcome | Critério |
|---|---|
| Supported | O conjunto sustenta a Claim com seus qualificadores, sem conflito relevante não resolvido |
| Partial | Há suporte identificável para parte da Claim, com lacunas explícitas |
| Contradicted | Há oposição relevante à mesma proposição/contexto; indicar os qualificadores e evidências |
| Indeterminate | Não é possível decidir pelo suporte disponível, inclusive ausência de relação ou conflito não resolvido |
| NotEvaluated | A tarefa não foi avaliada ou está fora do escopo; registrar motivo |

“Contradicted” não escolhe qual fonte é verdadeira. Datas diferentes não geram
contradição automaticamente: podem descrever mudança de estado. Correção precisa
de vínculo explícito com o relato corrigido; registrar esse vínculo e a fonte.
Se os relatos forem incompatíveis e não houver resolução sustentada, indicar
Indeterminate e registrar o conflito, sem usar a ordem do arquivo como autoridade.

Marcar como Direct quando a proposição é expressa pelas fontes, mesmo distribuída
em vários spans. Derived exige premissas e regra de raciocínio descritas; não é
determinado pelo número de trechos. A anotação de uma regra não a torna regra
aceita pela política. Agregação é dimensão independente, com fontes explicitadas.

Ambiguidade é um resultado válido. Não consultar os outcomes existentes do harness
para resolvê-la. Preservar justificativa e alternativas; não converter dúvida em
Supported para aumentar concordância.

## 5. Processo de anotação e revisão

1. **Calibração**: usar apenas o pacote público e registrar revisão das instruções.
   Reter anotações pré-discussão e pós-discussão como rodadas diferentes.
2. **Anotação independente**: revisores trabalham sem consultar anotações uns dos
   outros ou predições. Registrar identidade, rodada, versão do protocolo e exposição.
   Planejar duas anotações independentes por unidade neste piloto; é uma escolha
   deste protocolo, não uma exigência universal de revisão. Não há revisores
   atribuídos nesta entrega.
3. **Concordância pré-adjudicação**: congelar arquivos e calcular as métricas da
   seção 6 antes de discutir os desacordos.
4. **Adjudicação**: revisor designado registra anotações de origem, decisão,
   justificativa e desacordos não resolvidos. Não sobrescrever os arquivos originais.
5. **Referência revisada**: publicar como nova versão, com trilha de proveniência.
   Não alterar independent_review de fixtures por simples validação de schema.

Uma revisão de anotação verifica o conteúdo das referências. Uma revisão dos
oráculos do broker verifica regras e payloads. São atividades distintas: concluir
uma não conclui automaticamente a outra nem estabelece independência de autoria
dos motores Python/Node.

## 6. Métricas predefinidas

- **Entidades**: F1 por classe com correspondência exata `(source_id, offset, length,
  label)`. Um F1 relaxado por IoU de bytes >=0,5 pode ser secundário; não substituir
  a métrica exata após observar os resultados.
- **Eventos**: F1 de triggers exatos. Para eventos alinhados, matriz de confusão e
  concordância por atributo, com cobertura e valores Underspecified reportados.
- **Relações**: F1 de predicado + pontas alinhadas por spans. Reportar separadamente
  F1 com qualificadores/escopo, para não confundir edge correto com fato afirmativo.
  Endpoints não alinhados contam como desacordo; IDs locais não são comparados.
- **Suporte**: concordância bruta e matriz de confusão sobre as mesmas tarefas.
  Cohen's kappa é opcional para dois revisores e categorias nominais; registrar
  marginais e casos indefinidos. Para outro desenho, escolher e fixar métrica
  apropriada antes da anotação. Kappa não é requisito universal.
- **Adjudicação**: taxa de desacordo resolvido/não resolvido, com denominadores.

Separar concordância entre anotadores de desempenho do modelo contra uma referência
adjudicada. Reportar número de fontes únicas e de Claims; não tratar as 19 tarefas
como 19 documentos independentes. Métricas do pacote público são de calibração e
desenvolvimento, sem alegação de generalização.

O novo esquema por evento não é diretamente equivalente aos labels documentais
do baseline. Qualquer comparação exige mapeamento de unidades/labels explicitado
e versionado; não recalcular ou reinterpretar retroativamente o resultado 1/8 como
se a tarefa antiga e a nova fossem idênticas.

## 7. Corpus reservado

Não foi materializado nesta entrega. Um curador deve controlar fontes e rótulos
fora do acesso usado para desenvolvimento, fixar o split antes de ajustes e registrar
acessos. Publicar apenas o compromisso de integridade e o procedimento de avaliação
quando adequado. Gerar e ler novos exemplos nesta sessão não os torna reservados.
O pacote público não deve ser reclassificado retroativamente como holdout.

Não impor uma proporção ou número mínimo sem desenho amostral. Definir domínio,
idiomas, agrupamento por fonte/tema, raridade das classes e critérios de exclusão;
evitar que versões quase idênticas da mesma fonte cruzem splits inadvertidamente.

## 8. Estado da entrega

Protocolo candidato, schema verificável e pacote público preparados. Anotação,
concordância humana, adjudicação, corpus reservado, promoção de avaliador e revisão
independente continuam pendentes. Não foram alterados baseline, pesos, labels do
experimento, resultados anteriores, política ou oráculos do broker.
