"""Compara os bracos do experimento nas dimensoes medidas do idioleto.

    python -I eval/run_eval.py

Bracos:
  real_full   400 linhas reais held-out, sem filtro de comprimento.
              Confere se a amostra reproduz as taxas do corpus inteiro --
              sanidade do proprio harness, antes de julgar qualquer coisa.
  real_band   120 linhas reais held-out, 25-140 caracteres. E a REFERENCIA
              contra a qual os bracos gerados sao medidos, porque assim
              comprimento nao confunde a medida de estilo.
  mirror      60 linhas que eu escrevi seguindo out/persona/mode-mirror.md.
  naive       60 linhas que eu escrevi como um LLM generico renderiza
              "portugues informal brasileiro", sem a especificacao.

O que isto mede: conformidade a especificacao. O que NAO mede:
indistinguibilidade. Ver eval/blind-test.md e a ressalva no relatorio.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import metrics  # noqa: E402

ARMS = [
    ("real_full", "real_full.txt", "reais held-out, sem filtro"),
    ("real_band", "real_band.txt", "reais held-out, 25-140 ch (REFERENCIA)"),
    ("mirror", "mirror.txt", "geradas seguindo mode-mirror.md"),
    ("mirror_v2", "mirror_v2.txt", "geradas seguindo a especificacao CORRIGIDA"),
    ("naive", "naive.txt", "geradas sem a especificacao"),
]


def load(path):
    out = []
    for raw in open(path, encoding="utf-8"):
        raw = raw.rstrip("\n")
        if not raw.strip():
            continue
        # arquivos reais vem como "<linha>\t<texto>"
        out.append(raw.split("\t", 1)[1] if "\t" in raw else raw)
    return out


def main():
    arms_dir = os.path.join(HERE, "arms")
    out_dir = os.path.join(ROOT, "out")

    scored = {}
    for name, fname, _desc in ARMS:
        p = os.path.join(arms_dir, fname)
        if not os.path.isfile(p):
            sys.exit(f"braco ausente: {p}")
        scored[name] = metrics.score(load(p))

    corpus_ref = metrics.reference_from_lexicon(out_dir)
    corpus_ref["voice_score_medio"] = scored["real_full"]["voice_score_medio"]

    ref = scored["real_band"]
    dist = {
        "real_full": metrics.distance(scored["real_full"], ref),
        "mirror": metrics.distance(scored["mirror"], ref),
        "mirror_v2": metrics.distance(scored["mirror_v2"], ref),
        "naive": metrics.distance(scored["naive"], ref),
    }

    L = []
    w = L.append
    w("# Avaliacao do modo espelho")
    w("")
    w("Gerado por `eval/run_eval.py`. Determinístico: mesma amostra, mesmos")
    w("números em toda execução.")
    w("")
    w("## Sanidade do harness")
    w("")
    w("Antes de julgar qualquer braço: a amostra real reproduz o corpus?")
    w("")
    w("| dimensão | corpus (278.854 linhas) | real_full (400) |")
    w("|:--|--:|--:|")
    for k in ("maiuscula_inicial_pct", "pontuacao_final_pct", "virgula_pct",
              "len_mediana", "negacao_num_pct", "emoji_pct"):
        w(f"| `{k}` | {corpus_ref[k]} | {scored['real_full'][k]} |")
    for k in ("nao", "e_verbo"):
        w(f"| `acento.{k}` | {corpus_ref['acento_mantido_pct'][k]} | "
          f"{scored['real_full']['acento_mantido_pct'][k]} |")
    w("")
    w("## Distância de estilo até real_band")
    w("")
    w("Média ponderada do desvio normalizado em 15 dimensões "
      "(`metrics.WEIGHTS`). 0 = idêntico à referência.")
    w("")
    w("| braço | distância | dimensões usadas |")
    w("|:--|--:|--:|")
    for k in ("real_full", "mirror", "mirror_v2", "naive"):
        w(f"| `{k}` | **{dist[k]['distancia']}** | "
          f"{dist[k]['dimensoes_usadas']}/{len(metrics.WEIGHTS)} |")
    for k in ("real_full", "mirror", "mirror_v2", "naive"):
        for sk in dist[k]["dimensoes_ignoradas"]:
            w("")
            w(f"Em `{k}`, `{sk['dim']}` ficou fora: {sk['motivo']}.")
    w("")
    w("`real_full` não é zero porque é a distribuição sem filtro de")
    w("comprimento comparada à faixa 25-140 — serve como piso de referência:")
    w("é a distância que a *própria* escrita dele tem da referência quando a")
    w("amostragem muda. Um braço gerado abaixo ou perto desse piso está")
    w("dentro do ruído de amostragem.")
    w("")
    w("## Comparação por dimensão")
    w("")
    w("| dimensão | real_band | mirror | mirror_v2 | naive |")
    w("|:--|--:|--:|--:|--:|")
    flat = [
        "n_linhas", "len_media", "len_mediana", "len_p95",
        "maiuscula_inicial_pct", "pontuacao_final_pct", "virgula_pct",
        "emoji_pct", "risada_kkk_pct", "diminutivo_pct", "alongamento_pct",
        "emotes_por_linha", "voice_score_medio", "negacao_num_pct",
    ]
    for k in flat:
        w(f"| `{k}` | {ref[k]} | {scored['mirror'][k]} | "
          f"{scored['mirror_v2'][k]} | {scored['naive'][k]} |")
    def fmt(v):
        return "n/d" if v is None else v
    for k in sorted(ref["acento_mantido_pct"]):
        w(f"| `acento.{k}` | {fmt(ref['acento_mantido_pct'][k])} | "
          f"{fmt(scored['mirror']['acento_mantido_pct'][k])} | "
          f"{fmt(scored['mirror_v2']['acento_mantido_pct'][k])} | "
          f"{fmt(scored['naive']['acento_mantido_pct'][k])} |")
    for k in sorted(ref["reducao_pct"]):
        w(f"| `reducao.{k}` | {fmt(ref['reducao_pct'][k])} | "
          f"{fmt(scored['mirror']['reducao_pct'][k])} | "
          f"{fmt(scored['mirror_v2']['reducao_pct'][k])} | "
          f"{fmt(scored['naive']['reducao_pct'][k])} |")
    w("")
    w("## Onde o modo espelho mais desvia")
    w("")
    w("| dimensão | espelho | referência | desvio norm. | peso |")
    w("|:--|--:|--:|--:|--:|")
    for row in dist["mirror"]["dimensoes"][:8]:
        w(f"| `{row['dim']}` | {row['cand']} | {row['ref']} | "
          f"{row['desvio_norm']} | {row['peso']} |")
    w("")
    w("## O que esta avaliação NÃO estabelece")
    w("")
    w("1. **Indistinguibilidade.** Isto mede conformidade à especificação. "
      "Um texto pode acertar todas as taxas e ainda soar errado — ritmo, "
      "assunto e timing de piada não estão em nenhuma dessas 15 dimensões.")
    w("2. **Independência do avaliador.** Eu escrevi a especificação, os dois "
      "braços gerados e o harness. Não posso ser juiz cego do meu próprio "
      "texto. O braço `naive` é uma linha de base *construída* por mim para "
      "representar o modo de falha default, não uma amostra independente.")
    w("3. **Significância.** n=60 por braço gerado. Uma taxa de 8% sobre 60 "
      "linhas são 5 linhas: trocar duas muda o número em 3 pontos. Trate "
      "diferenças pequenas como ruído.")
    w("")
    w("A perna que falta é `eval/blind-test.md`: 60 itens embaralhados, metade "
      "reais held-out e metade do braço espelho, sem rótulo. Se você acertar "
      "perto de 50%, a especificação funciona. Acima de ~70%, não funciona, e "
      "a coluna de desvio acima diz por onde começar.")
    w("")

    rep = os.path.join(HERE, "report.md")
    with open(rep, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    with open(os.path.join(HERE, "scores.json"), "w", encoding="utf-8") as fh:
        json.dump({"arms": scored, "corpus_reference": corpus_ref,
                   "distance_to_real_band": dist}, fh,
                  ensure_ascii=False, indent=2)

    for k in ("real_full", "mirror", "mirror_v2", "naive"):
        tag = "  (piso)" if k == "real_full" else ""
        print(f"{k:11s} distancia : {dist[k]['distancia']}{tag}")
    print()
    print("maiores desvios do espelho v2:")
    for row in dist["mirror_v2"]["dimensoes"][:5]:
        print(f"  {row['dim']:32s} {row['cand']:>7} vs {row['ref']:>7} "
              f"(desvio {row['desvio_norm']})")
    print()
    print(f"relatorio: {rep}")


if __name__ == "__main__":
    main()
