#!/usr/bin/env python3
"""Recebimento de um lote real: classifica, aplica a porta de escopo e preserva os bytes.

O que este passo faz:
  - registra cada arquivo encontrado, com sha256 do caminho de origem;
  - aceita apenas TXT, Markdown e PDF com texto selecionavel;
  - recusa o resto com motivo, sem tentar converter nada;
  - aplica os limites do lote (arquivos, paginas, megabytes);
  - copia os aceitos byte a byte para recebidos/;
  - extrai o texto dos PDFs para extracoes/, com mapa de linha -> pagina;
  - emite esqueletos de lote.json, referencias.json, alteracoes.json e pendencias.json
    SEM nenhuma afirmacao preenchida, e um indice de enderecos para o operador escolher.

O que este passo nao faz: nao decide o que e verdade, nao preenche o mapa de
referencias, nao executa nada do conteudo recebido. O PDF e passado como argumento
para um extrator de texto, nunca executado, com argv fixo e sem shell.

Uso: python -I -B receber.py --entrada <pasta> --saida lotes/L002 --lote L002
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess  # somente para o extrator de PDF, com argv fixo e shell=False
import sys
from pathlib import Path

PDFTOTEXT = "pdftotext"
EXTENSOES_TEXTO = {".txt", ".md", ".markdown"}
EXTENSAO_PDF = ".pdf"

LIMITE_ARQUIVOS = 10
LIMITE_PAGINAS = 50
LIMITE_MB = 50
LIMITE_AFIRMACOES = 20
CHARS_POR_PAGINA = 1800  # so para estimar paginas de arquivo de texto
MIN_CHARS_POR_PAGINA = 20  # abaixo disso, o PDF nao tem texto selecionavel util

PADROES_INSTRUCAO = (
    "envie", "enviar", "encaminhe", "encaminhar", "execute", "executar", "rode",
    "baixe", "baixar", "instale", "apague", "apagar", "exclua", "ignore",
    "desconsidere", "clique", "acesse", "autorize",
    "send ", "run ", "ignore previous", "disregard",
    "http://", "https://", "curl ", "wget ", "powershell", "cmd.exe", "base64",
)


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def extrair_pdf(origem: Path, destino_txt: Path) -> tuple[bool, str, list[str], list[int]]:
    """Extrai texto de PDF com argv fixo. Devolve (ok, motivo, linhas, pagina_por_linha)."""
    destino_txt.parent.mkdir(parents=True, exist_ok=True)
    try:
        proc = subprocess.run(
            [PDFTOTEXT, "-layout", "-enc", "UTF-8", str(origem), str(destino_txt)],
            shell=False, capture_output=True, timeout=60, check=False,
        )
    except FileNotFoundError:
        return False, "extrator de PDF indisponivel neste ambiente", [], []
    except subprocess.TimeoutExpired:
        return False, "extracao de PDF excedeu o tempo limite", [], []
    if proc.returncode != 0:
        erro = (proc.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        motivo = erro[-1] if erro else "codigo " + str(proc.returncode)
        if "password" in motivo.lower() or "encrypt" in motivo.lower():
            motivo = "PDF protegido por senha (" + motivo + ")"
        return False, "extracao de texto falhou: " + motivo, [], []
    if not destino_txt.is_file():
        return False, "extracao nao produziu arquivo de texto", [], []

    bruto = destino_txt.read_text(encoding="utf-8", errors="replace")
    paginas = bruto.split("\f")
    if paginas and paginas[-1].strip() == "":
        paginas = paginas[:-1]
    linhas: list[str] = []
    pagina_por_linha: list[int] = []
    for n, pagina in enumerate(paginas, start=1):
        for linha in pagina.splitlines():
            linhas.append(linha)
            pagina_por_linha.append(n)
    uteis = sum(len(l.strip()) for l in linhas)
    if not paginas or uteis < MIN_CHARS_POR_PAGINA * len(paginas):
        return (False,
                "sem texto selecionavel suficiente (" + str(uteis) + " caracteres em "
                + str(len(paginas)) + " paginas); OCR esta fora deste lote", [], [])
    # regrava o texto normalizado, uma linha por linha, sem o form feed
    destino_txt.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return True, str(len(paginas)) + " paginas extraidas", linhas, pagina_por_linha


def ler_texto(origem: Path) -> tuple[bool, str, list[str]]:
    try:
        bruto = origem.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False, "nao decodifica como UTF-8; codificacao fora deste lote", []
    if "\x00" in bruto:
        return False, "contem bytes nulos; nao e texto simples", []
    return True, "texto simples lido", bruto.splitlines()


def ocorrencias_instrucao(etiqueta: str, linhas: list[str],
                          pagina_por_linha: list[int] | None) -> list[dict]:
    achados = []
    for i, linha in enumerate(linhas):
        baixa = linha.lower()
        for padrao in PADROES_INSTRUCAO:
            if padrao in baixa:
                achados.append({
                    "fonte": etiqueta, "linha": i + 1,
                    "pagina": pagina_por_linha[i] if pagina_por_linha else None,
                    "texto": linha.strip()[:300], "padrao": padrao.strip(),
                })
                break
    return achados


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", required=True, help="pasta com os arquivos recebidos")
    ap.add_argument("--saida", required=True, help="pasta do lote a criar")
    ap.add_argument("--lote", default="L002")
    ap.add_argument("--remetente", default="")
    ap.add_argument("--autorizacao", default="")
    args = ap.parse_args()

    entrada = Path(args.entrada).resolve()
    saida = Path(args.saida)
    if not entrada.is_dir():
        print("entrada nao e uma pasta: " + str(entrada))
        return 2
    if saida.exists() and any(saida.iterdir()):
        print("saida ja existe e nao esta vazia: " + str(saida))
        return 2
    (saida / "recebidos").mkdir(parents=True, exist_ok=True)

    candidatos = sorted(p for p in entrada.rglob("*")
                        if p.is_file() or p.is_symlink())
    registro: list[dict] = []
    ocorrencias: list[dict] = []
    conteudos: dict[str, list[str]] = {}
    paginas_de: dict[str, list[int]] = {}
    proximo = 1

    for origem in candidatos:
        rel = origem.relative_to(entrada).as_posix()
        ext = origem.suffix.lower()

        # O caminho real tem de ficar dentro da pasta autorizada. Link que aponta para
        # fora dela nao e seguido: copiar aquilo seria receber o que ninguem autorizou.
        real = origem.resolve()
        if origem.is_symlink() or not real.is_relative_to(entrada):
            registro.append({"caminho_origem": rel, "bytes": None,
                             "sha256_origem": None, "extensao": ext, "id": None,
                             "estado": "recusado",
                             "motivo": "aponta para " + str(real)
                                       + ", fora da pasta autorizada; o recebimento nao "
                                         "segue link",
                             "paginas": None, "paginas_estimadas": True})
            continue

        tamanho = origem.stat().st_size
        base = {"caminho_origem": rel, "bytes": tamanho,
                "sha256_origem": sha256(origem), "extensao": ext}

        if ext not in EXTENSOES_TEXTO and ext != EXTENSAO_PDF:
            registro.append({**base, "id": None, "estado": "recusado",
                             "motivo": "extensao fora do lote (" + (ext or "sem extensao")
                                       + "); imagens, planilhas, executaveis e arquivos "
                                         "protegidos exigem novo escopo",
                             "paginas": None, "paginas_estimadas": True})
            continue

        cabecalho = origem.open("rb").read(5)
        if ext == EXTENSAO_PDF and not cabecalho.startswith(b"%PDF-"):
            registro.append({**base, "id": None, "estado": "recusado",
                             "motivo": "extensao .pdf mas o conteudo nao comeca com %PDF-",
                             "paginas": None, "paginas_estimadas": True})
            continue

        ident = "D" + str(proximo).zfill(3)
        if ext == EXTENSAO_PDF:
            destino_txt = saida / "extracoes" / (ident + ".txt")
            ok, motivo, linhas, pag = extrair_pdf(origem, destino_txt)
            if not ok:
                destino_txt.unlink(missing_ok=True)
                registro.append({**base, "id": None, "estado": "recusado",
                                 "motivo": motivo, "paginas": None,
                                 "paginas_estimadas": True})
                continue
            n_paginas, estimadas = (pag[-1] if pag else 0), False
            extracao_rel = "extracoes/" + ident + ".txt"
        else:
            ok, motivo, linhas = ler_texto(origem)
            if not ok:
                registro.append({**base, "id": None, "estado": "recusado",
                                 "motivo": motivo, "paginas": None,
                                 "paginas_estimadas": True})
                continue
            pag = []
            n_paginas = max(1, math.ceil(sum(len(l) for l in linhas) / CHARS_POR_PAGINA))
            estimadas = True
            extracao_rel = None

        destino = saida / "recebidos" / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origem, destino)
        if sha256(destino) != base["sha256_origem"]:
            registro.append({**base, "id": None, "estado": "recusado",
                             "motivo": "copia nao coincidiu com a origem",
                             "paginas": None, "paginas_estimadas": True})
            destino.unlink(missing_ok=True)
            continue

        registro.append({**base, "id": ident, "estado": "aceito", "motivo": motivo,
                         "paginas": n_paginas, "paginas_estimadas": estimadas,
                         "extracao": extracao_rel, "linhas": len(linhas)})
        conteudos[ident] = linhas
        if pag:
            paginas_de[ident] = pag
            (saida / "extracoes" / (ident + ".paginas.json")).write_text(
                json.dumps(pag), encoding="utf-8")
        ocorrencias.extend(ocorrencias_instrucao(ident + " (" + rel + ")", linhas,
                                                 pag or None))
        proximo += 1

    aceitos = [r for r in registro if r["estado"] == "aceito"]
    recusados = [r for r in registro if r["estado"] == "recusado"]
    total_bytes = sum(r["bytes"] for r in aceitos)
    total_paginas = sum(r["paginas"] for r in aceitos)

    excessos = []
    if len(aceitos) > LIMITE_ARQUIVOS:
        excessos.append(str(len(aceitos)) + " arquivos aceitos acima do limite de "
                        + str(LIMITE_ARQUIVOS))
    if total_paginas > LIMITE_PAGINAS:
        excessos.append(str(total_paginas) + " paginas acima do limite de "
                        + str(LIMITE_PAGINAS) + " (parte estimada)")
    if total_bytes > LIMITE_MB * 1024 * 1024:
        excessos.append(str(round(total_bytes / 1048576, 1)) + " MB acima do limite de "
                        + str(LIMITE_MB) + " MB")

    # --- registro do recebimento ---------------------------------------------
    (saida / "recebimento.json").write_text(json.dumps({
        "lote": args.lote,
        "entrada": str(entrada),
        "arquivos": registro,
        "aceitos": len(aceitos), "recusados": len(recusados),
        "bytes": total_bytes, "paginas": total_paginas,
        "excessos_de_escopo": excessos,
        "limites": {"arquivos": LIMITE_ARQUIVOS, "paginas": LIMITE_PAGINAS,
                    "megabytes": LIMITE_MB, "afirmacoes": LIMITE_AFIRMACOES},
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- esqueleto de lote.json ----------------------------------------------
    (saida / "lote.json").write_text(json.dumps({
        "projeto": "", "lote": args.lote, "titulo": "",
        "recebido_em": "", "remetente_declarado": args.remetente,
        "autorizacao_registrada": args.autorizacao,
        "destinatarios_permitidos": [], "ambiente_processamento": "",
        "revisor": "", "revisado_em": "", "revisao_independente": False,
        "arquivos": [{"id": r["id"], "arquivo": r["caminho_origem"],
                      "versao": "", "origem": "", "relacao": "",
                      **({"texto": r["extracao"],
                          "paginas": "extracoes/" + r["id"] + ".paginas.json"}
                         if r.get("extracao") else {})}
                     for r in aceitos],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- esqueletos sem nenhuma afirmacao preenchida -------------------------
    (saida / "referencias.json").write_text(json.dumps({
        "versao_conferida": "", "afirmacoes_selecionadas": 0,
        "fora_da_analise": [], "afirmacoes": [],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (saida / "alteracoes.json").write_text(json.dumps({
        "par": {"anterior": "", "posterior": ""}, "campos": [],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (saida / "pendencias.json").write_text("[]\n", encoding="utf-8")

    # --- indice de enderecos: onde cada linha esta ---------------------------
    linhas_md = ["# Índice de endereços do lote " + args.lote, "",
                 "Toda linha legível do que foi aceito, com o endereço para citar no mapa",
                 "de referências. Isto é um localizador, não uma seleção de afirmações:",
                 "escolher o que será conferido é decisão do cliente, com o limite de "
                 + str(LIMITE_AFIRMACOES) + " afirmações.", ""]
    for r in aceitos:
        ident = r["id"]
        linhas_md += ["## " + ident + " — " + r["caminho_origem"], ""]
        if r.get("extracao"):
            linhas_md += ["Endereços de PDF citam a página física do arquivo. O texto abaixo",
                          "vem de `" + r["extracao"] + "`, que é extração de trabalho e não",
                          "substitui o original.", ""]
        linhas_md += ["| Endereço | Texto |", "| --- | --- |"]
        pag = paginas_de.get(ident)
        for i, linha in enumerate(conteudos[ident]):
            if not linha.strip():
                continue
            endereco = (("página " + str(pag[i]) + ", linha " + str(i + 1))
                        if pag else ("linha " + str(i + 1)))
            linhas_md.append("| " + endereco + " | "
                             + linha.strip()[:160].replace("|", "\\|") + " |")
        linhas_md.append("")
    (saida / "enderecos.md").write_text("\n".join(linhas_md), encoding="utf-8")

    # --- ocorrencias do recebimento ------------------------------------------
    oc = ["# Ocorrências do recebimento — lote " + args.lote, "",
          str(len(aceitos)) + " aceitos, " + str(len(recusados)) + " recusados, "
          + str(total_bytes) + " bytes, " + str(total_paginas)
          + " páginas (parte estimada).", ""]
    if recusados:
        oc += ["## Arquivos recusados", "",
               "Recusa não é julgamento do conteúdo: é ausência de escopo para tratá-lo.",
               "", "| Arquivo | Bytes | Motivo |", "| --- | --- | --- |"]
        oc += ["| " + r["caminho_origem"] + " | " + str(r["bytes"]) + " | "
               + r["motivo"].replace("|", "\\|") + " |" for r in recusados]
        oc.append("")
    if excessos:
        oc += ["## Escopo excedido", "",
               "O lote não pode seguir sem novo acordo de escopo.", ""]
        oc += ["- " + x for x in excessos]
        oc.append("")
    if ocorrencias:
        oc += ["## Conteúdo com aparência de instrução operacional", "",
               "Registrado como conteúdo. Nada foi executado e nada disso decide escopo,",
               "referência, pendência ou aceite.", "",
               "| Fonte | Endereço | Texto registrado | Padrão |",
               "| --- | --- | --- | --- |"]
        for o in ocorrencias:
            endereco = (("página " + str(o["pagina"]) + ", linha " + str(o["linha"]))
                        if o["pagina"] else ("linha " + str(o["linha"])))
            oc.append("| " + o["fonte"] + " | " + endereco + " | "
                      + o["texto"].replace("|", "\\|") + " | " + o["padrao"] + " |")
        oc.append("")
    oc += ["## Limites deste passo", "",
           "Nomes, versões e origens continuam sendo declaração de quem enviou.",
           "A contagem de páginas de arquivo de texto é estimativa a "
           + str(CHARS_POR_PAGINA) + " caracteres por página; só PDF tem página física.",
           "A extração de PDF pode errar ordem de colunas e tabelas: se o trecho citado",
           "ficar ambíguo, confira no original e registre que não foi possível verificar.",
           ""]
    (saida / "ocorrencias-recebimento.md").write_text("\n".join(oc), encoding="utf-8")

    print("lote " + args.lote + ": " + str(len(aceitos)) + " aceitos, "
          + str(len(recusados)) + " recusados, " + str(total_paginas)
          + " paginas, " + str(round(total_bytes / 1048576, 2)) + " MB, "
          + str(len(ocorrencias)) + " ocorrencias"
          + (", ESCOPO EXCEDIDO" if excessos else ""))
    for r in recusados:
        print("  recusado: " + r["caminho_origem"] + " -> " + r["motivo"])
    print("preencha " + str(saida / "lote.json") + " e "
          + str(saida / "referencias.json") + " antes de montar o pacote")
    return 3 if excessos else 0


if __name__ == "__main__":
    raise SystemExit(main())
