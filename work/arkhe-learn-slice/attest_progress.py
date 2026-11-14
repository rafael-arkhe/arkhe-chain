"""Atesta o progresso do aluno: WormGraph + MMR + OVB, com calibracao real.

    python -I attest_progress.py [n_tentativas]

Diferenca em relacao a atestacao da memoria do Corvo
(`cognition/corvo-arkhe/pipeline/attest.py`): la o
`calibration_summary.samples` ficou **zerado de proposito**, porque calibracao
exige oraculo e o unico dado era o proprio corpus. Aqui existe oraculo -- o
veredito deterministico do `run_slice.py` -- entao a calibracao e medida de
verdade, nao preenchida com numero inventado.

E isso e a metrica pedagogica do produto. A habilidade que se treina em vibe
coding verificado nao e acertar, e a confianca bater com o que a verificacao
provou. ECE (expected calibration error) mede exatamente isso.

## Commit-reveal

A resposta e a confianca do aluno sao **comprometidas antes** de ele ver o
veredito: o no guarda `answer_commit = blake3(nonce|resposta|confianca)` e so
depois os valores revelados. Sem isso a calibracao nao vale nada, porque
bastaria ajustar a confianca depois de saber o resultado. Com o commitment no
WormGraph, alterar a confianca a posteriori quebra a verificacao.

## AVISO: a sessao e SIMULADA

Nao existe aluno. A sessao vem de um modelo parametrizado (`StudentModel`)
com habilidade e excesso de confianca explicitos. Os numeros de calibracao
sao mecanicamente corretos DADA a simulacao -- eles demonstram que o pipeline
mede, nao que algum humano tenha esses numeros.
"""
from __future__ import annotations

import json
import os
import random
import sys

import blake3 as _b3

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import mmr  # noqa: E402
from specs import SPECS  # noqa: E402

DOM_SPEC = b"ARKHE/LEARN/SPEC/v1"
DOM_ITEM = b"ARKHE/LEARN/ITEM/v1"
DOM_ATTEMPT = b"ARKHE/LEARN/ATTEMPT/v1"
CREATOR_KEY_ID = "arkhe:learn:creator:local"
BUNDLE_VERSION = 1
CONF_BUCKETS = (0.5, 0.7, 0.9, 1.0)


def h(*parts):
    d = _b3.blake3()
    for p in parts:
        d.update(p.encode("utf-8") if isinstance(p, str) else p)
    return d.hexdigest()


def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


# ---------------------------------------------------------------------------
# Banco de itens
# ---------------------------------------------------------------------------

def spec_digest(spec):
    return h(DOM_SPEC, canon({
        "id": spec["id"], "requirement": spec["requirement"],
        "entry": spec["entry"], "cases": spec["cases"],
    }))


def build_bank(exercises_path):
    """Itens = baselines (corretos) + mutantes legiveis (incorretos).

    O banco PRECISA de itens corretos. Se fosse so mutante, a resposta certa
    seria sempre "rejeito" e o exercicio nao mediria julgamento nenhum.
    """
    blob = json.load(open(exercises_path, encoding="utf-8"))
    by_spec = {s["id"]: s for s in SPECS}
    digests = {sid: spec_digest(s) for sid, s in by_spec.items()}
    pyver = f"{sys.version_info.major}.{sys.version_info.minor}"

    bank, seen_base = [], set()
    for e in blob["exercicios"]:
        if not e["legivel"]:
            continue
        sd = digests[e["spec"]]
        if e["spec"] not in seen_base:
            seen_base.add(e["spec"])
            bank.append({
                "item_id": h(DOM_ITEM, sd, e["baseline"], str(e["budget"]), pyver),
                "spec": e["spec"], "spec_digest": sd,
                "source": e["baseline"], "correto": True,
                "tipo": "baseline", "erro_nomeado": None,
                "budget": e["budget"], "python": pyver,
            })
        bank.append({
            "item_id": h(DOM_ITEM, sd, e["candidato"], str(e["budget"]), pyver),
            "spec": e["spec"], "spec_digest": sd,
            "source": e["candidato"], "correto": False,
            "tipo": e["tipo"], "erro_nomeado": e["erro_nomeado"],
            "budget": e["budget"], "python": pyver,
        })
    return bank, blob.get("fingerprint", "")


# ---------------------------------------------------------------------------
# Aluno simulado
# ---------------------------------------------------------------------------

DIFICULDADE = {
    "baseline": 0.80,       # reconhecer codigo correto
    "nunca_termina": 0.88,  # loop infinito e visivel
    "ache_o_bug": 0.74,
    "spec_fraca": 0.42,     # passa nos testes: o mais dificil
}

# Facilidade PERCEBIDA pelo aluno, que nao e a real. `spec_fraca` e o caso
# critico: o codigo passa em todos os testes, entao parece facil e o aluno
# fica confiante -- e e onde ele mais erra. A distancia entre este dict e o
# DIFICULDADE acima e o que o ECE captura.
PERCEPCAO = {
    "baseline": 0.80,
    "nunca_termina": 0.82,
    "ache_o_bug": 0.76,
    "spec_fraca": 0.78,     # parece facil, acerta 42%
}


class StudentModel:
    """Aluno sintetico com habilidade por tipo e excesso de confianca fixo."""

    def __init__(self, seed=99, overconfidence=0.18):
        self.rng = random.Random(seed)
        self.over = overconfidence

    def answer(self, item):
        p = DIFICULDADE.get(item["tipo"], 0.6)
        acerta = self.rng.random() < p
        # julga "correto" se acertou e o item e correto, etc.
        julga_correto = item["correto"] if acerta else not item["correto"]
        # Confianca ancorada na FACILIDADE PERCEBIDA do tipo, nao na
        # habilidade real -- e justamente a divergencia entre as duas que o
        # ECE mede. Ruido largo pra popular os quatro buckets; com ruido
        # estreito a confianca colapsa em dois e o ECE fica mal demonstrado.
        percebida = PERCEPCAO.get(item["tipo"], 0.6)
        alvo = min(percebida + self.over + self.rng.uniform(-0.30, 0.18), 1.0)
        conf = min(CONF_BUCKETS, key=lambda b: abs(b - alvo))
        return julga_correto, conf


# ---------------------------------------------------------------------------
# WormGraph de tentativas
# ---------------------------------------------------------------------------

def build_node(state_id, intent_id, verdict, transition_id, reject_reason,
               parent_ids, timestamp, content):
    parts = [state_id, "|", intent_id, "|", verdict, "|",
             transition_id or "", "|", reject_reason or "", "|",
             ",".join(parent_ids), "|", str(timestamp)]
    return {
        "node_id": h("".join(parts)),
        "state_id": state_id, "intent_id": intent_id, "verdict": verdict,
        "transition_id": transition_id, "reject_reason": reject_reason,
        "parent_ids": parent_ids, "timestamp": timestamp, "content": content,
    }


def run_session(bank, bank_fp, n_attempts, seed=99):
    rng = random.Random(seed)
    student = StudentModel(seed=seed)

    # sessao balanceada entre corretos e incorretos
    corretos = [i for i in bank if i["correto"]]
    errados = [i for i in bank if not i["correto"]]
    picks = []
    for k in range(n_attempts):
        pool = corretos if (k % 2 == 0 and corretos) else errados
        picks.append(rng.choice(pool))

    nodes, attempts, leaves = [], [], []
    prev = None
    for k, item in enumerate(picks):
        julga_correto, conf = student.answer(item)
        nonce = h(DOM_ATTEMPT, str(seed), str(k))[:32]
        commit = h(DOM_ATTEMPT, nonce, "correto" if julga_correto else "incorreto",
                   f"{conf:.2f}")

        # oraculo: o veredito deterministico ja esta no banco
        certo = julga_correto == item["correto"]
        verdict = "Allow" if certo else "Reject"
        reason = None if certo else (
            "falso_aprovado" if julga_correto else "falso_rejeitado")

        content = canon({
            "item_id": item["item_id"], "spec": item["spec"],
            "tipo": item["tipo"],
            "resposta": "correto" if julga_correto else "incorreto",
            "confianca": conf, "nonce": nonce,
            "gabarito": "correto" if item["correto"] else "incorreto",
        })
        state_id = h(content)
        intent_id = h(DOM_ATTEMPT, item["item_id"], commit)
        node = build_node(
            state_id=state_id, intent_id=intent_id, verdict=verdict,
            transition_id=h(intent_id, str(k)) if certo else None,
            reject_reason=reason, parent_ids=([prev] if prev else []),
            timestamp=k, content=content,
        )
        nodes.append(node)
        leaves.append(mmr.leaf_hash(node["node_id"]))
        prev = node["node_id"]
        attempts.append({
            "k": k, "item_id": item["item_id"], "spec": item["spec"],
            "tipo": item["tipo"], "erro_nomeado": item["erro_nomeado"],
            "answer_commit": commit, "nonce": nonce,
            "resposta": "correto" if julga_correto else "incorreto",
            "confianca": conf,
            "gabarito": "correto" if item["correto"] else "incorreto",
            "acertou": certo, "verdict": verdict, "reject_reason": reason,
            "node_id": node["node_id"],
        })
    return nodes, attempts, leaves


# ---------------------------------------------------------------------------
# Calibracao
# ---------------------------------------------------------------------------

def calibration(attempts):
    n = len(attempts)
    if not n:
        return {"samples": 0}
    acc = sum(1 for a in attempts if a["acertou"]) / n
    conf = sum(a["confianca"] for a in attempts) / n

    buckets, ece, max_gap = [], 0.0, 0.0
    for b in CONF_BUCKETS:
        grp = [a for a in attempts if a["confianca"] == b]
        if not grp:
            continue
        b_acc = sum(1 for a in grp if a["acertou"]) / len(grp)
        gap = abs(b - b_acc)
        ece += (len(grp) / n) * gap
        max_gap = max(max_gap, gap)
        buckets.append({"confianca": b, "n": len(grp),
                        "acuracia": round(b_acc, 4), "gap": round(gap, 4)})

    return {
        "samples": n,
        "mean_confidence": round(conf, 4),
        "mean_observed_accuracy": round(acc, 4),
        "mean_gap": round(abs(conf - acc), 4),
        "max_gap": round(max_gap, 4),
        "ece": round(ece, 4),
        "buckets": buckets,
        "falsos_aprovados": sum(
            1 for a in attempts if a["reject_reason"] == "falso_aprovado"),
        "falsos_rejeitados": sum(
            1 for a in attempts if a["reject_reason"] == "falso_rejeitado"),
    }


# ---------------------------------------------------------------------------
# OVB
# ---------------------------------------------------------------------------

def canonical_identity(nodes):
    return h(canon(nodes))


def verify(ovb):
    errs = []
    nodes = ovb.get("wormgraph_nodes") or []
    for field in ("mmr_root", "agent_identity", "trust_root_id"):
        if not ovb.get(field):
            errs.append(f"{field} ausente")
    if not ovb.get("signatures"):
        errs.append("signatures ausentes")
    if not nodes:
        errs.append("wormgraph vazio")
    if ovb.get("bundle_version") != BUNDLE_VERSION:
        errs.append("versao nao suportada")
    if ovb.get("trust_root_id") == CREATOR_KEY_ID:
        errs.append("trust_root_id == creator_key_id (INV-CONSCIOUSNESS-04)")
    if errs:
        return {"ok": False, "errors": errs}

    identity_ok = canonical_identity(nodes) == ovb["agent_identity"]
    content_bound = all(nd["state_id"] == h(nd["content"]) for nd in nodes)
    node_ids_ok = all(
        nd["node_id"] == build_node(
            nd["state_id"], nd["intent_id"], nd["verdict"], nd["transition_id"],
            nd["reject_reason"], nd["parent_ids"], nd["timestamp"],
            nd["content"])["node_id"]
        for nd in nodes
    )
    chain_ok = not nodes[0]["parent_ids"] and all(
        nodes[i]["parent_ids"] == [nodes[i - 1]["node_id"]]
        for i in range(1, len(nodes)))
    leaves = [mmr.leaf_hash(nd["node_id"]) for nd in nodes]
    mmr_ok = mmr.root(leaves).hex() == ovb["mmr_root"]
    trust_ok = ovb["trust_root_id"] == "rekor:dryrun:" + h(ovb["mmr_root"])

    # Commit-reveal, amarrado na cadeia.
    #
    # O compromisso entra no `intent_id`, que entra no `node_id`, que entra no
    # mmr_root. Entao recomputar o commitment a partir do conteudo revelado e
    # comparar o intent_id resultante prova que a resposta e a confianca sao
    # as mesmas que foram comprometidas ANTES de o aluno ver o veredito.
    # Mexer na confianca depois quebra aqui, no state_id e no node_id.
    commits_ok = True
    for nd in nodes:
        try:
            c = json.loads(nd["content"])
            commit = h(DOM_ATTEMPT, c["nonce"], c["resposta"],
                       f"{c['confianca']:.2f}")
            if h(DOM_ATTEMPT, c["item_id"], commit) != nd["intent_id"]:
                commits_ok = False
                break
        except (KeyError, ValueError, TypeError):
            commits_ok = False
            break

    # O array `attempts` e metadado fora da cadeia: confere contra os nos.
    attempts_consistent = True
    for a in ovb.get("attempts") or []:
        if h(DOM_ATTEMPT, a["nonce"], a["resposta"],
             f"{a['confianca']:.2f}") != a["answer_commit"]:
            attempts_consistent = False
            break

    allows = sum(1 for nd in nodes if nd["verdict"] == "Allow")
    return {
        "ok": all([identity_ok, content_bound, node_ids_ok, chain_ok,
                   mmr_ok, trust_ok, commits_ok, attempts_consistent]),
        "nodes_verified": len(nodes), "allows": allows,
        "rejects": len(nodes) - allows,
        "identity_ok": identity_ok, "content_bound_to_chain": content_bound,
        "node_ids_recomputed_ok": node_ids_ok, "parent_chain_ok": chain_ok,
        "mmr_root_ok": mmr_ok, "trust_root_derivation_ok": trust_ok,
        "answer_commitments_ok": commits_ok,
        "attempts_match_nodes": attempts_consistent,
        "trust_root_independent": ovb["trust_root_id"] != CREATOR_KEY_ID,
        "errors": [],
    }


def main():
    n_attempts = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    ex_path = os.path.join(HERE, "exercises", "exercises.json")
    if not os.path.isfile(ex_path):
        sys.exit("rode `python -I run_slice.py` primeiro")

    bank, bank_fp = build_bank(ex_path)
    nodes, attempts, leaves = run_session(bank, bank_fp, n_attempts)

    mmr_root = mmr.root(leaves).hex()
    agent_identity = canonical_identity(nodes)
    cal = calibration(attempts)

    ovb = {
        "bundle_version": BUNDLE_VERSION,
        "subject": "aluno:simulado:seed99",
        "SIMULADO": "sessao sintetica; nao ha aluno real. Ver docstring.",
        "exercise_bank_fingerprint": bank_fp,
        "bank_items": len(bank),
        "mmr_root": mmr_root,
        "agent_identity": agent_identity,
        "trust_root_id": "rekor:dryrun:" + h(mmr_root),
        "signatures": [h(f"selfsig|{agent_identity}")],
        "calibration_summary": cal,
        "wormgraph_nodes": nodes,
        "attempts": attempts,
    }
    report = verify(ovb)

    out = os.path.join(HERE, "progress")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "ovb.json"), "w", encoding="utf-8") as fh:
        json.dump(ovb, fh, ensure_ascii=False, indent=2)

    # prova de inclusao de uma tentativa, pra mostrar o caso de uso
    idx = min(7, len(leaves) - 1)
    proof = mmr.gen_proof(leaves, idx)
    proof_ok = mmr.verify_proof(leaves[idx], proof, bytes.fromhex(mmr_root))
    with open(os.path.join(out, "inclusion_proof.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"attempt": attempts[idx], "proof": proof,
                   "mmr_root": mmr_root, "verifica": proof_ok},
                  fh, ensure_ascii=False, indent=2)

    print(f"banco de itens        : {len(bank)} "
          f"({sum(1 for i in bank if i['correto'])} corretos, "
          f"{sum(1 for i in bank if not i['correto'])} incorretos)")
    print(f"fingerprint do banco  : {bank_fp[:32]}...")
    print(f"tentativas            : {len(attempts)}")
    print(f"  acertos (Allow)     : {report['allows']}")
    print(f"  erros (Reject)      : {report['rejects']}")
    print(f"    falso aprovado    : {cal['falsos_aprovados']}")
    print(f"    falso rejeitado   : {cal['falsos_rejeitados']}")
    print()
    print("CALIBRACAO (a metrica do produto)")
    print(f"  confianca media     : {cal['mean_confidence']}")
    print(f"  acuracia observada  : {cal['mean_observed_accuracy']}")
    print(f"  gap medio           : {cal['mean_gap']}")
    print(f"  gap maximo (bucket) : {cal['max_gap']}")
    print(f"  ECE                 : {cal['ece']}")
    for b in cal["buckets"]:
        print(f"    conf {b['confianca']:.1f}  n={b['n']:3d}  "
              f"acuracia={b['acuracia']:.2f}  gap={b['gap']:.2f}")
    print()
    print(f"agent_identity        : {agent_identity}")
    print(f"mmr_root              : {mmr_root}")
    print(f"verificacao           : {'OK' if report['ok'] else 'FALHOU'}")
    print(f"prova de inclusao #{idx}  : "
          f"{'OK' if proof_ok else 'FALHOU'} "
          f"(path {len(proof['path'])} + "
          f"{len(proof['peaks_left']) + len(proof['peaks_right'])} peaks)")
    print(f"saida                 : {out}")
    return ovb


if __name__ == "__main__":
    main()
