# Diagnóstico de máscaras v3 — resumo exploratório

A implementação resume o relatório OOF validado da v2, sem refazer modelos ou executar ações ARC. O original recebido fica em `references/user-mask-diagnostic-v3/`, preservado sem execução.

## Correções

- Mantém dois alvos fixos entre máscaras e dobras: frame completo e núcleo central de 56 linhas, com contexto. A interseção aprendida não participa deste resumo.
- Exige os mesmos grupos e números de consultas para cada máscara. Não descarta silenciosamente grupos ausentes.
- Igualdade nas contagens de estados não determina utilidade. Igualdade nas contagens de previsões é descrita apenas como igualdade agregada, sem afirmar previsões idênticas.
- Erro condicional compara subconjuntos distintos quando os modelos abstêm em consultas diferentes. Para um denominador comum, registra cobertura correta, cobertura de erros e perda seletiva: `(erros + custo * abstenções) / consultas`.
- Custo de abstenção 0,5 e margem 0,02 são parâmetros exploratórios explícitos. Não constituem critérios previamente registrados de aceitação.
- Bootstrap pareado usa os mesmos sorteios de episódios e informa quantos sorteios têm cada diferença definida. Os intervalos são condicionais aos modelos OOF já ajustados, sem reajuste; cinco episódios e treinos compartilhados limitam a inferência. Não demonstram não inferioridade nem generalização entre jogos.
- Toda classificação mantém `promotion_allowed: false`.

## Resultados

Quatro controles sintéticos passaram: HUD móvel, flag na borda que altera a dinâmica, célula intermitente e marcador deslocado. O controle da flag detecta perda de informação; o marcador confirma que baixa volatilidade por célula pode escapar da máscara de variância.

Nos cinco episódios OOF existentes, com preditor por moda:

| Jogo/política | Consultas | Acertos núcleo: original → border2 | Acertos frame completo: original → border2 |
|---|---:|---:|---:|
| ls20/frontier | 995 | 103 → 103 | 103 → 103 |
| ls20/random | 995 | 106 → 106 | 106 → 106 |
| vc33/frontier | 985 | 66 → 683 | 66 → 31 |
| vc33/random | 985 | 58 → 574 | 58 → 26 |

Em vc33, a perda seletiva diminui no núcleo e aumenta no frame completo, para o custo escolhido. Isso não identifica semanticamente HUD nem autoriza descartar bordas durante exploração.

## Verificação e artefatos

57 testes passaram. Relatórios em `D:/arkhe/output/arc3-mask-diagnostic-v3-20261027/`: `synthetic-report.json`, `tradeoff-report.json` e `verification-receipt.json` com hashes.

Nenhuma ação ARC, alteração da política ativa ou submissão Kaggle foi realizada.

```powershell
.\work\arc-agi-3\.venv\Scripts\python.exe work/arc-agi-3/mask_diagnostic_v3.py --report output/arc3-mask-diagnostic-v2-20261027/episode-oof-report.json --out output/novo-resumo-v3.json
```
