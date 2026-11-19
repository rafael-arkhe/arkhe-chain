#!/usr/bin/env python3
"""Testa o verificador: cada mutante estraga uma coisa e deve derrubar uma verificacao.

Um conjunto de verificacoes que nunca falha nao prova nada. Aqui cada mutante
aplica um defeito a uma copia do exemplar e exige que a verificacao indicada
retorne FALHOU. Se o verificador aprovar um mutante, o mutante sobrevive e a
verificacao correspondente nao vale como evidencia.

Uso: python -I -B mutantes.py
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import verificar as V  # noqa: E402  (instala o bloqueio de rede)


def preparar(tmp: Path) -> tuple[Path, Path, Path]:
    fontes, dados = V._copiar_entrada(tmp)
    pacote = tmp / "pacote"
    V.construir(fontes, dados, pacote)
    return fontes, dados, pacote


def carregar(dados: Path) -> tuple[dict, dict, dict, list]:
    return (json.loads((dados / "lote.json").read_text(encoding="utf-8")),
            json.loads((dados / "referencias.json").read_text(encoding="utf-8")),
            json.loads((dados / "alteracoes.json").read_text(encoding="utf-8")),
            json.loads((dados / "pendencias.json").read_text(encoding="utf-8")))


def gravar(caminho: Path, obj) -> None:
    caminho.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


# --- mutantes -----------------------------------------------------------------

def m_linha_removida_do_mapa(fontes, dados, pacote):
    """Apagar a linha de A004 do mapa entregue."""
    arq = pacote / "referencias.md"
    texto = [l for l in arq.read_text(encoding="utf-8").split("\n")
             if not l.startswith("| A004 ")]
    arq.write_text("\n".join(texto), encoding="utf-8")
    lote, refs, _, pends = carregar(dados)
    return "I2", V.checar_i2(dados, fontes, lote, refs, pends, pacote)


def m_trecho_inexistente(fontes, dados, pacote):
    """Citar na fonte um trecho que nao esta la."""
    lote, refs, _, pends = carregar(dados)
    refs["afirmacoes"][1]["fonte"]["trecho"] = "Quantidade registrada de presenças: 44."
    return "I2", V.checar_i2(dados, fontes, lote, refs, pends, pacote)


def m_afirmacao_sem_suporte_declarada_compativel(fontes, dados, pacote):
    """Marcar a quitacao como compativel, citando a linha que nega o comprovante."""
    lote, refs, _, pends = carregar(dados)
    a = refs["afirmacoes"][3]
    a["suporte"] = "compativel"
    a.pop("pendencia", None)
    a["alcance"] = "Compatível com a fonte"
    return "I2", V.checar_i2(dados, fontes, lote, refs, pends, pacote)


def m_pendencia_fechada_sem_prova(fontes, dados, pacote):
    """Fechar P001 sem anexar o comprovante."""
    lote, refs, _, pends = carregar(dados)
    for p in pends:
        if p["id"] == "P001":
            p["estado"] = "encerrada"
    return "I2", V.checar_i2(dados, fontes, lote, refs, pends, pacote)


def m_linha_fora_do_arquivo(fontes, dados, pacote):
    """Citar uma linha que nao existe na fonte."""
    lote, refs, _, pends = carregar(dados)
    refs["afirmacoes"][0]["fonte"]["linha"] = 99
    return "I2", V.checar_i2(dados, fontes, lote, refs, pends, pacote)


def m_original_apagado(fontes, dados, pacote):
    """Entregar o pacote sem um dos originais aceitos."""
    (pacote / "originais" / "D001" / "relatorio_v1.txt").unlink()
    lote, _, _, _ = carregar(dados)
    return "I1", V.checar_i1(fontes, lote, pacote)


def m_original_a_mais(fontes, dados, pacote):
    """Incluir em originais um arquivo que nao consta do indice."""
    (pacote / "originais" / "intruso.txt").write_text("conteudo nao declarado\n",
                                                      encoding="utf-8")
    lote, _, _, _ = carregar(dados)
    return "I1", V.checar_i1(fontes, lote, pacote)


def m_campo_ausente_que_existe(fontes, dados, pacote):
    """Declarar ausente em D001 um termo que esta em D001."""
    lote, _, alts, pends = carregar(dados)
    alts["campos"][2]["antes"]["ausente_termos"] = ["documentação"]
    return "I2b", V.checar_alteracoes(dados, lote, alts, pends, pacote)


def m_alteracao_sem_justificativa_nem_pendencia(fontes, dados, pacote):
    """Alteracao sem justificativa e sem pendencia vinculada."""
    lote, _, alts, pends = carregar(dados)
    alts["campos"][0]["pendencia"] = None
    return "I2b", V.checar_alteracoes(dados, lote, alts, pends, pacote)


def m_endereco_externo_no_pacote(fontes, dados, pacote):
    """Pacote que depende de um endereco na rede para ser lido."""
    arq = pacote / "LEIA-ME.md"
    arq.write_text(arq.read_text(encoding="utf-8")
                   + "\nConsulte o painel em https://exemplo-invalido.test/pacote\n",
                   encoding="utf-8")
    return "I6", V.checar_i6(pacote)


def m_endereco_na_prosa_das_ocorrencias(fontes, dados, pacote):
    """Endereço externo na prosa de ocorrencias.md, não como conteúdo citado em tabela."""
    arq = pacote / "ocorrencias.md"
    arq.write_text(arq.read_text(encoding="utf-8")
                   + "\nPara o relatório completo acesse https://exemplo-invalido.test/oc\n",
                   encoding="utf-8")
    return "I6", V.checar_i6(pacote)


def m_arquivo_citado_inexistente(fontes, dados, pacote):
    """LEIA-ME cita um arquivo que nao esta no pacote."""
    (pacote / "pendencias.md").unlink()
    return "I6", V.checar_i6(pacote)


def m_revisao_concluida_sem_revisor(fontes, dados, pacote):
    """Relatorio sem a declaracao de revisao, com revisor vazio no lote."""
    arq = pacote / "relatorio.md"
    arq.write_text(arq.read_text(encoding="utf-8").replace(
        "revisão declarada pelo próprio operador", "revisão concluída por"),
        encoding="utf-8")
    lote, _, _, _ = carregar(dados)
    lote["revisor"] = ""
    lote["revisado_em"] = ""
    return "I5", V.checar_i5(pacote, lote)


def m_autorrevisao_apresentada_como_independente(fontes, dados, pacote):
    """Esconder do relatorio que nao houve revisao independente."""
    arq = pacote / "relatorio.md"
    arq.write_text(arq.read_text(encoding="utf-8").replace(
        "; não houve revisão independente", ""), encoding="utf-8")
    lote, _, _, _ = carregar(dados)
    return "I5", V.checar_i5(pacote, lote)


def m_destino_nao_registrado(fontes, dados, pacote):
    """Entregar sem registrar o ambiente de processamento."""
    lote, _, _, _ = carregar(dados)
    arq = pacote / "relatorio.md"
    arq.write_text(arq.read_text(encoding="utf-8").replace(
        lote["ambiente_processamento"], "não informado"), encoding="utf-8")
    return "I7", V.checar_i7(pacote, lote)


def m_exclusao_declarada_sem_confirmacao(fontes, dados, pacote):
    """Afirmar exclusao que ninguem confirmou."""
    arq = pacote / "relatorio.md"
    arq.write_text(arq.read_text(encoding="utf-8")
                   + "\nCópias de trabalho: excluído com sucesso.\n", encoding="utf-8")
    lote, _, _, _ = carregar(dados)
    return "I7", V.checar_i7(pacote, lote)


def m_escopo_excedido_em_silencio(fontes, dados, pacote):
    """21 afirmações selecionadas, acima do limite, sem registro de excesso no pacote."""
    lote, refs, _, pends = carregar(dados)
    modelo = refs["afirmacoes"][0]
    while len(refs["afirmacoes"]) <= V.montar.LIMITE_AFIRMACOES:
        copia = json.loads(json.dumps(modelo))
        copia["id"] = "A" + str(len(refs["afirmacoes"]) + 1).zfill(3)
        refs["afirmacoes"].append(copia)
    refs["afirmacoes_selecionadas"] = len(refs["afirmacoes"])
    return "E1", V.checar_escopo(dados, lote, refs, pacote)


def m_contagem_de_afirmacoes_divergente(fontes, dados, pacote):
    """Declarar menos afirmações do que o mapa realmente tem."""
    lote, refs, _, pends = carregar(dados)
    refs["afirmacoes_selecionadas"] = 2
    return "E1", V.checar_escopo(dados, lote, refs, pacote)


def m_codigo_executa_conteudo(fontes, dados, pacote):
    """Verificacao estatica: montar.py passaria a executar conteudo."""
    original = (RAIZ / "montar.py").read_text(encoding="utf-8")
    try:
        (RAIZ / "montar.py").write_text(
            original.replace("import difflib", "import difflib, subprocess"),
            encoding="utf-8")
        return "I3a", V.checar_i3_estatico()
    finally:
        (RAIZ / "montar.py").write_text(original, encoding="utf-8")


MUTANTES = [
    ("M01", "linha de afirmação apagada do mapa", m_linha_removida_do_mapa),
    ("M02", "trecho citado não existe na fonte", m_trecho_inexistente),
    ("M03", "quitação declarada compatível citando a linha que a nega",
     m_afirmacao_sem_suporte_declarada_compativel),
    ("M04", "pendência encerrada sem o documento", m_pendencia_fechada_sem_prova),
    ("M05", "linha citada fora do arquivo", m_linha_fora_do_arquivo),
    ("M06", "original aceito ausente do pacote", m_original_apagado),
    ("M07", "original não declarado no índice", m_original_a_mais),
    ("M08", "termo declarado ausente que está presente", m_campo_ausente_que_existe),
    ("M09", "alteração sem justificativa e sem pendência",
     m_alteracao_sem_justificativa_nem_pendencia),
    ("M10", "pacote passa a depender de endereço externo", m_endereco_externo_no_pacote),
    ("M11", "arquivo citado no LEIA-ME não existe", m_arquivo_citado_inexistente),
    ("M17", "endereço externo na prosa das ocorrências",
     m_endereco_na_prosa_das_ocorrencias),
    ("M12", "revisão concluída sem revisor nem data", m_revisao_concluida_sem_revisor),
    ("M13", "autorrevisão apresentada como revisão", m_autorrevisao_apresentada_como_independente),
    ("M14", "ambiente de processamento não registrado", m_destino_nao_registrado),
    ("M15", "exclusão declarada sem confirmação", m_exclusao_declarada_sem_confirmacao),
    ("M16", "código passaria a poder executar conteúdo", m_codigo_executa_conteudo),
    ("M18", "21 afirmações sem registro de escopo excedido",
     m_escopo_excedido_em_silencio),
    ("M19", "contagem declarada diferente do mapa",
     m_contagem_de_afirmacoes_divergente),
]


def main() -> int:
    linhas = []
    sobreviventes = 0
    for mid, descricao, fn in MUTANTES:
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            fontes, dados, pacote = preparar(tmp)
            alvo, (ok, evidencia) = fn(fontes, dados, pacote)
            morto = not ok  # a verificacao precisa FALHAR
            if not morto:
                sobreviventes += 1
            linhas.append({"id": mid, "defeito": descricao, "verificacao": alvo,
                           "resultado": "detectado" if morto else "NAO DETECTADO",
                           "evidencia": evidencia})

    saida = RAIZ / "resultados"
    saida.mkdir(exist_ok=True)
    (saida / "mutantes.json").write_text(
        json.dumps({"data": "2026-11-14", "linhas": linhas,
                    "sobreviventes": sobreviventes}, ensure_ascii=False, indent=2),
        encoding="utf-8")

    md = ["# Teste do verificador por mutação", "",
          "Cada linha aplica um defeito a uma cópia do exemplar. A verificação indicada",
          "tem de falhar. Um mutante não detectado significa que aquela verificação não",
          "serve como evidência.", "",
          "| ID | Defeito introduzido | Verificação | Resultado | Evidência |",
          "| --- | --- | --- | --- | --- |"]
    for l in linhas:
        md.append("| " + l["id"] + " | " + l["defeito"] + " | " + l["verificacao"]
                  + " | " + l["resultado"] + " | " + l["evidencia"].replace("|", "\\|")[:300]
                  + " |")
    md += ["", str(len(linhas) - sobreviventes) + " de " + str(len(linhas))
           + " defeitos detectados. Sobreviventes: " + str(sobreviventes) + ".", "",
           "A mutação cobre os defeitos listados acima. Não cobre defeito que ninguém",
           "pensou em escrever, e nenhuma destas verificações decide se uma fonte é",
           "verdadeira: só se a afirmação está localizável no que foi recebido.", ""]
    (saida / "mutantes.md").write_text("\n".join(md), encoding="utf-8")

    for l in linhas:
        print(l["resultado"].ljust(14), l["id"], l["verificacao"].ljust(5),
              l["defeito"][:52].ljust(54), l["evidencia"][:70])
    print("")
    print(str(len(linhas) - sobreviventes) + "/" + str(len(linhas))
          + " defeitos detectados; sobreviventes: " + str(sobreviventes))
    return 1 if sobreviventes else 0


if __name__ == "__main__":
    raise SystemExit(main())
