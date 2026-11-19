#!/usr/bin/env python3
"""Testa o verificador de execucao: cada mutante estraga uma coisa e deve derrubar X1..X8.

Mesma regra do outro harness: um mutante que sobrevive significa que aquela
verificacao nao serve como evidencia.

Uso: python -I -B mutantes_execucao.py
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import verificar_execucao as VE  # noqa: E402  (instala o bloqueio de rede)


def ler(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def grava(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def reescreve_passos(captura: Path, muda) -> None:
    linhas = []
    for linha in (captura / "passos.jsonl").read_text(encoding="utf-8").splitlines():
        if not linha.strip():
            continue
        r = json.loads(linha)
        muda(r)
        linhas.append(json.dumps(r, ensure_ascii=False, sort_keys=True))
    (captura / "passos.jsonl").write_text("\n".join(linhas) + "\n", encoding="utf-8")


# --- mutantes -----------------------------------------------------------------

def mx_soma_do_registro_divergente(base, captura, registro, resp):
    """Trocar uma soma no registro entregue."""
    arq = registro / "somas.sha256"
    arq.write_text(arq.read_text(encoding="utf-8").replace("0", "1", 1), encoding="utf-8")
    _, passos = VE.carregar(captura)
    return "X1", VE.checar_x1(captura, passos, registro)


def mx_citacao_de_passo_inexistente(base, captura, registro, resp):
    r = ler(resp)
    r["afirmacoes"][0]["citacoes"][0]["passo"] = "P42"
    _, passos = VE.carregar(captura)
    return "X2", VE.checar_x2(captura, passos, r, registro)


def mx_apoiada_sem_citacao(base, captura, registro, resp):
    r = ler(resp)
    r["afirmacoes"][1]["citacoes"] = []
    _, passos = VE.carregar(captura)
    return "X2", VE.checar_x2(captura, passos, r, registro)


def mx_recusada_sem_pendencia(base, captura, registro, resp):
    r = ler(resp)
    r["afirmacoes"][3].pop("pendencia", None)
    _, passos = VE.carregar(captura)
    return "X2", VE.checar_x2(captura, passos, r, registro)


def mx_pendencia_fechada_sem_prova(base, captura, registro, resp):
    r = ler(resp)
    for q in r["pendencias"]:
        if q["id"] == "Q001":
            q["estado"] = "encerrada"
    _, passos = VE.carregar(captura)
    return "X2", VE.checar_x2(captura, passos, r, registro)


def mx_afirmacao_apagada_do_registro(base, captura, registro, resp):
    arq = registro / "afirmacoes.md"
    arq.write_text("\n".join(l for l in arq.read_text(encoding="utf-8").split("\n")
                             if not l.startswith("| A03 ")), encoding="utf-8")
    r = ler(resp)
    _, passos = VE.carregar(captura)
    return "X2", VE.checar_x2(captura, passos, r, registro)


def mx_plano_trocado_depois_da_captura(base, captura, registro, resp):
    plano = ler(captura / "plano.json")
    plano["passos"][1]["argumentos"]["caminho"] = "teste-recebimento/lote/recebidos/resumo.md"
    grava(captura / "plano.json", plano)
    meta, passos = VE.carregar(captura)
    return "X3", VE.checar_x3(captura, meta, passos, ler(resp))


def mx_argumentos_diferentes_do_plano(base, captura, registro, resp):
    reescreve_passos(captura, lambda r: r.update(
        {"entrada": "{\"caminho\": \"teste-recebimento/lote/recebidos/resumo.md\"}"})
        if r["id"] == "P02" else None)
    meta, passos = VE.carregar(captura)
    return "X3", VE.checar_x3(captura, meta, passos, ler(resp))


def mx_runner_com_processo_externo(base, captura, registro, resp):
    original = (RAIZ / "executar.py").read_text(encoding="utf-8")
    try:
        (RAIZ / "executar.py").write_text(
            original.replace("import json", "import json, subprocess", 1), encoding="utf-8")
        meta, passos = VE.carregar(captura)
        return "X3", VE.checar_x3(captura, meta, passos, ler(resp))
    finally:
        (RAIZ / "executar.py").write_text(original, encoding="utf-8")


def mx_run_id_nao_casa_com_a_pasta(base, captura, registro, resp):
    meta = ler(captura / "meta.json")
    meta["run_id"] = "Rfalsific-t01"
    grava(captura / "meta.json", meta)
    return "X4", VE.checar_x4(captura.parent, meta)


def mx_executor_sem_modelo(base, captura, registro, resp):
    meta = ler(captura / "meta.json")
    meta["executor"]["modelo"] = ""
    grava(captura / "meta.json", meta)
    return "X5", VE.checar_x5(registro, meta)


def mx_autorrevisao_apresentada_como_revisao(base, captura, registro, resp):
    arq = registro / "relatorio.md"
    arq.write_text(arq.read_text(encoding="utf-8").replace(
        "; não houve revisão independente", ""), encoding="utf-8")
    meta, _ = VE.carregar(captura)
    return "X5", VE.checar_x5(registro, meta)


def mx_endereco_externo_na_prosa(base, captura, registro, resp):
    arq = registro / "relatorio.md"
    arq.write_text(arq.read_text(encoding="utf-8")
                   + "\nPainel da execução: https://exemplo-invalido.test/run\n",
                   encoding="utf-8")
    return "X6", VE.checar_x6(registro)


def mx_captura_crua_dentro_do_registro(base, captura, registro, resp):
    shutil.copytree(captura / "bruto", registro / "bruto")
    return "X6", VE.checar_x6(registro)


def mx_arquivo_citado_inexistente(base, captura, registro, resp):
    (registro / "efeitos.md").unlink()
    return "X6", VE.checar_x6(registro)


def mx_segredo_no_registro(base, captura, registro, resp):
    arq = registro / "observacoes.md"
    arq.write_text(arq.read_text(encoding="utf-8")
                   + "\n   1  api_key=" + VE.SEGREDO_DE_TESTE + "\n", encoding="utf-8")
    _, passos = VE.carregar(captura)
    return "X7", VE.checar_x7(captura, passos, registro)


def mx_chave_aplicada_duas_vezes(base, captura, registro, resp):
    run2 = VE.executar_plano(captura.parent.parent / "plano.json", base, captura.parent)
    captura2 = captura.parent / run2
    reescreve_passos(captura2, lambda r: r.update({"estado": "executado"})
                     if r["efeito"] == "escrita" else None)
    _, passos = VE.carregar(captura)
    return "X8", VE.checar_x8(captura.parent, passos, registro, VE.carregar(captura)[0])


def mx_chave_ausente_do_registro(base, captura, registro, resp):
    arq = registro / "efeitos.md"
    arq.write_text(arq.read_text(encoding="utf-8").replace("resumo-L002-v1", "—"),
                   encoding="utf-8")
    _, passos = VE.carregar(captura)
    return "X8", VE.checar_x8(captura.parent, passos, registro, VE.carregar(captura)[0])


# --- mutantes dos tres eixos novos: hierarquia, permissao, digest -------------

def _passos(captura: Path) -> list[dict]:
    return [json.loads(l) for l in
            (captura / "passos.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]


def mx_bloco_fornecido_alterado(base, captura, registro, resp):
    """Trocar um byte dentro do bloco que foi fornecido ao contexto."""
    alvo = captura / "bruto" / "P01.bin"
    alvo.write_bytes(alvo.read_bytes().replace(b"11.950", b"91.950"))
    return "X9", VE.checar_x9(captura, _passos(captura), ler(resp))


def mx_descarte_sem_motivo(base, captura, registro, resp):
    """Candidato descartado sem dizer por quê."""
    def muda(r):
        if r.get("recuperacao"):
            for c in r["recuperacao"]["candidatos"]:
                if not c["fornecido"]:
                    c["motivo_descarte"] = "   "
    reescreve_passos(captura, muda)
    return "X9", VE.checar_x9(captura, _passos(captura), ler(resp))


def mx_citacao_fora_de_bloco(base, captura, registro, resp):
    """Citar a linha do cabeçalho, que não é conteúdo fornecido."""
    r = ler(resp)
    r["afirmacoes"][0]["citacoes"][0] = {"passo": "P01", "linha": 12,
                                         "trecho": "--- C2 "}
    return "X9", VE.checar_x9(captura, _passos(captura), r)


def mx_descartado_entrou_no_contexto(base, captura, registro, resp):
    """Declarar descartado um candidato cujo conteúdo foi fornecido."""
    def muda(r):
        if r.get("recuperacao"):
            cands = r["recuperacao"]["candidatos"]
            fornecido = next(c for c in cands if c["fornecido"])
            descartado = next(c for c in cands if not c["fornecido"])
            descartado["sha256_arquivo"] = fornecido["sha256_fornecido"]
    reescreve_passos(captura, muda)
    return "X9", VE.checar_x9(captura, _passos(captura), ler(resp))


def mx_estado_suprimido_com_t3_permitindo(base, captura, registro, resp):
    """Dizer usado_mas_suprimido com T3 permitindo."""
    def muda(r):
        if r.get("estado_permissao") == "usado_mas_suprimido":
            r["tokens"]["T3"]["veredicto"] = "permite"
    reescreve_passos(captura, muda)
    return "X10", VE.checar_x10(captura, _passos(captura), ler(resp))


def mx_estado_exibido_sem_t3(base, captura, registro, resp):
    """Dizer exibido sem o token de T3."""
    def muda(r):
        if r.get("estado_permissao") == "exibido":
            r["tokens"]["T3"] = None
    reescreve_passos(captura, muda)
    return "X10", VE.checar_x10(captura, _passos(captura), ler(resp))


def mx_digest_de_permissao_trocado(base, captura, registro, resp):
    """Token com digest de permissão que não corresponde ao estado avaliado."""
    def muda(r):
        if r.get("tokens", {}).get("T1"):
            r["tokens"]["T1"]["digest_permissao"] = "0" * 64
    reescreve_passos(captura, muda)
    return "X10", VE.checar_x10(captura, _passos(captura), ler(resp))


def mx_conferido_em_retrocede(base, captura, registro, resp):
    """T3 conferido antes de T2."""
    def muda(r):
        tk = r.get("tokens") or {}
        if tk.get("T2") and tk.get("T3"):
            tk["T3"]["conferido_em"] = tk["T2"]["conferido_em"] - 10
            tk["T3"]["valido_de"] = tk["T3"]["conferido_em"]
    reescreve_passos(captura, muda)
    return "X10", VE.checar_x10(captura, _passos(captura), ler(resp))


def mx_evento_retroativo_no_log(base, captura, registro, resp):
    """Evento de permissão com efeito no passado."""
    log = ler(captura / "permissoes.json")
    if log["eventos"]:
        log["eventos"][0]["efetivo_em"] = log["eventos"][0]["registrado_em"] - 500
    grava(captura / "permissoes.json", log)
    return "X10", VE.checar_x10(captura, _passos(captura), ler(resp))


def mx_afirmacao_apoiada_em_passo_suprimido(base, captura, registro, resp):
    """Promover a afirmação do anexo suprimido a apoiada."""
    r = ler(resp)
    a = r["afirmacoes"][-1]
    a["suporte"] = "apoiada"
    a["citacoes"] = [{"passo": "P02", "linha": 10, "trecho": "99 participantes"}]
    a["alcance"] = "Compatível com o anexo"
    return "X10", VE.checar_x10(captura, _passos(captura), r)


def mx_registro_digest_trocado(base, captura, registro, resp):
    """Digest do registro trocado."""
    reescreve_passos(captura, lambda r: r.update({"registro_digest": "0" * 64}))
    return "X11", VE.checar_x11(captura, _passos(captura))


def mx_campo_do_registro_alterado(base, captura, registro, resp):
    """Alterar um campo do registro mantendo o digest antigo."""
    def muda(r):
        if r["id"] == "P03":
            r["proposito"] = "proposito reescrito depois do fato"
    reescreve_passos(captura, muda)
    return "X11", VE.checar_x11(captura, _passos(captura))


def mx_assinatura_trocada(base, captura, registro, resp):
    """MAC trocado, digest intacto."""
    def muda(r):
        if r.get("registro_assinatura"):
            r["registro_assinatura"]["mac"] = "0" * 64
    reescreve_passos(captura, muda)
    return "X11", VE.checar_x11(captura, _passos(captura))


def _meta(captura: Path) -> dict:
    return ler(captura / "meta.json")


def mx_recurso_fora_do_escopo(base, captura, registro, resp):
    """Passo com recurso que a delegação não cobre."""
    reescreve_passos(captura, lambda r: r.update({"recurso": "cofre-financeiro"})
                     if r.get("recurso") else None)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


def mx_efeitos_acima_do_limite(base, captura, registro, resp):
    """Mais efeitos executados do que a delegação permite."""
    d = ler(captura / "delegacao.json")
    d["escopo"]["max_acoes"] = 0
    grava(captura / "delegacao.json", d)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


def mx_delegacao_id_divergente(base, captura, registro, resp):
    """Meta cita uma delegação diferente da decisão gravada."""
    m = _meta(captura)
    m["delegacao_id"] = "del-outra-0099"
    grava(captura / "meta.json", m)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


def mx_execucao_sob_recusa(base, captura, registro, resp):
    """Execução gravada sob uma decisão que recusou."""
    d = ler(captura / "delegacao.json")
    d["veredicto"] = "recusa"
    d["razoes_da_recusa"] = ["D1: acao nao coberta"]
    grava(captura / "delegacao.json", d)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


def mx_decisao_apos_expirar(base, captura, registro, resp):
    """Decisão tomada depois de o contrato expirar."""
    d = ler(captura / "delegacao.json")
    d["escopo"]["expira_em"] = d["decidido_em"] - 100
    grava(captura / "delegacao.json", d)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


def mx_decisao_sem_limites(base, captura, registro, resp):
    """Decisão que apaga os limites declarados."""
    d = ler(captura / "delegacao.json")
    d["limites"] = []
    grava(captura / "delegacao.json", d)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


def mx_digest_da_decisao_trocado(base, captura, registro, resp):
    """Campo da decisão alterado depois de assinada."""
    d = ler(captura / "delegacao.json")
    d["escopo"]["recursos"] = d["escopo"]["recursos"] + ["cofre-financeiro"]
    grava(captura / "delegacao.json", d)
    return "X12", VE.checar_x12(captura, _meta(captura), _passos(captura))


MUTANTES_DELEGACAO = [
    ("MX32", "passo com recurso fora do escopo delegado", mx_recurso_fora_do_escopo),
    ("MX33", "efeitos acima do limite da delegação", mx_efeitos_acima_do_limite),
    ("MX34", "meta cita outra delegação", mx_delegacao_id_divergente),
    ("MX35", "execução gravada sob decisão de recusa", mx_execucao_sob_recusa),
    ("MX36", "decisão tomada após o contrato expirar", mx_decisao_apos_expirar),
    ("MX37", "decisão com os limites apagados", mx_decisao_sem_limites),
    ("MX38", "escopo ampliado depois de assinado", mx_digest_da_decisao_trocado),
]

MUTANTES_V3 = [
    ("MX19", "byte alterado dentro do bloco fornecido", mx_bloco_fornecido_alterado),
    ("MX20", "candidato descartado sem motivo", mx_descarte_sem_motivo),
    ("MX21", "citação na linha de cabeçalho, fora do bloco", mx_citacao_fora_de_bloco),
    ("MX22", "descartado cujo conteúdo entrou no contexto",
     mx_descartado_entrou_no_contexto),
    ("MX23", "usado_mas_suprimido com T3 permitindo",
     mx_estado_suprimido_com_t3_permitindo),
    ("MX24", "exibido sem o token de T3", mx_estado_exibido_sem_t3),
    ("MX25", "digest de permissão que não bate com o estado",
     mx_digest_de_permissao_trocado),
    ("MX26", "conferido_em de T3 anterior ao de T2", mx_conferido_em_retrocede),
    ("MX27", "evento de permissão com efeito no passado", mx_evento_retroativo_no_log),
    ("MX28", "afirmação apoiada em passo suprimido",
     mx_afirmacao_apoiada_em_passo_suprimido),
    ("MX29", "registro_digest trocado", mx_registro_digest_trocado),
    ("MX30", "campo do registro alterado depois de assinado",
     mx_campo_do_registro_alterado),
    ("MX31", "MAC da assinatura trocado", mx_assinatura_trocada),
]

MUTANTES = [
    ("MX01", "soma do registro divergente da captura", mx_soma_do_registro_divergente),
    ("MX02", "citação aponta passo que não existe", mx_citacao_de_passo_inexistente),
    ("MX03", "afirmação apoiada sem nenhuma citação", mx_apoiada_sem_citacao),
    ("MX04", "afirmação recusada sem pendência vinculada", mx_recusada_sem_pendencia),
    ("MX05", "pendência encerrada sem o documento", mx_pendencia_fechada_sem_prova),
    ("MX06", "afirmação apagada do registro entregue", mx_afirmacao_apagada_do_registro),
    ("MX07", "plano trocado depois da captura", mx_plano_trocado_depois_da_captura),
    ("MX08", "passo rodou com argumentos fora do plano", mx_argumentos_diferentes_do_plano),
    ("MX09", "runner passaria a poder chamar processo externo",
     mx_runner_com_processo_externo),
    ("MX10", "run_id não casa com a pasta da captura", mx_run_id_nao_casa_com_a_pasta),
    ("MX11", "executor sem modelo declarado", mx_executor_sem_modelo),
    ("MX12", "autorrevisão apresentada como revisão", mx_autorrevisao_apresentada_como_revisao),
    ("MX13", "registro passa a depender de endereço externo", mx_endereco_externo_na_prosa),
    ("MX14", "captura crua copiada para dentro do registro",
     mx_captura_crua_dentro_do_registro),
    ("MX15", "arquivo citado no LEIA-ME não existe", mx_arquivo_citado_inexistente),
    ("MX16", "credencial colada no registro", mx_segredo_no_registro),
    ("MX17", "mesma chave de idempotência aplicada duas vezes",
     mx_chave_aplicada_duas_vezes),
    ("MX18", "chave de idempotência ausente do registro", mx_chave_ausente_do_registro),
]


def main() -> int:
    linhas, sobreviventes = [], 0
    for mid, descricao, fn, cenario in ([(a, b, c, VE._cenario) for a, b, c in MUTANTES]
                                        + [(a, b, c, VE._cenario_v3)
                                           for a, b, c in MUTANTES_V3]
                                        + [(a, b, c, VE._cenario_delegado)
                                           for a, b, c in MUTANTES_DELEGACAO]):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            base, captura, registro, resp = cenario(tmp)
            alvo, (ok, evidencia) = fn(base, captura, registro, resp)
            morto = not ok
            if not morto:
                sobreviventes += 1
            linhas.append({"id": mid, "defeito": descricao, "verificacao": alvo,
                           "resultado": "detectado" if morto else "NAO DETECTADO",
                           "evidencia": evidencia})

    saida = RAIZ / "resultados"
    saida.mkdir(exist_ok=True)
    (saida / "mutantes-execucao.json").write_text(
        json.dumps({"data": "2026-11-14", "linhas": linhas,
                    "sobreviventes": sobreviventes}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    md = ["# Teste do verificador de execução por mutação", "",
          "Cada linha aplica um defeito a uma cópia da execução. A verificação indicada",
          "tem de falhar.", "",
          "Os MX01 a MX18 usam a execução com plano fixo; os MX19 a MX31, a execução",
          "com hierarquia de recuperação e permissão por estágio; os MX32 a MX38, a",
          "execução autorizada por um gate de delegação a montante.", "",
          "| ID | Defeito introduzido | Verificação | Resultado | Evidência |",
          "| --- | --- | --- | --- | --- |"]
    for l in linhas:
        md.append("| " + l["id"] + " | " + l["defeito"] + " | " + l["verificacao"]
                  + " | " + l["resultado"] + " | "
                  + l["evidencia"].replace("|", "\\|")[:300] + " |")
    md += ["", str(len(linhas) - sobreviventes) + " de " + str(len(linhas))
           + " defeitos detectados. Sobreviventes: " + str(sobreviventes) + ".", "",
           "Os mutantes são escritos à mão: cobrem o defeito que alguém pensou em",
           "escrever, e nada além disso. Nenhuma destas verificações decide se o que a",
           "execução leu era verdade.", ""]
    (saida / "mutantes-execucao.md").write_text("\n".join(md), encoding="utf-8")

    for l in linhas:
        print(l["resultado"].ljust(14), l["id"], l["verificacao"].ljust(4),
              l["defeito"][:50].ljust(52), l["evidencia"][:66])
    print("")
    print(str(len(linhas) - sobreviventes) + "/" + str(len(linhas))
          + " defeitos detectados; sobreviventes: " + str(sobreviventes))
    return 1 if sobreviventes else 0


if __name__ == "__main__":
    raise SystemExit(main())
