# Calibração do painel: pipeline e dados ainda pendentes

```powershell
node --test examples/sde-publication/publication.test.mjs examples/sde-publication/ai-aggregate.test.mjs examples/sde-publication/calibrate.test.mjs
node examples/sde-publication/calibrate.mjs examples/sde-publication/calibration-fixture.jsonl examples/sde-publication/calibration-report.json
```

## O que foi construído

O script usa o `aggregate()` real para todos os casos. Não duplica a fórmula do
painel, não altera pesos/zonas e não promove spec automaticamente. Recebe JSONL,
verifica IDs únicos e grupos separados entre desenvolvimento (`calibration`) e
teste (`holdout`), mantém gates e indisponibilidades e exporta hash do conjunto,
scores, decisões, métricas e motivos de pendência.

O relatório inclui por caso grupo, proveniência declarada, referência, candidato,
base do rótulo, anotações e resultados brutos dos juízes, inclusive indisponibilidades.
O CLI registra também hashes SHA-256 dos arquivos de calibração, agregação e spec.
Esses hashes são dos bytes dos arquivos; `spec_hash` no resultado do painel é do
JSON serializado por `JSON.stringify`, portanto não é o mesmo domínio de hash.
O pacote `calibration-review.zip` acompanha os fontes, o fixture, o relatório,
o log e um manifest de hashes. Ele não autentica autores nem a verdade dos rótulos.
Um relatório real pode conter dados sensíveis; sua distribuição exige o tratamento
de acesso e privacidade correspondente ao conjunto, antes de compartilhar o pacote.

`calibration-fixture.jsonl` é um smoke test de oito itens aritméticos. As referências
são igualdades verificáveis, mas as respostas, scores e anotações são sintéticos,
produzidos para testar o software. Não há inferência LLM nem anotação humana real.
Não é um golden set de suporte ao cliente ou evidência de eficácia no domínio.
Ele inclui uma resposta errada com juízes excessivamente confiantes e uma indisponibilidade.

## Critério de medição proposto

- Positivo de referência: resposta aceitável segundo rubrica e verdade independente.
- Aceitação automática de baseline: ALLOW e ALLOW_WITH_LOGGING juntos (cutoff 0.70).
  ALLOW isolado (cutoff 0.85) é relatado separadamente.
- Precisão = TP/(TP+FP); sem aceites, precisão é `null`, não 1.
- Recall = TP/(TP+FN), contando abstinências como não aceites; cobertura = aceites/total.
- Reportar matriz de confusão e decisões por split, sem ocultar casos indisponíveis.
- Intervalo de Wilson bilateral de 95% para precisão; a escolha é uma proposta
  de protocolo, não uma exigência do spec. Supõe observações independentes; grupos
  correlacionados exigem um método de incerteza adequado, não multiplicação de linhas.
- Sweep apenas em desenvolvimento: candidatos >=0.70, derivados dos scores daquele
  split; exigir limite inferior >=0.95, depois maximizar cobertura e desempatar por
  precisão e limiar maior. Não otimizar com o holdout.
- Avaliar o candidato fixado uma vez no holdout. Isso propõe apenas um cutoff de
  aceitação automática combinada; não calibra todas as zonas, pesos ou probabilidades.
- Cohen kappa compara as duas anotações binárias; é `null` no caso degenerado.
  Não mede verdade e não substitui adjudicação. Não calcular kappa entre dimensões
  diferentes como grounding e hallucination, que não são rótulos intercambiáveis.

Escolhemos uma restrição de precisão com cobertura, não Youden J: são objetivos
diferentes. Um composto de scores não é automaticamente probabilidade calibrada.

## Conjunto de referência real necessário

Coletar casos representativos do domínio, incluindo erros, recusas, casos difíceis,
tentativas de injeção e indisponibilidade. Registrar por item `id`, `group_id`, split,
`provenance`, referência verificável, resposta candidata, `label_basis`, aceitabilidade
adjudicada, duas anotações independentes e resultados medidos dos juízes. Guardar
também em manifest externo: rubrica, revisores, fontes com versões/hashes, versões
de modelo/prompt/juízes, processo de amostragem e data. Não usar scores para criar
os rótulos de verdade. Variantes da mesma questão/documento devem compartilhar grupo.

O loader exige `reference`, `candidate`, `label_basis` e ambas as classes por split,
mas não autentica a proveniência declarada nem verifica independência de revisores.
`external` é uma declaração a revisar, não certificação. Por isso o relatório mantém
`PENDING` inclusive quando os critérios numéricos são atingidos. O conjunto externo
e seu desenho amostral precisam de revisão antes de qualquer promoção versionada.

## Monitoramento posterior

Após validação externa, comparar novos lotes rotulados com o baseline: precisão,
cobertura, recusas, indisponibilidade e resultados por fatia do domínio. Mudança de
modelo, prompt, corpus, rubrica ou juízes exige reavaliação. Cadência e critérios de
deriva dependem do contexto; este script não implementa monitoramento contínuo nem
cria automações. O holdout perde seu papel se usado repetidamente para ajustar decisões.

## Fontes verificadas e limites das conclusões

- [scikit-learn: ajuste de limiar](https://scikit-learn.org/stable/modules/classification_threshold.html):
  separar dados de ajuste do modelo e do limiar para evitar sobreajuste.
- [NIST: intervalos para proporções](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm):
  fórmula do intervalo de Wilson usada no script.
- [Zhang et al., 2609.12002](https://arxiv.org/abs/2609.12002): apresenta WMV calibrado
  com estimativas de erros por desacordo; não valida nossos pesos 40/30/30 ou zonas.
- [JuryFlow, 2609.40103](https://arxiv.org/abs/2609.40103): usa desacordo por afirmação
  e um grafo de resolução; não equivale ao nosso composto no nível da resposta.

Uma média pode ocultar conflitos; armazenar os scores preserva dados para análise,
mas não resolve o desacordo automaticamente. Não há suporte aqui para um corte
universal 9.5, independência garantida dos juízes ou calibração mensal universal.
