"""Passagem 2: destila atomos de memoria a partir das linhas de primeira pessoa.

Entrada : out/corpus/normalized.jsonl
Saidas  : out/memory/atoms.jsonl             (tier publico, admitidos e rejeitados)
          out/memory/atoms.restricted.jsonl  (tier sensivel, fora do contexto padrao)
          out/memory/topics.json             (matriz topico x epoca)
          out/memory/index.json              (indice invertido token -> atom_id)

Um atomo e uma afirmacao que ele fez sobre si mesmo, deduplicada, com a lista
de linhas do corpus que a sustentam (`support`). `support_n > 1` significa que
ele repetiu a afirmacao em momentos diferentes -- corroboracao, nao enfase.

O gate de admissao reproduz a semantica do ContainmentGate do scaffold:
fail-closed, quatro checagens sequenciais, cada uma capaz de rejeitar sozinha.
Atomo rejeitado NAO desaparece: fica no arquivo com `verdict: Reject` e o
motivo, porque a historia tem de ser completa pra identidade ser auditavel.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P  # noqa: E402

try:
    import blake3 as _b3

    def h(s):
        return _b3.blake3(s.encode("utf-8")).hexdigest()
except ImportError:  # pragma: no cover
    raise RuntimeError("pip install blake3")


# Prioridade do kind primario quando a linha bate em varios padroes.
KIND_PRIORITY = [
    "identity", "project", "relationship", "biography", "skill",
    "preference", "practice", "analysis", "belief", "state",
]

KIND_WEIGHT = {
    "identity": 1.00, "project": 0.95, "analysis": 0.85, "relationship": 0.80,
    "biography": 0.80, "skill": 0.75, "preference": 0.70, "practice": 0.70,
    "belief": 0.60, "state": 0.40,
}

# Topicos cujo conteudo e mais util pro agente operar hoje.
TOPIC_WEIGHT_HIGH = {"arkhe_govtech", "tech_dev", "ai_crypto", "money_work", "politics_society"}

# `analysis`: raciocinio dele sobre os dominios que importam pro trabalho.
# Nao vem de regex de padrao fixo -- vem da conjuncao topico + movimento
# argumentativo + comprimento, porque e assim que ele raciocina em texto.
ANALYSIS_TOPICS = TOPIC_WEIGHT_HIGH
ANALYSIS_MIN_LEN = 45

# Registros que nao podem ser lidos como auto-relato factual.
NON_FACTUAL_REGISTERS = {"action_bit"}

# Gate: parametros fail-closed.
MIN_CLAIM_LEN = 20
MAX_CLAIM_LEN = 400
MIN_SALIENCE = 0.34
MIN_CONTENT_WORDS = 3

_WS = re.compile(r"\s+")
_PUNCT_STRIP = re.compile(r"[^\wÀ-ÿ\s]+")
PROPER = re.compile(r"\b[A-ZÀ-Ý][a-zà-ý]{2,}\b")
NUMBER = re.compile(r"\d")


def dedup_key(text):
    t = _PUNCT_STRIP.sub(" ", text.lower())
    return _WS.sub(" ", t).strip()


def content_words(text):
    return [
        w for w in P.WORD.findall(text.lower())
        if len(w) >= 4 and w not in P.STOPWORDS
    ]


def salience(kind, support_n, claim, topics, epoch):
    """Score em [0,1]. Analogo a salience do WorkspaceSlot (GWT compete).

    Pesos escolhidos a mao, nao aprendidos -- ver honesty-note, TAU: CONJECTURE.
    """
    corrob = min(math.log1p(support_n) / math.log(11.0), 1.0)      # saturа em 10 repeticoes
    cw = content_words(claim)
    spec = min(len(cw) / 12.0, 1.0)
    anchored = 0.5 * bool(PROPER.search(claim)) + 0.5 * bool(NUMBER.search(claim))
    kw = KIND_WEIGHT.get(kind, 0.5)
    tw = 0.3 if not topics else (0.9 if any(t in TOPIC_WEIGHT_HIGH for t in topics) else 0.55)
    rec = epoch / 9.0

    s = (
        0.22 * corrob
        + 0.20 * spec
        + 0.10 * anchored
        + 0.26 * kw
        + 0.12 * tw
        + 0.10 * rec
    )
    return round(min(max(s, 0.0), 1.0), 4)


# Mensagem com bits e frequentemente copypasta de chat, que o pipeline nao
# sabe distinguir de fala propria (precisaria de um corpus multi-autor pra
# saber que a frase circula). Penalizamos a salience e deixamos a flag visivel
# em vez de fingir que o filtro resolveu. Ver honesty-note, item 6.
CHEER_SALIENCE_PENALTY = 0.75


def gate(claim, kind, sal, cw_count, flags):
    """Fail-closed. Devolve (verdict, reason)."""
    if flags["register"] in NON_FACTUAL_REGISTERS:
        return "Reject", "roleplay_not_selfreport"
    if flags["quoted"]:
        return "Reject", "quotation_not_own_claim"
    vs = P.voice_score(claim)
    if P.english_heavy(claim):
        return "Reject", "not_portuguese_likely_pasted"
    if P.PASTED_REGISTER.search(claim) and vs == 0:
        return "Reject", "news_or_policy_register"
    if len(claim) >= 180 and vs == 0:
        return "Reject", "long_without_idiolect_marker"
    if len(claim) < MIN_CLAIM_LEN:
        return "Reject", "claim_too_short"
    if len(claim) > MAX_CLAIM_LEN:
        return "Reject", "claim_too_long"
    if claim.rstrip().endswith("?"):
        return "Reject", "interrogative_not_claim"
    if cw_count < MIN_CONTENT_WORDS:
        return "Reject", "insufficient_content_words"
    if P.URL.search(claim) and len(P.URL.sub("", claim).strip()) < MIN_CLAIM_LEN:
        return "Reject", "mostly_url"
    if sal < MIN_SALIENCE:
        return "Reject", f"below_min_salience({MIN_SALIENCE})"
    return "Allow", None


def run(out_dir):
    mem_dir = os.path.join(out_dir, "memory")
    os.makedirs(mem_dir, exist_ok=True)
    norm_path = os.path.join(out_dir, "corpus", "normalized.jsonl")

    # agrupa por dedup_key
    groups = {}
    topic_epoch = defaultdict(Counter)
    with open(norm_path, encoding="utf-8") as fh:
        for raw in fh:
            r = json.loads(raw)
            for t in r["topics"]:
                topic_epoch[t][r["epoch"]] += 1
            if not r["fp"]:
                continue
            claim, flags = P.provenance(r["text"])
            if not claim:
                continue

            kinds = [k for k, rxs in P.ATOM_RE.items() if any(rx.search(claim) for rx in rxs)]
            # Broadening 1: toda fala de primeira pessoa sobre o projeto conta
            # como projeto, mesmo sem bater num padrao fixo.
            if "arkhe_govtech" in r["topics"]:
                kinds.append("project")
            # Broadening 2: raciocinio dele nos dominios de trabalho.
            if (
                set(r["topics"]) & ANALYSIS_TOPICS
                and r["moves"]
                and len(claim) >= ANALYSIS_MIN_LEN
            ):
                kinds.append("analysis")
            if not kinds:
                continue

            key = dedup_key(claim)
            if not key:
                continue
            g = groups.get(key)
            if g is None:
                groups[key] = {
                    "claim": claim,
                    "kinds": set(kinds),
                    "topics": set(r["topics"]),
                    "moves": set(r["moves"]),
                    "sens": set(r["sens"]),
                    "support": [r["ln"]],
                    "epoch_first": r["epoch"],
                    "epoch_last": r["epoch"],
                    "flags": flags,
                    "replies_to": ([flags["reply_to"]] if flags["reply_to"] else []),
                }
            else:
                g["kinds"].update(kinds)
                g["topics"].update(r["topics"])
                g["moves"].update(r["moves"])
                g["sens"].update(r["sens"])
                if len(g["support"]) < 25:
                    g["support"].append(r["ln"])
                else:
                    g["support_overflow"] = g.get("support_overflow", 0) + 1
                g["epoch_last"] = r["epoch"]
                if flags["reply_to"] and flags["reply_to"] not in g["replies_to"]:
                    g["replies_to"].append(flags["reply_to"])
                # Um registro factual em qualquer ocorrencia desqualifica o
                # roleplay: se ele disse a mesma coisa fora do /me, vale.
                if flags["register"] not in NON_FACTUAL_REGISTERS:
                    g["flags"] = flags
                # mantem a redacao mais longa como canonica
                if len(claim) > len(g["claim"]):
                    g["claim"] = claim

    atoms_pub, atoms_res = [], []
    counts = Counter()
    for key, g in groups.items():
        kind = next((k for k in KIND_PRIORITY if k in g["kinds"]), sorted(g["kinds"])[0])
        support_n = len(g["support"]) + g.get("support_overflow", 0)
        claim = g["claim"]
        sal = salience(kind, support_n, claim, g["topics"], g["epoch_last"])
        if g["flags"]["cheer"]:
            sal = round(sal * CHEER_SALIENCE_PENALTY, 4)
        cw = content_words(claim)
        verdict, reason = gate(claim, kind, sal, len(cw), g["flags"])
        tier = "restricted" if g["sens"] else "public"

        atom = {
            "atom_id": h(f"{kind}|{key}")[:32],
            "kind": kind,
            "kinds": sorted(g["kinds"]),
            "claim": claim,
            "topics": sorted(g["topics"]),
            "moves": sorted(g["moves"]),
            "epoch_first": g["epoch_first"],
            "epoch_last": g["epoch_last"],
            "support": g["support"],
            "support_n": support_n,
            "salience": sal,
            "verdict": verdict,
            "reject_reason": reason,
            "tier": tier,
            "sens": sorted(g["sens"]),
            "register": g["flags"]["register"],
            "cheer": g["flags"]["cheer"],
            "replies_to": g["replies_to"][:8],
        }
        counts[f"{tier}/{verdict}"] += 1
        counts[f"kind/{kind}"] += 1
        if reason:
            counts[f"reject/{reason}"] += 1
        (atoms_res if tier == "restricted" else atoms_pub).append(atom)

    # ordem estavel e deterministica: salience desc, depois atom_id
    for lst in (atoms_pub, atoms_res):
        lst.sort(key=lambda a: (-a["salience"], a["atom_id"]))

    def dump(path, lst):
        with open(path, "w", encoding="utf-8") as fh:
            for a in lst:
                fh.write(json.dumps(a, ensure_ascii=False) + "\n")

    dump(os.path.join(mem_dir, "atoms.jsonl"), atoms_pub)
    dump(os.path.join(mem_dir, "atoms.restricted.jsonl"), atoms_res)

    with open(os.path.join(mem_dir, "topics.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {
                "note": "epoca = decil da posicao no corpus (tempo ordinal, nao data)",
                "topic_by_epoch": {t: dict(sorted(c.items())) for t, c in topic_epoch.items()},
            },
            fh, ensure_ascii=False, indent=2,
        )

    # indice invertido sobre os atomos ADMITIDOS do tier publico
    inv = defaultdict(list)
    for a in atoms_pub:
        if a["verdict"] != "Allow":
            continue
        # P.index_tokens e o tokenizador canonico: tem de ser o mesmo usado
        # na consulta, em loader/corvo_memory.py.
        for w in set(P.index_tokens(a["claim"])):
            inv[w].append(a["atom_id"])
    inv = {w: ids for w, ids in inv.items() if len(ids) <= 400}
    with open(os.path.join(mem_dir, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {"note": "token -> atom_id, apenas atomos Allow do tier publico",
             "tokens": len(inv), "index": inv},
            fh, ensure_ascii=False,
        )

    print(f"[atoms] grupos: {len(groups)}")
    print(f"[atoms] publico: {len(atoms_pub)}  restrito: {len(atoms_res)}")
    for k, v in sorted(counts.items()):
        print(f"[atoms]   {k}: {v}")
    print(f"[atoms] tokens no indice: {len(inv)}")
    return {"public": len(atoms_pub), "restricted": len(atoms_res), "counts": dict(counts)}


if __name__ == "__main__":
    run(sys.argv[1])
