"""Monta o teste cego: reais held-out contra o melhor braco gerado.

    python -I eval/make_blind_test.py          # gera o teste e o gabarito
    python -I eval/score_blind.py "RGGR..."    # corrige

Saidas:
  eval/blind-test.md   60 itens embaralhados, sem rotulo. E o que voce le.
  eval/blind-key.json  o gabarito. Nao abra antes de responder.

Por que isto existe separado do harness de metricas: o harness mede
conformidade a especificacao, que e verificavel por maquina. "Soa como ele"
nao e -- e julgamento de quem conhece a voz. Eu escrevi a especificacao e os
bracos gerados, entao nao posso ser juiz cego do meu proprio texto. Esta
perna e sua.
"""
from __future__ import annotations

import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 7331
CANDIDATE_ARM = "mirror_v2.txt"


def load(path, tagged):
    out = []
    for raw in open(path, encoding="utf-8"):
        raw = raw.rstrip("\n")
        if not raw.strip():
            continue
        if tagged:
            ln, text = raw.split("\t", 1)
            out.append({"text": text, "label": "R", "src": f"corpus:L{ln}"})
        else:
            out.append({"text": raw, "label": "G", "src": CANDIDATE_ARM})
    return out


def main():
    arms = os.path.join(HERE, "arms")
    real = load(os.path.join(arms, "real_blind.txt"), tagged=True)
    gen = load(os.path.join(arms, CANDIDATE_ARM), tagged=False)

    rng = random.Random(SEED)
    gen = rng.sample(gen, len(real))      # mesmo n dos reais: 50/50
    items = real + gen
    rng.shuffle(items)

    key = {str(i + 1): {"label": it["label"], "src": it["src"]}
           for i, it in enumerate(items)}
    with open(os.path.join(HERE, "blind-key.json"), "w", encoding="utf-8") as fh:
        json.dump({"seed": SEED, "n": len(items), "key": key}, fh,
                  ensure_ascii=False, indent=2)

    n = len(items)
    L = []
    w = L.append
    w("# Teste cego — modo espelho")
    w("")
    w(f"{n} mensagens, {n // 2} escritas por você e {n // 2} geradas seguindo")
    w("`out/persona/mode-mirror.md`. Estão embaralhadas e não há rótulo.")
    w("")
    w("As reais são **held-out**: nenhuma delas aparece como exemplar, como")
    w("átomo ou em qualquer lugar do persona pack. Foram sorteadas de um pool")
    w("de 166.898 linhas que o pipeline nunca expôs.")
    w("")
    w("## Como responder")
    w("")
    w("Monte uma string de 60 letras na ordem dos itens — `R` se você escreveu,")
    w("`G` se foi gerada — e rode:")
    w("")
    w("```bash")
    w("python -I eval/score_blind.py \"RGGRG...\"")
    w("```")
    w("")
    w("Chute quando não souber; não pule. O número que importa não é quantas")
    w("você acerta, é quão perto de **50%** você fica. Com 60 itens, qualquer")
    w("coisa entre 37% e 63% é indistinguível de cara-ou-coroa. Acima disso, a")
    w("especificação não está funcionando — e a tabela de desvios em")
    w("`report.md` diz por onde começar.")
    w("")
    w("**Não abra `eval/blind-key.json` antes de responder.**")
    w("")
    w("## Itens")
    w("")
    for i, it in enumerate(items, 1):
        w(f"{i:2d}. `{it['text']}`")
    w("")

    out = os.path.join(HERE, "blind-test.md")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"[blind] {n} itens ({len(real)} reais / {len(gen)} geradas)")
    print(f"[blind] teste:    {out}")
    print(f"[blind] gabarito: {os.path.join(HERE, 'blind-key.json')}")


if __name__ == "__main__":
    main()
