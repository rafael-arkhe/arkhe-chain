#!/usr/bin/env python3
"""Oraculo de permissao com tokens por estagio, gravaveis num registro.

A diferenca em relacao ao desenho que avaliamos: aqui o oraculo emite e o RUNTIME
grava o token na captura. O verificador nunca emite token; ele confere o que foi
gravado. Sem isso nao existe TOCTOU detectavel: quem emite na hora de conferir so ve
o estado de agora, e reconferir o mesmo registro amanha daria outro resultado.

Estagios: T1 antes de recuperar, T2 antes de usar como apoio, T3 antes de exibir,
T4 antes de exportar. O relogio avanca entre estagios, entao revogacao no meio do
caminho e expressavel — e o estado "usado_mas_suprimido" e alcancavel de verdade.

O token carrega o estado avaliado inteiro, para que o verificador recalcule o digest
de permissao. Um digest que o runtime preenche com o que quiser nao prova nada.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets

ESTAGIOS = ("T1", "T2", "T3", "T4")
TTL_SEGUNDOS = 60
VERSAO_POLITICA = "v1"


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def digest_estado(estado: dict) -> str:
    return sha256_hex(json.dumps(estado, sort_keys=True, ensure_ascii=False,
                                 separators=(",", ":")).encode("utf-8"))


class Relogio:
    def __init__(self, inicio: int = 1000) -> None:
        self._agora = inicio

    def agora(self) -> int:
        return self._agora

    def avancar(self, segundos: int) -> None:
        self._agora += segundos


def estado_nulo() -> dict:
    return {"permitido": False, "papel": "nenhum", "inquilino": "t1", "sensibilidade": 3}


class Oraculo:
    """Estado de permissao, log de eventos e emissao de tokens assinados."""

    def __init__(self, relogio: Relogio, emissor: str = "oraculo-local",
                 segredo_hex: str = "") -> None:
        self.relogio = relogio
        self.emissor = emissor
        self.chave_id = emissor + "-" + secrets.token_hex(3)
        self.segredo = bytes.fromhex(segredo_hex) if segredo_hex else secrets.token_bytes(32)
        self._estado: dict[tuple[str, str], dict] = {}
        self._eventos: list[dict] = []
        self._agendados: list[dict] = []

    # --- mutacoes ---------------------------------------------------------
    def conceder(self, principal: str, recurso: str, papel: str = "leitor",
                 inquilino: str = "t1", sensibilidade: int = 1) -> dict:
        return self._mudar("concedido", principal, recurso,
                           {"permitido": True, "papel": papel, "inquilino": inquilino,
                            "sensibilidade": sensibilidade})

    def revogar(self, principal: str, recurso: str) -> dict:
        antigo = self.estado(principal, recurso)
        return self._mudar("revogado", principal, recurso, {**antigo, "permitido": False})

    def mudar_papel(self, principal: str, recurso: str, papel: str) -> dict:
        antigo = self.estado(principal, recurso)
        return self._mudar("papel_alterado", principal, recurso, {**antigo, "papel": papel})

    def _mudar(self, tipo: str, principal: str, recurso: str, novo: dict,
               efetivo_em: int | None = None) -> dict:
        antigo = self.estado(principal, recurso)
        agora = self.relogio.agora()
        self._estado[(principal, recurso)] = novo
        evento = {
            "evento_id": sha256_hex(f"{principal}:{recurso}:{agora}:{tipo}".encode())[:16],
            "tipo": tipo, "principal": principal, "recurso": recurso,
            "de_estado": antigo, "para_estado": novo,
            "efetivo_em": agora if efetivo_em is None else efetivo_em,
            "registrado_em": agora, "emissor": self.emissor,
        }
        evento["assinatura"] = self._assinar(evento)
        self._eventos.append(evento)
        return evento

    def mudar_retroativo(self, principal: str, recurso: str, efetivo_em: int) -> dict:
        """Evento com efeito no passado. Existe para ser detectado, nao para ser usado."""
        antigo = self.estado(principal, recurso)
        return self._mudar("revogado", principal, recurso,
                           {**antigo, "permitido": False}, efetivo_em=efetivo_em)

    def agendar(self, principal: str, recurso: str, tipo: str, em: int) -> None:
        """Mudanca que entra em vigor quando o relogio passar de `em`."""
        self._agendados.append({"principal": principal, "recurso": recurso,
                                "tipo": tipo, "em": em})

    def aplicar_agendados(self) -> list[dict]:
        agora = self.relogio.agora()
        aplicados = []
        restantes = []
        for a in self._agendados:
            if a["em"] <= agora:
                if a["tipo"] == "revogado":
                    aplicados.append(self.revogar(a["principal"], a["recurso"]))
                elif a["tipo"] == "concedido":
                    aplicados.append(self.conceder(a["principal"], a["recurso"]))
                else:
                    aplicados.append(self.mudar_papel(a["principal"], a["recurso"],
                                                      a["tipo"]))
            else:
                restantes.append(a)
        self._agendados = restantes
        return aplicados

    # --- consulta ---------------------------------------------------------
    def estado(self, principal: str, recurso: str) -> dict:
        return self._estado.get((principal, recurso), estado_nulo())

    def eventos(self, principal: str = "", recurso: str = "") -> list[dict]:
        return [e for e in self._eventos
                if (not principal or e["principal"] == principal)
                and (not recurso or e["recurso"] == recurso)]

    # --- tokens -----------------------------------------------------------
    def _assinar(self, objeto: dict) -> str:
        corpo = json.dumps({k: v for k, v in objeto.items() if k != "assinatura"},
                           sort_keys=True, ensure_ascii=False,
                           separators=(",", ":")).encode("utf-8")
        return hmac.new(self.segredo, corpo, hashlib.sha256).hexdigest()

    def emitir_token(self, principal: str, recurso: str, estagio: str) -> dict:
        if estagio not in ESTAGIOS:
            raise ValueError("estagio desconhecido: " + estagio)
        self.aplicar_agendados()
        agora = self.relogio.agora()
        estado = self.estado(principal, recurso)
        eventos = [e for e in self._eventos
                   if e["principal"] == principal and e["recurso"] == recurso
                   and e["efetivo_em"] <= agora]
        token = {
            "token_id": sha256_hex(f"tok:{principal}:{recurso}:{estagio}:{agora}:"
                                   f"{secrets.token_hex(4)}".encode())[:16],
            "estagio": estagio, "principal": principal, "recurso": recurso,
            "conferido_em": agora,
            "veredicto": "permite" if estado["permitido"] else "nega",
            "valido_de": agora, "valido_ate": agora + TTL_SEGUNDOS,
            "estado_avaliado": estado,
            "digest_permissao": digest_estado(estado),
            "versao_politica": VERSAO_POLITICA,
            "emissor": self.emissor, "emissor_chave_id": self.chave_id,
            "eventos_aplicados": [e["evento_id"] for e in eventos],
        }
        token["assinatura"] = self._assinar(token)
        return token

    def conferir_token(self, token: dict) -> tuple[bool, str]:
        """So o detentor da chave do emissor pode conferir a assinatura."""
        if token.get("emissor_chave_id") != self.chave_id:
            return False, "token de outra chave de emissor"
        esperado = self._assinar(token)
        if not hmac.compare_digest(str(token.get("assinatura", "")), esperado):
            return False, "assinatura do token nao confere"
        return True, "assinatura do token confere"


def autoteste() -> int:
    casos = []
    r = Relogio(1000)
    o = Oraculo(r)
    o.conceder("alice", "doc1")

    t1 = o.emitir_token("alice", "doc1", "T1")
    casos.append(("T1 permite com acesso concedido", t1["veredicto"] == "permite", ""))

    # TOCTOU de verdade: revogacao entra em vigor entre T2 e T3.
    t2 = o.emitir_token("alice", "doc1", "T2")
    o.agendar("alice", "doc1", "revogado", em=r.agora() + 5)
    r.avancar(10)
    t3 = o.emitir_token("alice", "doc1", "T3")
    casos.append(("T2 permite e T3 nega apos revogacao agendada",
                  t2["veredicto"] == "permite" and t3["veredicto"] == "nega",
                  t2["veredicto"] + "/" + t3["veredicto"]))
    casos.append(("os tokens tem ids distintos",
                  len({t1["token_id"], t2["token_id"], t3["token_id"]}) == 3, ""))
    casos.append(("os digests de permissao de T2 e T3 diferem",
                  t2["digest_permissao"] != t3["digest_permissao"], ""))
    casos.append(("o digest confere com o estado avaliado",
                  digest_estado(t3["estado_avaliado"]) == t3["digest_permissao"], ""))
    casos.append(("conferido_em nao retrocede", t3["conferido_em"] >= t2["conferido_em"], ""))

    ok, nota = o.conferir_token(t3)
    casos.append(("token assinado confere", ok, nota))
    falso = dict(t3)
    falso["veredicto"] = "permite"
    ok2, nota2 = o.conferir_token(falso)
    casos.append(("veredicto trocado derruba a assinatura", not ok2, nota2))

    o2 = Oraculo(Relogio(1000))
    ok3, nota3 = o2.conferir_token(t3)
    casos.append(("outro emissor nao valida o token", not ok3, nota3))

    r4 = Relogio(1000)
    o4 = Oraculo(r4)
    o4.conceder("bob", "doc2")
    evt = o4.mudar_retroativo("bob", "doc2", efetivo_em=500)
    casos.append(("evento retroativo e detectavel",
                  evt["registrado_em"] > evt["efetivo_em"],
                  "efetivo_em=" + str(evt["efetivo_em"]) + ", registrado_em="
                  + str(evt["registrado_em"])))

    r5 = Relogio(1000)
    o5 = Oraculo(r5)
    o5.conceder("ana", "doc3")
    t = o5.emitir_token("ana", "doc3", "T1")
    r5.avancar(120)
    casos.append(("token expira pelo TTL", t["valido_ate"] < r5.agora(),
                  "valido_ate=" + str(t["valido_ate"]) + ", agora=" + str(r5.agora())))

    falhas = 0
    for nome, ok, detalhe in casos:
        if not ok:
            falhas += 1
        print(("PASSOU " if ok else "FALHOU ") + nome + ("  | " + detalhe if detalhe else ""))
    print("")
    print(str(len(casos) - falhas) + "/" + str(len(casos)) + " propriedades do oraculo")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(autoteste())
