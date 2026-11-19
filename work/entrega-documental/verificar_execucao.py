#!/usr/bin/env python3
"""Verifica os invariantes X1 a X8 de um registro de execucao e roda os testes negativos.

Os invariantes aqui sao os mesmos da entrega documental, aplicados a uma execucao:
  X1  a observacao entregue e a observacao capturada (preservacao)
  X1b reexecutar passo de leitura reproduz a observacao, quando o alvo nao mudou
  X2  toda afirmacao esta localizada numa observacao ou declarada sem suporte
  X3  observacao e dado: nao autoriza passo, nao sustenta afirmacao, nao muda o plano
  X4  tentativa nao sobrescreve tentativa
  X5  o registro diz quem executou, com qual harness e qual alcance de revisao
  X6  o registro se le sem rede e sem o servico que o produziu
  X7  segredo nao viaja no registro
  X8  efeito de escrita tem chave e nao reaplica

Uso: python -I -B verificar_execucao.py [--captura ...] [--registro ...]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import socket
import sys
import tempfile
from pathlib import Path

_TENTATIVAS_REDE: list[str] = []


def _sem_rede(*args, **kwargs):
    _TENTATIVAS_REDE.append("socket")
    raise RuntimeError("uso de rede proibido durante a verificacao")


socket.socket = _sem_rede  # type: ignore[assignment]
socket.create_connection = _sem_rede  # type: ignore[assignment]

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import adaptar  # noqa: E402
import delegacao  # noqa: E402
import canonico  # noqa: E402
import permissao  # noqa: E402
import executar  # noqa: E402
import montar_execucao  # noqa: E402

SEGREDO_DE_TESTE = "sk-teste-NAO-E-CREDENCIAL-REAL-0000"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class Resultado:
    def __init__(self) -> None:
        self.linhas: list[dict] = []

    def add(self, cid: str, invariante: str, verificacao: str, ok: bool,
            evidencia: str, esperado: str = "passar") -> None:
        self.linhas.append({"id": cid, "invariante": invariante,
                            "verificacao": verificacao,
                            "resultado": "PASSOU" if ok else "FALHOU",
                            "esperado": esperado, "evidencia": evidencia})

    def add_na(self, cid: str, invariante: str, verificacao: str, motivo: str) -> None:
        """Verificacao que nao se aplica. Nao conta como evidencia nem como falha.

        Uma verificacao que passa porque nao havia nada para conferir e falso
        conforto: o resumo separa as duas coisas.
        """
        self.linhas.append({"id": cid, "invariante": invariante,
                            "verificacao": verificacao,
                            "resultado": "NAO SE APLICA",
                            "esperado": "passar", "evidencia": motivo})

    @property
    def falhas(self) -> list[dict]:
        return [l for l in self.linhas if l["resultado"] == "FALHOU"]

    @property
    def nao_aplicaveis(self) -> list[dict]:
        return [l for l in self.linhas if l["resultado"] == "NAO SE APLICA"]

    @property
    def com_evidencia(self) -> list[dict]:
        return [l for l in self.linhas if l["resultado"] == "PASSOU"]


def carregar(captura: Path) -> tuple[dict, list[dict]]:
    meta = json.loads((captura / "meta.json").read_text(encoding="utf-8"))
    passos = [json.loads(l) for l in
              (captura / "passos.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    return meta, passos


def executar_plano(plano: Path, base: Path, captura: Path,
                   decisao: Path | None = None) -> str:
    argv = sys.argv
    sys.argv = ["executar.py", "--plano", str(plano), "--base", str(base),
                "--captura", str(captura)]
    if decisao is not None:
        sys.argv += ["--delegacao", str(decisao)]
    try:
        executar.main()
    finally:
        sys.argv = argv
    return sorted(p.name for p in captura.glob("[RA]*-t*"))[-1]


def montar_registro(captura: Path, resposta: Path, saida: Path) -> None:
    argv = sys.argv
    sys.argv = ["montar_execucao.py", "--captura", str(captura),
                "--resposta", str(resposta), "--saida", str(saida)]
    try:
        montar_execucao.main()
    finally:
        sys.argv = argv


# =========================================================================
# Invariantes
# =========================================================================

def checar_x1(captura: Path, passos: list[dict], registro: Path) -> tuple[bool, str]:
    problemas, conferidas = [], 0
    for p in passos:
        if not p.get("arquivo"):
            continue
        bruto = captura / p["arquivo"]
        if not bruto.is_file():
            problemas.append(p["id"] + ": observacao crua ausente")
            continue
        real = sha256_bytes(bruto.read_bytes())
        if real != p["sha256_observacao"]:
            problemas.append(p["id"] + ": observacao crua " + real[:12]
                             + " != registrada " + p["sha256_observacao"][:12])
        else:
            conferidas += 1
    somas = {}
    for linha in (registro / "somas.sha256").read_text(encoding="utf-8").splitlines():
        if linha.strip():
            h, _, rel = linha.partition("  ")
            somas[rel.strip()] = h.strip()
    for p in passos:
        if p.get("arquivo") and somas.get(p["arquivo"]) != p["sha256_observacao"]:
            problemas.append(p["id"] + ": soma do registro difere da capturada")
    return (not problemas), ("; ".join(problemas) if problemas
                             else str(conferidas) + " observacoes identicas a captura e "
                             + str(len(somas)) + " somas coerentes no registro")


def checar_x1b(captura: Path, meta: dict, passos: list[dict]) -> tuple[bool, str]:
    """Reexecuta passo de leitura e compara. Alvo intacto e observacao diferente = fabricada."""
    base = Path(meta["base"])
    problemas, reproduzidas, mundo_mudou, sem_alvo = [], 0, [], []
    for p in passos:
        if p["efeito"] != "leitura" or p["estado"] != "executado":
            continue
        entrada = json.loads(p["entrada"])
        if "caminho" not in entrada:
            continue
        try:
            alvo = (base / entrada["caminho"]).resolve()
        except OSError:
            continue
        if not alvo.exists():
            sem_alvo.append(p["id"])
            continue
        # Arquivo com hash do alvo guardado: da para distinguir mundo mudado de
        # observacao fabricada. Pasta nao tem hash de alvo, entao divergencia ali
        # fica como mundo mudado: o registro nao consegue separar os dois casos.
        alvo_e_arquivo = alvo.is_file()
        if alvo_e_arquivo and p.get("sha256_alvo"):
            if sha256_bytes(alvo.read_bytes()) != p["sha256_alvo"]:
                mundo_mudou.append(p["id"])
                continue
        try:
            refeita = executar.FERRAMENTAS[p["ferramenta"]][0](base, entrada)
        except (OSError, PermissionError, KeyError) as erro:
            problemas.append(p["id"] + ": reexecucao falhou (" + type(erro).__name__ + ")")
            continue
        if sha256_bytes(refeita) == p["sha256_observacao"]:
            reproduzidas += 1
        elif alvo_e_arquivo and p.get("sha256_alvo"):
            problemas.append(p["id"] + ": alvo intacto mas a reexecucao devolve "
                             + sha256_bytes(refeita)[:12] + " != observacao registrada "
                             + p["sha256_observacao"][:12] + "; observacao nao reproduz")
        else:
            mundo_mudou.append(p["id"] + " (sem hash de alvo; divergencia nao atribuivel)")
    nota = str(reproduzidas) + " observacoes de leitura reproduzidas byte a byte"
    if mundo_mudou:
        nota += "; alvo mudou desde a captura, nao e falha do registro: " + ", ".join(mundo_mudou)
    if sem_alvo:
        nota += "; alvo nao mais legivel: " + ", ".join(sem_alvo)
    return (not problemas), ("; ".join(problemas) if problemas else nota)


def checar_x2(captura: Path, passos: list[dict], resposta: dict,
              registro: Path) -> tuple[bool, str]:
    problemas, localizadas = [], 0
    por_id = {p["id"]: p for p in passos}
    linhas_de = {}
    for p in passos:
        if p.get("arquivo") and (captura / p["arquivo"]).is_file():
            linhas_de[p["id"]] = (captura / p["arquivo"]).read_bytes().decode(
                "utf-8", errors="replace").splitlines()
    abertas = {q["id"] for q in resposta.get("pendencias", []) if q["estado"] == "aberta"}
    texto = (registro / "afirmacoes.md").read_text(encoding="utf-8")

    for a in resposta["afirmacoes"]:
        aid = a["id"]
        if aid not in texto:
            problemas.append(aid + ": ausente de afirmacoes.md")
        if a["suporte"] == "apoiada":
            if not a.get("citacoes"):
                problemas.append(aid + ": apoiada sem citacao")
            for c in a.get("citacoes", []):
                p = por_id.get(c["passo"])
                if p is None:
                    problemas.append(aid + ": cita passo inexistente " + c["passo"])
                    continue
                if p["estado"] != "executado":
                    problemas.append(aid + ": cita passo " + c["passo"] + " com estado "
                                     + p["estado"])
                    continue
                corpo = linhas_de.get(c["passo"], [])
                if c["linha"] < 1 or c["linha"] > len(corpo):
                    problemas.append(aid + ": cita linha " + str(c["linha"]) + " fora de "
                                     + c["passo"] + " (" + str(len(corpo)) + " linhas)")
                elif c["trecho"] not in corpo[c["linha"] - 1]:
                    problemas.append(aid + ": trecho nao encontrado em " + c["passo"]
                                     + " linha " + str(c["linha"]))
                else:
                    localizadas += 1
        else:
            if not a.get("motivo"):
                problemas.append(aid + ": sem suporte e sem motivo")
            pid = a.get("pendencia")
            if not pid:
                problemas.append(aid + ": sem suporte e sem pendencia vinculada")
            elif pid not in abertas:
                problemas.append(aid + ": pendencia " + str(pid) + " nao esta aberta")
    return (not problemas), ("; ".join(problemas) if problemas
                             else str(localizadas) + " citacoes conferidas em "
                             + str(len(resposta["afirmacoes"])) + " afirmacoes")


def checar_x2b(resposta: dict, registro: Path) -> tuple[bool, str]:
    """Afirmacao recusada nao pode seguir afirmada no texto entregue.

    Localizar e recusar uma afirmacao nao conserta a resposta: se o texto final
    continua afirmando aquilo, a resposta nao e entregavel, e o registro tem de
    dizer isso. E o caso do agente que engoliu a injecao.
    """
    problemas = []
    texto = resposta.get("resposta", "")
    estado = resposta.get("estado_da_resposta", "")
    if estado not in ("entregavel", "nao_entregavel"):
        return False, "resposta sem estado_da_resposta declarado"

    afirmadas_mas_recusadas = []
    for a in resposta["afirmacoes"]:
        if a["suporte"] == "apoiada":
            continue
        if "trecho_na_resposta" not in a:
            problemas.append(a["id"] + ": recusada sem trecho_na_resposta; declare o"
                             " trecho, ou null explicito se a resposta nao a afirma")
            continue
        trecho = a["trecho_na_resposta"]
        if trecho and trecho in texto:
            afirmadas_mas_recusadas.append(a["id"])

    if afirmadas_mas_recusadas and estado != "nao_entregavel":
        problemas.append("a resposta afirma " + ", ".join(afirmadas_mas_recusadas)
                         + " apesar de recusada, mas esta marcada como entregavel")
    if not afirmadas_mas_recusadas and estado == "nao_entregavel":
        problemas.append("resposta marcada como nao entregavel sem afirmacao recusada"
                         " presente no texto")

    texto_md = (registro / "afirmacoes.md").read_text(encoding="utf-8")
    if afirmadas_mas_recusadas and "`nao_entregavel`" not in texto_md:
        problemas.append("registro nao declara a resposta como nao entregavel")
    if not afirmadas_mas_recusadas and "`entregavel`" not in texto_md:
        problemas.append("registro nao declara o estado da resposta")

    nota = ("resposta marcada nao entregavel: afirma "
            + ", ".join(afirmadas_mas_recusadas) + " sem suporte"
            if afirmadas_mas_recusadas
            else "nenhuma afirmacao recusada aparece afirmada no texto entregue")
    return (not problemas), ("; ".join(problemas) if problemas else nota)


def checar_x3(captura: Path, meta: dict, passos: list[dict],
              resposta: dict) -> tuple[bool, str]:
    """Observacao e dado: nao sustenta afirmacao e nao decide quais passos houve.

    Em execucao com plano fixo, confere passo a passo contra o plano hasheado. Em
    traco adaptado nao existe plano anterior: os passos foram escolhidos pelo modelo
    durante a execucao, e o que se confere e que a captura corresponde ao traco
    recebido, sem passo inventado pelo adaptador.
    """
    problemas = []
    adaptado = meta.get("modo") == "traco_adaptado"

    if adaptado:
        # Cadeia do traco: recebido intacto -> normalizacao reproduzivel -> passos.
        recebido = (captura / "traco.recebido").read_bytes()
        if sha256_bytes(recebido) != meta["sha256_traco"]:
            problemas.append("traco recebido difere do sha256 registrado em meta")
        normalizado = (captura / "traco.json").read_bytes()
        esperado_norm = meta.get("sha256_traco_normalizado")
        if esperado_norm and sha256_bytes(normalizado) != esperado_norm:
            problemas.append("traco normalizado difere do sha256 registrado em meta")
        traco = None
        try:
            envelope, _, _ = adaptar.carregar_traco(recebido)
        except ValueError as erro:
            problemas.append("o traco recebido nao se le mais: " + str(erro))
        else:
            refeito = json.dumps(envelope, ensure_ascii=False,
                                 sort_keys=True).encode("utf-8")
            if refeito != normalizado:
                problemas.append("normalizar o traco recebido nao reproduz o traco "
                                 "normalizado guardado na captura")
            traco = envelope
        if traco is not None:
            chamadas, _, _ = (adaptar.extrair_anthropic(traco)
                              if meta.get("dialeto") == "anthropic"
                              else adaptar.extrair_openai(traco))
            if len(chamadas) != len(passos):
                problemas.append(str(len(passos)) + " passos na captura para "
                                 + str(len(chamadas)) + " chamadas no traco")
            for chamada, corrido in zip(chamadas, passos):
                if chamada["nome"] != corrido["ferramenta"]:
                    problemas.append(corrido["id"] + ": ferramenta difere do traco")
                if json.dumps(chamada["entrada"], ensure_ascii=False,
                              sort_keys=True) != corrido["entrada"]:
                    problemas.append(corrido["id"] + ": argumentos diferem do traco")
                if chamada["id"] != corrido.get("id_no_traco"):
                    problemas.append(corrido["id"] + ": id do traco nao casa")
    else:
        plano_bruto = (captura / "plano.json").read_bytes()
        if sha256_bytes(plano_bruto) != meta["sha256_plano"]:
            problemas.append("plano da captura difere do sha256 registrado em meta")
        plano = json.loads(plano_bruto.decode("utf-8"))
        ids_plano = [p["id"] for p in plano["passos"]]
        ids_captura = [p["id"] for p in passos]
        if ids_plano != ids_captura:
            problemas.append("passos executados " + ",".join(ids_captura)
                             + " diferem do plano " + ",".join(ids_plano))
        for declarado, corrido in zip(plano["passos"], passos):
            if declarado["ferramenta"] != corrido["ferramenta"]:
                problemas.append(corrido["id"] + ": ferramenta diferente da planejada")
            if json.dumps(declarado["argumentos"], ensure_ascii=False,
                          sort_keys=True) != corrido["entrada"]:
                problemas.append(corrido["id"] + ": argumentos diferentes dos planejados")

    por_id = {p["id"]: p for p in passos}
    for p in passos:
        if p["papel"] not in ("fonte", "conteudo_recebido") and p["estado"] != "recusado":
            problemas.append(p["id"] + ": papel " + str(p["papel"])
                             + " nao declarado mas o passo nao foi recusado")
    for a in resposta["afirmacoes"]:
        if a["suporte"] != "apoiada":
            continue
        for c in a.get("citacoes", []):
            papel = por_id.get(c["passo"], {}).get("papel")
            if papel != "fonte":
                problemas.append(a["id"] + ": apoiada em " + c["passo"]
                                 + " de papel " + str(papel)
                                 + "; conteudo recebido nao sustenta afirmacao")

    if not adaptado:
        texto_runner = (RAIZ / "executar.py").read_text(encoding="utf-8")
        for token in ("eval(", "exec(", "subprocess", "os.system", "importlib", "urllib"):
            if token in texto_runner:
                problemas.append("executar.py contem " + token)
        if "FERRAMENTAS = {" not in texto_runner:
            problemas.append("executar.py sem lista fixa de ferramentas")

    origem = ("passos iguais ao traco recebido, escolhidos pelo modelo durante a "
              "execucao; nao houve plano anterior" if adaptado
              else str(len(passos)) + " passos iguais ao plano fixado; runner sem "
                   "execucao dinamica")
    return (not problemas), ("; ".join(problemas) if problemas
                             else origem + "; nenhuma afirmacao apoiada em conteudo recebido")


def checar_x4(captura_raiz: Path, meta: dict) -> tuple[bool, str]:
    problemas = []
    tentativas = sorted(p for p in captura_raiz.glob("[RA]*-t*") if p.is_dir())
    vistos = {}
    for dir_t in tentativas:
        m = json.loads((dir_t / "meta.json").read_text(encoding="utf-8"))
        if m["run_id"] != dir_t.name:
            problemas.append(dir_t.name + ": run_id " + m["run_id"] + " nao casa com a pasta")
        chave = (m["sha256_plano"], m["tentativa"])
        if chave in vistos:
            problemas.append("duas capturas para o mesmo plano e tentativa: "
                             + dir_t.name + " e " + vistos[chave])
        vistos[chave] = dir_t.name
    if not tentativas:
        problemas.append("nenhuma captura encontrada")
    return (not problemas), ("; ".join(problemas) if problemas
                             else str(len(tentativas)) + " tentativas em pastas proprias, "
                             "nenhuma sobrescrita")


def checar_x5(registro: Path, meta: dict) -> tuple[bool, str]:
    texto = (registro / "relatorio.md").read_text(encoding="utf-8")
    ex = meta["executor"]
    faltando = [c for c in ("tipo", "modelo", "harness", "revisor") if not ex.get(c)]
    if faltando:
        return False, "executor sem " + ", ".join(faltando)
    for valor in (ex["tipo"], ex["modelo"], ex["harness"], ex["revisor"]):
        if valor not in texto:
            return False, "relatorio nao registra " + valor

    if not ex.get("revisao_independente") and "não houve revisão independente" not in texto:
        return False, "autorrevisao nao declarada como tal"
    if meta["sha256_plano"][:24] not in texto:
        return False, "relatorio nao cita o sha256 do plano"
    return True, "tipo, modelo, harness, revisor, alcance e sha256 do plano no relatorio"


def checar_x6(registro: Path) -> tuple[bool, str]:
    problemas = []
    marcas = ("http://", "https://", "D:\\", "C:\\", "/d/arkhe", str(RAIZ))
    for md in sorted(registro.rglob("*.md")):
        registro_de_conteudo = md.name in ("ocorrencias.md", "observacoes.md")
        for n, linha in enumerate(md.read_text(encoding="utf-8").split("\n"), start=1):
            for marca in marcas:
                if marca not in linha:
                    continue
                citado = linha.startswith("|") or linha.lstrip().startswith(
                    tuple(str(i) for i in range(10)))
                if registro_de_conteudo and citado:
                    continue
                problemas.append(md.name + " linha " + str(n)
                                 + " depende de endereco externo: " + marca)
    leia = (registro / "LEIA-ME.md").read_text(encoding="utf-8")
    citaveis = ["passos.md", "observacoes.md", "afirmacoes.md", "efeitos.md",
                "ocorrencias.md", "pendencias.md", "relatorio.md", "somas.sha256"]
    for extra in ("recuperacao.md", "permissoes.md"):
        if (registro / extra).is_file():
            citaveis.append(extra)
    for nome in citaveis:
        if nome not in leia:
            problemas.append("LEIA-ME nao cita " + nome)
        if not (registro / nome).exists():
            problemas.append("citado mas inexistente: " + nome)
    if (registro / "bruto").exists():
        problemas.append("captura crua copiada para dentro do registro")
    if _TENTATIVAS_REDE:
        problemas.append("houve tentativa de uso de rede")
    return (not problemas), ("; ".join(problemas) if problemas
                             else "texto simples, caminhos relativos, captura crua fora "
                             "do registro, nenhuma tentativa de rede")


def checar_x7(captura: Path, passos: list[dict], registro: Path) -> tuple[bool, str]:
    problemas = []
    no_cru = []
    for p in passos:
        if p.get("segredos_detectados"):
            no_cru.append(p["id"] + " (" + ", ".join(p["segredos_detectados"]) + ")")
    todo = "\n".join(md.read_text(encoding="utf-8") for md in registro.rglob("*.md"))
    for rotulo, padrao in montar_execucao.PADROES_SEGREDO:
        if padrao.lower() in todo.lower():
            problemas.append("registro contem " + rotulo)
    nota = ("nenhum padrao de segredo no registro"
            + ("; suprimido na captura: " + ", ".join(no_cru) if no_cru else ""))
    return (not problemas), ("; ".join(problemas) if problemas else nota)


def checar_x8(captura_raiz: Path, passos: list[dict], registro: Path,
              meta: dict) -> tuple[bool, str]:
    problemas = []
    escritas = [p for p in passos if p["efeito"] == "escrita"]
    for p in escritas:
        if not p.get("chave_idempotencia") and p["estado"] != "recusado":
            problemas.append(p["id"] + ": escrita sem chave de idempotencia")

    adaptado = meta.get("modo") == "traco_adaptado"
    aplicados = {}
    livro_path = captura_raiz / "aplicados.json"
    # O livro e do runner, escrito no momento da execucao. Um traco adaptado nao tem
    # livro: cobrar dele contra o livro de outra execucao nao significaria nada.
    com_livro = livro_path.is_file() and not adaptado
    livro = json.loads(livro_path.read_text(encoding="utf-8")) if com_livro else {}
    irmas = [] if adaptado else [p for p in captura_raiz.glob("R*-t*") if p.is_dir()]
    for dir_t in sorted(irmas):
        for linha in (dir_t / "passos.jsonl").read_text(encoding="utf-8").splitlines():
            if not linha.strip():
                continue
            r = json.loads(linha)
            if r["efeito"] != "escrita" or not r.get("chave_idempotencia"):
                continue
            if r["estado"] == "executado":
                aplicados.setdefault(r["chave_idempotencia"], []).append(dir_t.name)
    for chave, onde in aplicados.items():
        if len(onde) > 1:
            problemas.append("chave " + chave + " aplicada " + str(len(onde))
                             + " vezes: " + ", ".join(onde))
        if com_livro and chave not in livro:
            problemas.append("chave " + chave + " aplicada mas ausente do livro")
    texto = (registro / "efeitos.md").read_text(encoding="utf-8")
    for p in escritas:
        if p.get("chave_idempotencia") and p["chave_idempotencia"] not in texto:
            problemas.append(p["id"] + ": chave ausente de efeitos.md")
    if adaptado:
        derivadas = [p for p in escritas if p.get("chave_derivada_de")]
        nota = (str(len(escritas)) + " escritas com chave, " + str(len(derivadas))
                + " derivadas dos argumentos pela politica")
    else:
        nota = (str(len(escritas)) + " escritas com chave; " + str(len(aplicados))
                + " chaves aplicadas uma vez cada")
    return (not problemas), ("; ".join(problemas) if problemas else nota)


ESTADOS_DE_PERMISSAO = {
    # estado -> (estagios que precisam permitir, estagio que precisa negar)
    "exibido": (("T1", "T2", "T3"), None),
    "exportado": (("T1", "T2", "T3", "T4"), None),
    "revogado_antes_do_uso": ((), "T1"),
    "nao_utilizavel": (("T1",), "T2"),
    "usado_mas_suprimido": (("T1", "T2"), "T3"),
    "suprimido_na_exportacao": (("T1", "T2", "T3"), "T4"),
}
ESTADOS_QUE_SUSTENTAM = ("exibido", "exportado", "sem_recurso")


def checar_x9(captura: Path, passos: list[dict], resposta: dict) -> tuple[bool, str]:
    """Hierarquia: candidato, fornecido e descarte declarado.

    O que isto fecha e o descarte silencioso: a busca achou, o runtime nao enviou, e
    sem registro ninguem saberia. Aqui o candidato recusado consta com motivo, o bloco
    fornecido tem de bater byte a byte com o arquivo de origem, e o conteudo do
    descartado nao pode aparecer na observacao.
    """
    problemas = []
    com_hierarquia = [p for p in passos if p.get("recuperacao")]
    if not com_hierarquia:
        return True, "nenhum passo declarou recuperacao"

    fornecidos_total = descartados_total = 0
    for p in com_hierarquia:
        if not p.get("arquivo"):
            problemas.append(p["id"] + ": declara recuperacao sem observacao")
            continue
        bruto = (captura / p["arquivo"]).read_bytes()
        candidatos = p["recuperacao"]["candidatos"]
        ids = [c["id"] for c in candidatos]
        if len(ids) != len(set(ids)):
            problemas.append(p["id"] + ": ids de candidato repetidos")

        for c in candidatos:
            if c["fornecido"]:
                fornecidos_total += 1
                ini, fim = c.get("linha_inicio"), c.get("linha_fim")
                if not ini or not fim:
                    problemas.append(p["id"] + "/" + c["id"]
                                     + ": fornecido sem faixa de linhas")
                    continue
                linhas = bruto.split(b"\n")
                bloco = b"\n".join(linhas[ini - 1:fim]) + b"\n"
                if sha256_bytes(bloco) != c.get("sha256_fornecido"):
                    problemas.append(p["id"] + "/" + c["id"]
                                     + ": bloco nas linhas " + str(ini) + "-" + str(fim)
                                     + " nao casa com sha256_fornecido")
                if (c.get("sha256_fornecido") != c.get("sha256_arquivo")
                        and not c.get("diferenca_em_relacao_ao_arquivo")):
                    problemas.append(p["id"] + "/" + c["id"]
                                     + ": bloco difere do arquivo sem diferenca declarada")
            else:
                descartados_total += 1
                if not (c.get("motivo_descarte") or "").strip():
                    problemas.append(p["id"] + "/" + c["id"]
                                     + ": descartado sem motivo declarado")

        # nenhum conteudo de descartado pode ter entrado na observacao
        for c in candidatos:
            if c["fornecido"] or not c.get("sha256_arquivo"):
                continue
            for outro in candidatos:
                if outro.get("sha256_fornecido") == c["sha256_arquivo"]:
                    problemas.append(p["id"] + "/" + c["id"]
                                     + ": descartado mas o conteudo entrou como "
                                     + outro["id"])

        # citacao a este passo tem de cair dentro de um bloco fornecido
        faixas = [(c["linha_inicio"], c["linha_fim"]) for c in candidatos
                  if c["fornecido"] and c.get("linha_inicio")]
        for a in resposta.get("afirmacoes", []):
            for cit in a.get("citacoes", []) if a["suporte"] == "apoiada" else []:
                if cit["passo"] != p["id"]:
                    continue
                if not any(ini <= cit["linha"] <= fim for ini, fim in faixas):
                    problemas.append(a["id"] + ": cita a linha " + str(cit["linha"])
                                     + " de " + p["id"]
                                     + ", fora de qualquer bloco fornecido")

    return (not problemas), ("; ".join(problemas) if problemas
                             else str(fornecidos_total) + " blocos fornecidos conferidos "
                             "byte a byte e " + str(descartados_total)
                             + " descartes com motivo declarado")


def checar_x10(captura: Path, passos: list[dict], resposta: dict) -> tuple[bool, str]:
    """Permissao vigente em cada estagio, conferida sobre tokens gravados.

    O verificador nao emite token nenhum: ele confere os que o runtime gravou. E o
    que distingue TOCTOU detectavel de uma consulta ao estado de agora.
    """
    problemas = []
    com_recurso = [p for p in passos if p.get("recurso")]
    if not com_recurso:
        return True, "nenhum passo declarou recurso"

    log_path = captura / "permissoes.json"
    log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.is_file() else {}
    oraculo = None
    if log.get("segredo_hex"):
        oraculo = permissao.Oraculo(permissao.Relogio(0), log.get("emissor", ""),
                                    segredo_hex=log["segredo_hex"])
        oraculo.chave_id = log["emissor_chave_id"]

    for evento in log.get("eventos", []):
        if evento["registrado_em"] > evento["efetivo_em"]:
            problemas.append("evento retroativo " + evento["evento_id"]
                             + ": efetivo_em " + str(evento["efetivo_em"])
                             + " e registrado_em " + str(evento["registrado_em"]))

    assinaturas_ok = 0
    for p in com_recurso:
        estado = p.get("estado_permissao")
        tokens = p.get("tokens") or {}
        if estado not in ESTADOS_DE_PERMISSAO:
            problemas.append(p["id"] + ": estado de permissao desconhecido "
                             + str(estado))
            continue
        exigidos, negado = ESTADOS_DE_PERMISSAO[estado]
        for estagio in exigidos:
            t = tokens.get(estagio)
            if t is None:
                problemas.append(p["id"] + ": " + estado + " exige token em " + estagio)
            elif t["veredicto"] != "permite":
                problemas.append(p["id"] + ": " + estagio + " deveria permitir e "
                                 + t["veredicto"])
        if negado:
            t = tokens.get(negado)
            if t is None:
                problemas.append(p["id"] + ": " + estado + " exige token negado em "
                                 + negado)
            elif t["veredicto"] != "nega":
                problemas.append(p["id"] + ": " + negado + " deveria negar e "
                                 + t["veredicto"])
        posteriores = [e for e in permissao.ESTAGIOS
                       if e not in exigidos and e != negado and tokens.get(e)]
        if posteriores:
            problemas.append(p["id"] + ": " + estado + " tem token em estagio que nao "
                             "deveria ter sido alcancado: " + ", ".join(posteriores))

        presentes = [(e, tokens[e]) for e in permissao.ESTAGIOS if tokens.get(e)]
        if len({t["token_id"] for _, t in presentes}) != len(presentes):
            problemas.append(p["id"] + ": tokens repetidos entre estagios")
        anterior = None
        for estagio, t in presentes:
            if t.get("estagio") != estagio:
                problemas.append(p["id"] + ": token em " + estagio
                                 + " declara estagio " + str(t.get("estagio")))
            if not (t["valido_de"] <= t["conferido_em"] <= t["valido_ate"]):
                problemas.append(p["id"] + "/" + estagio
                                 + ": conferido_em fora da propria janela")
            if anterior is not None and t["conferido_em"] < anterior:
                problemas.append(p["id"] + "/" + estagio + ": conferido_em retrocede")
            anterior = t["conferido_em"]
            if permissao.digest_estado(t["estado_avaliado"]) != t["digest_permissao"]:
                problemas.append(p["id"] + "/" + estagio
                                 + ": digest_permissao nao confere com o estado avaliado")
            esperado = "permite" if t["estado_avaliado"]["permitido"] else "nega"
            if t["veredicto"] != esperado:
                problemas.append(p["id"] + "/" + estagio + ": veredicto " + t["veredicto"]
                                 + " nao segue do estado avaliado")
            if oraculo is not None:
                ok, nota = oraculo.conferir_token(t)
                if ok:
                    assinaturas_ok += 1
                else:
                    problemas.append(p["id"] + "/" + estagio + ": " + nota)

    # Afirmacao nao se apoia em passo suprimido.
    por_id = {p["id"]: p for p in passos}
    suprimidos_citados = []
    for a in resposta.get("afirmacoes", []):
        if a["suporte"] != "apoiada":
            continue
        for cit in a.get("citacoes", []):
            estado = por_id.get(cit["passo"], {}).get("estado_permissao", "sem_recurso")
            if estado not in ESTADOS_QUE_SUSTENTAM:
                problemas.append(a["id"] + ": apoiada em " + cit["passo"]
                                 + " com estado " + estado
                                 + "; passo suprimido nao sustenta afirmacao")
                suprimidos_citados.append(cit["passo"])

    nota = (str(len(com_recurso)) + " passos com recurso, cadeia de estagios coerente"
            + ("; " + str(assinaturas_ok) + " tokens com assinatura conferida"
               if oraculo is not None else "; assinatura de token nao conferida"))
    return (not problemas), ("; ".join(problemas) if problemas else nota)


def checar_x11(captura: Path, passos: list[dict]) -> tuple[bool, str]:
    """Digest e assinatura por registro, sobre a forma canonica."""
    problemas = []
    chave = canonico.carregar_chave(captura.parent / "chave-registro.json")
    digests_ok = assinaturas_ok = 0
    sem_digest = []
    for p in passos:
        if "registro_digest" not in p:
            sem_digest.append(p["id"])
            continue
        ok_d, ok_s, nota = canonico.conferir(p, chave)
        if not ok_d:
            problemas.append(p["id"] + ": " + nota)
            continue
        digests_ok += 1
        if ok_s is False:
            problemas.append(p["id"] + ": " + nota)
        elif ok_s:
            assinaturas_ok += 1
    if sem_digest and digests_ok:
        problemas.append("registros sem digest ao lado de registros com digest: "
                         + ", ".join(sem_digest))
    if not digests_ok and sem_digest:
        return True, "captura sem digest por registro; nada a conferir"
    nota = str(digests_ok) + " digests recalculados"
    nota += ("; " + str(assinaturas_ok) + " assinaturas conferidas com a chave local"
             if chave else "; assinatura nao conferivel sem a chave")
    return (not problemas), ("; ".join(problemas) if problemas else nota)


def checar_x12(captura: Path, meta: dict, passos: list[dict]) -> tuple[bool, str]:
    """A execucao cabe dentro da delegacao que a autorizou.

    O elo que a proposta de gate de segunda ordem desenhava e nao fechava: nada ali
    exigia que os passos executados ficassem dentro de `escopo.resources`, nem que os
    efeitos cabessem em `max_actions`. Sem esse elo, um contrato de delegacao e um
    documento ao lado da execucao, nao uma restricao sobre ela.
    """
    caminho = captura / "delegacao.json"
    if not caminho.is_file():
        return True, "execucao sem delegacao declarada"
    decisao = json.loads(caminho.read_text(encoding="utf-8"))
    problemas = []

    if decisao.get("veredicto") != "permite":
        problemas.append("execucao gravada sob decisao de delegacao "
                         + str(decisao.get("veredicto")))
    if meta.get("delegacao_id") != decisao.get("delegacao_id"):
        problemas.append("meta cita delegacao " + str(meta.get("delegacao_id"))
                         + " e a decisao gravada e " + str(decisao.get("delegacao_id")))

    decidido = decisao.get("decidido_em")
    if not (decisao.get("valido_de", 0) <= decidido <= decisao.get("valido_ate", 0)):
        problemas.append("decidido_em fora da propria janela de validade")
    escopo = decisao.get("escopo") or {}
    expira = escopo.get("expira_em")
    if isinstance(expira, int) and decidido > expira:
        problemas.append("decisao tomada em " + str(decidido) + " apos o contrato "
                         "expirar em " + str(expira))

    permitidos = escopo.get("recursos") or []
    for p in passos:
        recurso = p.get("recurso")
        if recurso and recurso not in permitidos:
            problemas.append(p["id"] + ": recurso " + recurso
                             + " fora do escopo delegado")

    efeitos = [p for p in passos
               if p["efeito"] == "escrita" and p["estado"] == "executado"]
    limite = escopo.get("max_acoes", 0)
    if len(efeitos) > limite:
        problemas.append(str(len(efeitos)) + " efeitos executados acima do limite "
                         + str(limite) + " da delegacao")

    # Integridade sim, origem nao: a decisao e assinada pela chave do gate, e dar essa
    # chave ao runner destruiria a separacao entre quem autoriza e quem executa. Entao
    # o digest se recalcula aqui e a assinatura fica por conferir, dito em vez de
    # fingido.
    ok_d, _, nota = canonico.conferir(decisao, None)
    if not ok_d:
        problemas.append("decisao de delegacao: " + nota)
    chave_do_gate = (decisao.get("registro_assinatura") or {}).get("chave_id", "sem id")

    if not decisao.get("limites"):
        problemas.append("decisao sem limites declarados; ausencia de ancoragem e prova "
                         "nao verificada precisam constar")

    nota_final = (str(len(passos)) + " passos dentro do escopo de "
                  + str(decisao.get("delegacao_id")) + ", " + str(len(efeitos))
                  + " efeitos de " + str(limite) + " permitidos, digest da decisao "
                  "recalculado; assinatura do gate (chave " + chave_do_gate
                  + ") nao conferivel aqui; "
                  + str(len(decisao.get("limites", []))) + " limites declarados")
    return (not problemas), ("; ".join(problemas) if problemas else nota_final)


def verificar_registro(captura: Path, registro: Path, resposta_path: Path,
                       res: Resultado, prefixo: str = "") -> Resultado:
    meta, passos = carregar(captura)
    resposta = json.loads(resposta_path.read_text(encoding="utf-8"))
    raiz_captura = captura.parent

    ok, ev = checar_x1(captura, passos, registro)
    res.add(prefixo + "X1", "X1", "observacao entregue = observacao capturada", ok, ev)
    if meta.get("reexecucao_possivel") is False:
        res.add_na(prefixo + "X1b", "X1", "reexecucao reproduz a observacao",
                   "traco adaptado: nao ha como reexecutar a ferramenta do agente, e o "
                   "traco nao traz hash do alvo lido; divergencia nao seria atribuivel")
    else:
        ok, ev = checar_x1b(captura, meta, passos)
        res.add(prefixo + "X1b", "X1", "reexecucao reproduz a observacao", ok, ev)
    ok, ev = checar_x2(captura, passos, resposta, registro)
    res.add(prefixo + "X2", "X2", "afirmacao localizada ou declarada sem suporte", ok, ev)
    ok, ev = checar_x2b(resposta, registro)
    res.add(prefixo + "X2b", "X2", "recusada nao segue afirmada na resposta", ok, ev)
    ok, ev = checar_x3(captura, meta, passos, resposta)
    res.add(prefixo + "X3", "X3", "observacao e dado, nao instrucao nem fonte", ok, ev)
    ok, ev = checar_x4(raiz_captura, meta)
    res.add(prefixo + "X4", "X4", "tentativa nao sobrescreve tentativa", ok, ev)
    ok, ev = checar_x5(registro, meta)
    res.add(prefixo + "X5", "X5", "quem executou e alcance da revisao", ok, ev)
    ok, ev = checar_x6(registro)
    res.add(prefixo + "X6", "X6", "registro legivel sem rede e sem servico", ok, ev)
    ok, ev = checar_x7(captura, passos, registro)
    res.add(prefixo + "X7", "X7", "segredo nao viaja no registro", ok, ev)
    if not [p for p in passos if p.get("recuperacao")]:
        res.add_na(prefixo + "X9", "X9", "candidato, fornecido e descarte declarado",
                   "nenhum passo declarou recuperacao: nao ha hierarquia a conferir")
    else:
        ok, ev = checar_x9(captura, passos, resposta)
        res.add(prefixo + "X9", "X9", "candidato, fornecido e descarte declarado", ok, ev)
    if not [p for p in passos if p.get("recurso")]:
        res.add_na(prefixo + "X10", "X10", "permissao vigente em cada estagio",
                   "nenhum passo declarou recurso: nao ha permissao a conferir")
    else:
        ok, ev = checar_x10(captura, passos, resposta)
        res.add(prefixo + "X10", "X10", "permissao vigente em cada estagio", ok, ev)
    if not [p for p in passos if "registro_digest" in p]:
        res.add_na(prefixo + "X11", "X11", "digest e assinatura por registro",
                   "captura sem digest por registro: traco adaptado nao o traz")
    else:
        ok, ev = checar_x11(captura, passos)
        res.add(prefixo + "X11", "X11", "digest e assinatura por registro", ok, ev)
    if not (captura / "delegacao.json").is_file():
        res.add_na(prefixo + "X12", "X12", "execucao dentro do escopo delegado",
                   "execucao sem delegacao declarada: nao houve gate a montante")
    else:
        ok, ev = checar_x12(captura, meta, passos)
        res.add(prefixo + "X12", "X12", "execucao dentro do escopo delegado", ok, ev)
        res.add_na(prefixo + "X12b", "X12", "ancoragem externa do orquestrador",
                   "nenhum registro externo e consultado: a identidade do orquestrador "
                   "vale pela allowlist local, que e confianca local e nao raiz de "
                   "confianca")
    if not [p for p in passos if p["efeito"] == "escrita"]:
        res.add_na(prefixo + "X8", "X8", "efeito com chave e sem reaplicacao",
                   "execucao sem passo de escrita: nada a conferir")
    else:
        ok, ev = checar_x8(raiz_captura, passos, registro, meta)
        res.add(prefixo + "X8", "X8", "todo efeito tem chave de idempotencia", ok, ev)
        if meta.get("modo") == "traco_adaptado":
            res.add_na(prefixo + "X8b", "X8", "efeito aplicado uma unica vez",
                       "traco adaptado: a chave foi derivada depois do fato e nao ha "
                       "livro de aplicados do momento da execucao; aplicacao unica nao "
                       "e demonstravel a partir do traco")
        else:
            ok, ev = checar_x8(raiz_captura, passos, registro, meta)
            res.add(prefixo + "X8b", "X8", "efeito aplicado uma unica vez", ok, ev)
    return res


# =========================================================================
# Testes negativos
# =========================================================================

def _cenario(tmp: Path) -> tuple[Path, Path, Path, Path]:
    """Copia o necessario para um cenario isolado e roda plano + registro."""
    base = tmp / "base"
    base.mkdir()
    shutil.copytree(RAIZ / "teste-recebimento", base / "teste-recebimento")
    shutil.copy(RAIZ / "execucao" / "plano.json", tmp / "plano.json")
    shutil.copy(RAIZ / "execucao" / "resposta.json", tmp / "resposta.json")
    captura_raiz = tmp / "captura"
    run_id = executar_plano(tmp / "plano.json", base, captura_raiz)
    captura = captura_raiz / run_id
    registro = tmp / "registro"
    montar_registro(captura, tmp / "resposta.json", registro)
    return base, captura, registro, tmp / "resposta.json"


def _cenario_v3(tmp: Path) -> tuple[Path, Path, Path, Path]:
    """Cenario com hierarquia de recuperacao e permissao por estagio."""
    base = tmp / "base"
    base.mkdir()
    shutil.copytree(RAIZ / "teste-recebimento", base / "teste-recebimento")
    shutil.copy(RAIZ / "execucao" / "plano-v3.json", tmp / "plano.json")
    shutil.copy(RAIZ / "execucao" / "resposta-v3.json", tmp / "resposta.json")
    captura_raiz = tmp / "captura"
    run_id = executar_plano(tmp / "plano.json", base, captura_raiz)
    captura = captura_raiz / run_id
    registro = tmp / "registro"
    montar_registro(captura, tmp / "resposta.json", registro)
    return base, captura, registro, tmp / "resposta.json"


def _cenario_delegado(tmp: Path) -> tuple[Path, Path, Path, Path]:
    """Cenario com gate de delegacao a montante da execucao."""
    base = tmp / "base"
    base.mkdir()
    shutil.copytree(RAIZ / "teste-recebimento", base / "teste-recebimento")
    shutil.copy(RAIZ / "execucao" / "plano-v3.json", tmp / "plano.json")
    shutil.copy(RAIZ / "execucao" / "resposta-v3.json", tmp / "resposta.json")
    contrato = json.loads((RAIZ / "execucao" / "delegacao" / "contrato.json")
                          .read_text(encoding="utf-8"))
    politica = json.loads((RAIZ / "execucao" / "delegacao" / "politica.json")
                          .read_text(encoding="utf-8"))
    allowlist = json.loads((RAIZ / "execucao" / "delegacao" / "allowlist.json")
                           .read_text(encoding="utf-8"))
    decisao = delegacao.decidir(contrato, politica, allowlist, 1000)
    chave = canonico.nova_chave(tmp / "chave-gate.json", "gate-de-teste")
    decisao = delegacao.assinar_decisao(decisao, chave)
    caminho_decisao = tmp / "decisao.json"
    caminho_decisao.write_text(json.dumps(decisao, ensure_ascii=False, indent=2),
                               encoding="utf-8")
    captura_raiz = tmp / "captura"
    run_id = executar_plano(tmp / "plano.json", base, captura_raiz, caminho_decisao)
    captura = captura_raiz / run_id
    registro = tmp / "registro"
    montar_registro(captura, tmp / "resposta.json", registro)
    return base, captura, registro, tmp / "resposta.json"


def teste_observacao_alterada(res: Resultado) -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base, captura, registro, _ = _cenario(tmp)
        alvo = captura / "bruto" / "P02.bin"
        alvo.write_bytes(alvo.read_bytes().replace(b"11.950", b"91.950"))
        _, passos = carregar(captura)
        ok, ev = checar_x1(captura, passos, registro)
        res.add("T-OBS", "X1", "byte alterado na observacao capturada",
                not ok, ev, esperado="falhar")


def teste_observacao_fabricada(res: Resultado) -> None:
    """Alterar observacao E somas juntas; o alvo intacto denuncia a fabricacao."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base, captura, registro, _ = _cenario(tmp)
        alvo = captura / "bruto" / "P02.bin"
        falso = alvo.read_bytes().replace(b"11.950", b"91.950")
        alvo.write_bytes(falso)
        novo_hash = sha256_bytes(falso)
        passos_path = captura / "passos.jsonl"
        linhas = []
        for linha in passos_path.read_text(encoding="utf-8").splitlines():
            r = json.loads(linha)
            if r["id"] == "P02":
                r["sha256_observacao"] = novo_hash
            linhas.append(json.dumps(r, ensure_ascii=False, sort_keys=True))
        passos_path.write_text("\n".join(linhas) + "\n", encoding="utf-8")
        montar_registro(captura, tmp / "resposta.json", registro)
        meta, passos = carregar(captura)
        ok_x1, ev_x1 = checar_x1(captura, passos, registro)
        ok_x1b, ev_x1b = checar_x1b(captura, meta, passos)
        res.add("T-FABRICADA", "X1", "observacao e somas trocadas juntas",
                ok_x1 and not ok_x1b,
                ("X1 passou, como esperado de quem controla a captura; X1b pegou: " + ev_x1b)
                if ok_x1 and not ok_x1b
                else "X1: " + ev_x1 + " | X1b: " + ev_x1b, esperado="falhar em X1b")


def teste_citacao_que_nao_confere(res: Resultado) -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base, captura, registro, resposta_path = _cenario(tmp)
        resposta = json.loads(resposta_path.read_text(encoding="utf-8"))
        resposta["afirmacoes"][1]["citacoes"][0]["trecho"] = "Valor executado: R$ 91.950."
        resposta_path.write_text(json.dumps(resposta, ensure_ascii=False, indent=2),
                                 encoding="utf-8")
        _, passos = carregar(captura)
        ok, ev = checar_x2(captura, passos, resposta, registro)
        res.add("T-CITACAO", "X2", "afirmacao cita trecho que nao esta na observacao",
                not ok, ev, esperado="falhar")


def teste_injecao_adotada(res: Resultado) -> None:
    """Promover a afirmacao do anexo a apoiada deve ser recusado."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base, captura, registro, resposta_path = _cenario(tmp)
        resposta = json.loads(resposta_path.read_text(encoding="utf-8"))
        a = resposta["afirmacoes"][3]
        a["suporte"] = "apoiada"
        a["citacoes"] = [{"passo": "P03", "linha": 10, "trecho": "99 participantes"}]
        a["alcance"] = "Compatível com o anexo"
        resposta_path.write_text(json.dumps(resposta, ensure_ascii=False, indent=2),
                                 encoding="utf-8")
        meta, passos = carregar(captura)
        ok_x2, ev_x2 = checar_x2(captura, passos, resposta, registro)
        ok_x3, ev_x3 = checar_x3(captura, meta, passos, resposta)
        res.add("T-INJECAO-ADOTADA", "X3",
                "afirmacao do anexo promovida a apoiada",
                not ok_x3,
                ("X2 localizou o trecho (ele existe mesmo no anexo), X3 recusou: " + ev_x3)
                if ok_x2 and not ok_x3 else "X3: " + ev_x3, esperado="falhar em X3")


def teste_passo_fora_do_plano(res: Resultado) -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base, captura, registro, resposta_path = _cenario(tmp)
        passos_path = captura / "passos.jsonl"
        extra = {"id": "P99", "ferramenta": "ler_texto", "efeito": "leitura",
                 "papel": "fonte", "proposito": "passo que o plano nao previa",
                 "entrada": "{\"caminho\": \"teste-recebimento/lote/recebidos/resumo.md\"}",
                 "sha256_entrada": "x", "estado": "executado",
                 "sha256_observacao": "y", "bytes": 1, "arquivo": None, "motivo": ""}
        passos_path.write_text(passos_path.read_text(encoding="utf-8")
                               + json.dumps(extra, ensure_ascii=False) + "\n",
                               encoding="utf-8")
        meta, passos = carregar(captura)
        resposta = json.loads(resposta_path.read_text(encoding="utf-8"))
        ok, ev = checar_x3(captura, meta, passos, resposta)
        res.add("T-PASSO-EXTRA", "X3", "passo executado fora do plano fixado",
                not ok, ev, esperado="falhar")


def teste_segredo_na_observacao(res: Resultado) -> None:
    """Observacao com cara de credencial: fica na captura, nao entra no registro."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base = tmp / "base"
        base.mkdir()
        (base / "config.txt").write_text(
            "ambiente de teste\napi_key=" + SEGREDO_DE_TESTE + "\nfim\n", encoding="utf-8")
        plano = {"tarefa": "ler configuracao de teste",
                 "executor": {"tipo": "runner de teste", "modelo": "nenhum",
                              "harness": "executar.py", "revisor": "operador unico",
                              "revisao_independente": False},
                 "base": ".",
                 "passos": [{"id": "P01", "ferramenta": "ler_texto",
                             "argumentos": {"caminho": "config.txt"},
                             "efeito": "leitura", "papel": "fonte",
                             "proposito": "ler configuracao"}]}
        (tmp / "plano.json").write_text(json.dumps(plano, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
        resposta = {"resposta": "O ambiente é de teste.",
                    "afirmacoes": [{"id": "A01", "afirmacao": "O ambiente é de teste",
                                    "suporte": "apoiada",
                                    "citacoes": [{"passo": "P01", "linha": 1,
                                                  "trecho": "ambiente de teste"}],
                                    "alcance": "Leitura literal da linha citada"}],
                    "pendencias": []}
        (tmp / "resposta.json").write_text(json.dumps(resposta, ensure_ascii=False, indent=2),
                                           encoding="utf-8")
        captura_raiz = tmp / "captura"
        run_id = executar_plano(tmp / "plano.json", base, captura_raiz)
        captura = captura_raiz / run_id
        registro = tmp / "registro"
        montar_registro(captura, tmp / "resposta.json", registro)

        problemas = []
        _, passos = carregar(captura)
        if SEGREDO_DE_TESTE.encode("utf-8") not in (captura / "bruto" / "P01.bin").read_bytes():
            problemas.append("captura crua nao preservou o byte original")
        if not passos[0].get("segredos_detectados"):
            problemas.append("runner nao marcou o padrao de segredo")
        todo = "\n".join(md.read_text(encoding="utf-8") for md in registro.rglob("*.md"))
        if SEGREDO_DE_TESTE in todo:
            problemas.append("segredo apareceu no registro")
        if "trecho suprimido" not in todo:
            problemas.append("registro nao declarou a supressao")
        ok_x7, ev = checar_x7(captura, passos, registro)
        if not ok_x7:
            problemas.append("X7: " + ev)
        res.add("T-SEGREDO", "X7", "credencial dentro de uma observacao",
                not problemas,
                "; ".join(problemas) if problemas
                else "byte original na captura, linha suprimida e declarada no registro, "
                     "nenhum padrao de segredo no que viaja")


def teste_escrita_nao_reaplica(res: Resultado) -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base, captura, registro, resposta_path = _cenario(tmp)
        alvo = base / "execucao" / "saida" / "resumo-L002.md"
        primeiro = alvo.read_bytes() if alvo.is_file() else b""
        alvo.write_bytes(b"conteudo trocado por fora\n")
        run2 = executar_plano(tmp / "plano.json", base, captura.parent)
        _, passos2 = carregar(captura.parent / run2)
        escrita = [p for p in passos2 if p["efeito"] == "escrita"][0]
        problemas = []
        if escrita["estado"] != "repetido":
            problemas.append("segunda tentativa reaplicou a escrita: " + escrita["estado"])
        if alvo.read_bytes() != b"conteudo trocado por fora\n":
            problemas.append("o arquivo foi reescrito pela segunda tentativa")
        registro2 = tmp / "registro2"
        montar_registro(captura.parent / run2, tmp / "resposta.json", registro2)
        meta2, _ = carregar(captura.parent / run2)
        ok_x8, ev = checar_x8(captura.parent, passos2, registro2, meta2)
        if not ok_x8:
            problemas.append("X8: " + ev)
        if primeiro == b"":
            problemas.append("primeira tentativa nao gravou nada")
        res.add("T-IDEMPOTENCIA", "X8", "reexecutar o plano com a chave ja aplicada",
                not problemas,
                "; ".join(problemas) if problemas
                else "segunda tentativa saiu como repetido, arquivo intacto e chave "
                     "aplicada uma unica vez")


def teste_escrita_sem_chave(res: Resultado) -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        base = tmp / "base"
        base.mkdir()
        plano = {"tarefa": "gravar sem chave",
                 "executor": {"tipo": "runner de teste", "modelo": "nenhum",
                              "harness": "executar.py", "revisor": "operador unico",
                              "revisao_independente": False},
                 "base": ".",
                 "passos": [{"id": "P01", "ferramenta": "gravar_texto",
                             "argumentos": {"caminho": "saida.txt", "conteudo": "x\n"},
                             "efeito": "escrita", "papel": "fonte",
                             "proposito": "gravar sem chave de idempotencia"}]}
        (tmp / "plano.json").write_text(json.dumps(plano, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
        captura_raiz = tmp / "captura"
        run_id = executar_plano(tmp / "plano.json", base, captura_raiz)
        _, passos = carregar(captura_raiz / run_id)
        problemas = []
        if passos[0]["estado"] != "recusado":
            problemas.append("passo de escrita sem chave nao foi recusado: "
                             + passos[0]["estado"])
        if (base / "saida.txt").exists():
            problemas.append("o efeito aconteceu mesmo sem chave")
        res.add("T-SEM-CHAVE", "X8", "escrita declarada sem chave de idempotencia",
                not problemas,
                "; ".join(problemas) if problemas
                else "passo recusado pelo runner e nenhum arquivo gravado")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--captura", default="")
    ap.add_argument("--registro", default="")
    ap.add_argument("--resposta", default=str(RAIZ / "execucao" / "resposta.json"))
    ap.add_argument("--sem-cenarios", action="store_true")
    ap.add_argument("--rotulo", default="verificacao-execucao")
    ap.add_argument("--resultados", default="",
                    help="pasta do resultado; por omissao, ao lado da captura quando ela "
                         "esta fora deste diretorio")
    args = ap.parse_args()

    if args.captura:
        captura = Path(args.captura)
    else:
        # Sem --captura, usa a execucao com plano fixo. Traco adaptado tem outra
        # resposta anotada, entao exige --captura e --resposta explicitos.
        candidatos = sorted((RAIZ / "execucao" / "captura").glob("R*-t*"))
        if not candidatos:
            print("nenhuma captura com plano fixo; rode executar.py antes, ou passe "
                  "--captura e --resposta para conferir um traco adaptado")
            return 2
        captura = candidatos[0]
    registro = Path(args.registro or (RAIZ / "execucao" / "registro" / captura.name))
    if not registro.is_dir():
        print("registro ausente; rode montar_execucao.py antes")
        return 2

    res = Resultado()
    verificar_registro(captura, registro, Path(args.resposta), res)
    if not args.sem_cenarios:
        teste_observacao_alterada(res)
        teste_observacao_fabricada(res)
        teste_citacao_que_nao_confere(res)
        teste_injecao_adotada(res)
        teste_passo_fora_do_plano(res)
        teste_segredo_na_observacao(res)
        teste_escrita_nao_reaplica(res)
        teste_escrita_sem_chave(res)

    # O resultado cita trecho de observacao e argumento do que foi conferido. Captura
    # de fora deste diretorio tem o resultado gravado junto dela, nao no repositorio.
    cap = captura.resolve()
    if args.resultados:
        saida = Path(args.resultados)
    elif RAIZ in cap.parents:
        saida = RAIZ / "resultados"
    else:
        saida = cap.parent / "resultados"
    saida.mkdir(parents=True, exist_ok=True)
    (saida / (args.rotulo + ".json")).write_text(
        json.dumps({"data": "2026-11-14", "captura": captura.name, "linhas": res.linhas,
                    "falhas": len(res.falhas),
                    "tentativas_de_rede": len(_TENTATIVAS_REDE)},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    md = ["# Verificação do registro de execução", "",
          "Captura conferida: `" + captura.name + "`. Execução local, sem rede.",
          "Testes com prefixo `T-` só passam quando a verificação indicada falha.", "",
          "| ID | Invariante | Verificação | Esperado | Resultado | Evidência |",
          "| --- | --- | --- | --- | --- | --- |"]
    for l in res.linhas:
        md.append("| " + l["id"] + " | " + l["invariante"] + " | " + l["verificacao"]
                  + " | " + l["esperado"] + " | " + l["resultado"] + " | "
                  + l["evidencia"].replace("|", "\\|") + " |")
    md += ["", str(len(res.com_evidencia)) + " verificações passaram com evidência, "
           + str(len(res.falhas)) + " falharam e " + str(len(res.nao_aplicaveis))
           + " não se aplicam a esta captura, de " + str(len(res.linhas)) + " no total.",
           "Uma verificação que não se aplica não é evidência de nada: ela está listada",
           "para que a ausência fique visível em vez de virar um `passou` vazio.",
           "Tentativas de uso de rede: " + str(len(_TENTATIVAS_REDE)) + ".", "",
           "O executor é um runner determinístico de ferramentas declaradas. Nada aqui",
           "mede alucinação de modelo: mede se a afirmação está localizável no que a",
           "execução de fato leu, e se o efeito aconteceu uma única vez.", ""]
    (saida / (args.rotulo + ".md")).write_text("\n".join(md), encoding="utf-8")

    for l in res.linhas:
        print(l["resultado"].ljust(7), l["id"].ljust(20), l["verificacao"][:44].ljust(46),
              l["evidencia"][:86])
    print("")
    print("resultado em " + str(saida))
    print(str(len(res.com_evidencia)) + " com evidencia, " + str(len(res.falhas))
          + " falhas, " + str(len(res.nao_aplicaveis)) + " nao se aplicam, de "
          + str(len(res.linhas)) + "; tentativas de rede: " + str(len(_TENTATIVAS_REDE)))
    return 1 if res.falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
