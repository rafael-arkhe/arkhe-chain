"""API de recuperacao sobre a memoria destilada do Corvo/Arkhe.

Uso como biblioteca:

    from corvo_memory import CorvoMemory
    m = CorvoMemory("out")
    for hit in m.recall("transparencia em contrato publico", k=8):
        print(hit["score"], hit["claim"], hit["support"])

    print(m.persona("mirror"))       # prompt de sistema, modo espelho
    print(m.verify())                # identidade bate com o OVB?

Uso como CLI:

    python loader/corvo_memory.py recall "transparencia" --k 8
    python loader/corvo_memory.py persona advisor
    python loader/corvo_memory.py verify
    python loader/corvo_memory.py stats

Toda resposta carrega `support`: os numeros de linha do corpus original que
sustentam a afirmacao. Um agente que use esta memoria pode citar a origem de
qualquer coisa que diga sobre ele. Se nao tem linha, nao e memoria -- e
inferencia, e tem de ser dita como tal.

O tier restrito NAO carrega por default. Exige `tiers=("public","restricted")`
explicito na chamada, uma decisao por conversa.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "pipeline"))

WORD = re.compile(r"[0-9A-Za-zÀ-ÿ']+")

# O tokenizador TEM de ser o mesmo que construiu o indice (pipeline/atoms.py
# usa P.index_tokens). Se este import falhar, a busca degrada em silencio:
# "contratos publicos" deixa de casar com "contrato publico". Por isso o
# fallback avisa em vez de so funcionar pior.
try:
    import patterns as _P
    _tokens = _P.index_tokens
    _TOKENIZER = "canonico"
except Exception as _e:  # pragma: no cover
    _TOKENIZER = f"degradado ({_e})"
    sys.stderr.write(
        "[corvo_memory] AVISO: pipeline/patterns.py nao importou; "
        "a busca vai usar tokenizacao crua e perder casamentos.\n"
    )

    def _tokens(text):
        return [w for w in WORD.findall(text.lower()) if len(w) >= 4]


class CorvoMemory:
    def __init__(self, out_dir):
        self.out = os.path.abspath(out_dir)
        self._atoms = None
        self._restricted = None
        self._index = None
        self._df = None

    # ---- carregamento preguicoso ------------------------------------------
    def _load(self, name):
        path = os.path.join(self.out, "memory", name)
        return [json.loads(l) for l in open(path, encoding="utf-8")]

    @property
    def atoms(self):
        if self._atoms is None:
            self._atoms = {
                a["atom_id"]: a for a in self._load("atoms.jsonl")
                if a["verdict"] == "Allow"
            }
        return self._atoms

    @property
    def restricted(self):
        if self._restricted is None:
            self._restricted = {
                a["atom_id"]: a for a in self._load("atoms.restricted.jsonl")
                if a["verdict"] == "Allow"
            }
        return self._restricted

    @property
    def index(self):
        if self._index is None:
            with open(os.path.join(self.out, "memory", "index.json"),
                      encoding="utf-8") as fh:
                self._index = json.load(fh)["index"]
            self._df = {w: len(ids) for w, ids in self._index.items()}
        return self._index

    # ---- recuperacao -------------------------------------------------------
    def recall(self, query, k=8, tiers=("public",), kinds=None, topics=None,
               min_salience=0.0, prefer_recent=True):
        """Busca atomos por relevancia lexical ponderada.

        score = soma(idf do termo casado)
              * (1 + 0.35*salience)
              * (1 + 0.15*log1p(support_n))
              * (1 + 0.10*epoch/9   se prefer_recent)
        """
        self.index  # forca carregamento do df
        pool = {}
        if "public" in tiers:
            pool.update(self.atoms)
        if "restricted" in tiers:
            pool.update(self.restricted)
        if not pool:
            return []

        n_docs = max(len(pool), 1)
        qt = set(_tokens(query))
        if not qt:
            return []

        scores = {}
        for aid, a in pool.items():
            at = set(_tokens(a["claim"]))
            hit = qt & at
            if not hit:
                continue
            idf = sum(
                math.log(1 + n_docs / (1 + self._df.get(w, 1))) for w in hit
            )
            s = idf
            s *= 1 + 0.35 * a["salience"]
            s *= 1 + 0.15 * math.log1p(a["support_n"])
            if prefer_recent:
                s *= 1 + 0.10 * (a["epoch_last"] / 9.0)
            scores[aid] = s

        out = []
        for aid, s in sorted(scores.items(), key=lambda x: -x[1]):
            a = pool[aid]
            if kinds and a["kind"] not in kinds:
                continue
            if topics and not (set(topics) & set(a["topics"])):
                continue
            if a["salience"] < min_salience:
                continue
            out.append({
                "score": round(s, 4),
                "atom_id": aid,
                "kind": a["kind"],
                "claim": a["claim"],
                "topics": a["topics"],
                "moves": a["moves"],
                "epoch_last": a["epoch_last"],
                "support": a["support"],
                "support_n": a["support_n"],
                "salience": a["salience"],
                "tier": a["tier"],
            })
            if len(out) >= k:
                break
        return out

    def by_kind(self, kind, k=20, tier="public"):
        pool = self.atoms if tier == "public" else self.restricted
        sel = [a for a in pool.values() if a["kind"] == kind]
        sel.sort(key=lambda a: -a["salience"])
        return sel[:k]

    # ---- persona -----------------------------------------------------------
    def persona(self, mode="advisor"):
        name = {"mirror": "mode-mirror.md", "espelho": "mode-mirror.md",
                "advisor": "mode-advisor.md", "assessor": "mode-advisor.md"}[mode]
        with open(os.path.join(self.out, "persona", name), encoding="utf-8") as fh:
            return fh.read()

    def exemplars(self, funcao=None, k=10):
        path = os.path.join(self.out, "persona", "exemplars.jsonl")
        out = []
        for l in open(path, encoding="utf-8"):
            e = json.loads(l)
            if funcao and e["funcao"] != funcao:
                continue
            out.append(e)
            if len(out) >= k:
                break
        return out

    def reasoning_profile(self):
        with open(os.path.join(self.out, "reasoning", "profile.md"),
                  encoding="utf-8") as fh:
            return fh.read()

    # ---- integridade -------------------------------------------------------
    def verify(self):
        import attest
        with open(os.path.join(self.out, "attest", "ovb.json"),
                  encoding="utf-8") as fh:
            ovb = json.load(fh)
        return attest.verify(ovb)

    def identity(self):
        with open(os.path.join(self.out, "attest", "identity.json"),
                  encoding="utf-8") as fh:
            return json.load(fh)

    def stats(self):
        ident = self.identity()
        return {
            "agent_identity": ident["agent_identity"],
            "nodes": ident["nodes"],
            "atomos_publicos_admitidos": len(self.atoms),
            "atomos_restritos_admitidos": len(self.restricted),
            "tokens_indexados": len(self.index),
        }


def main(argv=None):
    ap = argparse.ArgumentParser(description="memoria destilada do Corvo/Arkhe")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(HERE), "out"))
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("recall")
    r.add_argument("query")
    r.add_argument("--k", type=int, default=8)
    r.add_argument("--kind")
    r.add_argument("--topic")
    r.add_argument("--restricted", action="store_true",
                   help="inclui o tier sensivel (decisao explicita)")

    p = sub.add_parser("persona")
    p.add_argument("mode", choices=["mirror", "advisor", "espelho", "assessor"])

    e = sub.add_parser("exemplars")
    e.add_argument("--funcao")
    e.add_argument("--k", type=int, default=10)

    sub.add_parser("verify")
    sub.add_parser("stats")
    sub.add_parser("reasoning")

    a = ap.parse_args(argv)
    m = CorvoMemory(a.out)

    if a.cmd == "recall":
        tiers = ("public", "restricted") if a.restricted else ("public",)
        hits = m.recall(a.query, k=a.k, tiers=tiers,
                        kinds=[a.kind] if a.kind else None,
                        topics=[a.topic] if a.topic else None)
        if not hits:
            print("nada encontrado")
        for hhit in hits:
            marca = " [RESTRITO]" if hhit["tier"] == "restricted" else ""
            print(f"{hhit['score']:7.3f} [{hhit['kind']:12s} e{hhit['epoch_last']} "
                  f"n={hhit['support_n']}]{marca} {hhit['claim']}")
            print(f"        L{hhit['support'][:6]}")
    elif a.cmd == "persona":
        print(m.persona(a.mode))
    elif a.cmd == "exemplars":
        for ex in m.exemplars(a.funcao, a.k):
            print(f"[{ex['funcao']:11s} L{ex['ln']}] {ex['text']}")
    elif a.cmd == "verify":
        print(json.dumps(m.verify(), ensure_ascii=False, indent=2))
    elif a.cmd == "stats":
        print(json.dumps(m.stats(), ensure_ascii=False, indent=2))
    elif a.cmd == "reasoning":
        print(m.reasoning_profile())


if __name__ == "__main__":
    main()
