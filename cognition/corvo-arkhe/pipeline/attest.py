"""Passagem 6: atesta a memoria num WormGraph e exporta o OVB.

Entradas: out/memory/atoms.jsonl, out/memory/atoms.restricted.jsonl
Saidas  : out/attest/wormgraph.jsonl  (um no por atomo, append-only)
          out/attest/ovb.json         (Offline Verification Bundle)
          out/attest/identity.json    (agent_identity, mmr_root, trust_root)
          out/attest/MANIFEST.sha256

Semantica copiada do scaffold arkhe-consciousness (`core.py`), pra que o
verificador dele (`wasm-host/verify.mjs`) valide este bundle sem alteracao:

    node_id         = blake3(state_id|intent_id|verdict|transition_id|
                             reject_reason|parent_ids|timestamp)
    agent_identity  = blake3(json(nodes, sort_keys, separators, ensure_ascii=False))
    mmr_root        = blake3(concat(leaf_hashes))
    trust_root_id   = "rekor:dryrun:" + blake3(mmr_root)

O ponto que faz isto valer a pena: **a identidade do agente e o hash da
memoria dele**. Mudar, remover ou reordenar um atomo muda `agent_identity`.
Nao da pra reescrever o passado do Corvo sem que o hash denuncie.

Camada restrita: os atomos sensiveis ENTRAM no grafo, senao a identidade nao
cobriria a memoria inteira. Mas o campo `content` deles carrega apenas
`restricted:<blake3(claim)>` -- compromisso criptografico sem divulgacao.
O ovb.json pode ser entregue a um terceiro sem vazar o tier sensivel, e ao
mesmo tempo prova que aqueles atomos existiam e nao foram trocados.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

import blake3 as _b3

BUNDLE_VERSION = 1
CREATOR_KEY_ID = "arkhe:corvo:creator:local"


def h(s):
    b = s.encode("utf-8") if isinstance(s, str) else s
    return _b3.blake3(b).hexdigest()


def build_node(state_id, intent_id, verdict, transition_id, reject_reason,
               parent_ids, timestamp, content):
    parts = [
        state_id, "|", intent_id, "|", verdict, "|",
        transition_id or "", "|",
        reject_reason or "", "|",
        ",".join(parent_ids), "|",
        str(timestamp),
    ]
    return {
        "node_id": h("".join(parts)),
        "state_id": state_id,
        "intent_id": intent_id,
        "verdict": verdict,
        "transition_id": transition_id,
        "reject_reason": reject_reason,
        "parent_ids": parent_ids,
        "timestamp": timestamp,
        "content": content,
    }


def canonical_identity(nodes):
    return h(json.dumps(nodes, sort_keys=True, separators=(",", ":"),
                        ensure_ascii=False))


def verify(ovb, creator_key_id=CREATOR_KEY_ID):
    """Reimplementa verify_bundle_with_creator. Fail-closed."""
    errs = []
    if not ovb.get("mmr_root"):
        errs.append("mmr_root ausente")
    if not ovb.get("signatures"):
        errs.append("signatures ausentes")
    if not ovb.get("trust_root_id"):
        errs.append("trust_root_id ausente")
    nodes = ovb.get("wormgraph_nodes") or []
    if not nodes:
        errs.append("wormgraph vazio")
    if ovb.get("bundle_version") != BUNDLE_VERSION:
        errs.append(f"versao nao suportada: {ovb.get('bundle_version')}")
    for i, nd in enumerate(nodes):
        if not nd.get("node_id"):
            errs.append(f"no {i} malformado")
            break
    if ovb.get("trust_root_id") == creator_key_id:
        errs.append("trust_root_id == creator_key_id (INV-CONSCIOUSNESS-04)")
    if errs:
        return {"ok": False, "errors": errs}

    identity_ok = canonical_identity(nodes) == ovb["agent_identity"]
    expected_trust = "rekor:dryrun:" + h(ovb["mmr_root"])
    trust_ok = ovb["trust_root_id"] == expected_trust
    mmr_ok = h("".join(nd["node_id"] for nd in nodes)) == ovb["mmr_root"]

    # Cadeia: cada no aponta pro anterior; o primeiro nao tem pai.
    chain_ok = not nodes[0]["parent_ids"] and all(
        nodes[i]["parent_ids"] == [nodes[i - 1]["node_id"]]
        for i in range(1, len(nodes))
    )
    # Conteudo amarrado ao node_id via state_id. Sem este check, alterar
    # `content` e recalcular `agent_identity` passa pela verificacao.
    content_bound = all(nd["state_id"] == h(nd["content"]) for nd in nodes)

    # node_id recomputado a partir dos proprios campos do no. Sem isto,
    # alterar state_id (e com ele o content) sem mexer no node_id passa.
    node_ids_ok = all(
        nd["node_id"] == build_node(
            nd["state_id"], nd["intent_id"], nd["verdict"],
            nd["transition_id"], nd["reject_reason"], nd["parent_ids"],
            nd["timestamp"], nd["content"],
        )["node_id"]
        for nd in nodes
    )

    allows = sum(1 for nd in nodes if nd["verdict"] == "Allow")
    return {
        "ok": (identity_ok and trust_ok and mmr_ok and chain_ok
               and content_bound and node_ids_ok),
        "nodes_verified": len(nodes),
        "allows": allows,
        "rejects": len(nodes) - allows,
        "identity_ok": identity_ok,
        "content_bound_to_chain": content_bound,
        "node_ids_recomputed_ok": node_ids_ok,
        "mmr_root_ok": mmr_ok,
        "trust_root_independent": ovb["trust_root_id"] != creator_key_id,
        "trust_root_derivation_ok": trust_ok,
        "parent_chain_ok": chain_ok,
        "errors": [],
    }


def run(out_dir):
    adir = os.path.join(out_dir, "attest")
    os.makedirs(adir, exist_ok=True)
    mem = os.path.join(out_dir, "memory")

    pub = [json.loads(l) for l in open(os.path.join(mem, "atoms.jsonl"), encoding="utf-8")]
    res = [json.loads(l) for l in open(os.path.join(mem, "atoms.restricted.jsonl"),
                                       encoding="utf-8")]

    # Ordem canonica do grafo: timestamp ordinal (primeira linha de suporte),
    # depois atom_id. Deterministica e independente da ordem dos arquivos.
    everything = [(a, "public") for a in pub] + [(a, "restricted") for a in res]
    everything.sort(key=lambda t: (t[0]["support"][0], t[0]["atom_id"]))

    nodes = []
    prev = None
    for atom, tier in everything:
        verdict = atom["verdict"]
        content = (
            atom["claim"] if tier == "public"
            else "restricted:" + h(atom["claim"])
        )
        # DIVERGENCIA DELIBERADA do scaffold: state_id = blake3(content).
        #
        # No `WormNode.build` original, `content` nao entra no hash do
        # node_id -- so state_id, intent_id, verdict, transition_id,
        # reject_reason, parent_ids e timestamp entram. Como mmr_root e o
        # hash da concatenacao dos node_id, e trust_root_id deriva do
        # mmr_root, o conteudo acaba fora da cadeia de compromisso. Em
        # DryRun isso e explorável: trocar o texto de um no, recalcular
        # `agent_identity` (que qualquer um recalcula) e o bundle volta a
        # verificar, porque mmr_root e trust_root nao mudaram.
        #
        # Amarrando state_id ao content, o conteudo passa a estar dentro do
        # node_id -> dentro do mmr_root -> dentro do trust_root_id, e a
        # verificacao fica checavel sem dado externo: basta recomputar
        # blake3(content) e comparar. Ver tests/test_integrity.py,
        # violacao 6, e o honesty-note, item 9.
        state_id = h(content)
        intent_id = h(f"admit|{atom['kind']}|{atom['atom_id']}")
        transition_id = h(f"{intent_id}|{len(nodes)}") if verdict == "Allow" else None
        nd = build_node(
            state_id=state_id,
            intent_id=intent_id,
            verdict=verdict,
            transition_id=transition_id,
            reject_reason=atom["reject_reason"],
            parent_ids=([prev] if prev else []),
            timestamp=atom["support"][0],
            content=content,
        )
        nodes.append(nd)
        prev = nd["node_id"]

    agent_identity = canonical_identity(nodes)
    mmr_root = h("".join(nd["node_id"] for nd in nodes))
    trust_root_id = "rekor:dryrun:" + h(mmr_root)

    with open(os.path.join(adir, "wormgraph.jsonl"), "w", encoding="utf-8") as fh:
        for nd in nodes:
            fh.write(json.dumps(nd, sort_keys=True, separators=(",", ":"),
                                ensure_ascii=False) + "\n")

    ovb = {
        "bundle_version": BUNDLE_VERSION,
        "mmr_root": mmr_root,
        "agent_identity": agent_identity,
        "wormgraph_nodes": nodes,
        "signatures": [h(f"selfsig|{agent_identity}")],
        "trust_root_id": trust_root_id,
        "verifier_wasm": [],
        "calibration_summary": {
            "samples": 0,
            "mean_confidence": 0.0,
            "mean_observed_accuracy": 0.0,
            "mean_gap": 0.0,
            "max_gap": 0.0,
        },
    }
    with open(os.path.join(adir, "ovb.json"), "w", encoding="utf-8") as fh:
        json.dump(ovb, fh, ensure_ascii=False, separators=(",", ":"))

    report = verify(ovb)
    identity = {
        "agent": "Corvo/Arkhe",
        "agent_identity": agent_identity,
        "mmr_root": mmr_root,
        "trust_root_id": trust_root_id,
        "creator_key_id": CREATOR_KEY_ID,
        "rekor_env": "dryrun",
        "nodes": len(nodes),
        "allows": report["allows"],
        "rejects": report["rejects"],
        "tier_public": len(pub),
        "tier_restricted": len(res),
        "verification": report,
        "nota_calibracao": (
            "calibration_summary.samples = 0 de proposito. Calibracao exige "
            "oraculo: alguma fonte independente que diga se o atomo e "
            "verdadeiro. Este pipeline nao tem nenhuma -- a unica evidencia "
            "e o proprio corpus. Preencher o campo com um numero derivado da "
            "salience seria inventar acuracia. Fica zerado e declarado."
        ),
        "nota_timestamp": (
            "timestamp e o numero da linha no corpus, nao epoch. O corpus foi "
            "exportado sem data; a ordem e cronologica ascendente, entao a "
            "linha serve como tempo ordinal e nada mais."
        ),
    }
    with open(os.path.join(adir, "identity.json"), "w", encoding="utf-8") as fh:
        json.dump(identity, fh, ensure_ascii=False, indent=2)

    # MANIFEST sobre tudo que o pipeline produziu
    lines = []
    for root, _dirs, files in sorted(os.walk(out_dir)):
        for f in sorted(files):
            if f == "MANIFEST.sha256":
                continue
            p = os.path.join(root, f)
            digest = hashlib.sha256()
            with open(p, "rb") as fb:
                for chunk in iter(lambda: fb.read(1 << 20), b""):
                    digest.update(chunk)
            rel = os.path.relpath(p, out_dir).replace("\\", "/")
            lines.append(f"{digest.hexdigest()}  {rel}")
    with open(os.path.join(adir, "MANIFEST.sha256"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(f"[attest] nos: {len(nodes)} (Allow {report['allows']} / "
          f"Reject {report['rejects']})")
    print(f"[attest] agent_identity: {agent_identity}")
    print(f"[attest] mmr_root:       {mmr_root}")
    print(f"[attest] verify ok: {report['ok']}  {('erros: ' + str(report['errors'])) if report['errors'] else ''}")
    print(f"[attest] manifest: {len(lines)} arquivos")
    return identity


if __name__ == "__main__":
    run(sys.argv[1])
