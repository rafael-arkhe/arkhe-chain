#!/usr/bin/env python3
"""Executa um plano de passos declarados e captura cada observacao byte a byte.

O que este runner garante, e que um log comum nao garante:
  - a observacao de cada passo e gravada crua, com sha256, antes de qualquer resumo;
  - so ferramentas da lista fixa rodam, com caminho preso a pasta base;
  - nada do que uma observacao diz altera o plano: o plano e lido uma vez, no inicio;
  - passo de escrita carrega chave de idempotencia e consulta um livro de aplicados,
    entao reexecutar o plano nao reaplica o efeito;
  - cada tentativa ganha sua propria pasta: nenhuma captura sobrescreve a anterior.

Uso: python -I -B executar.py [--plano execucao/plano.json] [--base .]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

_RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(_RAIZ))

import canonico  # noqa: E402  digest e assinatura por registro
import permissao  # noqa: E402  oraculo de permissao por estagio

# Padroes de segredo: a captura crua guarda o byte original, mas o registro
# compartilhavel nunca recebe o trecho. Ver montar_execucao.py.
PADROES_SEGREDO = (
    ("chave de API com prefixo s-k", "sk-"),
    ("token do GitHub", "ghp_"),
    ("token do Slack", "xoxb-"),
    ("chave de acesso AWS", "AKIA"),
    ("bloco PEM de chave privada", "-----BEGIN"),
    ("cabecalho de autorizacao", "Bearer "),
    ("campo de chave de API", "api_key"),
    ("campo de chave de API", "apikey"),
    ("campo de senha", "password="),
    ("campo de senha", "senha="),
    ("campo de segredo", "secret="),
)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# --- ferramentas: lista fixa, nenhuma delas executa conteudo -----------------

def _resolver(base: Path, caminho: str) -> Path:
    alvo = (base / caminho).resolve()
    if not alvo.is_relative_to(base.resolve()):
        raise PermissionError("caminho fora da base autorizada: " + caminho)
    return alvo


def ferr_listar_pasta(base: Path, args: dict) -> bytes:
    alvo = _resolver(base, args["caminho"])
    nomes = sorted(p.name + ("/" if p.is_dir() else "") for p in alvo.iterdir())
    return ("\n".join(nomes) + "\n").encode("utf-8")


def ferr_ler_texto(base: Path, args: dict) -> bytes:
    return _resolver(base, args["caminho"]).read_bytes()


def ferr_recuperar(base: Path, args: dict) -> bytes:
    """Monta contexto a partir de candidatos, fornecendo apenas os escolhidos.

    A observacao traz um cabecalho por bloco fornecido, para que cada trecho tenha
    endereco. O candidato recusado NAO entra na observacao: ele consta do registro do
    passo, com o motivo, para que descarte silencioso seja impossivel.
    """
    partes = []
    for item in args["candidatos"]:
        if not item.get("fornecido"):
            continue
        alvo = _resolver(base, item["caminho"])
        conteudo = alvo.read_bytes()
        if conteudo and not conteudo.endswith(b"\n"):
            conteudo += b"\n"
        partes.append(("--- " + item["id"] + " " + item["caminho"] + " ---\n").encode("utf-8"))
        partes.append(conteudo)
    return b"".join(partes)


def ferr_gravar_texto(base: Path, args: dict) -> bytes:
    alvo = _resolver(base, args["caminho"])
    alvo.parent.mkdir(parents=True, exist_ok=True)
    dados = args["conteudo"].encode("utf-8")
    alvo.write_bytes(dados)
    return ("gravado " + str(len(dados)) + " bytes em " + args["caminho"] + "\n").encode("utf-8")


FERRAMENTAS = {
    "listar_pasta": (ferr_listar_pasta, "leitura"),
    "ler_texto": (ferr_ler_texto, "leitura"),
    "recuperar": (ferr_recuperar, "leitura"),
    "gravar_texto": (ferr_gravar_texto, "escrita"),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plano", default="execucao/plano.json")
    ap.add_argument("--base", default=".")
    ap.add_argument("--captura", default="execucao/captura")
    ap.add_argument("--delegacao", default="",
                    help="decisao do gate de delegacao; sem permissao, nada executa")
    args = ap.parse_args()

    base = Path(args.base).resolve()
    plano_bruto = Path(args.plano).read_bytes()
    plano = json.loads(plano_bruto.decode("utf-8"))

    # Gate de delegacao a montante: sem decisao que permita, nada executa. A decisao
    # vem de delegacao.py e e gravada na captura como recebida.
    decisao = None
    if args.delegacao:
        decisao = json.loads(Path(args.delegacao).read_text(encoding="utf-8"))
        if decisao.get("veredicto") != "permite":
            print("delegacao recusada; nada foi executado")
            for r in decisao.get("razoes_da_recusa", []):
                print("  " + r)
            return 4
        fora = [p.get("recurso") for p in plano["passos"]
                if p.get("recurso")
                and p["recurso"] not in (decisao.get("escopo") or {}).get("recursos", [])]
        if fora:
            print("plano pede recurso fora do escopo delegado: " + ", ".join(sorted(set(fora))))
            return 4

    # A identidade da execucao vem do plano. Tentativas do mesmo plano nao se
    # sobrescrevem: cada uma recebe seu proprio numero.
    hash_plano = sha256_bytes(plano_bruto)
    raiz = Path(args.captura)
    raiz.mkdir(parents=True, exist_ok=True)
    anteriores = sorted(raiz.glob("R" + hash_plano[:8] + "-t*"))
    tentativa = len(anteriores) + 1
    run_id = "R" + hash_plano[:8] + "-t" + str(tentativa).zfill(2)
    destino = raiz / run_id
    destino.mkdir()
    (destino / "bruto").mkdir()

    livro_path = raiz / "aplicados.json"
    livro = json.loads(livro_path.read_text(encoding="utf-8")) if livro_path.is_file() else {}

    # Chave local de integridade do registro. Fica na raiz da captura, nunca no
    # registro. Prova que quem assinou a detinha, e nada alem disso.
    chave_path = raiz / "chave-registro.json"
    chave = canonico.carregar_chave(chave_path) or canonico.nova_chave(chave_path)

    # Oraculo de permissao: emite tokens por estagio. O relogio avanca entre estagios,
    # entao revogacao no meio do caminho e expressavel.
    relogio = permissao.Relogio(plano.get("relogio_inicial", 1000))
    oraculo = permissao.Oraculo(relogio)
    principal = plano.get("principal", "operador")
    for concessao in plano.get("permissoes_iniciais", []):
        oraculo.conceder(principal, concessao["recurso"],
                         papel=concessao.get("papel", "leitor"),
                         sensibilidade=concessao.get("sensibilidade", 1))
    for agendado in plano.get("eventos_agendados", []):
        oraculo.agendar(principal, agendado["recurso"], agendado["tipo"],
                        em=relogio.agora() + agendado["em_segundos"])
    if plano.get("evento_retroativo"):
        ev = plano["evento_retroativo"]
        oraculo.mudar_retroativo(principal, ev["recurso"], ev["efetivo_em"])
    avanco = plano.get("avanco_por_estagio", 5)

    def token(recurso: str, estagio: str) -> dict:
        relogio.avancar(avanco)
        return oraculo.emitir_token(principal, recurso, estagio)

    registros = []
    for passo in plano["passos"]:
        ferramenta, efeito_declarado = FERRAMENTAS.get(passo["ferramenta"], (None, None))
        entrada = json.dumps(passo["argumentos"], ensure_ascii=False, sort_keys=True)
        linha = {
            "id": passo["id"], "ferramenta": passo["ferramenta"],
            "efeito": passo["efeito"], "papel": passo["papel"],
            "proposito": passo["proposito"],
            "entrada": entrada, "sha256_entrada": sha256_bytes(entrada.encode("utf-8")),
        }

        if ferramenta is None:
            linha.update({"estado": "recusado", "motivo": "ferramenta fora da lista fixa",
                          "sha256_observacao": None, "bytes": 0, "arquivo": None})
            registros.append(linha)
            continue
        if passo["efeito"] != efeito_declarado:
            linha.update({"estado": "recusado",
                          "motivo": "efeito declarado (" + passo["efeito"]
                                    + ") difere do efeito da ferramenta ("
                                    + str(efeito_declarado) + ")",
                          "sha256_observacao": None, "bytes": 0, "arquivo": None})
            registros.append(linha)
            continue

        if passo["efeito"] == "escrita":
            chave_idem = passo.get("chave_idempotencia")
            if not chave_idem:
                linha.update({"estado": "recusado",
                              "motivo": "passo de escrita sem chave de idempotencia",
                              "sha256_observacao": None, "bytes": 0, "arquivo": None})
                registros.append(linha)
                continue
            linha["chave_idempotencia"] = chave_idem
            if chave_idem in livro:
                obs = ("efeito ja aplicado sob a chave " + chave_idem + " em "
                       + livro[chave_idem]["run_id"] + "; nao reaplicado\n").encode("utf-8")
                arq = destino / "bruto" / (passo["id"] + ".bin")
                arq.write_bytes(obs)
                linha.update({"estado": "repetido", "motivo": "chave ja aplicada",
                              "sha256_observacao": sha256_bytes(obs),
                              "bytes": len(obs), "arquivo": "bruto/" + arq.name})
                registros.append(linha)
                continue

        # --- T1: permissao para recuperar, antes de qualquer leitura ---------
        recurso = passo.get("recurso")
        tokens: dict[str, dict | None] = {e: None for e in permissao.ESTAGIOS}
        if recurso:
            tokens["T1"] = token(recurso, "T1")
            if tokens["T1"]["veredicto"] == "nega":
                linha.update({"estado": "recusado",
                              "estado_permissao": "revogado_antes_do_uso",
                              "recurso": recurso, "tokens": tokens,
                              "motivo": "T1 negou: sem permissao para recuperar",
                              "sha256_observacao": None, "bytes": 0, "arquivo": None})
                registros.append(linha)
                continue

        try:
            observacao = ferramenta(base, passo["argumentos"])
            estado, motivo = "executado", ""
        except (OSError, PermissionError, KeyError) as erro:
            observacao = (type(erro).__name__ + ": " + str(erro) + "\n").encode("utf-8")
            estado, motivo = "falhou", type(erro).__name__

        arq = destino / "bruto" / (passo["id"] + ".bin")
        arq.write_bytes(observacao)  # cru, antes de qualquer resumo
        # Hash do alvo lido: permite distinguir, numa reexecucao, o arquivo que mudou
        # no mundo da observacao que foi fabricada.
        sha_alvo = None
        if passo["efeito"] == "leitura" and "caminho" in passo["argumentos"]:
            try:
                alvo_lido = _resolver(base, passo["argumentos"]["caminho"])
                if alvo_lido.is_file():
                    sha_alvo = sha256_bytes(alvo_lido.read_bytes())
            except (OSError, PermissionError):
                sha_alvo = None
        # --- hierarquia: candidato, fornecido e motivo do descarte ----------
        if passo["ferramenta"] == "recuperar":
            candidatos = []
            # Localizacao em bytes, sem decodificar: o bloco entregue tem de ser
            # comparavel byte a byte com o arquivo de origem. Decodificar e rejuntar
            # linhas trocaria o fim de linha e quebraria justamente essa comparacao.
            cursor = 0
            for item in passo["argumentos"]["candidatos"]:
                alvo = _resolver(base, item["caminho"])
                bruto_arq = alvo.read_bytes() if alvo.is_file() else b""
                registro_cand = {
                    "id": item["id"], "caminho": item["caminho"],
                    "sha256_arquivo": sha256_bytes(bruto_arq) if bruto_arq else None,
                    "fornecido": bool(item.get("fornecido")),
                    "motivo_descarte": item.get("motivo_descarte", ""),
                }
                if item.get("fornecido"):
                    cabecalho = ("--- " + item["id"] + " " + item["caminho"]
                                 + " ---" + chr(10)).encode("utf-8")
                    pos = observacao.find(cabecalho, cursor)
                    inicio_bytes = pos + len(cabecalho)
                    prox = observacao.find(b"--- ", inicio_bytes)
                    fim_bytes = prox if prox != -1 else len(observacao)
                    cursor = fim_bytes
                    bloco = observacao[inicio_bytes:fim_bytes]
                    sha_bloco = sha256_bytes(bloco)
                    diferenca = ""
                    if bruto_arq and sha_bloco != sha256_bytes(bruto_arq):
                        diferenca = ("bloco difere do arquivo: "
                                     + str(len(bloco)) + " bytes contra "
                                     + str(len(bruto_arq))
                                     + "; nova linha final acrescentada na montagem"
                                     if not bruto_arq.endswith(b"\n")
                                     else "bloco difere do arquivo em " + str(
                                         abs(len(bloco) - len(bruto_arq))) + " bytes")
                    registro_cand.update({
                        "linha_inicio": observacao[:inicio_bytes].count(b"\n") + 1,
                        "linha_fim": observacao[:fim_bytes].count(b"\n"),
                        "bytes_fornecidos": len(bloco),
                        "sha256_fornecido": sha_bloco,
                        "diferenca_em_relacao_ao_arquivo": diferenca,
                    })
                candidatos.append(registro_cand)
            linha["recuperacao"] = {
                "candidatos": candidatos,
                "fornecidos": sum(1 for c in candidatos if c["fornecido"]),
                "descartados": sum(1 for c in candidatos if not c["fornecido"]),
            }

        # --- T2, T3, T4: usar como apoio, exibir, exportar ------------------
        estado_permissao = "sem_recurso"
        if recurso:
            estado_permissao = "exibido"
            tokens["T2"] = token(recurso, "T2")
            if tokens["T2"]["veredicto"] == "nega":
                estado_permissao = "nao_utilizavel"
            else:
                tokens["T3"] = token(recurso, "T3")
                if tokens["T3"]["veredicto"] == "nega":
                    estado_permissao = "usado_mas_suprimido"
                elif passo.get("exportar"):
                    tokens["T4"] = token(recurso, "T4")
                    if tokens["T4"]["veredicto"] == "nega":
                        estado_permissao = "suprimido_na_exportacao"
                    else:
                        estado_permissao = "exportado"

        linha.update({"estado": estado, "motivo": motivo,
                      "sha256_observacao": sha256_bytes(observacao),
                      "sha256_alvo": sha_alvo,
                      "bytes": len(observacao), "arquivo": "bruto/" + arq.name,
                      "segredos_detectados": sorted({rot for rot, pad in PADROES_SEGREDO
                                                    if pad.encode("utf-8") in observacao})})
        if recurso:
            linha.update({"recurso": recurso, "tokens": tokens,
                          "estado_permissao": estado_permissao})
        else:
            linha["estado_permissao"] = "sem_recurso"
        registros.append(linha)

        if passo["efeito"] == "escrita" and estado == "executado":
            livro[passo["chave_idempotencia"]] = {
                "run_id": run_id, "passo": passo["id"],
                "sha256_observacao": linha["sha256_observacao"],
            }

    # Digest e assinatura por registro, sobre a forma canonica de canonico.py.
    for linha in registros:
        linha.update(canonico.assinar(linha, chave))

    with (destino / "passos.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for linha in registros:
            f.write(json.dumps(linha, ensure_ascii=False, sort_keys=True) + "\n")

    # Log de permissao do runtime. Guarda o segredo do emissor de tokens, entao fica
    # na captura e nunca no registro compartilhavel.
    if decisao is not None:
        (destino / "delegacao.json").write_text(
            json.dumps(decisao, ensure_ascii=False, indent=2), encoding="utf-8")

    (destino / "permissoes.json").write_text(json.dumps({
        "_nota": "Chave local do emissor de tokens. Prova que os tokens sairam deste "
                 "oraculo. Nao e raiz de confianca e nao identifica ninguem.",
        "principal": principal, "emissor": oraculo.emissor,
        "emissor_chave_id": oraculo.chave_id,
        "segredo_hex": oraculo.segredo.hex(),
        "relogio_inicial": plano.get("relogio_inicial", 1000),
        "relogio_final": relogio.agora(),
        "avanco_por_estagio": avanco,
        "eventos": oraculo.eventos(),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (destino / "plano.json").write_bytes(plano_bruto)
    (destino / "meta.json").write_text(json.dumps({
        "run_id": run_id, "tentativa": tentativa, "sha256_plano": hash_plano,
        "tarefa": plano["tarefa"], "executor": plano["executor"],
        "base": str(base), "passos": len(registros),
        "executados": sum(1 for r in registros if r["estado"] == "executado"),
        "repetidos": sum(1 for r in registros if r["estado"] == "repetido"),
        "recusados": sum(1 for r in registros if r["estado"] == "recusado"),
        "falhos": sum(1 for r in registros if r["estado"] == "falhou"),
        "principal": principal,
        "chave_registro_id": chave["chave_id"],
        "emissor_chave_id": oraculo.chave_id,
        "estados_de_permissao": sorted({r.get("estado_permissao", "sem_recurso")
                                        for r in registros}),
        "reexecucao_possivel": True,
        "delegacao_id": (decisao or {}).get("delegacao_id"),
        "delegacao_decidida_em": (decisao or {}).get("decidido_em"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    livro_path.write_text(json.dumps(livro, ensure_ascii=False, indent=2), encoding="utf-8")

    perms = [r for r in registros if r.get("estado_permissao", "sem_recurso") != "sem_recurso"]
    if perms:
        print("permissao: " + ", ".join(
            r["id"] + "=" + r["estado_permissao"] for r in perms))
    print(run_id + ": " + str(len(registros)) + " passos, "
          + str(sum(1 for r in registros if r["estado"] == "executado")) + " executados, "
          + str(sum(1 for r in registros if r["estado"] == "repetido")) + " repetidos, "
          + str(sum(1 for r in registros if r["estado"] == "recusado")) + " recusados, "
          + str(sum(1 for r in registros if r["estado"] == "falhou")) + " falhos")
    print("captura crua em " + str(destino))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
