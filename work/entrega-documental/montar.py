#!/usr/bin/env python3
"""Monta o pacote de entrega a partir das fontes recebidas e dos dados declarados pelo operador.

O conteudo das fontes e lido como dado. Nada nele e executado, interpretado como
instrucao operacional, nem usado para preencher lacunas. Linhas com aparencia de
instrucao sao apenas registradas em ocorrencias.md.

Uso: python -I -B montar.py --fontes fontes --dados dados --saida pacote
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import shutil
from pathlib import Path

PADROES_INSTRUCAO = (
    "envie", "enviar", "encaminhe", "encaminhar", "execute", "executar", "rode",
    "baixe", "baixar", "instale", "apague", "apagar", "exclua", "ignore",
    "desconsidere", "clique", "acesse", "autorize",
    "send ", "run ", "ignore previous", "disregard",
    "http://", "https://", "curl ", "wget ", "powershell", "cmd.exe", "base64",
)

LIMITE_ARQUIVOS = 10
LIMITE_MB = 50
LIMITE_AFIRMACOES = 20


def sha256(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


def linhas(caminho: Path) -> list[str]:
    return caminho.read_text(encoding="utf-8").splitlines()


def linhas_do_item(item: dict, dados: Path, arquivo: Path) -> list[str]:
    """Conteudo conferivel do item: a extracao de trabalho, se houver, senao o texto.

    Para PDF, o que se le e a extracao em extracoes/<ID>.txt. Ela nao substitui o
    original: serve para localizar trecho e pagina.
    """
    if item.get("texto"):
        sidecar = dados / item["texto"]
        return linhas(sidecar) if sidecar.is_file() else []
    if not arquivo.is_file():
        return []
    try:
        return linhas(arquivo)
    except UnicodeDecodeError:
        return []


def paginas_do_item(item: dict, dados: Path) -> list[int]:
    if item.get("paginas"):
        mapa = dados / item["paginas"]
        if mapa.is_file():
            return json.loads(mapa.read_text(encoding="utf-8"))
    return []


def endereco(paginas: list[int], linha: int) -> str:
    """Endereco citavel: pagina fisica quando o arquivo tem pagina, senao linha."""
    if paginas and 1 <= linha <= len(paginas):
        return "página " + str(paginas[linha - 1]) + ", linha " + str(linha)
    return "linha " + str(linha)


def ocorrencias_instrucao(ident: str, nome: str, conteudo: list[str]) -> list[dict]:
    achados = []
    for n, linha in enumerate(conteudo, start=1):
        baixa = linha.lower()
        for padrao in PADROES_INSTRUCAO:
            if padrao in baixa:
                achados.append({"id": ident, "arquivo": nome, "linha": n,
                                "texto": linha, "padrao": padrao.strip()})
                break
    return achados


def tabela(cabecalho: list[str], corpo: list[list[str]]) -> str:
    saida = ["| " + " | ".join(cabecalho) + " |",
             "|" + "|".join([" --- "] * len(cabecalho)) + "|"]
    for linha in corpo:
        saida.append("| " + " | ".join(linha) + " |")
    return "\n".join(saida) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fontes", default="fontes")
    ap.add_argument("--dados", default="dados")
    ap.add_argument("--saida", default="pacote")
    args = ap.parse_args()

    fontes, dados, saida = Path(args.fontes), Path(args.dados), Path(args.saida)

    lote = json.loads((dados / "lote.json").read_text(encoding="utf-8"))
    refs = json.loads((dados / "referencias.json").read_text(encoding="utf-8"))
    alts = json.loads((dados / "alteracoes.json").read_text(encoding="utf-8"))
    pends = json.loads((dados / "pendencias.json").read_text(encoding="utf-8"))

    if saida.exists():
        shutil.rmtree(saida)
    (saida / "originais").mkdir(parents=True)

    # --- recebimento: originais preservados, um diretorio por ID --------------
    registro: list[dict] = []
    total_bytes = 0
    ocorrencias: list[dict] = []
    conteudos: dict[str, list[str]] = {}
    paginas: dict[str, list[int]] = {}

    for item in lote["arquivos"]:
        origem = fontes / item["arquivo"]
        if not origem.is_file():
            registro.append({**item, "estado": "ausente no recebimento",
                             "sha256": None, "bytes": None})
            continue
        destino = saida / "originais" / item["id"] / item["arquivo"]
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origem, destino)  # bytes, sem reescrita de texto
        tamanho = destino.stat().st_size
        total_bytes += tamanho
        registro.append({**item, "estado": "aceito",
                         "sha256": sha256(destino), "bytes": tamanho})
        conteudo = linhas_do_item(item, dados, destino)
        conteudos[item["id"]] = conteudo
        paginas[item["id"]] = paginas_do_item(item, dados)
        ocorrencias.extend(ocorrencias_instrucao(
            item["id"], item["id"] + " (" + item["arquivo"] + ")", conteudo))
        # a extracao de trabalho viaja no pacote, rotulada, sem substituir o original
        if item.get("texto"):
            origem_extr = dados / item["texto"]
            if origem_extr.is_file():
                alvo = saida / "extracoes" / (item["id"] + ".txt")
                alvo.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(origem_extr, alvo)

    aceitos = [r for r in registro if r["estado"] == "aceito"]
    ausentes = [r for r in registro if r["estado"] != "aceito"]

    # --- somas de verificacao -------------------------------------------------
    somas = "".join(
        r["sha256"] + "  originais/" + r["id"] + "/" + r["arquivo"] + "\n"
        for r in aceitos)
    (saida / "somas.sha256").write_text(somas, encoding="utf-8")

    # --- escopo ---------------------------------------------------------------
    fora_escopo = []
    if len(aceitos) > LIMITE_ARQUIVOS:
        fora_escopo.append(
            str(len(aceitos)) + " arquivos excedem o limite de " + str(LIMITE_ARQUIVOS))
    if total_bytes > LIMITE_MB * 1024 * 1024:
        fora_escopo.append(
            str(total_bytes) + " bytes excedem o limite de " + str(LIMITE_MB) + " MB")
    if len(refs["afirmacoes"]) > LIMITE_AFIRMACOES:
        fora_escopo.append(str(len(refs["afirmacoes"]))
                           + " afirmacoes excedem o limite de " + str(LIMITE_AFIRMACOES))

    # --- indice.md ------------------------------------------------------------
    corpo_indice = []
    for r in registro:
        corpo_indice.append([
            r["id"], r["arquivo"], r["versao"], r["origem"], r["relacao"], r["estado"],
            str(r["bytes"]) if r["bytes"] is not None else "—",
            (r["sha256"][:16] + "…") if r["sha256"] else "—",
        ])
    texto_indice = (
        "# Índice de fontes\n\n"
        + "Lote " + lote["lote"] + ", recebido em " + lote["recebido_em"] + ". "
        + "Remetente declarado: " + lote["remetente_declarado"] + ".\n\n"
        + tabela(["ID", "Nome recebido", "Versão declarada", "Origem declarada",
                  "Relação", "Estado", "Bytes", "SHA-256"], corpo_indice)
        + "\nNomes, versões e origens são declarações de quem enviou, não verificadas.\n"
        + "A soma de verificação detecta diferença entre cópias; não autentica a origem.\n")
    if ausentes:
        texto_indice += ("\nArquivos do índice ausentes no recebimento: "
                         + ", ".join(r["id"] + " (" + r["arquivo"] + ")" for r in ausentes)
                         + ".\n")
    (saida / "indice.md").write_text(texto_indice, encoding="utf-8")

    # --- referencias.md: cada afirmacao localizada ou pendente ----------------
    corpo_ref = []
    for a in refs["afirmacoes"]:
        loc, fonte = a["local"], a["fonte"]
        fonte_presente = fonte["id"] in conteudos
        if not fonte_presente:
            resultado = "Fonte " + fonte["id"] + " ausente do lote; pendência aberta"
            local_fonte = fonte["id"] + " (ausente)"
        else:
            local_fonte = (fonte["id"] + ", "
                           + endereco(paginas.get(fonte["id"], []), fonte["linha"]))
            if a["suporte"] == "compativel":
                resultado = a["alcance"]
            else:
                resultado = (a["alcance"] + " ("
                             + a.get("pendencia", "pendência não vinculada") + ")")
        corpo_ref.append([a["id"], a["afirmacao"],
                          loc["id"] + ", " + endereco(paginas.get(loc["id"], []),
                                                      loc["linha"]),
                          local_fonte, resultado])
    (saida / "referencias.md").write_text(
        "# Mapa de referências\n\n"
        + "Versão conferida: " + refs["versao_conferida"] + ". "
        + str(len(refs["afirmacoes"])) + " afirmações selecionadas.\n\n"
        + tabela(["ID", "Afirmação", "Local da afirmação", "Fonte e localização",
                  "Resultado da conferência documental"], corpo_ref)
        + "\nFora da análise, por acordo de escopo:\n"
        + "".join("- " + x + "\n" for x in refs["fora_da_analise"])
        + "\nA conferência é textual: compara a redação da afirmação com a redação da fonte.\n"
        + "Não autentica identidade, não comprova fato do mundo físico e não cobre o que\n"
        + "não foi selecionado.\n",
        encoding="utf-8")

    # --- alteracoes.md: diff mecanico + campos declarados ---------------------
    ant, pos = alts["par"]["anterior"], alts["par"]["posterior"]
    if not ant or not pos:
        ant = ant or "—"
        pos = pos or "—"
        bloco_diff = ("Nenhum par de versões foi declarado para este lote, então não há\n"
                      "diferença a calcular.\n")
    elif ant in conteudos and pos in conteudos:
        diff = difflib.unified_diff(conteudos[ant], conteudos[pos],
                                    fromfile=ant, tofile=pos, lineterm="", n=1)
        bloco_diff = "```diff\n" + "\n".join(diff) + "\n```\n"
    else:
        bloco_diff = ("Diferença não calculada: " + ant + " ou " + pos
                      + " ausente do lote.\n")

    corpo_alt = []
    for c in alts["campos"]:
        antes = c["antes"]
        if antes is None:
            txt_antes = "—"
        elif "trecho" in antes:
            txt_antes = (antes["trecho"] + " (" + antes["id"] + ", "
                         + endereco(paginas.get(antes["id"], []), antes["linha"]) + ")")
        else:
            txt_antes = "não mencionado em " + antes["id"]
        depois = c["depois"]
        txt_depois = (depois["trecho"] + " (" + depois["id"] + ", "
                      + endereco(paginas.get(depois["id"], []), depois["linha"]) + ")")
        just = c["justificativa"] or ("Ausente; " + str(c["pendencia"]) + " aberta")
        corpo_alt.append([c["campo"], txt_antes, txt_depois, just])

    (saida / "alteracoes.md").write_text(
        "# Diferenças entre " + ant + " e " + pos + "\n\n"
        + "## Diferença linha a linha, calculada\n\n" + bloco_diff
        + "\n## Campos declarados pelo operador, com localização conferível\n\n"
        + tabela(["Campo", "Antes", "Depois", "Justificativa disponível"], corpo_alt)
        + "\nA compatibilidade de um valor com outra fonte do lote não resolve a divergência\n"
        + "histórica nem autentica a fonte citada. O motivo da mudança só consta quando\n"
        + "declarado por quem a fez.\n",
        encoding="utf-8")

    # --- pendencias.md --------------------------------------------------------
    abertas = [p for p in pends if p["estado"] == "aberta"]
    (saida / "pendencias.md").write_text(
        "# Pendências\n\n"
        + tabela(["ID", "Pendência", "Efeito", "Responsável proposto",
                  "Condição de encerramento", "Estado"],
                 [[p["id"], p["pendencia"], p["efeito"], p["responsavel"],
                   p["condicao"], p["estado"]] for p in pends])
        + "\n" + str(len(abertas)) + " pendências abertas de " + str(len(pends)) + ".\n"
        + "Responsáveis são propostas de operação; nenhuma pessoa foi designada.\n",
        encoding="utf-8")

    # --- ocorrencias.md: conteudo registrado, nenhuma acao -------------------
    if ocorrencias:
        bloco_oc = tabela(["Fonte", "Endereço", "Texto registrado", "Padrão reconhecido"],
                          [[o["arquivo"],
                            endereco(paginas.get(o["id"], []), o["linha"]),
                            o["texto"].replace("|", "\\|"), o["padrao"]]
                           for o in ocorrencias])
        nota_oc = ("\nAs linhas acima foram registradas como conteúdo das fontes. Nenhuma\n"
                   "foi executada, nenhum envio foi disparado e nenhuma delas alterou o\n"
                   "escopo, o mapa de referências ou as pendências desta entrega.\n")
    else:
        bloco_oc = "Nenhuma linha com aparência de instrução operacional foi encontrada.\n"
        nota_oc = ("\nO reconhecimento é por padrão de redação e não garante que não haja\n"
                   "instrução redigida de outra forma. Em todo caso, o conteúdo das fontes\n"
                   "não é executado nem usado para decidir escopo, referências ou aceite.\n")
    texto_oc = "# Ocorrências do recebimento\n\n" + bloco_oc + nota_oc
    if ausentes:
        texto_oc += ("\nArquivos ausentes no recebimento:\n"
                     + "".join("- " + r["id"] + " (" + r["arquivo"] + ")\n"
                               for r in ausentes))
    if fora_escopo:
        texto_oc += "\nEscopo excedido:\n" + "".join("- " + x + "\n" for x in fora_escopo)
    (saida / "ocorrencias.md").write_text(texto_oc, encoding="utf-8")

    # --- relatorio.md: alcance da revisao -------------------------------------
    tem_revisor = (bool(lote.get("revisor", "").strip())
                   and bool(lote.get("revisado_em", "").strip()))
    if not tem_revisor:
        estado_revisao = "revisão não concluída: revisor ou data ausentes"
    elif lote.get("revisao_independente"):
        estado_revisao = ("revisão registrada por " + lote["revisor"] + " em "
                          + lote["revisado_em"])
    else:
        estado_revisao = ("revisão declarada pelo próprio operador (" + lote["revisor"]
                          + ") em " + lote["revisado_em"]
                          + "; não houve revisão independente")

    compativeis = [a for a in refs["afirmacoes"]
                   if a["suporte"] == "compativel" and a["fonte"]["id"] in conteudos]
    sem_suporte = [a for a in refs["afirmacoes"] if a not in compativeis]
    sem_just = [c for c in alts["campos"] if not c["justificativa"]]

    (saida / "relatorio.md").write_text(
        "# Relatório de conferência\n\n"
        + "Lote " + lote["lote"] + " · " + lote["titulo"] + " · recebido em "
        + lote["recebido_em"] + "\n\n## Resultado\n\n"
        + str(len(aceitos)) + " arquivos aceitos e preservados, " + str(total_bytes)
        + " bytes no conjunto.\n"
        + str(len(refs["afirmacoes"])) + " afirmações de " + refs["versao_conferida"]
        + " selecionadas: " + str(len(compativeis))
        + " compatíveis com a redação da fonte citada, " + str(len(sem_suporte))
        + " sem suporte documental no lote.\n"
        + str(len(alts["campos"])) + " campos alterados entre " + ant + " e " + pos
        + ", " + str(len(sem_just)) + " sem justificativa registrada.\n"
        + str(len(abertas)) + " pendências abertas.\n\n"
        + "## Alcance da revisão\n\nEstado: " + estado_revisao + ".\n\n"
        + "Ambiente de processamento: " + lote["ambiente_processamento"] + ".\n"
        + "Autorização registrada: " + lote["autorizacao_registrada"] + ".\n"
        + "Destinatários permitidos: "
        + ", ".join(lote["destinatarios_permitidos"]) + ".\n\n"
        + "## Limites\n\n" + refs["versao_conferida"]
        + " não está aprovada como versão final enquanto aceite.md estiver pendente.\n"
        + "Esta conferência é textual e delimitada às afirmações selecionadas. Não há\n"
        + "verificação externa, autenticação de identidade, auditoria independente, parecer\n"
        + "jurídico nem certificação de fatos do mundo físico. As fontes deste lote são\n"
        + "fictícias e não há cliente pagante associado.\n",
        encoding="utf-8")

    # --- aceite.md ------------------------------------------------------------
    (saida / "aceite.md").write_text(
        "# Aceite\n\nVersão candidata: " + refs["versao_conferida"] + "\n\n"
        + tabela(["Campo", "Valor"],
                 [["Decisão", "pendente"], ["Versão recebida", "não registrada"],
                  ["Nome de quem decide", "não registrado"], ["Data", "não registrada"],
                  ["Lista de correções", "não registrada"]])
        + "\nEnquanto a decisão estiver pendente, não há aceite. Ausência de resposta não\n"
        + "é aceite. O aceite registra o recebimento conforme os critérios combinados; não\n"
        + "significa concordância com a veracidade das fontes.\n",
        encoding="utf-8")

    # --- LEIA-ME.md -----------------------------------------------------------
    if any(item.get("texto") for item in lote["arquivos"]):
        linha_extracoes = ("| `extracoes/` | Texto extraído dos PDFs, para localizar "
                           "trecho e página. Não substitui o original |\n")
        nota_extracoes = (
            "\nOs endereços de PDF citam a página física do arquivo. A extração em\n"
            "`extracoes/` é arquivo de trabalho: se um trecho citado ficar ambíguo, "
            "confira\nno original em `originais/`.\n")
    else:
        linha_extracoes = ""
        nota_extracoes = ""

    (saida / "LEIA-ME.md").write_text(
        "# " + lote["titulo"] + "\n\n"
        + "Lote " + lote["lote"] + " · recebido em " + lote["recebido_em"]
        + " · gerado por montar.py\n\n## Estado\n\n"
        + "Demonstração com fontes fictícias. Não representa cliente, venda, validação\n"
        + "independente nem software operacional. Não certifica fatos do mundo físico,\n"
        + "autoria, conformidade ou validade jurídica.\n\n"
        + "Aceite: pendente. " + estado_revisao + ".\n\n"
        + "## Como ler\n\n"
        + "| Arquivo | Conteúdo |\n| --- | --- |\n"
        + "| `indice.md` | IDs, nomes recebidos, versões e origens declaradas, relação |\n"
        + "| `originais/` | Cópias exatas dos arquivos aceitos, uma pasta por ID |\n"
        + "| `somas.sha256` | SHA-256 de cada original, para detectar diferença de cópias |\n"
        + "| `referencias.md` | Afirmações selecionadas, onde estão, qual fonte as apoia |\n"
        + "| `alteracoes.md` | Diferença linha a linha entre versões e campos alterados |\n"
        + "| `pendencias.md` | Lacunas, efeito, responsável proposto, condição de fechamento |\n"
        + "| `ocorrencias.md` | Conteúdo registrado no recebimento, texto com cara de instrução |\n"
        + "| `relatorio.md` | Resultado da conferência e alcance da revisão |\n"
        + "| `aceite.md` | Decisão do cliente; inicialmente pendente |\n"
        + linha_extracoes + "\n"
        + "Todos os caminhos são relativos a esta pasta. O pacote é texto simples: abre em\n"
        + "qualquer editor, sem rede, sem conta e sem serviço Arkhe.\n"
        + nota_extracoes + "\n"
        + "## Limites\n\n"
        + "- A soma de verificação detecta diferença entre duas cópias. Não autentica a\n"
        + "  origem: quem substituir arquivo e soma ao mesmo tempo oculta a alteração.\n"
        + "  Mantenha sua própria cópia de referência do que enviou.\n"
        + "- Não há assinatura digital nem carimbo temporal neste pacote.\n"
        + "- Nomes, versões e origens são declarações de quem enviou, não verificadas.\n"
        + "- O conteúdo das fontes foi tratado como dado. Nada nele foi executado.\n",
        encoding="utf-8")

    print("pacote montado em " + str(saida) + ": " + str(len(aceitos)) + " aceitos, "
          + str(len(ausentes)) + " ausentes, " + str(len(ocorrencias))
          + " ocorrencias, " + str(len(abertas)) + " pendencias abertas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
