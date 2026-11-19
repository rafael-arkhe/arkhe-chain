#!/usr/bin/env python3
"""Gate de delegacao: verifica a decisao de delegar antes de qualquer execucao.

Vem da proposta de "gate de segunda ordem". O que foi mantido, o que foi corrigido e
o que foi acrescentado esta no PARECER-GATE-DELEGACAO.md. Em resumo:

  D1  a politica cobre a acao no escopo pedido            (da proposta, implementado)
  D2  a prova do orquestrador referencia este contrato    (da proposta, REDUZIDO:
      hash nao e prova; sem verificador registrado isto confere associacao, nao
      validade, e o resultado diz isso)
  D3  o orquestrador e identificado por allowlist do lado
      do verificador, nunca pela propria declaracao dele  (da proposta, corrigido)
  D4  o contrato nao expirou no momento da decisao        (acrescentado)
  D5  a decisao carrega quando foi tomada e sua janela    (acrescentado)
  D6  escopo nao vazio e limite de acoes positivo         (acrescentado)
  D7  a politica declarada existe na versao declarada     (acrescentado)
  D8  ancoragem externa ausente e declarada, nunca
      tratada como satisfeita                             (acrescentado)

O gate NAO fecha o problema de raiz de confianca: ele o nomeia um nivel acima. Um
orquestrador sem ancoragem externa so passa por allowlist local, e a decisao registra
exatamente isso em `limites`.

Uso:
  python -I -B delegacao.py --contrato <c.json> --politica <p.json> \
      --allowlist <a.json> --saida <decisao.json>
  python -I -B delegacao.py --autoteste
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import canonico  # noqa: E402

TTL_DECISAO = 120
TIPOS_DE_PROVA = ("lean4", "agentic_redux", "politica_assinada")
# Tipos com verificador registrado neste modulo. Vazio de proposito: nenhum verificador
# de prova formal esta integrado aqui, e dizer o contrario seria falso.
VERIFICADORES_DE_PROVA: dict[str, object] = {}


def _campos_obrigatorios(contrato: dict) -> list[str]:
    esperados = ["delegacao_id", "orquestrador_id", "acao", "classe_agente", "escopo",
                 "politica_id", "politica_versao", "prova", "assinatura_orquestrador"]
    return [c for c in esperados if c not in contrato]


def decidir(contrato: dict, politica: dict, allowlist: dict, agora: int) -> dict:
    """Decide a delegacao. Cada verificacao nomeia o que olhou e o que concluiu."""
    conferencias: list[dict] = []
    limites: list[str] = []

    def confere(ident: str, nome: str, ok: bool, detalhe: str) -> bool:
        conferencias.append({"id": ident, "verificacao": nome,
                             "resultado": "passa" if ok else "recusa",
                             "detalhe": detalhe})
        return ok

    faltando = _campos_obrigatorios(contrato)
    if faltando:
        confere("D0", "contrato completo", False,
                "faltam campos: " + ", ".join(faltando))
        return _montar(contrato, conferencias, limites, agora)
    confere("D0", "contrato completo", True, "todos os campos obrigatorios presentes")

    escopo = contrato["escopo"]

    # D7: a politica existe na versao declarada.
    pol_ok = (politica.get("politica_id") == contrato["politica_id"]
              and politica.get("versao") == contrato["politica_versao"])
    confere("D7", "politica declarada existe", pol_ok,
            ("politica " + str(contrato["politica_id"]) + " v"
             + str(contrato["politica_versao"]) + " encontrada") if pol_ok
            else ("contrato pede " + str(contrato["politica_id"]) + " v"
                  + str(contrato["politica_versao"]) + " e a politica fornecida e "
                  + str(politica.get("politica_id")) + " v" + str(politica.get("versao"))))

    # D1: a politica cobre a acao, a classe de agente e cada recurso do escopo.
    regra = (politica.get("acoes") or {}).get(contrato["acao"]) if pol_ok else None
    if regra is None:
        confere("D1", "politica cobre a acao", False,
                "a politica nao cobre a acao " + str(contrato["acao"]))
    else:
        fora = [r for r in escopo.get("recursos", [])
                if r not in regra.get("recursos", [])]
        classe_ok = contrato["classe_agente"] in regra.get("classes_de_agente", [])
        limite_ok = escopo.get("max_acoes", 0) <= regra.get("max_acoes", 0)
        detalhes = []
        if fora:
            detalhes.append("recursos fora da politica: " + ", ".join(fora))
        if not classe_ok:
            detalhes.append("classe de agente " + str(contrato["classe_agente"])
                            + " nao autorizada")
        if not limite_ok:
            detalhes.append("max_acoes " + str(escopo.get("max_acoes"))
                            + " acima do limite da politica "
                            + str(regra.get("max_acoes")))
        confere("D1", "politica cobre a acao", not detalhes,
                "; ".join(detalhes) if detalhes
                else ("acao " + contrato["acao"] + " coberta para "
                      + str(len(escopo.get("recursos", []))) + " recursos"))

    # D6: escopo utilizavel.
    recursos = escopo.get("recursos") or []
    max_acoes = escopo.get("max_acoes", 0)
    confere("D6", "escopo utilizavel", bool(recursos) and max_acoes > 0,
            ("escopo com " + str(len(recursos)) + " recursos e max_acoes " + str(max_acoes))
            if recursos and max_acoes > 0
            else "escopo vazio ou max_acoes nao positivo")

    # D4: o contrato nao expirou no momento da decisao.
    expira = escopo.get("expira_em")
    confere("D4", "contrato vigente na decisao", isinstance(expira, int) and agora <= expira,
            ("decidido em " + str(agora) + ", expira em " + str(expira))
            if isinstance(expira, int)
            else "expira_em ausente ou nao numerico")

    # D3: identidade do orquestrador pelo lado do verificador.
    permitidos = allowlist.get("orquestradores") or {}
    entrada = permitidos.get(contrato["orquestrador_id"])
    ancorado = contrato.get("ancorado_em")
    if entrada is None:
        confere("D3", "orquestrador identificado", False,
                "orquestrador " + str(contrato["orquestrador_id"])
                + " fora da allowlist do verificador")
    else:
        confere("D3", "orquestrador identificado", True,
                "orquestrador na allowlist do verificador como "
                + str(entrada.get("descricao", "sem descricao")))

    # D8: ancoragem externa. Ausente e declarada, nunca satisfeita por omissao.
    if ancorado:
        confere("D8", "ancoragem externa declarada", True,
                "contrato declara ancoragem em " + str(ancorado)
                + "; este gate NAO confere a ancora: nao ha integracao com registro "
                  "externo aqui")
        limites.append("a ancoragem declarada em " + str(ancorado) + " nao foi conferida: "
                       "nenhum registro externo e consultado por este gate")
    else:
        confere("D8", "ancoragem externa declarada", True,
                "sem ancoragem externa; a identidade vale apenas pela allowlist local")
        limites.append("sem ancoragem externa: a identidade do orquestrador vale apenas "
                       "pela allowlist deste verificador, que e confianca local e nao "
                       "raiz de confianca")

    # D2: a prova do orquestrador. Reduzida de proposito.
    prova = contrato.get("prova") or {}
    tipo = prova.get("tipo")
    if tipo not in TIPOS_DE_PROVA:
        confere("D2", "prova referencia este contrato", False,
                "tipo de prova desconhecido: " + str(tipo))
    elif prova.get("contrato_ref") != contrato["delegacao_id"]:
        confere("D2", "prova referencia este contrato", False,
                "a prova referencia " + str(prova.get("contrato_ref"))
                + " e este contrato e " + contrato["delegacao_id"])
    elif not prova.get("hash"):
        confere("D2", "prova referencia este contrato", False, "prova sem hash")
    else:
        confere("D2", "prova referencia este contrato", True,
                "a prova de tipo " + tipo + " referencia este contrato")
        if tipo not in VERIFICADORES_DE_PROVA:
            limites.append("a prova de tipo " + tipo + " nao foi verificada: um hash "
                           "prova associacao, nao validade, e nenhum verificador de "
                           + tipo + " esta registrado neste gate")

    return _montar(contrato, conferencias, limites, agora)


def _montar(contrato: dict, conferencias: list[dict], limites: list[str],
            agora: int) -> dict:
    recusas = [c for c in conferencias if c["resultado"] == "recusa"]
    return {
        "delegacao_id": contrato.get("delegacao_id"),
        "orquestrador_id": contrato.get("orquestrador_id"),
        "acao": contrato.get("acao"),
        "escopo": contrato.get("escopo"),
        "veredicto": "recusa" if recusas else "permite",
        "razoes_da_recusa": [c["id"] + ": " + c["detalhe"] for c in recusas],
        "decidido_em": agora,
        "valido_de": agora, "valido_ate": agora + TTL_DECISAO,
        "conferencias": conferencias,
        "limites": limites,
        "gate": "delegacao.py", "versao_gate": "1",
    }


def assinar_decisao(decisao: dict, chave: dict) -> dict:
    decisao = dict(decisao)
    decisao.update(canonico.assinar(decisao, chave))
    return decisao


# =========================================================================
# Autoteste: um falsificador por verificacao
# =========================================================================

POLITICA = {
    "politica_id": "pol-lote-documental", "versao": "1",
    "acoes": {
        "conferir_lote": {
            "recursos": ["lote-L002", "anexo-D001"],
            "classes_de_agente": ["runner-deterministico"],
            "max_acoes": 5,
        }
    },
}

ALLOWLIST = {
    "orquestradores": {
        "orq-local-teste": {"descricao": "orquestrador de teste do exemplo"},
    }
}


def contrato_base() -> dict:
    return {
        "delegacao_id": "del-0001",
        "orquestrador_id": "orq-local-teste",
        "acao": "conferir_lote",
        "classe_agente": "runner-deterministico",
        "escopo": {"recursos": ["lote-L002", "anexo-D001"], "max_acoes": 5,
                   "expira_em": 2000},
        "politica_id": "pol-lote-documental", "politica_versao": "1",
        "prova": {"tipo": "politica_assinada", "hash": "a" * 64,
                  "contrato_ref": "del-0001"},
        "assinatura_orquestrador": "sig-orq-teste",
        "ancorado_em": None,
    }


def autoteste() -> int:
    casos = []

    def caso(nome: str, contrato: dict, espera: str, ident: str = "",
             politica: dict | None = None, allowlist: dict | None = None,
             agora: int = 1000) -> None:
        d = decidir(contrato, politica or POLITICA, allowlist or ALLOWLIST, agora)
        ok = d["veredicto"] == espera
        if ok and ident:
            ok = any(r.startswith(ident + ":") for r in d["razoes_da_recusa"])
        detalhe = (d["razoes_da_recusa"][0] if d["razoes_da_recusa"]
                   else "veredicto " + d["veredicto"])
        casos.append((nome, ok, detalhe))

    caso("controlo positivo: contrato completo e coberto", contrato_base(), "permite")

    c = contrato_base()
    c["acao"] = "executar_pagamento"
    caso("D1 acao fora da politica", c, "recusa", "D1")

    c = contrato_base()
    c["escopo"]["recursos"] = ["lote-L002", "cofre-financeiro"]
    caso("D1 recurso fora da politica", c, "recusa", "D1")

    c = contrato_base()
    c["classe_agente"] = "agente-desconhecido"
    caso("D1 classe de agente nao autorizada", c, "recusa", "D1")

    c = contrato_base()
    c["escopo"]["max_acoes"] = 99
    caso("D1 limite acima do permitido pela politica", c, "recusa", "D1")

    c = contrato_base()
    c["prova"]["contrato_ref"] = "del-9999"
    caso("D2 prova referencia outro contrato", c, "recusa", "D2")

    c = contrato_base()
    c["prova"]["tipo"] = "prova_inventada"
    caso("D2 tipo de prova desconhecido", c, "recusa", "D2")

    c = contrato_base()
    c["orquestrador_id"] = "orq-desconhecido"
    caso("D3 orquestrador fora da allowlist", c, "recusa", "D3")

    c = contrato_base()
    c["orquestrador_id"] = "orq-desconhecido"
    c["ancorado_em"] = "rekor://indice-inventado"
    caso("D3 ancoragem declarada nao substitui a allowlist", c, "recusa", "D3")

    caso("D4 contrato expirado no momento da decisao", contrato_base(), "recusa", "D4",
         agora=5000)

    c = contrato_base()
    c["escopo"].pop("expira_em")
    caso("D4 expira_em ausente", c, "recusa", "D4")

    c = contrato_base()
    c["escopo"]["recursos"] = []
    caso("D6 escopo sem recurso", c, "recusa", "D6")

    c = contrato_base()
    c["escopo"]["max_acoes"] = 0
    caso("D6 max_acoes nao positivo", c, "recusa", "D6")

    c = contrato_base()
    c["politica_versao"] = "2"
    caso("D7 versao de politica inexistente", c, "recusa", "D7")

    c = contrato_base()
    c.pop("assinatura_orquedtrador", None)
    c.pop("assinatura_orquestrador")
    caso("D0 contrato incompleto", c, "recusa", "D0")

    # D8 e D5: propriedades da decisao que passa.
    d = decidir(contrato_base(), POLITICA, ALLOWLIST, 1000)
    casos.append(("D5 a decisao diz quando foi tomada e por quanto vale",
                  d["decidido_em"] == 1000 and d["valido_ate"] == 1000 + TTL_DECISAO,
                  "decidido_em " + str(d["decidido_em"]) + ", vale ate "
                  + str(d["valido_ate"])))
    casos.append(("D8 a falta de ancoragem e declarada como limite",
                  any("sem ancoragem externa" in l for l in d["limites"]),
                  d["limites"][0] if d["limites"] else "sem limites declarados"))
    casos.append(("D2 a prova nao verificada e declarada como limite",
                  any("nao foi verificada" in l for l in d["limites"]),
                  "; ".join(d["limites"])[:90]))
    casos.append(("nenhum verificador de prova formal esta registrado",
                  VERIFICADORES_DE_PROVA == {},
                  "dizer o contrario seria falso enquanto nao houver integracao"))

    falhas = 0
    for nome, ok, detalhe in casos:
        if not ok:
            falhas += 1
        print(("PASSOU " if ok else "FALHOU ") + nome + ("  | " + detalhe if detalhe else ""))
    print("")
    print(str(len(casos) - falhas) + "/" + str(len(casos))
          + " falsificadores do gate de delegacao")
    return 1 if falhas else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--autoteste", action="store_true")
    ap.add_argument("--contrato", default="")
    ap.add_argument("--politica", default="")
    ap.add_argument("--allowlist", default="")
    ap.add_argument("--agora", type=int, default=1000)
    ap.add_argument("--saida", default="")
    args = ap.parse_args()

    if args.autoteste or not args.contrato:
        return autoteste()

    contrato = json.loads(Path(args.contrato).read_text(encoding="utf-8"))
    politica = json.loads(Path(args.politica).read_text(encoding="utf-8"))
    allowlist = json.loads(Path(args.allowlist).read_text(encoding="utf-8"))
    decisao = decidir(contrato, politica, allowlist, args.agora)

    if args.saida:
        destino = Path(args.saida)
        chave = (canonico.carregar_chave(destino.parent / "chave-registro.json")
                 or canonico.nova_chave(destino.parent / "chave-registro.json"))
        decisao = assinar_decisao(decisao, chave)
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(decisao, ensure_ascii=False, indent=2),
                           encoding="utf-8")

    print("delegacao " + str(decisao["delegacao_id"]) + ": " + decisao["veredicto"])
    for r in decisao["razoes_da_recusa"]:
        print("  recusa " + r)
    for l in decisao["limites"]:
        print("  limite declarado: " + l)
    return 0 if decisao["veredicto"] == "permite" else 3


if __name__ == "__main__":
    raise SystemExit(main())
