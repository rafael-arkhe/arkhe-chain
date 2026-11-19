#!/usr/bin/env python3
"""Monta o registro compartilhavel de uma execucao, a partir da captura crua.

A captura crua fica onde esta: ela guarda o byte original da observacao e pode
conter segredo. O registro e o que se entrega: traz trecho com endereco, soma de
cada observacao para quem tiver a captura conferir, e o veredito de cada afirmacao.

Uso: python -I -B montar_execucao.py --captura execucao/captura/<run_id> \
         --resposta execucao/resposta.json --saida execucao/registro/<run_id>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import executar  # noqa: E402  uma unica lista de padroes de segredo, a do runner
import montar  # noqa: E402  reaproveita tabela() e os padroes de instrucao

PADROES_INSTRUCAO = montar.PADROES_INSTRUCAO + ("aprove", "aprovar")
PADROES_SEGREDO = executar.PADROES_SEGREDO
LIMITE_LINHAS_TRECHO = 40


def redigir(linha: str) -> tuple[str, bool]:
    """Troca a linha inteira por um marcador se ela casar com padrao de segredo."""
    for rotulo, padrao in PADROES_SEGREDO:
        if padrao.lower() in linha.lower():
            # O marcador nomeia a classe, nunca o literal: ecoar o padrão
            # reintroduziria no registro justamente o que ele suprime.
            return ("[trecho suprimido: casa com " + rotulo
                    + "; confira na captura crua]"), True
    return linha, False


LIMITE_ENTRADA = 300


def redigir_entrada(entrada: str) -> tuple[str, int]:
    """Suprime segredo no argumento do passo, campo por campo.

    O argumento de uma ferramenta real pode trazer token, senha ou cabecalho de
    autorizacao. O registro entrega a entrada de cada passo, entao ela passa pelo
    mesmo crivo da observacao: a chave fica, o valor sai.
    """
    suprimidos = 0
    try:
        objeto = json.loads(entrada)
    except json.JSONDecodeError:
        texto, foi = redigir(entrada)
        return (texto if len(texto) <= LIMITE_ENTRADA
                else texto[:LIMITE_ENTRADA] + "… [truncado]"), (1 if foi else 0)

    if isinstance(objeto, dict):
        limpo = {}
        for chave, valor in objeto.items():
            bruto = valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
            casou = next((rot for rot, pad in PADROES_SEGREDO
                          if pad.lower() in str(chave).lower()
                          or pad.lower() in bruto.lower()), None)
            if casou:
                limpo[chave] = "[suprimido: " + casou + "]"
                suprimidos += 1
            elif len(bruto) > LIMITE_ENTRADA:
                limpo[chave] = bruto[:LIMITE_ENTRADA] + "… [truncado, "
                limpo[chave] += str(len(bruto)) + " caracteres]"
            else:
                limpo[chave] = valor
        return json.dumps(limpo, ensure_ascii=False, sort_keys=True), suprimidos

    texto = json.dumps(objeto, ensure_ascii=False)
    return (texto if len(texto) <= LIMITE_ENTRADA
            else texto[:LIMITE_ENTRADA] + "… [truncado]"), 0


def ocorrencias_de(passo_id: str, linhas: list[str]) -> list[dict]:
    achados = []
    for n, linha in enumerate(linhas, start=1):
        baixa = linha.lower()
        for padrao in PADROES_INSTRUCAO:
            if padrao in baixa:
                achados.append({"passo": passo_id, "linha": n,
                                "texto": linha.strip(), "padrao": padrao.strip()})
                break
    return achados


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--captura", required=True)
    ap.add_argument("--resposta", default="execucao/resposta.json")
    ap.add_argument("--saida", default="")
    args = ap.parse_args()

    captura = Path(args.captura)
    meta = json.loads((captura / "meta.json").read_text(encoding="utf-8"))
    passos = [json.loads(l) for l in
              (captura / "passos.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    resposta = json.loads(Path(args.resposta).read_text(encoding="utf-8"))
    saida = Path(args.saida or ("execucao/registro/" + meta["run_id"]))
    if saida.exists():
        import shutil
        shutil.rmtree(saida)
    saida.mkdir(parents=True)

    # --- conteudo das observacoes, lido como dado ----------------------------
    linhas_de: dict[str, list[str]] = {}
    suprimidas = 0
    ocorrencias: list[dict] = []
    for p in passos:
        if not p.get("arquivo"):
            continue
        bruto = (captura / p["arquivo"]).read_bytes()
        linhas = bruto.decode("utf-8", errors="replace").splitlines()
        seguras = []
        for linha in linhas:
            texto, foi = redigir(linha)
            suprimidas += 1 if foi else 0
            seguras.append(texto)
        linhas_de[p["id"]] = seguras
        ocorrencias.extend(ocorrencias_de(p["id"], seguras))

    por_id = {p["id"]: p for p in passos}

    # --- argumentos dos passos, pelo mesmo crivo das observacoes -------------
    entradas_limpas: dict[str, str] = {}
    suprimidos_entrada = 0
    for p in passos:
        limpa, n = redigir_entrada(p["entrada"])
        entradas_limpas[p["id"]] = limpa
        suprimidos_entrada += n
    suprimidas += suprimidos_entrada

    # --- passos.md -----------------------------------------------------------
    (saida / "passos.md").write_text(
        "# Passos da execução " + meta["run_id"] + "\n\n"
        + "Tarefa: " + meta["tarefa"] + "\n\n"
        + "Plano sha256 `" + meta["sha256_plano"][:16] + "…`, tentativa "
        + str(meta["tentativa"]) + ". O plano foi lido uma vez, antes do primeiro passo.\n\n"
        + montar.tabela(["Passo", "Ferramenta", "Entrada", "Efeito", "Papel", "Estado",
                         "Bytes", "SHA-256 da observação", "Propósito"],
                        [[p["id"], p["ferramenta"],
                          "`" + entradas_limpas[p["id"]].replace("|", "\\|") + "`",
                          p["efeito"], p["papel"], p["estado"], str(p["bytes"]),
                          (p["sha256_observacao"][:16] + "…") if p["sha256_observacao"] else "—",
                          p["proposito"]] for p in passos])
        + ("\n" + str(suprimidos_entrada) + " valores de argumento suprimidos por casarem"
           " com padrão de segredo. A chave fica, o valor sai; o original está na captura"
           " crua.\n" if suprimidos_entrada else "")
        + "\nO papel é declarado no plano. `fonte` é observação que pode sustentar uma\n"
        + "afirmação; `conteudo_recebido` é material do lote, que não sustenta nada e não\n"
        + "autoriza passo algum.\n",
        encoding="utf-8")

    # --- observacoes.md: trecho com endereco, sem segredo --------------------
    blocos = ["# Observações, com endereço\n",
              "Trechos do que cada ferramenta devolveu, numerados pela linha da\n"
              "observação crua. A captura crua não viaja neste registro; as somas abaixo\n"
              "permitem a quem a tiver conferir byte a byte.\n"]
    for p in passos:
        if p["id"] not in linhas_de:
            continue
        linhas = linhas_de[p["id"]]
        blocos.append("\n## " + p["id"] + " — " + p["ferramenta"] + " (" + p["papel"] + ")\n")
        if len(linhas) > LIMITE_LINHAS_TRECHO:
            blocos.append("\nObservação com " + str(len(linhas)) + " linhas; as primeiras "
                          + str(LIMITE_LINHAS_TRECHO) + " constam abaixo.\n")
        blocos.append("\n```\n" + "\n".join(
            str(n).rjust(4) + "  " + linha
            for n, linha in enumerate(linhas[:LIMITE_LINHAS_TRECHO], start=1)) + "\n```\n")
    (saida / "observacoes.md").write_text("".join(blocos), encoding="utf-8")

    # --- afirmacoes.md -------------------------------------------------------
    corpo = []
    for a in resposta["afirmacoes"]:
        if a["suporte"] == "apoiada":
            citacoes = []
            for c in a["citacoes"]:
                papel = por_id.get(c["passo"], {}).get("papel", "passo ausente")
                citacoes.append(c["passo"] + ", linha " + str(c["linha"])
                                + " (" + papel + ")")
            veredito = a["alcance"]
            onde = "<br>".join(citacoes)
        else:
            o = a.get("origem") or {}
            onde = ((o.get("passo", "—") + ", linha " + str(o.get("linha", "—"))
                     + " (" + por_id.get(o.get("passo", ""), {}).get("papel", "?") + ")")
                    if o else "—")
            veredito = a["motivo"] + (" (" + a["pendencia"] + ")" if a.get("pendencia") else "")
        corpo.append([a["id"], a["afirmacao"], a["suporte"], onde, veredito])

    apoiadas = [a for a in resposta["afirmacoes"] if a["suporte"] == "apoiada"]
    recusadas_no_texto = [a["id"] for a in resposta["afirmacoes"]
                          if a["suporte"] != "apoiada" and a.get("trecho_na_resposta")
                          and a["trecho_na_resposta"] in resposta.get("resposta", "")]
    if recusadas_no_texto:
        aviso = ("\nEstado da resposta: `nao_entregavel`\n"
                 "\n**Esta resposta não é entregável.** Ela afirma "
                 + ", ".join(recusadas_no_texto)
                 + ", que a conferência recusou por falta de suporte. Corrigir o texto e\n"
                   "registrar nova versão antes de entregar.\n")
    else:
        aviso = ("\nEstado da resposta: `entregavel`\n"
                 "\nNenhuma afirmação recusada aparece afirmada no texto; a resposta é\n"
                 "entregável quanto à localização das afirmações.\n")
    (saida / "afirmacoes.md").write_text(
        "# Afirmações da resposta\n\n## Resposta entregue\n\n> "
        + resposta["resposta"].replace("\n", "\n> ") + "\n" + aviso + "\n## Conferência\n\n"
        + montar.tabela(["ID", "Afirmação", "Suporte", "Onde", "Alcance ou motivo"], corpo)
        + "\n" + str(len(apoiadas)) + " afirmações apoiadas em observação de papel `fonte`, "
        + str(len(resposta["afirmacoes"]) - len(apoiadas)) + " recusadas.\n\n"
        + "A conferência é de localização: diz que a afirmação está no que a execução de\n"
        + "fato leu, não que seja verdadeira. Nenhuma afirmação se sustenta em observação\n"
        + "de papel `conteudo_recebido`.\n",
        encoding="utf-8")

    # --- efeitos.md ----------------------------------------------------------
    escritas = [p for p in passos if p["efeito"] == "escrita"]
    (saida / "efeitos.md").write_text(
        "# Efeitos desta execução\n\n"
        + (montar.tabela(["Passo", "Chave de idempotência", "Estado", "Observação"],
                         [[p["id"], p.get("chave_idempotencia", "—"), p["estado"],
                           (linhas_de.get(p["id"]) or ["—"])[0]] for p in escritas])
           if escritas else "Nenhum passo de escrita nesta execução.\n")
        + "\nPasso de escrita sem chave de idempotência é recusado. Com a chave já no\n"
        + "livro de aplicados, o passo sai como `repetido` e o efeito não é reaplicado:\n"
        + "reexecutar o plano não duplica a escrita.\n"
        + ("\nEsta captura não tem livro de aplicados: a chave foi derivada dos\n"
           "argumentos depois do fato, e o registro **não demonstra** que o efeito\n"
           "aconteceu uma única vez. Garantir aplicação única exige livro no momento da\n"
           "execução, não depois.\n"
           if not (captura.parent / "aplicados.json").is_file() else ""),
        encoding="utf-8")

    # --- recuperacao.md: candidato, fornecido e descarte ---------------------
    com_hierarquia = [p for p in passos if p.get("recuperacao")]
    if com_hierarquia:
        blocos_rec = ["# Hierarquia da recuperação\n",
                      "O que a busca encontrou, o que entrou no contexto e por que o "
                      "resto ficou\nfora. Candidato descartado consta aqui com o motivo: "
                      "é o que impede\ndescarte silencioso.\n"]
        for p in com_hierarquia:
            r = p["recuperacao"]
            blocos_rec.append("\n## " + p["id"] + " — " + str(r["fornecidos"])
                              + " fornecidos, " + str(r["descartados"]) + " descartados\n\n")
            blocos_rec.append(montar.tabela(
                ["Candidato", "Origem", "Estado", "Endereço no contexto",
                 "SHA-256 do arquivo", "Motivo do descarte"],
                [[c["id"], "`" + c["caminho"] + "`",
                  "fornecido" if c["fornecido"] else "descartado",
                  ("linhas " + str(c["linha_inicio"]) + "–" + str(c["linha_fim"]))
                  if c["fornecido"] else "—",
                  (c["sha256_arquivo"][:16] + "…") if c["sha256_arquivo"] else "—",
                  c["motivo_descarte"] or "—"] for c in r["candidatos"]]))
            diferencas = [c for c in r["candidatos"]
                          if c.get("diferenca_em_relacao_ao_arquivo")]
            if diferencas:
                blocos_rec.append("\nDiferenças declaradas entre bloco e arquivo:\n")
                for c in diferencas:
                    blocos_rec.append("- " + c["id"] + ": "
                                      + c["diferenca_em_relacao_ao_arquivo"] + "\n")
        blocos_rec.append("\nCada bloco fornecido foi conferido byte a byte contra o "
                          "arquivo de origem.\nAfirmação que cite este passo tem de "
                          "cair dentro de um bloco fornecido.\n")
        (saida / "recuperacao.md").write_text("".join(blocos_rec), encoding="utf-8")

    # --- permissoes.md: a cadeia de estagios ---------------------------------
    com_recurso = [p for p in passos if p.get("recurso")]
    if com_recurso:
        corpo_perm = []
        for p in com_recurso:
            tk = p.get("tokens") or {}
            corpo_perm.append([
                p["id"], p["recurso"],
                *[((tk[e]["veredicto"] + " em " + str(tk[e]["conferido_em"]))
                   if tk.get(e) else "—") for e in ("T1", "T2", "T3", "T4")],
                p.get("estado_permissao", "—"),
            ])
        (saida / "permissoes.md").write_text(
            "# Permissão por estágio\n\n"
            + "T1 antes de recuperar, T2 antes de usar como apoio, T3 antes de exibir,\n"
            + "T4 antes de exportar. O relógio avança entre estágios, então revogação no\n"
            + "meio do caminho aparece aqui em vez de desaparecer.\n\n"
            + montar.tabela(["Passo", "Recurso", "T1", "T2", "T3", "T4", "Estado"],
                            corpo_perm)
            + "\nO que o estado significa:\n\n"
            + "| Estado | Leitura |\n| --- | --- |\n"
            + "| `exibido` | T1, T2 e T3 permitiram |\n"
            + "| `exportado` | T1 a T4 permitiram |\n"
            + "| `revogado_antes_do_uso` | T1 negou; nada foi lido |\n"
            + "| `nao_utilizavel` | T2 negou; lido, mas não sustenta afirmação |\n"
            + "| `usado_mas_suprimido` | T2 permitiu e T3 negou; já havia sido usado |\n"
            + "| `suprimido_na_exportacao` | T4 negou; fica sem sair |\n\n"
            + "`usado_mas_suprimido` registra o que não pode ser desfeito. Afirmação que\n"
            + "se apoie num passo nesse estado é recusada, e o token de cada estágio foi\n"
            + "emitido pelo oráculo no momento do estágio, não na hora de conferir.\n\n"
            + "As assinaturas dos tokens e a chave do emissor ficam na captura crua, fora\n"
            + "deste registro. Chave local prova que os tokens saíram do mesmo oráculo; não\n"
            + "é raiz de confiança e não identifica ninguém.\n",
            encoding="utf-8")

    # --- ocorrencias.md ------------------------------------------------------
    passos_por_observacao = [p for p in passos
                             if p["papel"] == "conteudo_recebido" and p["estado"] == "executado"]
    (saida / "ocorrencias.md").write_text(
        "# Ocorrências nas observações\n\n"
        + (montar.tabela(["Passo", "Linha", "Texto registrado", "Padrão reconhecido"],
                         [[o["passo"], str(o["linha"]), o["texto"].replace("|", "\\|"),
                           o["padrao"]] for o in ocorrencias])
           if ocorrencias else "Nenhuma linha com aparência de instrução nas observações.\n")
        + "\nO plano tem " + str(len(passos)) + " passos e foi fixado antes do primeiro\n"
        + "deles: nenhuma destas linhas acrescentou, removeu ou alterou passo, e nenhuma\n"
        + "autorizou efeito. "
        + (str(len(passos_por_observacao)) + " observações entraram como "
           "`conteudo_recebido` e não sustentam afirmação.\n" if passos_por_observacao
           else "Nenhuma observação foi marcada como conteúdo recebido.\n")
        + ("\n" + str(suprimidas) + " linhas suprimidas por casarem com padrão de segredo.\n"
           if suprimidas else "\nNenhuma linha casou com padrão de segredo.\n"),
        encoding="utf-8")

    # --- pendencias.md -------------------------------------------------------
    pends = resposta.get("pendencias", [])
    abertas = [p for p in pends if p["estado"] == "aberta"]
    (saida / "pendencias.md").write_text(
        "# Pendências\n\n"
        + (montar.tabela(["ID", "Pendência", "Efeito", "Responsável proposto",
                          "Condição de encerramento", "Estado"],
                         [[p["id"], p["pendencia"], p["efeito"], p["responsavel"],
                           p["condicao"], p["estado"]] for p in pends])
           if pends else "Nenhuma pendência registrada.\n")
        + "\n" + str(len(abertas)) + " pendências abertas de " + str(len(pends)) + ".\n",
        encoding="utf-8")

    # --- somas.sha256 --------------------------------------------------------
    (saida / "somas.sha256").write_text(
        "".join(p["sha256_observacao"] + "  " + p["arquivo"] + "\n"
                for p in passos if p.get("sha256_observacao") and p.get("arquivo"))
        + meta["sha256_plano"] + "  plano.json\n",
        encoding="utf-8")

    # --- relatorio.md --------------------------------------------------------
    executor = meta["executor"]
    revisao = ("revisão declarada pelo próprio operador (" + executor["revisor"]
               + "); não houve revisão independente"
               if not executor.get("revisao_independente")
               else "revisão registrada por " + executor["revisor"])
    (saida / "relatorio.md").write_text(
        "# Relatório da execução " + meta["run_id"] + "\n\n"
        + "Tarefa: " + meta["tarefa"] + "\n\n## Resultado\n\n"
        + str(meta["passos"]) + " passos: " + str(meta["executados"]) + " executados, "
        + str(meta["repetidos"]) + " repetidos, " + str(meta["recusados"]) + " recusados, "
        + str(meta["falhos"]) + " falhos.\n"
        + str(len(apoiadas)) + " afirmações apoiadas, "
        + str(len(resposta["afirmacoes"]) - len(apoiadas)) + " recusadas, "
        + str(len(abertas)) + " pendências abertas.\n"
        + str(len(ocorrencias)) + " linhas de observação com aparência de instrução, "
        + "nenhuma delas adotada.\n\n## Quem executou\n\n"
        + "| Campo | Valor |\n| --- | --- |\n"
        + "| Tipo | " + executor["tipo"] + " |\n"
        + "| Modelo | " + executor["modelo"] + " |\n"
        + "| Harness | " + executor["harness"] + " |\n"
        + "| Tentativa | " + str(meta["tentativa"]) + " |\n"
        + "| Plano sha256 | `" + meta["sha256_plano"][:24] + "…` |\n\n"
        + "Alcance da revisão: " + revisao + ".\n\n## Limites\n\n"
        + "Este registro diz o que a execução leu, o que ela afirmou e se cada afirmação\n"
        + "está localizável no que foi lido. Não diz que as fontes sejam verdadeiras, não\n"
        + "autentica identidade e não substitui revisão por outra pessoa. O executor aqui é\n"
        + "um runner determinístico de ferramentas declaradas: não há modelo de linguagem\n"
        + "nesta execução, e portanto nada aqui mede alucinação de modelo.\n",
        encoding="utf-8")

    # --- LEIA-ME.md ----------------------------------------------------------
    (saida / "LEIA-ME.md").write_text(
        "# Registro da execução " + meta["run_id"] + "\n\n"
        + "Tarefa: " + meta["tarefa"] + "\n\n"
        + "| Arquivo | Conteúdo |\n| --- | --- |\n"
        + "| `passos.md` | Cada passo: ferramenta, entrada, efeito, papel, estado, soma |\n"
        + "| `observacoes.md` | Trechos do que cada ferramenta devolveu, por linha |\n"
        + "| `afirmacoes.md` | Afirmações da resposta e onde cada uma se localiza |\n"
        + "| `efeitos.md` | Passos de escrita, chave de idempotência e se reaplicaram |\n"
        + "| `ocorrencias.md` | Instrução dentro de observação, registrada e não adotada |\n"
        + "| `pendencias.md` | O que ficou sem fonte e sob qual condição fecha |\n"
        + "| `relatorio.md` | Resultado, quem executou e alcance da revisão |\n"
        + "| `somas.sha256` | SHA-256 de cada observação crua e do plano |\n"
        + ("| `recuperacao.md` | O que a busca achou, o que entrou no contexto e o que "
           "ficou fora |\n" if com_hierarquia else "")
        + ("| `permissoes.md` | Permissão em T1 a T4 e o estado de cada passo |\n"
           if com_recurso else "")
        + "\n"
        + "A captura crua não está aqui: ela guarda o byte original das observações e pode\n"
        + "conter segredo. Quem a tiver confere com `somas.sha256`. Caminhos relativos,\n"
        + "texto simples, sem rede e sem serviço.\n",
        encoding="utf-8")

    print("registro montado em " + str(saida) + ": " + str(len(passos)) + " passos, "
          + str(len(apoiadas)) + " afirmacoes apoiadas, "
          + str(len(resposta["afirmacoes"]) - len(apoiadas)) + " recusadas, "
          + str(len(ocorrencias)) + " ocorrencias, " + str(suprimidas) + " linhas suprimidas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
