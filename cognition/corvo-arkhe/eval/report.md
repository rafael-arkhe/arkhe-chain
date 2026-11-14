# Avaliacao do modo espelho

Gerado por `eval/run_eval.py`. Determinístico: mesma amostra, mesmos
números em toda execução.

## Sanidade do harness

Antes de julgar qualquer braço: a amostra real reproduz o corpus?

| dimensão | corpus (278.854 linhas) | real_full (400) |
|:--|--:|--:|
| `maiuscula_inicial_pct` | 23.57 | 23.75 |
| `pontuacao_final_pct` | 8.15 | 8.75 |
| `virgula_pct` | 28.52 | 30.0 |
| `len_mediana` | 31 | 29 |
| `negacao_num_pct` | 42.1 | 51.2 |
| `emoji_pct` | 0.06 | 0.0 |
| `acento.nao` | 99.6 | 100.0 |
| `acento.e_verbo` | 100.0 | 100.0 |

## Distância de estilo até real_band

Média ponderada do desvio normalizado em 15 dimensões (`metrics.WEIGHTS`). 0 = idêntico à referência.

| braço | distância | dimensões usadas |
|:--|--:|--:|
| `real_full` | **0.0522** | 15/15 |
| `mirror` | **0.1281** | 14/15 |
| `mirror_v2` | **0.0336** | 14/15 |
| `naive` | **0.5011** | 15/15 |

Em `mirror`, `acento_mantido_pct.nao` ficou fora: sem ocorrencia da forma na amostra.

Em `mirror_v2`, `reducao_pct.porque` ficou fora: sem ocorrencia da forma na amostra.

`real_full` não é zero porque é a distribuição sem filtro de
comprimento comparada à faixa 25-140 — serve como piso de referência:
é a distância que a *própria* escrita dele tem da referência quando a
amostragem muda. Um braço gerado abaixo ou perto desse piso está
dentro do ruído de amostragem.

## Comparação por dimensão

| dimensão | real_band | mirror | mirror_v2 | naive |
|:--|--:|--:|--:|--:|
| `n_linhas` | 120 | 60 | 60 | 60 |
| `len_media` | 46.2 | 39.5 | 33.4 | 46.0 |
| `len_mediana` | 39 | 42 | 31 | 48 |
| `len_p95` | 91 | 58 | 52 | 64 |
| `maiuscula_inicial_pct` | 26.67 | 23.33 | 25.0 | 100.0 |
| `pontuacao_final_pct` | 3.33 | 8.33 | 3.33 | 88.33 |
| `virgula_pct` | 37.5 | 51.67 | 26.67 | 58.33 |
| `emoji_pct` | 0.0 | 0.0 | 0.0 | 11.67 |
| `risada_kkk_pct` | 2.5 | 10.0 | 5.0 | 0.0 |
| `diminutivo_pct` | 4.17 | 0.0 | 0.0 | 0.0 |
| `alongamento_pct` | 0.0 | 0.0 | 0.0 | 0.0 |
| `emotes_por_linha` | 0.158 | 0.05 | 0.0 | 0.0 |
| `voice_score_medio` | 0.592 | 1.25 | 0.383 | 0.117 |
| `negacao_num_pct` | 27.8 | 100.0 | 26.7 | 0.0 |
| `acento.ate` | 100.0 | n/d | n/d | n/d |
| `acento.e_verbo` | 100.0 | 100.0 | 100.0 | 100.0 |
| `acento.ja` | 100.0 | 100.0 | 100.0 | 100.0 |
| `acento.nao` | 100.0 | n/d | 100.0 | 0.0 |
| `acento.so` | 100.0 | 100.0 | n/d | 100.0 |
| `reducao.depois` | 100.0 | 100.0 | 0.0 | 0.0 |
| `reducao.esta` | 100.0 | 100.0 | 100.0 | 25.0 |
| `reducao.estou` | 100.0 | 100.0 | 100.0 | 0.0 |
| `reducao.hoje` | 100.0 | 100.0 | 0.0 | 0.0 |
| `reducao.mesmo` | 50.0 | 100.0 | 0.0 | 0.0 |
| `reducao.muito` | 50.0 | 75.0 | 0.0 | 0.0 |
| `reducao.para` | 100.0 | 100.0 | 100.0 | 25.0 |
| `reducao.porque` | 100.0 | 100.0 | n/d | 0.0 |
| `reducao.que` | 71.4 | 95.7 | 75.0 | 0.0 |
| `reducao.tambem` | 100.0 | 100.0 | 100.0 | 0.0 |
| `reducao.voce` | 80.0 | 100.0 | n/d | 0.0 |

## Onde o modo espelho mais desvia

| dimensão | espelho | referência | desvio norm. | peso |
|:--|--:|--:|--:|--:|
| `negacao_num_pct` | 100.0 | 27.8 | 0.722 | 2.0 |
| `reducao_pct.que` | 95.7 | 71.4 | 0.243 | 2.0 |
| `voice_score_medio` | 1.25 | 0.592 | 0.2193 | 2.0 |
| `len_p95` | 58.0 | 91.0 | 0.165 | 1.0 |
| `pontuacao_final_pct` | 8.33 | 3.33 | 0.05 | 3.0 |
| `virgula_pct` | 51.67 | 37.5 | 0.1417 | 1.0 |
| `risada_kkk_pct` | 10.0 | 2.5 | 0.075 | 1.5 |
| `maiuscula_inicial_pct` | 23.33 | 26.67 | 0.0334 | 3.0 |

## O que esta avaliação NÃO estabelece

1. **Indistinguibilidade.** Isto mede conformidade à especificação. Um texto pode acertar todas as taxas e ainda soar errado — ritmo, assunto e timing de piada não estão em nenhuma dessas 15 dimensões.
2. **Independência do avaliador.** Eu escrevi a especificação, os dois braços gerados e o harness. Não posso ser juiz cego do meu próprio texto. O braço `naive` é uma linha de base *construída* por mim para representar o modo de falha default, não uma amostra independente.
3. **Significância.** n=60 por braço gerado. Uma taxa de 8% sobre 60 linhas são 5 linhas: trocar duas muda o número em 3 pontos. Trate diferenças pequenas como ruído.

A perna que falta é `eval/blind-test.md`: 60 itens embaralhados, metade reais held-out e metade do braço espelho, sem rótulo. Se você acertar perto de 50%, a especificação funciona. Acima de ~70%, não funciona, e a coluna de desvio acima diz por onde começar.

