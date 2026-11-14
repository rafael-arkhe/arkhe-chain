"""Passagem 3: mede o idioleto.

Entrada : out/corpus/normalized.jsonl + out/corpus/stats.json
Saida   : out/persona/lexicon.json

Isto nao e uma lista de girias. Sao as decisoes ortograficas e sintaticas que
um LLM erra por default: ele capitaliza a primeira letra, fecha com ponto,
escreve "nao" com til e "que" inteiro. Ele nao. As taxas abaixo sao o que
separa imitacao de caricatura.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P  # noqa: E402

# Pares grafia-reduzida / grafia-padrao. A razao entre eles e o que importa.
ORTHO_PAIRS = {
    "que": (r"\bq\b", r"\bque\b"),
    "nao": (r"\bn[aã]o\b", r"\bn[aã]o\b"),  # ver NEGATION abaixo
    "voce": (r"\bvc\b", r"\bvoc[eê]\b"),
    "tambem": (r"\btbm?\b", r"\btamb[eé]m\b"),
    "porque": (r"\bpq\b", r"\bporque\b"),
    "muito": (r"\bmto\b", r"\bmuito\b"),
    "hoje": (r"\bhj\b", r"\bhoje\b"),
    "depois": (r"\bdps\b", r"\bdepois\b"),
    "mesmo": (r"\b(?:msm|memo)\b", r"\bmesmo\b"),
    "para": (r"\bpra\b", r"\bpara\b"),
    "esta": (r"\bt[aá]\b", r"\best[aá]\b"),
    "estou": (r"\bt[oô]u?\b", r"\bestou\b"),
    "valeu": (r"\bvlw\b", r"\bvaleu\b"),
    "beleza": (r"\bblz\b", r"\bbeleza\b"),
}

# "num" no lugar de "nao" e marca forte dele.
NEGATION = {
    "num": r"\bnum\b",
    "nao_com_til": r"\bnão\b",
    "nao_sem_til": r"\bnao\b",
}

# Acentuacao: ele escreve com ou sem?
ACCENT_PAIRS = {
    "e_verbo": (r"\bé\b", r"\beh\b"),
    "ja": (r"\bjá\b", r"\bja\b"),
    "so": (r"\bsó\b", r"\bso\b"),
    "ate": (r"\baté\b", r"\bate\b"),
    "nao": (r"\bnão\b", r"\bnao\b"),
    "esta": (r"\bestá\b", r"\besta\b"),
}

EMOJI = re.compile(
    "[" "\U0001F300-\U0001FAFF" "\U00002600-\U000027BF" "\U0001F000-\U0001F2FF" "]"
)
FIRST_ALPHA = re.compile(r"[A-Za-zÀ-ÿ]")
STOP_FOR_NGRAM = {"https", "http", "www"}


def run(out_dir):
    pdir = os.path.join(out_dir, "persona")
    os.makedirs(pdir, exist_ok=True)
    norm = os.path.join(out_dir, "corpus", "normalized.jsonl")
    stats = json.load(open(os.path.join(out_dir, "corpus", "stats.json"), encoding="utf-8"))

    ortho = {k: [0, 0] for k in ORTHO_PAIRS}
    negation = Counter()
    accents = {k: [0, 0] for k in ACCENT_PAIRS}
    ortho_re = {k: (re.compile(a, re.I), re.compile(b, re.I)) for k, (a, b) in ORTHO_PAIRS.items()}
    neg_re = {k: re.compile(v, re.I) for k, v in NEGATION.items()}
    acc_re = {k: (re.compile(a), re.compile(b)) for k, (a, b) in ACCENT_PAIRS.items()}

    n = 0
    starts_upper = ends_punct = ends_period = has_comma = has_emoji = 0
    lens = []
    bigrams = Counter()
    trigrams = Counter()
    openers = Counter()
    closers = Counter()
    emote_by_channel = defaultdict(Counter)

    with open(norm, encoding="utf-8") as fh:
        for raw in fh:
            r = json.loads(raw)
            s = r["text"]
            n += 1
            lens.append(len(s))

            m = FIRST_ALPHA.search(s)
            if m and m.group(0).isupper():
                starts_upper += 1
            if s[-1:] in ".!?":
                ends_punct += 1
            if s.endswith("."):
                ends_period += 1
            if "," in s:
                has_comma += 1
            if EMOJI.search(s):
                has_emoji += 1

            for k, (ra, rb) in ortho_re.items():
                if k == "nao":
                    continue
                ortho[k][0] += len(ra.findall(s))
                ortho[k][1] += len(rb.findall(s))
            for k, rx in neg_re.items():
                negation[k] += len(rx.findall(s))
            for k, (ra, rb) in acc_re.items():
                accents[k][0] += len(ra.findall(s))
                accents[k][1] += len(rb.findall(s))

            for e in P.emote_tokens(s):
                mm = re.match(r"^([a-z0-9_]{2,})[A-Z]", e)
                emote_by_channel[mm.group(1) if mm else "_global"][e] += 1

            toks = [t for t in re.findall(r"[0-9A-Za-zÀ-ÿ']+", s.lower())
                    if t not in STOP_FOR_NGRAM]
            if toks:
                openers[toks[0]] += 1
                closers[toks[-1]] += 1
            for i in range(len(toks) - 1):
                bigrams[(toks[i], toks[i + 1])] += 1
            for i in range(len(toks) - 2):
                trigrams[(toks[i], toks[i + 1], toks[i + 2])] += 1

    lens.sort()

    def pct(c):
        return round(100.0 * c / max(n, 1), 2)

    def per_k(c):
        return round(1000.0 * c / max(n, 1), 2)

    voice_rates = {
        cat: {name: {"lines": c, "per_1k": per_k(c)} for name, c in sorted(d.items(), key=lambda x: -x[1])}
        for cat, d in stats["voice"].items()
    }

    lex = {
        "base": {
            "signal_lines": n,
            "total_corpus_lines": stats["total_lines"],
            "nota": "taxas sao por 1000 linhas de sinal, nao do corpus inteiro",
        },
        "comprimento": {
            "media_chars": round(sum(lens) / max(len(lens), 1), 1),
            "p25": lens[len(lens) // 4] if lens else 0,
            "mediana": lens[len(lens) // 2] if lens else 0,
            "p75": lens[3 * len(lens) // 4] if lens else 0,
            "p95": lens[int(0.95 * len(lens))] if lens else 0,
        },
        "ortografia": {
            "comeca_com_maiuscula_pct": pct(starts_upper),
            "termina_com_pontuacao_pct": pct(ends_punct),
            "termina_com_ponto_pct": pct(ends_period),
            "usa_virgula_pct": pct(has_comma),
            "usa_emoji_unicode_pct": pct(has_emoji),
            "alongamento_vocalico_linhas": stats["voice_elongation_lines"],
            "diminutivo_linhas": stats["voice_diminutive_lines"],
        },
        "reducoes": {
            k: {"reduzido": v[0], "padrao": v[1],
                "preferencia_reduzido_pct": round(100.0 * v[0] / max(v[0] + v[1], 1), 1)}
            for k, v in sorted(ortho.items(), key=lambda x: -(x[1][0] + x[1][1]))
            if k != "nao"
        },
        "negacao": dict(negation.most_common()),
        "acentuacao": {
            k: {"com_acento": v[0], "sem_acento": v[1],
                "mantem_acento_pct": round(100.0 * v[0] / max(v[0] + v[1], 1), 1)}
            for k, v in accents.items()
        },
        "marcadores_de_voz": voice_rates,
        "emotes": {
            "distintos": stats["emote_distinct"],
            "total": stats["emote_total"],
            "por_canal": {
                ch: dict(c.most_common(12))
                for ch, c in sorted(emote_by_channel.items(), key=lambda x: -sum(x[1].values()))[:14]
            },
        },
        "construcoes": {
            "bigramas_top": {" ".join(k): v for k, v in bigrams.most_common(120)},
            "trigramas_top": {" ".join(k): v for k, v in trigrams.most_common(120)},
            "aberturas_top": dict(openers.most_common(50)),
            "fechamentos_top": dict(closers.most_common(50)),
        },
        "palavras_conteudo_top": dict(list(stats["words_top"].items())[:250]),
    }

    with open(os.path.join(pdir, "lexicon.json"), "w", encoding="utf-8") as fh:
        json.dump(lex, fh, ensure_ascii=False, indent=2)

    o = lex["ortografia"]
    print(f"[lexicon] {n} linhas de sinal; mediana {lex['comprimento']['mediana']} chars")
    print(f"[lexicon] maiuscula inicial {o['comeca_com_maiuscula_pct']}% | "
          f"pontuacao final {o['termina_com_pontuacao_pct']}% | virgula {o['usa_virgula_pct']}%")
    print(f"[lexicon] negacao: {dict(negation.most_common())}")
    return lex


if __name__ == "__main__":
    run(sys.argv[1])
