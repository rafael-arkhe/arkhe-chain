#!/usr/bin/env python3
"""Forma canonica, digest e assinatura de um registro.

O parecer sobre o contrato v3 apontou que "SHA256 de todos os campos acima" nao e
reproduzivel sem fixar as escolhas. Aqui elas estao fixadas, e um teste confere que
duas ordens de chave diferentes dao o mesmo digest:

  - as chaves saem ordenadas (sort_keys), recursivamente;
  - sem espaco entre separadores;
  - texto em NFC, sem escapar nao-ASCII;
  - UTF-8;
  - os campos de digest e assinatura ficam fora do que se hasheia;
  - campo ausente e campo null sao a MESMA coisa: null e removido antes de hashear,
    senao o mesmo registro daria dois digests conforme quem o serializou.

A assinatura e um HMAC-SHA256 com chave local. Isso prova que quem assinou detinha a
chave, e nada alem: NAO e raiz de confianca, nao identifica pessoa nem organizacao, e
nao serve para terceiro conferir origem. Raiz de confianca externa continua pendente,
e o registro declara isso em vez de sugerir o contrario.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import unicodedata
from pathlib import Path

CAMPOS_FORA_DO_DIGEST = ("registro_digest", "registro_assinatura")
ALGORITMO = "HMAC-SHA256"


def _normalizar(valor):
    """Remove null recursivamente e normaliza texto em NFC."""
    if isinstance(valor, dict):
        return {k: _normalizar(v) for k, v in sorted(valor.items()) if v is not None}
    if isinstance(valor, (list, tuple)):
        return [_normalizar(v) for v in valor]
    if isinstance(valor, str):
        return unicodedata.normalize("NFC", valor)
    return valor


def forma_canonica(registro: dict) -> bytes:
    """Bytes sobre os quais o digest e calculado."""
    limpo = _normalizar({k: v for k, v in registro.items()
                         if k not in CAMPOS_FORA_DO_DIGEST})
    return json.dumps(limpo, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")


def digest(registro: dict) -> str:
    return hashlib.sha256(forma_canonica(registro)).hexdigest()


def nova_chave(caminho: Path, chave_id: str = "") -> dict:
    """Cria uma chave local. O segredo fica no arquivo e nunca entra no registro."""
    segredo = secrets.token_bytes(32)
    chave = {"chave_id": chave_id or ("local-" + secrets.token_hex(4)),
             "algoritmo": ALGORITMO, "segredo_hex": segredo.hex(),
             "_nota": "Chave local de integridade. Prova que quem assinou detinha esta "
                      "chave. Nao e raiz de confianca e nao identifica ninguem."}
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(chave, ensure_ascii=False, indent=2), encoding="utf-8")
    return chave


def carregar_chave(caminho: Path) -> dict | None:
    if not caminho.is_file():
        return None
    return json.loads(caminho.read_text(encoding="utf-8"))


def assinar(registro: dict, chave: dict) -> dict:
    """Devolve o par digest/assinatura, sem alterar o registro recebido."""
    d = digest(registro)
    mac = hmac.new(bytes.fromhex(chave["segredo_hex"]), d.encode("utf-8"),
                   hashlib.sha256).hexdigest()
    return {"registro_digest": d,
            "registro_assinatura": {"algoritmo": chave["algoritmo"],
                                    "chave_id": chave["chave_id"], "mac": mac}}


def conferir(registro: dict, chave: dict | None) -> tuple[bool, bool | None, str]:
    """(digest_ok, assinatura_ok, nota). assinatura_ok e None sem a chave."""
    esperado = registro.get("registro_digest")
    calculado = digest(registro)
    digest_ok = esperado == calculado
    if not digest_ok:
        return False, None, ("digest declarado " + str(esperado)[:16] + "… difere do "
                             "recalculado " + calculado[:16] + "…")

    assinatura = registro.get("registro_assinatura") or {}
    if chave is None:
        return True, None, ("digest confere; assinatura nao conferivel sem a chave "
                            + str(assinatura.get("chave_id", "(sem id)")))
    if assinatura.get("chave_id") != chave["chave_id"]:
        return True, False, ("assinatura referencia a chave "
                             + str(assinatura.get("chave_id"))
                             + " e a chave fornecida e " + chave["chave_id"])
    if assinatura.get("algoritmo") != chave["algoritmo"]:
        return True, False, "algoritmo da assinatura difere do da chave"
    esperado_mac = hmac.new(bytes.fromhex(chave["segredo_hex"]), calculado.encode("utf-8"),
                            hashlib.sha256).hexdigest()
    ok = hmac.compare_digest(str(assinatura.get("mac", "")), esperado_mac)
    return True, ok, ("digest e assinatura conferem com a chave " + chave["chave_id"]
                      if ok else "assinatura nao confere com a chave fornecida")


def autoteste() -> int:
    """Confere as propriedades que a forma canonica promete."""
    casos = []

    a = {"b": 2, "a": 1, "c": {"y": "ü", "x": [1, {"n": None, "m": 3}]}}
    b = {"c": {"x": [1, {"m": 3}], "y": "ü"}, "a": 1, "b": 2}
    casos.append(("ordem de chave, null ausente e NFC dao o mesmo digest",
                  digest(a) == digest(b), digest(a)[:16] + " vs " + digest(b)[:16]))

    c = dict(a)
    c["registro_digest"] = "qualquer"
    c["registro_assinatura"] = {"mac": "qualquer"}
    casos.append(("digest ignora os proprios campos de digest e assinatura",
                  digest(c) == digest(a), ""))

    d = dict(a)
    d["a"] = 2
    casos.append(("mudar um campo muda o digest", digest(d) != digest(a), ""))

    import tempfile
    with tempfile.TemporaryDirectory() as td:
        caminho = Path(td) / "chave.json"
        chave = nova_chave(caminho, "teste")
        registro = dict(a)
        registro.update(assinar(registro, chave))
        ok_d, ok_s, nota = conferir(registro, chave)
        casos.append(("registro assinado confere", ok_d and ok_s is True, nota))

        adulterado = dict(registro)
        adulterado["a"] = 99
        ok_d2, ok_s2, nota2 = conferir(adulterado, chave)
        casos.append(("campo adulterado derruba o digest", not ok_d2, nota2))

        outra = nova_chave(Path(td) / "outra.json", "outra")
        ok_d3, ok_s3, nota3 = conferir(registro, outra)
        casos.append(("chave errada derruba a assinatura", ok_d3 and ok_s3 is False, nota3))

        ok_d4, ok_s4, nota4 = conferir(registro, None)
        casos.append(("sem chave, assinatura fica indeterminada",
                      ok_d4 and ok_s4 is None, nota4))

        registro_mac = dict(registro)
        registro_mac["registro_assinatura"] = dict(registro["registro_assinatura"])
        registro_mac["registro_assinatura"]["mac"] = "0" * 64
        ok_d5, ok_s5, nota5 = conferir(registro_mac, chave)
        casos.append(("mac trocado derruba a assinatura, nao o digest",
                      ok_d5 and ok_s5 is False, nota5))

        casos.append(("o segredo nao esta no registro",
                      chave["segredo_hex"] not in json.dumps(registro), ""))

    falhas = 0
    for nome, ok, detalhe in casos:
        if not ok:
            falhas += 1
        print(("PASSOU " if ok else "FALHOU ") + nome + ("  | " + detalhe if detalhe else ""))
    print("")
    print(str(len(casos) - falhas) + "/" + str(len(casos)) + " propriedades da forma canonica")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(autoteste())
