#!/usr/bin/env python3
"""Reune evidencia sobre as ferramentas de um traco, sem decidir nada sobre elas.

Primeiro passo diante de um traco novo. Le o traco, lista cada ferramenta que
apareceu e junta os fatos observaveis: quantas chamadas, quais chaves de argumento,
tamanho e numero de linhas das saidas, se houve erro, se a mesma entrada deu a mesma
saida, se alguma linha tem aparencia de instrucao, se algo casa com padrao de segredo.

O que este passo NAO faz: nao propoe papel, nao propoe efeito, nao propoe chave de
idempotencia, nao propoe citacao. O esqueleto de politica sai com os campos vazios, e
assim o adaptador recusa cada ferramenta ate alguem declarar. Decidir se a saida de
uma ferramenta sustenta afirmacao e se um passo tem efeito e julgamento de quem
responde pela entrega, nao inferencia de nome de funcao.

Uso: python -I -B inspecionar.py --traco <arquivo> --saida <pasta>
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import adaptar  # noqa: E402
import montar  # noqa: E402
import montar_execucao  # noqa: E402

LIMITE_AMOSTRA_LINHAS = 5
LIMITE_AMOSTRA_CHARS = 160
LIMITE_AMOSTRAS_ARG = 3
LIMITE_VALOR_ARG = 80


def rotulos_de_segredo(texto: str) -> list[str]:
    return sorted({rot for rot, pad in montar_execucao.PADROES_SEGREDO
                   if pad.lower() in texto.lower()})


def linhas_com_instrucao(texto: str) -> list[tuple[int, str]]:
    achados = []
    for n, linha in enumerate(texto.splitlines(), start=1):
        baixa = linha.lower()
        for padrao in montar_execucao.PADROES_INSTRUCAO:
            if padrao in baixa:
                achados.append((n, linha.strip()[:LIMITE_AMOSTRA_CHARS]))
                break
    return achados


def descrever_argumentos(chamadas: list[dict]) -> dict:
    campos: dict[str, dict] = {}
    for c in chamadas:
        entrada = c["entrada"] if isinstance(c["entrada"], dict) else {"_nao_objeto": c["entrada"]}
        for chave, valor in entrada.items():
            bruto = valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
            registro = campos.setdefault(chave, {
                "tipos": set(), "aparece_em": 0, "tamanho_min": None, "tamanho_max": 0,
                "amostras": [], "padroes_de_segredo": set(),
            })
            registro["tipos"].add(type(valor).__name__)
            registro["aparece_em"] += 1
            tamanho = len(bruto)
            registro["tamanho_max"] = max(registro["tamanho_max"], tamanho)
            registro["tamanho_min"] = (tamanho if registro["tamanho_min"] is None
                                       else min(registro["tamanho_min"], tamanho))
            achados = rotulos_de_segredo(str(chave) + " " + bruto)
            registro["padroes_de_segredo"].update(achados)
            if len(registro["amostras"]) < LIMITE_AMOSTRAS_ARG:
                if achados:
                    registro["amostras"].append("[suprimido: " + achados[0] + "]")
                else:
                    registro["amostras"].append(
                        bruto[:LIMITE_VALOR_ARG]
                        + ("… [" + str(tamanho) + " caracteres]" if tamanho > LIMITE_VALOR_ARG
                           else ""))
    for registro in campos.values():
        registro["tipos"] = sorted(registro["tipos"])
        registro["padroes_de_segredo"] = sorted(registro["padroes_de_segredo"])
    return campos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--traco", required=True)
    ap.add_argument("--saida", required=True,
                    help="pasta onde gravar a evidencia e o esqueleto de politica")
    args = ap.parse_args()

    bruto = Path(args.traco).read_bytes()
    try:
        envelope, formato, avisos = adaptar.carregar_traco(bruto)
    except ValueError as erro:
        print("nao foi possivel ler o traco: " + str(erro))
        return 2

    dialeto = adaptar.detectar_dialeto(envelope)
    extrair = (adaptar.extrair_anthropic if dialeto == "anthropic"
               else adaptar.extrair_openai)
    chamadas, resultados, texto_final = extrair(envelope)
    por_id = {r["id"]: r for r in resultados}

    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)

    por_ferramenta: dict[str, list[dict]] = {}
    for c in chamadas:
        por_ferramenta.setdefault(c["nome"] or "(sem nome)", []).append(c)

    evidencias = []
    for nome in sorted(por_ferramenta):
        grupo = por_ferramenta[nome]
        tamanhos, numeros_de_linha, instrucoes, segredos_saida = [], [], [], set()
        com, sem, erros = 0, 0, 0
        amostra = None
        saidas_por_entrada: dict[str, set] = {}
        for c in grupo:
            r = por_id.get(c["id"])
            if r is None:
                sem += 1
                continue
            com += 1
            if r["erro"]:
                erros += 1
            texto = r["texto"]
            tamanhos.append(len(texto.encode("utf-8")))
            linhas = texto.splitlines()
            numeros_de_linha.append(len(linhas))
            segredos_saida.update(rotulos_de_segredo(texto))
            for n, trecho in linhas_com_instrucao(texto):
                instrucoes.append({"chamada": c["id"], "linha": n, "texto": trecho})
            chave_entrada = json.dumps(c["entrada"], ensure_ascii=False, sort_keys=True)
            saidas_por_entrada.setdefault(chave_entrada, set()).add(texto)
            if amostra is None:
                primeiras = []
                for n, linha in enumerate(linhas[:LIMITE_AMOSTRA_LINHAS], start=1):
                    limpa, _ = montar_execucao.redigir(linha)
                    primeiras.append([n, limpa[:LIMITE_AMOSTRA_CHARS]])
                amostra = {"chamada": c["id"], "primeiras_linhas": primeiras}

        repetidas = {k: v for k, v in saidas_por_entrada.items() if len(v) > 1}
        mesma_entrada_mesma_saida = (None if len(saidas_por_entrada) == len(grupo)
                                     and not repetidas else not repetidas)

        evidencias.append({
            "ferramenta": nome,
            "chamadas": len(grupo),
            "ids_no_traco": [c["id"] for c in grupo],
            "resultados": {
                "com_resultado": com, "sem_resultado": sem, "marcados_erro": erros,
                "bytes_min": min(tamanhos) if tamanhos else None,
                "bytes_max": max(tamanhos) if tamanhos else None,
                "bytes_mediana": int(statistics.median(tamanhos)) if tamanhos else None,
                "linhas_min": min(numeros_de_linha) if numeros_de_linha else None,
                "linhas_max": max(numeros_de_linha) if numeros_de_linha else None,
            },
            "mesma_entrada_mesma_saida": mesma_entrada_mesma_saida,
            "argumentos_observados": descrever_argumentos(grupo),
            "linhas_com_aparencia_de_instrucao": instrucoes,
            "padroes_de_segredo_na_saida": sorted(segredos_saida),
            "amostra_da_saida": amostra,
        })

    (saida / "evidencia-ferramentas.json").write_text(json.dumps({
        "traco": str(Path(args.traco).resolve()), "formato": formato, "dialeto": dialeto,
        "avisos_de_formato": avisos,
        "chamadas": len(chamadas), "resultados": len(resultados),
        "ferramentas": len(por_ferramenta),
        "texto_final_presente": bool(texto_final),
        "evidencias": evidencias,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- esqueleto de politica, com tudo em branco ---------------------------
    esqueleto_path = saida / "politica-esqueleto.json"
    esqueleto = {
        "_nota": "Esqueleto. Nenhum campo foi proposto: papel, efeito e chave_de sao "
                 "declaracao de quem responde pela entrega. Ferramenta com campo vazio "
                 "e recusada pelo adaptador, e isso e proposital. papel: \"fonte\" se a "
                 "saida pode sustentar afirmacao, \"conteudo_recebido\" se nao. efeito: "
                 "\"leitura\" ou \"escrita\". Para escrita, chave_de lista os argumentos "
                 "que formam a chave de idempotencia.",
        "ferramentas": {
            e["ferramenta"]: {"papel": "", "efeito": "", "justificativa": ""}
            for e in evidencias
        },
    }
    if not esqueleto_path.exists():
        esqueleto_path.write_text(json.dumps(esqueleto, ensure_ascii=False, indent=2),
                                  encoding="utf-8")

    # --- evidencia legivel ---------------------------------------------------
    md = ["# Evidência sobre as ferramentas do traço", "",
          "Traço `" + Path(args.traco).name + "`, formato " + formato
          + ", dialeto " + dialeto + ".",
          str(len(chamadas)) + " chamadas, " + str(len(resultados)) + " resultados, "
          + str(len(por_ferramenta)) + " ferramentas distintas.", "",
          "Aqui há fatos observados, não recomendação. `papel`, `efeito` e `chave_de` "
          "continuam", "em branco em `politica-esqueleto.json`, e o adaptador recusa "
          "ferramenta não declarada.", ""]
    if avisos:
        md += ["Avisos de formato:"] + ["- " + a for a in avisos] + [""]

    md += ["| Ferramenta | Chamadas | Sem resultado | Erros | Bytes (mín/máx) | Linhas (mín/máx) | Mesma entrada, mesma saída |",
           "| --- | --- | --- | --- | --- | --- | --- |"]
    for e in evidencias:
        r = e["resultados"]
        determinismo = {True: "sim, nas repetições observadas", False: "não",
                        None: "nenhuma entrada repetida no traço"}[e["mesma_entrada_mesma_saida"]]
        md.append("| `" + e["ferramenta"] + "` | " + str(e["chamadas"]) + " | "
                  + str(r["sem_resultado"]) + " | " + str(r["marcados_erro"]) + " | "
                  + str(r["bytes_min"]) + " / " + str(r["bytes_max"]) + " | "
                  + str(r["linhas_min"]) + " / " + str(r["linhas_max"]) + " | "
                  + determinismo + " |")
    md.append("")

    for e in evidencias:
        md += ["## `" + e["ferramenta"] + "`", "",
               "Chamadas no traço: " + ", ".join("`" + str(i) + "`" for i in e["ids_no_traco"])
               + ".", ""]
        if e["argumentos_observados"]:
            md += ["| Argumento | Tipos | Em quantas chamadas | Tamanho (mín/máx) | Amostras | Padrão de segredo |",
                   "| --- | --- | --- | --- | --- | --- |"]
            for chave, info in sorted(e["argumentos_observados"].items()):
                md.append("| `" + str(chave) + "` | " + ", ".join(info["tipos"]) + " | "
                          + str(info["aparece_em"]) + " | " + str(info["tamanho_min"])
                          + " / " + str(info["tamanho_max"]) + " | "
                          + "; ".join(a.replace("|", "\\|") for a in info["amostras"])
                          + " | " + (", ".join(info["padroes_de_segredo"]) or "—") + " |")
            md.append("")
        else:
            md += ["Nenhum argumento observado.", ""]

        if e["padroes_de_segredo_na_saida"]:
            md += ["Padrão de segredo na saída: "
                   + ", ".join(e["padroes_de_segredo_na_saida"]) + ".", ""]
        if e["linhas_com_aparencia_de_instrucao"]:
            md += ["Linhas da saída com aparência de instrução, registradas como fato do "
                   "texto:", "", "| Chamada | Linha | Texto |", "| --- | --- | --- |"]
            for i in e["linhas_com_aparencia_de_instrucao"]:
                md.append("| `" + str(i["chamada"]) + "` | " + str(i["linha"]) + " | "
                          + i["texto"].replace("|", "\\|") + " |")
            md.append("")
        if e["amostra_da_saida"]:
            md += ["Primeiras linhas de uma saída (`" + str(e["amostra_da_saida"]["chamada"])
                   + "`):", "", "```"]
            md += [str(n).rjust(4) + "  " + texto
                   for n, texto in e["amostra_da_saida"]["primeiras_linhas"]]
            md += ["```", ""]

    md += ["## Para decidir", "",
           "Por ferramenta, três declarações, em `politica-esqueleto.json`:", "",
           "- `papel`: `fonte` se a saída pode sustentar uma afirmação da resposta;",
           "  `conteudo_recebido` se não pode. Observação de papel `conteudo_recebido`",
           "  não sustenta afirmação e não autoriza passo nenhum.",
           "- `efeito`: `leitura` ou `escrita`. Declarar escrita como leitura dispensa a",
           "  chave de idempotência, então o erro nessa direção é o que custa.",
           "- `chave_de`: para escrita, quais argumentos formam a chave. Argumento ausente",
           "  no traço faz o passo ser recusado.", "",
           "Preenchido, renomeie para `politica.json` e rode `adaptar.py`.", ""]
    (saida / "evidencia-ferramentas.md").write_text("\n".join(md), encoding="utf-8")

    print("traco: " + formato + ", dialeto " + dialeto)
    print(str(len(chamadas)) + " chamadas, " + str(len(resultados)) + " resultados, "
          + str(len(por_ferramenta)) + " ferramentas")
    for e in evidencias:
        marcas = []
        if e["resultados"]["sem_resultado"]:
            marcas.append(str(e["resultados"]["sem_resultado"]) + " sem resultado")
        if e["resultados"]["marcados_erro"]:
            marcas.append(str(e["resultados"]["marcados_erro"]) + " com erro")
        if e["linhas_com_aparencia_de_instrucao"]:
            marcas.append(str(len(e["linhas_com_aparencia_de_instrucao"]))
                          + " linhas com cara de instrucao")
        if e["padroes_de_segredo_na_saida"]:
            marcas.append("padrao de segredo na saida")
        if any(i["padroes_de_segredo"] for i in e["argumentos_observados"].values()):
            marcas.append("padrao de segredo em argumento")
        print("  " + e["ferramenta"].ljust(22) + str(e["chamadas"]).rjust(3) + " chamadas"
              + ("  | " + "; ".join(marcas) if marcas else ""))
    print("evidencia em " + str(saida / "evidencia-ferramentas.md"))
    print("declare papel e efeito em " + str(esqueleto_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
