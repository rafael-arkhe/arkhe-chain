"""Corrige o teste cego.

    python -I eval/score_blind.py "RGGRG..."

Reporta acerto total, e separa os dois tipos de erro, que dizem coisas
diferentes:

  falso G  - linha sua que voce achou gerada. A especificacao cobre uma faixa
             da sua escrita que voce mesmo nao reconhece como caracteristica.
  falso R  - linha gerada que passou por sua. E o que conta a favor da
             especificacao.

O numero que importa nao e o acerto alto, e a proximidade de 50%.
"""
from __future__ import annotations

import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    if len(sys.argv) < 2:
        sys.exit("uso: python -I eval/score_blind.py \"RGGR...\"")
    ans = "".join(c for c in sys.argv[1].upper() if c in "RG")

    with open(os.path.join(HERE, "blind-key.json"), encoding="utf-8") as fh:
        blob = json.load(fh)
    key, n = blob["key"], blob["n"]

    if len(ans) != n:
        sys.exit(f"esperava {n} letras R/G, recebi {len(ans)}")

    right = 0
    false_g, false_r = [], []
    for i in range(n):
        truth = key[str(i + 1)]["label"]
        got = ans[i]
        if got == truth:
            right += 1
        elif truth == "R":
            false_g.append(i + 1)      # real, julgada gerada
        else:
            false_r.append(i + 1)      # gerada, julgada real

    acc = right / n
    # IC 95% binomial normal-aproximado em torno de 0.5
    half = 1.96 * math.sqrt(0.25 / n)
    lo, hi = 0.5 - half, 0.5 + half

    print(f"acerto: {right}/{n} = {100*acc:.1f}%")
    print(f"faixa de indistinguibilidade (IC 95% em torno do chute): "
          f"{100*lo:.1f}% a {100*hi:.1f}%")
    print()
    if acc <= hi:
        print("VEREDITO: indistinguivel do chute. A especificacao sobrevive")
        print("a este teste. Isto nao prova que ela e boa -- prova que voce")
        print("nao conseguiu separar as duas pilhas com 60 itens.")
    elif acc <= 0.75:
        print("VEREDITO: acima do chute, mas nao muito. A especificacao pega")
        print("a maior parte do estilo e escapa em algo. Os itens que voce")
        print("marcou certo como G sao onde olhar.")
    else:
        print("VEREDITO: voce separa as pilhas com facilidade. A especificacao")
        print("NAO reproduz sua voz. Veja a tabela de desvios em report.md e")
        print("os itens listados abaixo.")
    print()
    print(f"falso G (suas, julgadas geradas): {len(false_g)} -> {false_g}")
    print(f"falso R (geradas, passaram por suas): {len(false_r)} -> {false_r}")
    print()
    if false_r:
        print("as geradas que passaram:")
        for i in false_r[:12]:
            print(f"  {i:2d}. (ver blind-test.md)")
    print()
    print("Pra registrar o resultado no honesty-note, item 18, anote:")
    print(f"  n={n}, acerto={100*acc:.1f}%, "
          f"faixa de chute ate {100*hi:.1f}%")

    with open(os.path.join(HERE, "blind-result.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "n": n, "acertos": right, "acuracia": round(acc, 4),
            "ic95_chute": [round(lo, 4), round(hi, 4)],
            "falso_g": false_g, "falso_r": false_r,
            "respostas": ans,
        }, fh, ensure_ascii=False, indent=2)
    print(f"\nresultado salvo em {os.path.join(HERE, 'blind-result.json')}")


if __name__ == "__main__":
    main()
