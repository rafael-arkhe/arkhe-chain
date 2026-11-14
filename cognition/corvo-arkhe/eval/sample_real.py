"""Amostra linhas reais held-out do corpus, excluindo o que o pipeline ja expos.

Por que excluir: durante o desenvolvimento eu li algumas centenas de linhas
(exemplares, atomos, cadeias de raciocinio). Essas linhas estao contaminadas
como material de teste cego -- eu poderia reconhece-las de cor em vez de
julgar o estilo. O sampler exclui toda linha que aparece em
out/persona/exemplars.jsonl, no `support` de qualquer atomo, ou nos
exemplares/cadeias de out/reasoning/profile.json.

Tres saidas:
  real_full.txt   n=400, sem filtro de comprimento. Serve pra conferir que a
                  amostra reproduz as taxas do corpus inteiro (sanidade do
                  harness) e como referencia da distribuicao verdadeira.
  real_band.txt   n=120, 25-140 caracteres. Referencia justa pra comparar com
                  texto gerado, porque assim comprimento nao confunde a
                  medida de estilo.
  real_blind.txt  n=30, disjunto de real_band, mesma faixa. Vai pro teste cego.

Deterministico: seed fixa, mesma amostra em toda execucao.
"""
from __future__ import annotations

import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = 20261114
BAND = (25, 140)


def seen_lines(out_dir):
    seen = set()
    p = os.path.join(out_dir, "persona", "exemplars.jsonl")
    if os.path.isfile(p):
        for l in open(p, encoding="utf-8"):
            seen.add(json.loads(l)["ln"])
    for name in ("atoms.jsonl", "atoms.restricted.jsonl"):
        p = os.path.join(out_dir, "memory", name)
        if os.path.isfile(p):
            for l in open(p, encoding="utf-8"):
                seen.update(json.loads(l)["support"])
    p = os.path.join(out_dir, "reasoning", "profile.json")
    if os.path.isfile(p):
        prof = json.load(open(p, encoding="utf-8"))
        for bucket in prof.get("exemplares", {}).values():
            for e in bucket:
                seen.add(e["ln"])
        for e in prof.get("cadeias_longas", []):
            seen.add(e["ln"])
    return seen


def run(out_dir, eval_dir):
    os.makedirs(eval_dir, exist_ok=True)
    skip = seen_lines(out_dir)

    pool_all, pool_band = [], []
    with open(os.path.join(out_dir, "corpus", "normalized.jsonl"),
              encoding="utf-8") as fh:
        for raw in fh:
            r = json.loads(raw)
            if r["ln"] in skip or r["sens"]:
                continue
            rec = (r["ln"], r["text"])
            pool_all.append(rec)
            if BAND[0] <= len(r["text"]) <= BAND[1]:
                pool_band.append(rec)

    rng = random.Random(SEED)
    full = rng.sample(pool_all, min(400, len(pool_all)))
    band_pick = rng.sample(pool_band, min(150, len(pool_band)))
    band, blind = band_pick[:120], band_pick[120:150]

    def dump(name, rows):
        with open(os.path.join(eval_dir, name), "w", encoding="utf-8") as fh:
            for ln, text in rows:
                fh.write(f"{ln}\t{text}\n")

    dump("real_full.txt", full)
    dump("real_band.txt", band)
    dump("real_blind.txt", blind)

    print(f"[sample] excluidas por contaminacao: {len(skip)} linhas")
    print(f"[sample] pool total {len(pool_all)}, pool na faixa {len(pool_band)}")
    print(f"[sample] real_full {len(full)} | real_band {len(band)} | "
          f"real_blind {len(blind)}")
    return {"full": len(full), "band": len(band), "blind": len(blind)}


if __name__ == "__main__":
    run(os.path.join(ROOT, "out"), os.path.join(ROOT, "eval", "arms"))
