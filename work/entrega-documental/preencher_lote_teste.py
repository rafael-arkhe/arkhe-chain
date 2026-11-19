#!/usr/bin/env python3
"""Preenche o lote de teste como o operador preencheria, para rodar a cadeia inteira.

Isto NAO e parte do servico: escolher afirmacoes e julgar alcance e trabalho humano,
feito com o cliente. Aqui esta escrito em codigo so para que o teste ponta a ponta
seja reproduzivel.

Nenhuma afirmacao recebe suporte que o lote nao tenha: duas das quatro ficam
pendentes justamente por isso.

Uso: python -I -B preencher_lote_teste.py teste-recebimento/lote
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    lote_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "teste-recebimento/lote")
    lote = json.loads((lote_dir / "lote.json").read_text(encoding="utf-8"))

    por_arquivo = {item["arquivo"]: item for item in lote["arquivos"]}
    esperados = {"anexo_com_instrucao.pdf", "ata_v1.txt", "prestacao_contas.pdf",
                 "resumo.md"}
    if set(por_arquivo) != esperados:
        print("lote inesperado: " + ", ".join(sorted(por_arquivo)))
        return 2
    ident = {nome: por_arquivo[nome]["id"] for nome in esperados}

    lote.update({
        "projeto": "teste-recebimento-lote-real",
        "titulo": "Prestação de contas de novembro de 2026 (fixture)",
        "recebido_em": "2026-11-14",
        "destinatarios_permitidos": ["operador do teste"],
        "ambiente_processamento": "máquina local do operador, sem envio a serviço externo",
        "revisor": "operador único do teste",
        "revisado_em": "2026-11-14",
        "revisao_independente": False,
    })
    declaracoes = {
        "ata_v1.txt": ("1", "Fixture: ata enviada pelo remetente declarado",
                       "Fonte citada pela prestação de contas"),
        "prestacao_contas.pdf": ("1", "Fixture: PDF com texto selecionável",
                                 "Candidata à entrega, aprovação pendente"),
        "resumo.md": ("1", "Fixture: resumo em Markdown", "Documento de apoio"),
        "anexo_com_instrucao.pdf": ("1", "Fixture: anexo de teste de injeção",
                                    "Anexo recebido; nenhuma afirmação selecionada"),
    }
    for nome, (versao, origem, relacao) in declaracoes.items():
        por_arquivo[nome].update({"versao": versao, "origem": origem,
                                  "relacao": relacao})
    (lote_dir / "lote.json").write_text(
        json.dumps(lote, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    pc = ident["prestacao_contas.pdf"]
    ata = ident["ata_v1.txt"]

    referencias = {
        "versao_conferida": pc,
        "afirmacoes_selecionadas": 4,
        "fora_da_analise": [
            ident["resumo.md"] + " inteiro (documento de apoio, não é a versão conferida)",
            ident["anexo_com_instrucao.pdf"]
            + " inteiro (anexo sem afirmação selecionada)",
            pc + ", página 2, linha 10 (campo de responsável, não é afirmação de fato)",
        ],
        "afirmacoes": [
            {
                "id": "A001",
                "afirmacao": "Orçamento aprovado de R$ 12.400",
                "local": {"id": pc, "pagina": 1, "linha": 4, "trecho": "R$ 12.400"},
                "fonte": {"id": ata, "linha": 4, "trecho": "R$ 12.400"},
                "suporte": "compativel",
                "alcance": "Compatível com o valor informado na ata; aprovação "
                           "orçamentária não autenticada",
            },
            {
                "id": "A002",
                "afirmacao": "Período de referência: novembro de 2026",
                "local": {"id": pc, "pagina": 1, "linha": 3,
                          "trecho": "novembro de 2026"},
                "fonte": {"id": ata, "linha": 2, "trecho": "novembro de 2026"},
                "suporte": "compativel",
                "alcance": "Compatível com a data da reunião registrada na ata; "
                           "ocorrência física não verificada",
            },
            {
                "id": "A003",
                "afirmacao": "Valor executado de R$ 11.950",
                "local": {"id": pc, "pagina": 1, "linha": 5, "trecho": "R$ 11.950"},
                "fonte": {"id": pc, "pagina": 2, "linha": 9,
                          "trecho": "Comprovante de devolucao: nao anexado."},
                "suporte": "ausente",
                "pendencia": "P001",
                "alcance": "Sem fonte independente no lote: o valor só consta do próprio "
                           "documento conferido e o comprovante não foi anexado",
            },
            {
                "id": "A004",
                "afirmacao": "Saldo devolvido de R$ 450",
                "local": {"id": pc, "pagina": 2, "linha": 8, "trecho": "R$ 450"},
                "fonte": {"id": pc, "pagina": 2, "linha": 9,
                          "trecho": "Comprovante de devolucao: nao anexado."},
                "suporte": "ausente",
                "pendencia": "P002",
                "alcance": "A diferença entre aprovado e executado é inferência "
                           "aritmética, não afirmação de fonte; sem comprovante de "
                           "devolução no lote",
            },
        ],
    }
    (lote_dir / "referencias.json").write_text(
        json.dumps(referencias, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    pendencias = [
        {"id": "P001", "pendencia": "Comprovante de execução de R$ 11.950 ausente",
         "efeito": "O valor executado fica sem fonte independente no lote",
         "responsavel": "Responsável financeiro do remetente, ainda não designado",
         "condicao": "Anexar extrato ou comprovante e conferir, ou corrigir a afirmação",
         "estado": "aberta"},
        {"id": "P002", "pendencia": "Comprovante de devolução de R$ 450 ausente",
         "efeito": "A devolução não se sustenta como fato documentado",
         "responsavel": "Responsável financeiro do remetente, ainda não designado",
         "condicao": "Anexar comprovante de devolução e conferir",
         "estado": "aberta"},
        {"id": "P003", "pendencia": "Aprovação da versão de entrega ausente",
         "efeito": pc + " permanece candidata",
         "responsavel": "Aprovador do cliente, ainda não designado",
         "condicao": "Registrar decisão, versão, nome e data",
         "estado": "aberta"},
    ]
    (lote_dir / "pendencias.json").write_text(
        json.dumps(pendencias, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Sem par de versoes neste lote: nada a comparar, e nada sera inventado.
    (lote_dir / "alteracoes.json").write_text(
        json.dumps({"par": {"anterior": "", "posterior": ""}, "campos": []},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("lote preenchido: versao conferida " + pc + ", 4 afirmacoes, "
          + "2 compativeis, 2 pendentes, 3 pendencias abertas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
