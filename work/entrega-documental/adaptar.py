#!/usr/bin/env python3
"""Converte um traco de agente com LLM no formato de captura, sem inventar o que falta.

Um traco de mensagens carrega chamada de ferramenta e resultado. Nao carrega:
  - papel da observacao (fonte ou conteudo recebido);
  - efeito do passo (leitura ou escrita);
  - chave que torna o efeito idempotente;
  - citacao das afirmacoes da resposta final.
Nada disso e inferivel do traco. As tres primeiras vem de politica.json, declarada
por ferramenta; a quarta fica como esqueleto para quem anotar, e este adaptador nao
propoe citacao nenhuma: propor seria fabricar suporte.

Ferramenta sem politica e recusada. tool_use sem tool_result, id repetido e
tool_result orfao sao registrados como ocorrencia, nao corrigidos.

Dialetos aceitos: mensagens da API Anthropic (tool_use / tool_result) e da OpenAI
(tool_calls / role tool).

Uso: python -I -B adaptar.py --traco execucao/traco-exemplo.json \
         --politica execucao/politica.json --captura execucao/captura
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import executar  # noqa: E402  mesma lista de padroes de segredo do runner

PAPEIS = ("fonte", "conteudo_recebido")
EFEITOS = ("leitura", "escrita")


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def texto_do_resultado(conteudo) -> str:
    """O tool_result pode vir como string ou como lista de blocos."""
    if isinstance(conteudo, str):
        return conteudo
    if isinstance(conteudo, list):
        partes = []
        for bloco in conteudo:
            if isinstance(bloco, str):
                partes.append(bloco)
            elif isinstance(bloco, dict):
                partes.append(bloco.get("text", json.dumps(bloco, ensure_ascii=False)))
        return "".join(partes)
    return json.dumps(conteudo, ensure_ascii=False)


def extrair_anthropic(traco: dict) -> tuple[list[dict], list[dict], str]:
    """Devolve (chamadas, resultados, texto final)."""
    chamadas, resultados, textos = [], [], []
    for msg in traco.get("messages", []):
        conteudo = msg.get("content")
        if isinstance(conteudo, str):
            if msg.get("role") == "assistant":
                textos.append(conteudo)
            continue
        for bloco in conteudo or []:
            if not isinstance(bloco, dict):
                continue
            if bloco.get("type") == "tool_use":
                chamadas.append({"id": bloco.get("id"), "nome": bloco.get("name"),
                                 "entrada": bloco.get("input", {})})
            elif bloco.get("type") == "tool_result":
                resultados.append({"id": bloco.get("tool_use_id"),
                                   "texto": texto_do_resultado(bloco.get("content")),
                                   "erro": bool(bloco.get("is_error"))})
            elif bloco.get("type") == "text" and msg.get("role") == "assistant":
                textos.append(bloco.get("text", ""))
    return chamadas, resultados, textos[-1] if textos else ""


def extrair_openai(traco: dict) -> tuple[list[dict], list[dict], str]:
    chamadas, resultados, textos = [], [], []
    for msg in traco.get("messages", []):
        papel = msg.get("role")
        for chamada in msg.get("tool_calls") or []:
            fn = chamada.get("function", {})
            bruto = fn.get("arguments", "{}")
            try:
                entrada = json.loads(bruto) if isinstance(bruto, str) else bruto
            except json.JSONDecodeError:
                entrada = {"_argumentos_nao_json": bruto}
            chamadas.append({"id": chamada.get("id"), "nome": fn.get("name"),
                             "entrada": entrada})
        if papel == "tool":
            resultados.append({"id": msg.get("tool_call_id"),
                               "texto": texto_do_resultado(msg.get("content")),
                               "erro": False})
        elif papel == "assistant" and isinstance(msg.get("content"), str) and msg["content"]:
            textos.append(msg["content"])
    return chamadas, resultados, textos[-1] if textos else ""


CAMINHOS_DE_MENSAGENS = (
    ("messages",), ("conversation", "messages"), ("trace", "messages"),
    ("data", "messages"), ("result", "messages"), ("body", "messages"),
    ("request", "messages"), ("payload", "messages"), ("input", "messages"),
    ("conversa", "mensagens"), ("mensagens",),
)


def _parece_mensagem(obj) -> bool:
    return isinstance(obj, dict) and (
        "role" in obj or "tool_calls" in obj or "tool_call_id" in obj)


def carregar_traco(bruto: bytes) -> tuple[dict, str, list[str]]:
    """Encontra as mensagens num traco real, sem exigir um envelope especifico.

    Aceita: um documento JSON com as mensagens em alguma chave conhecida, uma lista
    JSON de mensagens, ou JSONL com uma mensagem (ou um evento que embrulha uma
    mensagem, como o transcript do Claude Code) por linha.

    Devolve (envelope normalizado, formato detectado, avisos). Nao encontrando
    mensagem, levanta ValueError dizendo o que achou, em vez de estourar adiante.
    """
    texto = bruto.decode("utf-8", errors="replace").strip()
    avisos: list[str] = []
    envelope: dict = {}
    mensagens: list = []
    formato = ""

    documento = None
    try:
        documento = json.loads(texto)
    except json.JSONDecodeError:
        pass

    if documento is not None:
        if isinstance(documento, list):
            mensagens = [m for m in documento if _parece_mensagem(m)]
            formato = "lista JSON de mensagens"
            if len(mensagens) != len(documento):
                avisos.append(str(len(documento) - len(mensagens))
                              + " itens da lista nao parecem mensagem e foram ignorados")
        elif isinstance(documento, dict):
            envelope = {k: v for k, v in documento.items()
                        if isinstance(v, (str, int, float, bool))}
            for caminho in CAMINHOS_DE_MENSAGENS:
                no = documento
                for chave in caminho:
                    no = no.get(chave) if isinstance(no, dict) else None
                    if no is None:
                        break
                if isinstance(no, list) and any(_parece_mensagem(m) for m in no):
                    mensagens = [m for m in no if _parece_mensagem(m)]
                    formato = "JSON, mensagens em " + ".".join(caminho)
                    break
            if not mensagens:
                raise ValueError(
                    "nenhuma lista de mensagens encontrada. Chaves do nivel de cima: "
                    + ", ".join(sorted(documento)[:20])
                    + ". Procurei em: " + "; ".join(".".join(c) for c in CAMINHOS_DE_MENSAGENS)
                    + ". Passe o traco com as mensagens em uma dessas chaves, ou como "
                      "lista, ou como JSONL de uma mensagem por linha.")
        else:
            raise ValueError("o traco e um JSON que nao e objeto nem lista")
    else:
        linhas, ruins = [], 0
        for n, linha in enumerate(texto.splitlines(), start=1):
            linha = linha.strip()
            if not linha:
                continue
            try:
                linhas.append(json.loads(linha))
            except json.JSONDecodeError:
                ruins += 1
        if not linhas:
            raise ValueError("o traco nao e JSON valido nem JSONL: nenhuma linha "
                             "parseou como JSON")
        if ruins:
            avisos.append(str(ruins) + " linhas do JSONL nao parsearam e foram ignoradas")
        for item in linhas:
            if _parece_mensagem(item):
                mensagens.append(item)
            elif isinstance(item, dict) and _parece_mensagem(item.get("message")):
                mensagens.append(item["message"])  # evento que embrulha a mensagem
            elif isinstance(item, dict):
                for chave in ("model", "harness", "tarefa", "task", "version"):
                    if isinstance(item.get(chave), str) and chave not in envelope:
                        envelope[chave] = item[chave]
        formato = "JSONL, uma mensagem por linha"
        if not mensagens:
            raise ValueError("JSONL lido, mas nenhuma linha tem 'role', 'tool_calls' "
                             "ou um objeto 'message' dentro")

    envelope["messages"] = mensagens
    return envelope, formato, avisos


def detectar_dialeto(traco: dict) -> str:
    for msg in traco.get("messages", []):
        if msg.get("tool_calls") or msg.get("role") == "tool":
            return "openai"
        conteudo = msg.get("content")
        if isinstance(conteudo, list):
            for bloco in conteudo:
                if isinstance(bloco, dict) and bloco.get("type") in ("tool_use", "tool_result"):
                    return "anthropic"
    return "anthropic"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--traco", required=True)
    ap.add_argument("--politica", default="execucao/politica.json")
    ap.add_argument("--captura", default="execucao/captura")
    ap.add_argument("--resposta", default="",
                    help="onde gravar o esqueleto de resposta; por omissao, dentro da captura")
    ap.add_argument("--revisor", default="",
                    help="quem revisa este registro; vazio mantem a revisao como nao concluida")
    args = ap.parse_args()

    traco_bruto = Path(args.traco).read_bytes()
    try:
        traco, formato, avisos_formato = carregar_traco(traco_bruto)
    except ValueError as erro:
        print("nao foi possivel ler o traco: " + str(erro))
        return 2
    politica = json.loads(Path(args.politica).read_text(encoding="utf-8"))
    por_ferramenta = politica.get("ferramentas", {})

    dialeto = detectar_dialeto(traco)
    extrair = extrair_anthropic if dialeto == "anthropic" else extrair_openai
    chamadas, resultados, texto_final = extrair(traco)

    # --- integridade do traco, registrada e nao corrigida --------------------
    ocorrencias: list[dict] = []
    vistos: dict[str, int] = {}
    for c in chamadas:
        vistos[c["id"]] = vistos.get(c["id"], 0) + 1
    for ident, n in vistos.items():
        if n > 1:
            ocorrencias.append({"tipo": "id repetido", "detalhe":
                                str(ident) + " aparece " + str(n) + " vezes no traco"})
    por_id_resultado: dict[str, dict] = {}
    for r in resultados:
        if r["id"] in por_id_resultado:
            ocorrencias.append({"tipo": "resultado duplicado",
                                "detalhe": str(r["id"]) + " tem mais de um resultado"})
        por_id_resultado[r["id"]] = r
    for r in resultados:
        if r["id"] not in vistos:
            ocorrencias.append({"tipo": "resultado orfao",
                                "detalhe": "resultado para " + str(r["id"])
                                           + " sem chamada correspondente"})

    for aviso in avisos_formato:
        ocorrencias.append({"tipo": "formato do traco", "detalhe": aviso})
    normalizado = json.dumps(traco, ensure_ascii=False, sort_keys=True).encode("utf-8")
    hash_traco = sha256_bytes(traco_bruto)
    hash_normalizado = sha256_bytes(normalizado)
    raiz = Path(args.captura)
    raiz.mkdir(parents=True, exist_ok=True)
    anteriores = sorted(raiz.glob("A" + hash_traco[:8] + "-t*"))
    tentativa = len(anteriores) + 1
    run_id = "A" + hash_traco[:8] + "-t" + str(tentativa).zfill(2)
    destino = raiz / run_id
    destino.mkdir()
    (destino / "bruto").mkdir()

    registros = []
    sem_politica: set[str] = set()
    for n, c in enumerate(chamadas, start=1):
        pid = "P" + str(n).zfill(2)
        entrada = json.dumps(c["entrada"], ensure_ascii=False, sort_keys=True)
        regra = por_ferramenta.get(c["nome"])
        linha = {
            "id": pid, "ferramenta": c["nome"] or "(sem nome)",
            "id_no_traco": c["id"],
            "entrada": entrada,
            "sha256_entrada": sha256_bytes(entrada.encode("utf-8")),
            "proposito": "passo escolhido pelo modelo durante a execucao",
            "sha256_alvo": None,
        }

        if regra is None:
            sem_politica.add(str(c["nome"]))
            linha.update({"papel": "nao_declarado", "efeito": "nao_declarado",
                          "estado": "recusado",
                          "motivo": "ferramenta sem politica: papel e efeito nao declarados",
                          "sha256_observacao": None, "bytes": 0, "arquivo": None})
            registros.append(linha)
            continue

        papel, efeito = regra.get("papel"), regra.get("efeito")
        if papel not in PAPEIS or efeito not in EFEITOS:
            linha.update({"papel": str(papel), "efeito": str(efeito), "estado": "recusado",
                          "motivo": "politica invalida para esta ferramenta",
                          "sha256_observacao": None, "bytes": 0, "arquivo": None})
            registros.append(linha)
            continue
        linha.update({"papel": papel, "efeito": efeito,
                      "justificativa_politica": regra.get("justificativa", "")})

        if efeito == "escrita":
            campos = regra.get("chave_de") or []
            faltando = [campo for campo in campos if campo not in c["entrada"]]
            if not campos or faltando:
                linha.update({"estado": "recusado",
                              "motivo": ("chave de idempotencia nao derivavel: "
                                         + ("politica sem chave_de" if not campos
                                            else "argumentos ausentes " + ", ".join(faltando))),
                              "sha256_observacao": None, "bytes": 0, "arquivo": None})
                registros.append(linha)
                continue
            material = c["nome"] + "|" + "|".join(
                json.dumps(c["entrada"][campo], ensure_ascii=False, sort_keys=True)
                for campo in campos)
            linha["chave_idempotencia"] = (c["nome"] + "-"
                                           + sha256_bytes(material.encode("utf-8"))[:16])
            linha["chave_derivada_de"] = campos

        resultado = por_id_resultado.get(c["id"])
        if resultado is None:
            ocorrencias.append({"tipo": "chamada sem resultado",
                                "detalhe": pid + " (" + str(c["id"])
                                           + ") nao tem resultado no traco"})
            linha.update({"estado": "incompleto",
                          "motivo": "tool_use sem tool_result no traco",
                          "sha256_observacao": None, "bytes": 0, "arquivo": None})
            registros.append(linha)
            continue

        observacao = resultado["texto"].encode("utf-8")
        arq = destino / "bruto" / (pid + ".bin")
        arq.write_bytes(observacao)
        linha.update({"estado": "falhou" if resultado["erro"] else "executado",
                      "motivo": "tool_result marcado como erro" if resultado["erro"] else "",
                      "sha256_observacao": sha256_bytes(observacao),
                      "bytes": len(observacao), "arquivo": "bruto/" + arq.name,
                      "segredos_detectados": sorted(
                          {rot for rot, pad in executar.PADROES_SEGREDO
                           if pad.encode("utf-8") in observacao})})
        registros.append(linha)

    with (destino / "passos.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for linha in registros:
            f.write(json.dumps(linha, ensure_ascii=False, sort_keys=True) + "\n")
    (destino / "traco.recebido").write_bytes(traco_bruto)  # exatamente o que chegou
    (destino / "traco.json").write_bytes(normalizado)  # o que o extrator consumiu
    (destino / "politica.json").write_text(
        json.dumps(politica, ensure_ascii=False, indent=2), encoding="utf-8")

    executado_por = {
        "tipo": "agente com LLM, passos escolhidos durante a execucao",
        "modelo": traco.get("model", "nao declarado no traco"),
        "harness": traco.get("harness", "nao declarado no traco"),
        "revisor": args.revisor, "revisao_independente": False,
    }
    (destino / "meta.json").write_text(json.dumps({
        "run_id": run_id, "tentativa": tentativa, "modo": "traco_adaptado",
        "dialeto": dialeto, "formato": formato,
        "sha256_traco": hash_traco, "sha256_traco_normalizado": hash_normalizado,
        "sha256_plano": hash_traco,
        "origem_traco": str(Path(args.traco).resolve()),
        "tarefa": traco.get("tarefa", "nao declarada no traco"),
        "executor": executado_por, "base": "",
        "reexecucao_possivel": False,
        "passos": len(registros),
        "executados": sum(1 for r in registros if r["estado"] == "executado"),
        "repetidos": 0,
        "recusados": sum(1 for r in registros if r["estado"] == "recusado"),
        "falhos": sum(1 for r in registros if r["estado"] == "falhou"),
        "incompletos": sum(1 for r in registros if r["estado"] == "incompleto"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- esqueleto de resposta: texto final, nenhuma citacao proposta --------
    caminho_resposta = Path(args.resposta or (destino / "resposta.json"))
    if not caminho_resposta.exists():
        caminho_resposta.write_text(json.dumps({
            "_nota": "Esqueleto. As afirmacoes e suas citacoes sao declaradas por quem "
                     "anota: o adaptador nao propoe citacao, porque propor seria fabricar "
                     "suporte. Use enderecos.md para localizar trecho e linha.",
            "resposta": texto_final,
            "afirmacoes": [], "pendencias": [],
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- enderecos.md: onde cada linha de observacao esta -------------------
    linhas_md = ["# Endereços das observações de " + run_id, "",
                 "Toda linha das observações capturadas, com o endereço para citar na",
                 "anotação das afirmações. Localizador, não seleção: nenhuma citação foi",
                 "proposta aqui.", ""]
    for r in registros:
        if not r.get("arquivo"):
            continue
        corpo = (destino / r["arquivo"]).read_text(encoding="utf-8",
                                                   errors="replace").splitlines()
        linhas_md += ["## " + r["id"] + " — " + r["ferramenta"] + " (" + r["papel"] + ")", ""]
        if r["papel"] != "fonte":
            linhas_md += ["Papel `" + r["papel"] + "`: nada daqui sustenta afirmação.", ""]
        linhas_md += ["| Endereço | Texto |", "| --- | --- |"]
        for i, linha in enumerate(corpo, start=1):
            if linha.strip():
                linhas_md.append("| linha " + str(i) + " | "
                                 + linha.strip()[:160].replace("|", "\\|") + " |")
        linhas_md.append("")
    (destino / "enderecos.md").write_text("\n".join(linhas_md), encoding="utf-8")

    # --- ocorrencias da adaptacao -------------------------------------------
    oc = ["# Ocorrências da adaptação — " + run_id, "",
          "Traço `" + Path(args.traco).name + "`, formato reconhecido: " + formato + ",",
          "dialeto " + dialeto + ", sha256 do recebido `" + hash_traco[:16] + "…`.", "",
          str(len(chamadas)) + " chamadas de ferramenta, " + str(len(resultados))
          + " resultados, " + str(len(registros)) + " passos na captura.", ""]
    if sem_politica:
        oc += ["## Ferramentas sem política", "",
               "Sem papel e efeito declarados, o passo não é verificável. Declare em",
               "politica.json e adapte de novo.", ""]
        oc += ["- `" + nome + "`" for nome in sorted(sem_politica)]
        oc.append("")
    if ocorrencias:
        oc += ["## Traço incompleto ou inconsistente", "",
               "Registrado como recebido. O adaptador não preenche, não reordena e não",
               "descarta nada.", "", "| Tipo | Detalhe |", "| --- | --- |"]
        oc += ["| " + o["tipo"] + " | " + o["detalhe"] + " |" for o in ocorrencias]
        oc.append("")
    oc += ["## O que este passo não pode saber", "",
           "- O traço não diz qual observação é fonte: papel vem de politica.json.",
           "- O traço não diz qual passo tem efeito: efeito vem de politica.json.",
           "- O traço não traz chave de idempotência: ela é derivada dos argumentos",
           "  que a política indicar, e sem isso o passo de escrita é recusado.",
           "- O traço não traz o hash do alvo lido, então `sha256_alvo` fica nulo e a",
           "  verificação por reexecução não se aplica: divergência não é atribuível.",
           "- Os passos foram escolhidos pelo modelo durante a execução. Não houve plano",
           "  fixado antes do primeiro passo.", ""]
    (destino / "ocorrencias-adaptacao.md").write_text("\n".join(oc), encoding="utf-8")

    print("formato: " + formato + ", dialeto: " + dialeto)
    print(run_id + ": " + str(len(registros)) + " passos ("
          + str(sum(1 for r in registros if r["estado"] == "executado")) + " executados, "
          + str(sum(1 for r in registros if r["estado"] == "recusado")) + " recusados, "
          + str(sum(1 for r in registros if r["estado"] == "incompleto")) + " incompletos, "
          + str(sum(1 for r in registros if r["estado"] == "falhou")) + " falhos), "
          + str(len(ocorrencias)) + " ocorrencias, dialeto " + dialeto)
    for nome in sorted(sem_politica):
        print("  sem politica: " + nome)
    for o in ocorrencias:
        print("  " + o["tipo"] + ": " + o["detalhe"])
    print("captura em " + str(destino))
    print("anote as afirmacoes em " + str(caminho_resposta))
    # Passo recusado ou incompleto e falha da adaptacao, nao detalhe: sair com 0
    # faria um script tratar como sucesso uma captura onde nada e verificavel.
    nao_verificaveis = [r["id"] for r in registros
                        if r["estado"] in ("recusado", "incompleto")]
    if nao_verificaveis:
        print("passos nao verificaveis: " + ", ".join(nao_verificaveis))
    return 3 if (sem_politica or ocorrencias or nao_verificaveis) else 0


if __name__ == "__main__":
    raise SystemExit(main())
