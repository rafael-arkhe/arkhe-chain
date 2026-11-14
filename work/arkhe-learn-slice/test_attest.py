"""Testa a atestacao de progresso. A prova e a FALHA apos cada violacao.

    python -I test_attest.py

Cobre o que uma credencial de aluno precisa resistir:
  - alterar a confianca depois de ver o veredito (o ataque que mata calibracao)
  - promover um erro a acerto
  - apagar uma tentativa ruim
  - reordenar o historico
  - forjar a raiz de confianca
  - provar inclusao de uma tentativa sem revelar as outras
"""
from __future__ import annotations

import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import attest_progress as A  # noqa: E402
import mmr  # noqa: E402

_passed, _failed = [], []


def check(name, cond, detail=""):
    (_passed if cond else _failed).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def build():
    bank, fp = A.build_bank(os.path.join(HERE, "exercises", "exercises.json"))
    nodes, attempts, leaves = A.run_session(bank, fp, 48)
    root = mmr.root(leaves).hex()
    ident = A.canonical_identity(nodes)
    ovb = {
        "bundle_version": A.BUNDLE_VERSION,
        "subject": "aluno:simulado:seed99",
        "exercise_bank_fingerprint": fp,
        "bank_items": len(bank),
        "mmr_root": root,
        "agent_identity": ident,
        "trust_root_id": "rekor:dryrun:" + A.h(root),
        "signatures": [A.h(f"selfsig|{ident}")],
        "calibration_summary": A.calibration(attempts),
        "wormgraph_nodes": nodes,
        "attempts": attempts,
    }
    return ovb, leaves


def main():
    ovb, leaves = build()
    root_b = bytes.fromhex(ovb["mmr_root"])

    print("baseline")
    r = A.verify(ovb)
    check("bundle intacto verifica", r["ok"], f"{r['nodes_verified']} tentativas")
    check("identidade confere", r["identity_ok"])
    check("mmr_root confere", r["mmr_root_ok"])
    check("node_id recomputa", r["node_ids_recomputed_ok"])
    check("cadeia de pais intacta", r["parent_chain_ok"])
    check("compromissos de resposta conferem", r["answer_commitments_ok"])
    check("calibracao foi medida, nao zerada",
          ovb["calibration_summary"]["samples"] > 0,
          f"ECE={ovb['calibration_summary']['ece']}")

    print("\nviolacao 1: inflar a confianca depois de ver o veredito")
    t = copy.deepcopy(ovb)
    nd = t["wormgraph_nodes"][5]
    c = json.loads(nd["content"])
    c["confianca"] = 1.0
    nd["content"] = A.canon(c)
    nd["state_id"] = A.h(nd["content"])
    nd["node_id"] = A.build_node(
        nd["state_id"], nd["intent_id"], nd["verdict"], nd["transition_id"],
        nd["reject_reason"], nd["parent_ids"], nd["timestamp"],
        nd["content"])["node_id"]
    t["agent_identity"] = A.canonical_identity(t["wormgraph_nodes"])
    r = A.verify(t)
    check("verificacao FALHA", not r["ok"])
    check("  o compromisso denuncia", not r["answer_commitments_ok"],
          "intent_id nao bate com o commit recomputado")

    print("\nviolacao 2: promover um erro a acerto")
    t = copy.deepcopy(ovb)
    for nd in t["wormgraph_nodes"]:
        if nd["verdict"] == "Reject":
            nd["verdict"] = "Allow"
            nd["reject_reason"] = None
            break
    r = A.verify(t)
    check("verificacao FALHA", not r["ok"])
    check("  node_id nao recomputa", not r["node_ids_recomputed_ok"])

    print("\nviolacao 3: apagar uma tentativa ruim")
    t = copy.deepcopy(ovb)
    t["wormgraph_nodes"] = [
        nd for nd in t["wormgraph_nodes"] if nd["verdict"] == "Allow"]
    t["agent_identity"] = A.canonical_identity(t["wormgraph_nodes"])
    r = A.verify(t)
    check("verificacao FALHA", not r["ok"])
    check("  cadeia de pais quebra", not r["parent_chain_ok"])

    print("\nviolacao 4: reordenar o historico")
    t = copy.deepcopy(ovb)
    n = t["wormgraph_nodes"]
    n[2], n[9] = n[9], n[2]
    t["agent_identity"] = A.canonical_identity(n)
    r = A.verify(t)
    check("verificacao FALHA", not r["ok"])

    print("\nviolacao 5: forjar o trust_root como a chave do criador")
    t = copy.deepcopy(ovb)
    t["trust_root_id"] = A.CREATOR_KEY_ID
    r = A.verify(t)
    check("verificacao FALHA (INV-CONSCIOUSNESS-04)", not r["ok"])
    check("  erro nomeia o invariante",
          any("CONSCIOUSNESS-04" in e for e in r.get("errors", [])))

    print("\nviolacao 6: mexer no array `attempts` sem tocar nos nos")
    t = copy.deepcopy(ovb)
    t["attempts"][3]["confianca"] = 0.5
    r = A.verify(t)
    check("verificacao FALHA", not r["ok"])
    check("  attempts deixa de bater com os nos",
          not r["attempts_match_nodes"])

    print("\nprova de inclusao: provar uma tentativa sem mostrar as outras")
    idx = 7
    proof = mmr.gen_proof(leaves, idx)
    check("prova valida verifica",
          mmr.verify_proof(leaves[idx], proof, root_b))
    check("leaf forjado e rejeitado",
          not mmr.verify_proof(mmr.leaf_hash("tentativa inventada"), proof, root_b))
    check("prova contra raiz errada e rejeitada",
          not mmr.verify_proof(leaves[idx], proof,
                               bytes.fromhex(A.h("outra raiz"))[:32]))
    size = len(proof["path"]) + len(proof["peaks_left"]) + len(proof["peaks_right"])
    check("prova e logaritmica, nao linear", size < len(leaves) // 2,
          f"{size} hashes para {len(leaves)} tentativas")
    blob = json.dumps(proof)
    leaked = [nd for i, nd in enumerate(ovb["wormgraph_nodes"])
              if i != idx and nd["content"][:40] in blob]
    check("a prova nao revela o conteudo de outra tentativa", not leaked)

    print("\nviolacao 7: forja completa, recomputando tudo em cascata")
    print("  (o mesmo limite de DryRun do corvo-arkhe, nao falha de codigo)")
    t = copy.deepcopy(ovb)
    # Tem de ser um no que era REJECT, senao a "forja" nao muda nada e o
    # teste passa por engano -- foi o que aconteceu na primeira versao, que
    # pegou o indice 4 fixo e ele ja era um acerto.
    target = next(i for i, x in enumerate(t["wormgraph_nodes"])
                  if x["verdict"] == "Reject")
    nd = t["wormgraph_nodes"][target]
    c = json.loads(nd["content"])
    assert c["resposta"] != c["gabarito"], "o no escolhido ja era acerto"
    c["resposta"] = c["gabarito"]
    nd["content"] = A.canon(c)
    nd["state_id"] = A.h(nd["content"])
    commit = A.h(A.DOM_ATTEMPT, c["nonce"], c["resposta"], f"{c['confianca']:.2f}")
    nd["intent_id"] = A.h(A.DOM_ATTEMPT, c["item_id"], commit)
    nd["verdict"] = "Allow"
    nd["reject_reason"] = None
    prev = None
    for x in t["wormgraph_nodes"]:
        x["parent_ids"] = [prev] if prev else []
        x["node_id"] = A.build_node(
            x["state_id"], x["intent_id"], x["verdict"], x["transition_id"],
            x["reject_reason"], x["parent_ids"], x["timestamp"],
            x["content"])["node_id"]
        prev = x["node_id"]
    for a in t["attempts"]:
        if a["k"] == target:
            a["resposta"] = c["resposta"]
            a["answer_commit"] = commit
            a["acertou"] = True
            a["verdict"] = "Allow"
            a["reject_reason"] = None
    new_leaves = [mmr.leaf_hash(x["node_id"]) for x in t["wormgraph_nodes"]]
    t["mmr_root"] = mmr.root(new_leaves).hex()
    t["agent_identity"] = A.canonical_identity(t["wormgraph_nodes"])
    t["trust_root_id"] = "rekor:dryrun:" + A.h(t["mmr_root"])
    t["signatures"] = [A.h(f"selfsig|{t['agent_identity']}")]
    r = A.verify(t)
    check("a forja completa PASSA offline", r["ok"],
          "esperado: DryRun nao tem ancora externa")
    check("mas a identidade mudou, e e isso que denuncia",
          t["agent_identity"] != ovb["agent_identity"])
    print("  -> Mesma conclusao de sempre: a verificacao offline prova")
    print("     CONSISTENCIA INTERNA. Pra credencial valer pra terceiro, o")
    print("     agent_identity tem de ser publicado num log de transparencia")
    print("     no fim da sessao, por quem nao e o aluno.")

    print()
    print(f"{len(_passed)} passaram, {len(_failed)} falharam")
    for f in _failed:
        print(f"  FALHOU: {f}")
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
