"""Roda o pipeline inteiro, em ordem.

    python -I pipeline/run_all.py D:/arkhe/memory.md out

Cada passagem e independente e pode rodar sozinha; esta so garante a ordem e
imprime o resumo. Tudo e deterministico: mesma entrada, mesmos hashes.
"""
from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import atoms  # noqa: E402
import attest  # noqa: E402
import lexicon  # noqa: E402
import normalize  # noqa: E402
import persona  # noqa: E402
import reasoning  # noqa: E402

STAGES = [
    ("normalize", lambda c, o: normalize.run(c, o)),
    ("atoms", lambda c, o: atoms.run(o)),
    ("lexicon", lambda c, o: lexicon.run(o)),
    ("reasoning", lambda c, o: reasoning.run(o)),
    ("persona", lambda c, o: persona.run(o)),
    ("attest", lambda c, o: attest.run(o)),
]


def main():
    corpus = sys.argv[1] if len(sys.argv) > 1 else "D:/arkhe/memory.md"
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out"
    )
    if not os.path.isfile(corpus):
        sys.exit(f"corpus nao encontrado: {corpus}")

    print(f"corpus: {os.path.abspath(corpus)}")
    print(f"saida : {os.path.abspath(out)}")
    print()
    t_all = time.time()
    results = {}
    for name, fn in STAGES:
        t = time.time()
        results[name] = fn(corpus, out)
        print(f"  -> {name} em {time.time() - t:.1f}s")
        print()

    ident = results["attest"]
    print("=" * 66)
    print(f"agent_identity : {ident['agent_identity']}")
    print(f"mmr_root       : {ident['mmr_root']}")
    print(f"trust_root_id  : {ident['trust_root_id']}")
    print(f"nos            : {ident['nodes']} "
          f"(Allow {ident['allows']} / Reject {ident['rejects']})")
    print(f"verificacao    : {'OK' if ident['verification']['ok'] else 'FALHOU'}")
    print(f"total          : {time.time() - t_all:.1f}s")
    print("=" * 66)


if __name__ == "__main__":
    main()
