# Diagnóstico semântico de citações — 2026-10-28

## Resultado executado

36 pares sintéticos em inglês ASCII, 12 por rótulo: SUPPORTED, CONTRADICTED, INSUFFICIENT. Seis categorias (negação, números, entidades, datas, quantificadores, relações), duas famílias de exemplos por categoria, três afirmações por família. As 12 famílias compartilham evidência entre suas três afirmações; não são 36 amostras independentes.

Foi executado somente o verificador lexical Python existente, sem alteração de algoritmo, usando os rótulos semânticos para avaliar suas aceitações. Não foi executado um NLI ou LLM classificador semântico.

| Rótulo construído | PASS_LEXICAL | FAIL_LEXICAL |
|---|---:|---:|
| SUPPORTED | 12 | 0 |
| CONTRADICTED | 9 | 3 |
| INSUFFICIENT | 7 | 5 |

Foram 28 aceitações lexicais: 12 suportadas segundo a rubrica, nove contraditas e sete insuficientes. Fração suportada entre aceitações: 12/28 (42,86%). Taxa de aceitação de contradições: 9/12 (75%). Aceitação de insuficientes: 7/12 (58,33%). São resultados locais sobre exemplos construídos para exercitar limites conhecidos, não estimativa populacional, sensibilidade universal ou desempenho de produção. A proporção de classes é artificialmente equilibrada.

Os suportados são em grande parte repetição ou extração simples, sem uma bateria abrangente de paráfrases. A taxa 12/12 não demonstra robustez de recall. Os rótulos e justificativas foram escritos pelo mesmo agente que produziu o código, sem revisão humana independente. Casos controversos precisam ser revisados antes de uso confirmatório. Os arquivos são públicos no mesmo diretório: separação lógica de inputs/gold, não holdout secreto.

## Contrato e arquivos

- `inputs.json`: somente id, evidence e claim; não contém rótulo, categoria ou justificativa.
- `gold.json`: rótulo, família, categoria e justificativa de cada caso.
- `manifest.json`: rubrica, hipóteses interpretativas, contagens, hashes de inputs/gold e fontes.
- `lexical-baseline.json`: cada resultado lexical, tabela cruzada e taxas agregadas.
- `predictions.schema.json`: forma de respostas futuras; o scorer também rejeita IDs desconhecidos, repetidos e rótulos lexicais usados como semânticos.
- `sources/`: snapshots do gerador/scorer, cross-check lexical e BLAKE3 de referência.

Rubrica: SUPPORTED quando a evidência implica a afirmação; CONTRADICTED quando implica sua negação; INSUFFICIENT quando nenhuma das duas relações está estabelecida. Ausência de informação não é falsidade. Referentes e eventos nomeados são os mesmos; contagens exatas e valores únicos de evento são interpretados literalmente; "maior que" é estrito; não se presume uma regra de conversão de tarifa mensal em anual sem ela constar na evidência. O julgamento é sobre suporte textual, não verdade externa da fonte.

## Avaliação de um verificador futuro

Fornecer apenas `inputs.json` e a rubrica a um avaliador, guardando seus resultados completos como array de `{id, label}`. Os rótulos permitidos são SUPPORTED, CONTRADICTED, INSUFFICIENT e ABSTAIN. Não enviar gold nem justificativas como exemplos da própria avaliação. Exposição prévia a este conjunto impede tratá-lo como teste secreto independente.

Com o venv a partir de D:\arkhe:

```
.\work\arc-agi-3\.venv\Scripts\python.exe scripts/citation_semantic_diagnostic.py score output/citation-semantic-diagnostic-20261028 predictions.json semantic-score.json
```

O scorer confere hashes do dataset, rejeita IDs duplicados/desconhecidos, reporta confusão de três classes, precisão/recall/F1 por classe, cobertura e acurácia ITT/condicional. Abstenções e respostas ausentes permanecem no denominador ITT com zero acerto. NÃO distingue contradição de insuficiência a partir de FAIL_LEXICAL: a decisão lexical permanece binária e é avaliada separadamente.

Nenhum resultado de modelo semântico é apresentado nesta rodada. Não há justificativa para mudar o campo `semantic_entailment` da bridge de produção ou promover confiança. Avaliar um modelo nesta amostra continuaria sendo um diagnóstico; generalização exige conjunto adicional e revisão independente. Se houver treino/dev/test, separar por família/evidência, não embaralhar os três membros de cada tripla entre partições.

## Testes e limites de proveniência

24 testes pertinentes passaram: quatro do novo diagnóstico, oito do cross-check Python e 12 do broker. Não foi reexecutada a suíte inteira do workspace ou o diferencial Rust/Python de 74 casos nesta rodada. Testes do scorer usam respostas controladas para verificar contagem, não demonstrar capacidade semântica. A reexecução lexical não faz chamadas de modelo, Rust ou serviços externos.

Sem instalação de modelo, assinaturas, âncora externa, isolamento adversarial ou alteração de gate/trust. Hashes e snapshots permitem comparação de conteúdo, não autenticação contra reescrita integral ou independência de autoria.

## Fontes que motivam o desenho

- [ALCE, EMNLP 2023](https://aclanthology.org/2023.emnlp-main.398/): avaliação separada de correção e qualidade das citações.
- [Implementação ALCE](https://github.com/princeton-nlp/ALCE/blob/main/eval.py): avaliação de suporte com AutoAIS/NLI, não Jaccard lexical.
- [CAQA](https://arxiv.org/abs/2401.14640): atribuição complexa e avaliação de verificadores automáticos; esses verificadores também precisam ser medidos.

O conjunto presente não é uma reprodução desses benchmarks, não herda suas validações e não usa seus rótulos. É um diagnóstico local pequeno, revisável e separado da conformidade lexical.
