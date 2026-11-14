"""Testa a afirmacao central: a identidade do agente e o hash da memoria dele.

Se um destes testes passar quando nao devia, a atestacao nao vale nada. A
prova da irreversibilidade e a FALHA da verificacao apos cada violacao.

    python -I tests/test_integrity.py
"""
from __future__ import annotations

import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "loader"))

import attest  # noqa: E402

OUT = os.path.join(ROOT, "out")
OVB_PATH = os.path.join(OUT, "attest", "ovb.json")

_passed = []
_failed = []


def check(name, cond, detail=""):
    (_passed if cond else _failed).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def load():
    with open(OVB_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def main():
    base = load()

    print("baseline")
    rep = attest.verify(base)
    check("bundle intacto verifica", rep["ok"], f"{rep['nodes_verified']} nos")
    check("identidade confere", rep["identity_ok"])
    check("mmr_root confere", rep["mmr_root_ok"])
    check("trust_root derivado do mmr_root", rep["trust_root_derivation_ok"])
    check("trust_root != creator_key", rep["trust_root_independent"])
    check("cadeia de pais intacta", rep["parent_chain_ok"])

    print("\nviolacao 1: alterar o conteudo de um atomo no meio do grafo")
    t = copy.deepcopy(base)
    i = len(t["wormgraph_nodes"]) // 2
    t["wormgraph_nodes"][i]["content"] = "eu nunca disse isso"
    r = attest.verify(t)
    check("verificacao FALHA apos alterar conteudo", not r["ok"])
    check("  identity_ok fica falso", not r["identity_ok"])

    print("\nviolacao 2: remover um atomo")
    t = copy.deepcopy(base)
    del t["wormgraph_nodes"][7]
    r = attest.verify(t)
    check("verificacao FALHA apos remover no", not r["ok"])
    check("  cadeia de pais quebra", not r["parent_chain_ok"])

    print("\nviolacao 3: reordenar dois atomos")
    t = copy.deepcopy(base)
    n = t["wormgraph_nodes"]
    n[3], n[4] = n[4], n[3]
    r = attest.verify(t)
    check("verificacao FALHA apos reordenar", not r["ok"])

    print("\nviolacao 4: trocar o veredito de Reject pra Allow")
    t = copy.deepcopy(base)
    for nd in t["wormgraph_nodes"]:
        if nd["verdict"] == "Reject":
            nd["verdict"] = "Allow"
            nd["reject_reason"] = None
            break
    r = attest.verify(t)
    check("verificacao FALHA apos promover Reject", not r["ok"])

    print("\nviolacao 5: forjar trust_root como a chave do criador")
    t = copy.deepcopy(base)
    t["trust_root_id"] = attest.CREATOR_KEY_ID
    r = attest.verify(t)
    check("verificacao FALHA (INV-CONSCIOUSNESS-04)", not r["ok"])
    check("  erro nomeia o invariante",
          any("CONSCIOUSNESS-04" in e for e in r.get("errors", [])))

    print("\nviolacao 6: recalcular a identidade apos alterar (ataque esperto)")
    t = copy.deepcopy(base)
    t["wormgraph_nodes"][2]["content"] = "memoria plantada"
    t["agent_identity"] = attest.canonical_identity(t["wormgraph_nodes"])
    r = attest.verify(t)
    check("identity_ok volta a passar (esperado)", r["identity_ok"])
    check("mas o conteudo deixa de estar amarrado a cadeia",
          not r["content_bound_to_chain"],
          "state_id != blake3(content)")
    check("verificacao total FALHA", not r["ok"])

    print("\nviolacao 7: alterar content E state_id, sem mexer no node_id")
    t = copy.deepcopy(base)
    t["wormgraph_nodes"][2]["content"] = "memoria plantada"
    t["wormgraph_nodes"][2]["state_id"] = attest.h("memoria plantada")
    t["agent_identity"] = attest.canonical_identity(t["wormgraph_nodes"])
    r = attest.verify(t)
    check("content_bound volta a passar (esperado)", r["content_bound_to_chain"])
    check("mas o node_id nao recomputa", not r["node_ids_recomputed_ok"])
    check("verificacao total FALHA", not r["ok"])

    print("\nviolacao 8: forja completa, recomputando TUDO em cascata")
    print("  (este e o limite real do DryRun, nao uma falha do codigo)")
    t = copy.deepcopy(base)
    n = t["wormgraph_nodes"]
    n[2]["content"] = "memoria plantada"
    n[2]["state_id"] = attest.h(n[2]["content"])
    prev = None
    for nd in n:
        nd["parent_ids"] = [prev] if prev else []
        rebuilt = attest.build_node(
            nd["state_id"], nd["intent_id"], nd["verdict"], nd["transition_id"],
            nd["reject_reason"], nd["parent_ids"], nd["timestamp"], nd["content"],
        )
        nd["node_id"] = rebuilt["node_id"]
        prev = nd["node_id"]
    t["agent_identity"] = attest.canonical_identity(n)
    t["mmr_root"] = attest.h("".join(x["node_id"] for x in n))
    t["trust_root_id"] = "rekor:dryrun:" + attest.h(t["mmr_root"])
    t["signatures"] = [attest.h(f"selfsig|{t['agent_identity']}")]
    r = attest.verify(t)
    check("a forja completa PASSA na verificacao offline", r["ok"],
          "esperado: DryRun nao tem ancora externa")
    check("mas a identidade mudou, e e isso que denuncia",
          t["agent_identity"] != base["agent_identity"],
          f"{base['agent_identity'][:16]}... -> {t['agent_identity'][:16]}...")
    print("  -> Conclusao: a verificacao offline prova CONSISTENCIA INTERNA.")
    print("     Autenticidade exige que o agent_identity tenha sido publicado")
    print("     antes, por alguem que nao o criador (Rekor real). Em DryRun o")
    print("     trust_root deriva do proprio bundle, entao ele se auto-avaliza.")
    print("     Ver honesty-note, item 10.")

    print("\nconsistencia da camada restrita")
    leaked = [
        nd for nd in base["wormgraph_nodes"]
        if nd["content"].startswith("restricted:")
    ]
    check("tier restrito aparece como compromisso, nao texto",
          len(leaked) > 0, f"{len(leaked)} nos")
    check("nenhum no restrito expoe o claim",
          all(len(nd["content"]) == len("restricted:") + 64 for nd in leaked))

    print("\npersona e memoria carregam")
    from corvo_memory import CorvoMemory
    m = CorvoMemory(OUT)
    check("recall devolve resultado com proveniencia",
          bool(m.recall("transparencia contrato publico", k=3)))
    hits = m.recall("transparencia contrato publico", k=3)
    check("todo hit tem linha de suporte",
          all(hhit["support"] for hhit in hits))
    check("recall default NAO traz tier restrito",
          all(hhit["tier"] == "public" for hhit in m.recall("saude medico", k=10)))
    check("modo espelho carrega", "modo espelho" in m.persona("mirror"))
    check("modo assessor carrega", "modo assessor" in m.persona("advisor"))
    check("loader usa o tokenizador canonico",
          __import__("corvo_memory")._TOKENIZER == "canonico")

    print()
    print(f"{len(_passed)} passaram, {len(_failed)} falharam")
    if _failed:
        for f in _failed:
            print(f"  FALHOU: {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
