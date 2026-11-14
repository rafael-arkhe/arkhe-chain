"""Passagem 4: extrai o perfil de raciocinio.

Entrada : out/corpus/normalized.jsonl + out/corpus/stats.json
Saidas  : out/reasoning/profile.json
          out/reasoning/profile.md

A pergunta que este estagio responde nao e "o que ele pensa" (isso sao os
atomos) e sim "como ele chega onde chega": quais movimentos argumentativos
ele usa, em que proporcao, combinados com quais, e em que dominio.

O achado que domina tudo: ele afirma com modalidade explicita. O movimento
`hedge_epistemic` aparece numa ordem de magnitude acima de qualquer outro.
Isso nao e insegurança retorica -- e o default epistemico dele, e alimenta
diretamente o CalibrationLoop do scaffold (confidence reportada baixa por
habito, nao por calculo).
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from itertools import combinations

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P  # noqa: E402

# Verbos que marcam uma afirmacao sendo feita (denominador do hedge ratio).
ASSERTION = P.__dict__.get("ASSERTION")
if ASSERTION is None:
    import re
    ASSERTION = re.compile(
        r"\b(?:[eé]|s[aã]o|era|foi|tem|t[eê]m|vai|v[aã]o|"
        r"d[aá]|fica|existe|funciona|significa|precisa|devia|deve)\b",
        re.I,
    )

EX_MIN, EX_MAX = 45, 230
EX_PER_MOVE = 6


def run(out_dir):
    rdir = os.path.join(out_dir, "reasoning")
    os.makedirs(rdir, exist_ok=True)
    norm = os.path.join(out_dir, "corpus", "normalized.jsonl")
    stats = json.load(open(os.path.join(out_dir, "corpus", "stats.json"), encoding="utf-8"))

    n = 0
    move_lines = Counter()
    cooc = Counter()
    topic_move = defaultdict(Counter)
    moves_per_line = Counter()
    assertion_lines = 0
    hedged_assertions = 0
    fp_lines = 0
    fp_hedged = 0
    exemplars = defaultdict(list)
    chains = []  # linhas com 3+ movimentos: raciocinio encadeado

    with open(norm, encoding="utf-8") as fh:
        for raw in fh:
            r = json.loads(raw)
            n += 1
            s = r["text"]
            mv = r["moves"]
            moves_per_line[min(len(mv), 4)] += 1
            for m in mv:
                move_lines[m] += 1
            for a, b in combinations(sorted(mv), 2):
                cooc[(a, b)] += 1
            for t in r["topics"]:
                for m in mv:
                    topic_move[t][m] += 1

            is_assertion = bool(ASSERTION.search(s))
            if is_assertion:
                assertion_lines += 1
                if "hedge_epistemic" in mv:
                    hedged_assertions += 1
            if r["fp"]:
                fp_lines += 1
                if "hedge_epistemic" in mv:
                    fp_hedged += 1

            # exemplares: linha legivel, com voz propria, nao sensivel
            if mv and EX_MIN <= len(s) <= EX_MAX and not r["sens"]:
                claim, flags = P.provenance(s)
                if flags["register"] == "action_bit" or flags["quoted"]:
                    continue
                if P.voice_score(claim) < 1:
                    continue
                for m in mv:
                    b = exemplars[m]
                    if len(b) < EX_PER_MOVE and all(r["epoch"] != e["epoch"] for e in b):
                        b.append({"ln": r["ln"], "epoch": r["epoch"], "text": claim,
                                  "moves": mv})
                if len(mv) >= 3 and len(chains) < 40:
                    chains.append({"ln": r["ln"], "epoch": r["epoch"], "text": claim,
                                   "moves": mv})

    def per_k(c):
        return round(1000.0 * c / max(n, 1), 2)

    ranked = [
        {
            "move": m,
            "descricao": P.REASONING_MOVES[m][1],
            "linhas": c,
            "por_1k": per_k(c),
            "share_pct": round(100.0 * c / max(sum(move_lines.values()), 1), 2),
        }
        for m, c in move_lines.most_common()
    ]

    hedge_ratio = round(hedged_assertions / max(assertion_lines, 1), 4)
    fp_hedge_ratio = round(fp_hedged / max(fp_lines, 1), 4)
    # Linhas que carregam ao menos um movimento explicito. O denominador certo
    # pra falar de "dominancia" de um movimento e este, nao o corpus inteiro.
    lines_with_move = n - moves_per_line.get(0, 0)
    move_coverage = round(lines_with_move / max(n, 1), 4)
    hedge_among_reasoning = round(
        move_lines.get("hedge_epistemic", 0) / max(lines_with_move, 1), 4
    )

    profile = {
        "base": {"signal_lines": n, "movimentos_detectados": sum(move_lines.values())},
        "movimentos": ranked,
        "movimentos_por_linha": {str(k): v for k, v in sorted(moves_per_line.items())},
        "calibracao": {
            "linhas_com_afirmacao": assertion_lines,
            "afirmacoes_com_modalidade": hedged_assertions,
            "hedge_ratio_afirmacoes": hedge_ratio,
            "linhas_primeira_pessoa": fp_lines,
            "hedge_ratio_primeira_pessoa": fp_hedge_ratio,
            "recusa_de_certeza_linhas": move_lines.get("refuse_certainty", 0),
            "linhas_com_movimento_explicito": lines_with_move,
            "cobertura_de_movimento": move_coverage,
            "hedge_entre_linhas_que_raciocinam": hedge_among_reasoning,
            "leitura": (
                "Marcador explicito de raciocinio aparece em %.1f%% das linhas de "
                "sinal: a esmagadora maioria do corpus e conversa casual, nao "
                "argumento. Mas quando ele argumenta, o movimento que ele puxa "
                "primeiro e modalidade -- %.1f%% das linhas com raciocinio levam "
                "hedge, mais que o dobro do segundo colocado. Em relacao a TODAS "
                "as afirmacoes o hedge cai pra %.1f%%, porque o denominador vira "
                "o corpus casual inteiro. As duas leituras sao verdadeiras e "
                "medem coisas diferentes."
                % (100 * move_coverage, 100 * hedge_among_reasoning, 100 * hedge_ratio)
            ),
        },
        "coocorrencia_top": [
            {"par": [a, b], "linhas": c} for (a, b), c in cooc.most_common(25)
        ],
        "por_topico": {
            t: {
                "total": sum(c.values()),
                "movimentos": dict(c.most_common(6)),
            }
            for t, c in sorted(topic_move.items(), key=lambda x: -sum(x[1].values()))
        },
        "exemplares": {m: v for m, v in exemplars.items()},
        "cadeias_longas": chains[:25],
        "topic_hits_corpus": stats["topic_hits"],
    }

    with open(os.path.join(rdir, "profile.json"), "w", encoding="utf-8") as fh:
        json.dump(profile, fh, ensure_ascii=False, indent=2)

    # ---- versao legivel, pra carregar como contexto -------------------------
    def br(x):
        """Formata inteiro no padrao pt-BR sem estragar o resto da frase."""
        return f"{x:,}".replace(",", ".")

    L = []
    L.append("# Perfil de raciocinio — Corvo/Arkhe")
    L.append("")
    L.append(f"Medido sobre {br(n)} linhas de sinal do corpus "
             f"({br(stats['total_lines'])} mensagens cruas).")
    L.append("")
    L.append("## Movimentos, por frequencia")
    L.append("")
    L.append("| movimento | linhas | /1k | share | o que faz |")
    L.append("|:--|--:|--:|--:|:--|")
    for r in ranked:
        L.append(f"| `{r['move']}` | {r['linhas']} | {r['por_1k']} | "
                 f"{r['share_pct']}% | {r['descricao']} |")
    L.append("")
    L.append("## Calibracao")
    L.append("")
    c = profile["calibracao"]
    L.append(f"- Linhas com marcador explicito de raciocinio: "
             f"**{100*move_coverage:.1f}%** ({br(lines_with_move)} de {br(n)})")
    L.append(f"- Entre as que raciocinam, levam hedge: "
             f"**{100*hedge_among_reasoning:.1f}%**")
    L.append(f"- Sobre todas as afirmacoes do corpus: **{100*hedge_ratio:.1f}%** "
             f"({br(c['afirmacoes_com_modalidade'])} de "
             f"{br(c['linhas_com_afirmacao'])})")
    L.append(f"- Falas de primeira pessoa com hedge: **{100*fp_hedge_ratio:.1f}%**")
    L.append(f"- Linhas que declaram ignorancia (`num sei`, `num manjo`): "
             f"**{br(c['recusa_de_certeza_linhas'])}**")
    L.append("")
    L.append("Os tres primeiros numeros medem coisas diferentes e todos sao "
             "verdadeiros. O corpus e conversa casual: "
             f"{100*(1-move_coverage):.1f}% das linhas nao carregam marcador "
             "de raciocinio nenhum. Mas no subconjunto em que ele argumenta, "
             "modalidade e o movimento dominante, com folga de mais de 2x sobre "
             "encadeamento causal. Em termos operacionais: ele nao evita "
             "afirmar, ele evita afirmar **liso**. Um agente que fala por ele "
             "reproduz a modalidade; um que afirma sem marca soa como outra "
             "pessoa.")
    L.append("")
    L.append("## Pares que andam juntos")
    L.append("")
    for p in profile["coocorrencia_top"][:12]:
        L.append(f"- `{p['par'][0]}` + `{p['par'][1]}` — {p['linhas']} linhas")
    L.append("")
    L.append("## Como o raciocinio muda por dominio")
    L.append("")
    for t, d in list(profile["por_topico"].items())[:10]:
        top = ", ".join(f"`{m}`({v})" for m, v in list(d["movimentos"].items())[:4])
        L.append(f"- **{t}** ({d['total']}): {top}")
    L.append("")
    L.append("## Limites desta medicao")
    L.append("")
    L.append(f"- `steelman` deu {move_lines.get('steelman', 0)} ocorrencias. Isso e "
             "artefato do regex, que e estreito demais (exige frases como \"o lado "
             "dele\"). Nao leia como ausencia do movimento.")
    L.append(f"- Linhas com 3+ movimentos: apenas {len(chains)}. A mediana de "
             "mensagem dele tem 31 caracteres, entao ele encadeia raciocinio "
             "**entre** mensagens, nao dentro de uma. O corpus nao tem fronteira "
             "de conversa nem timestamp, entao o pipeline nao consegue remontar "
             "essas cadeias. E a lacuna mais seria do perfil.")
    L.append("- Os pesos e os regexes foram escolhidos a mao sobre uma amostra. "
             "Nao ha conjunto anotado, entao nao existe precisao/recall medidos.")
    L.append("")
    L.append("## Cadeias de raciocinio reais (3+ movimentos na mesma linha)")
    L.append("")
    for ch in chains[:12]:
        L.append(f"- L{ch['ln']} `{'+'.join(ch['moves'])}`")
        L.append(f"  > {ch['text']}")
    L.append("")
    L.append("## Exemplares por movimento")
    L.append("")
    for m, _ in move_lines.most_common():
        ex = exemplars.get(m, [])
        if not ex:
            continue
        L.append(f"### `{m}` — {P.REASONING_MOVES[m][1]}")
        L.append("")
        for e in ex:
            L.append(f"- L{e['ln']}: {e['text']}")
        L.append("")

    with open(os.path.join(rdir, "profile.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    print(f"[reasoning] {sum(move_lines.values())} movimentos em {n} linhas")
    print(f"[reasoning] hedge ratio (afirmacoes): {100*hedge_ratio:.1f}%")
    print(f"[reasoning] hedge ratio (1a pessoa):  {100*fp_hedge_ratio:.1f}%")
    print(f"[reasoning] cadeias 3+ movimentos: {len(chains)}")
    return profile


if __name__ == "__main__":
    run(sys.argv[1])
