"""Mede um conjunto de linhas nas mesmas dimensoes do lexicon.

A ideia: `out/persona/lexicon.json` diz como ele escreve. Este modulo mede
como QUALQUER texto escreve, nas mesmas dimensoes, pra que a comparacao seja
numerica em vez de impressao.

Isto responde "o candidato obedece a especificacao?" -- que nao e a mesma
pergunta que "o candidato soa como ele?". A segunda exige juiz humano; ver
eval/blind-test.md.
"""
from __future__ import annotations

import json
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline"))
import patterns as P  # noqa: E402

FIRST_ALPHA = re.compile(r"[A-Za-zÀ-ÿ]")
EMOJI = re.compile(
    "[" "\U0001F300-\U0001FAFF" "\U00002600-\U000027BF" "\U0001F000-\U0001F2FF" "]"
)

# Pares reducao/padrao, iguais aos do lexicon.
ORTHO = {
    "que": (r"\bq\b", r"\bque\b"),
    "para": (r"\bpra\b", r"\bpara\b"),
    "esta": (r"\bt[aá]\b", r"\best[aá]\b"),
    "estou": (r"\bt[oô]u?\b", r"\bestou\b"),
    "voce": (r"\bvc\b", r"\bvoc[eê]\b"),
    "tambem": (r"\btbm?\b", r"\btamb[eé]m\b"),
    "porque": (r"\bpq\b", r"\bporque\b"),
    "muito": (r"\bmto\b", r"\bmuito\b"),
    "hoje": (r"\bhj\b", r"\bhoje\b"),
    "depois": (r"\bdps\b", r"\bdepois\b"),
    "mesmo": (r"\b(?:msm|memo)\b", r"\bmesmo\b"),
}
ORTHO_RE = {k: (re.compile(a, re.I), re.compile(b, re.I)) for k, (a, b) in ORTHO.items()}

ACCENT = {
    "nao": (r"\bnão\b", r"\bnao\b"),
    "e_verbo": (r"\bé\b", r"\beh\b"),
    "ja": (r"\bjá\b", r"\bja\b"),
    "so": (r"\bsó\b", r"\bso\b"),
    "ate": (r"\baté\b", r"\bate\b"),
}
ACCENT_RE = {k: (re.compile(a), re.compile(b)) for k, (a, b) in ACCENT.items()}

NUM_RE = re.compile(r"\bnum\b", re.I)
NAO_RE = re.compile(r"\bnão\b", re.I)
KKK_RE = re.compile(r"\bk{3,}\b", re.I)


def score(lines):
    """Vetor de metricas de um conjunto de linhas."""
    lines = [l.strip() for l in lines if l.strip()]
    n = max(len(lines), 1)
    lens = sorted(len(l) for l in lines)

    starts_upper = ends_punct = has_comma = has_emoji = kkk = 0
    ortho = {k: [0, 0] for k in ORTHO}
    accent = {k: [0, 0] for k in ACCENT}
    num = nao = 0
    vs_total = 0
    voice_cat = {c: 0 for c in P.VOICE_RE}
    moves = {m: 0 for m in P.REASONING_RE}
    emotes = 0
    dimin = elong = 0

    for s in lines:
        m = FIRST_ALPHA.search(s)
        if m and m.group(0).isupper():
            starts_upper += 1
        if s[-1:] in ".!?":
            ends_punct += 1
        if "," in s:
            has_comma += 1
        if EMOJI.search(s):
            has_emoji += 1
        if KKK_RE.search(s):
            kkk += 1
        for k, (ra, rb) in ORTHO_RE.items():
            ortho[k][0] += len(ra.findall(s))
            ortho[k][1] += len(rb.findall(s))
        for k, (ra, rb) in ACCENT_RE.items():
            accent[k][0] += len(ra.findall(s))
            accent[k][1] += len(rb.findall(s))
        num += len(NUM_RE.findall(s))
        nao += len(NAO_RE.findall(s))
        vs_total += P.voice_score(s)
        for c, g in P.VOICE_RE.items():
            if any(rx.search(s) for rx in g.values()):
                voice_cat[c] += 1
        for mv, rx in P.REASONING_RE.items():
            if rx.search(s):
                moves[mv] += 1
        emotes += len(P.emote_tokens(s))
        if P.DIMINUTIVE.search(s):
            dimin += 1
        if P.ELONGATION.search(s):
            elong += 1

    def pct(c):
        return round(100.0 * c / n, 2)

    def ratio(pair):
        """None quando a forma nao ocorre -- indefinido nao e zero.

        Sem isto, um braco que simplesmente nunca escreve `nao` nem `nao`
        marca 0% de retencao de acento e parece o pior caso possivel,
        quando na verdade a dimensao nao se aplica. Foi o que aconteceu na
        primeira rodada desta avaliacao.
        """
        a, b = pair
        if a + b == 0:
            return None
        return round(100.0 * a / (a + b), 1)

    return {
        "n_linhas": len(lines),
        "len_media": round(statistics.fmean(lens), 1) if lens else 0.0,
        "len_mediana": lens[len(lens) // 2] if lens else 0,
        "len_p95": lens[int(0.95 * (len(lens) - 1))] if lens else 0,
        "maiuscula_inicial_pct": pct(starts_upper),
        "pontuacao_final_pct": pct(ends_punct),
        "virgula_pct": pct(has_comma),
        "emoji_pct": pct(has_emoji),
        "risada_kkk_pct": pct(kkk),
        "diminutivo_pct": pct(dimin),
        "alongamento_pct": pct(elong),
        "emotes_por_linha": round(emotes / n, 3),
        "voice_score_medio": round(vs_total / n, 3),
        "voice_cat_pct": {c: pct(v) for c, v in voice_cat.items()},
        "reducao_pct": {k: ratio(v) for k, v in ortho.items()},
        "acento_mantido_pct": {k: ratio(v) for k, v in accent.items()},
        "negacao_num_pct": round(100.0 * num / max(num + nao, 1), 1),
        "movimento_pct": {m: pct(v) for m, v in moves.items()},
    }


# Dimensoes que entram na distancia de estilo, com o peso de cada uma.
# Peso alto = e isso que entrega uma imitacao ruim (ver mode-mirror.md).
WEIGHTS = {
    "maiuscula_inicial_pct": (3.0, 100.0),
    "pontuacao_final_pct": (3.0, 100.0),
    "len_mediana": (2.0, 60.0),
    "acento_mantido_pct.nao": (3.0, 100.0),
    "acento_mantido_pct.e_verbo": (2.0, 100.0),
    "reducao_pct.que": (2.0, 100.0),
    "reducao_pct.para": (1.5, 100.0),
    "reducao_pct.porque": (1.0, 100.0),
    "reducao_pct.esta": (1.0, 100.0),
    "negacao_num_pct": (2.0, 100.0),
    "risada_kkk_pct": (1.5, 100.0),
    "emoji_pct": (1.5, 100.0),
    "virgula_pct": (1.0, 100.0),
    "voice_score_medio": (2.0, 3.0),
    "len_p95": (1.0, 200.0),
}


def _get(d, path):
    cur = d
    for part in path.split("."):
        cur = cur[part]
    return cur


def distance(cand, ref):
    """Distancia de estilo ponderada em [0,1]. 0 = identico a referencia.

    Cada dimensao contribui |cand-ref|/escala, truncado em 1, vezes o peso.
    A escala existe pra que 'mediana 31 vs 34' nao conte o mesmo que
    'maiuscula 24% vs 98%'.
    """
    rows = []
    skipped = []
    num = den = 0.0
    for path, (w, scale) in WEIGHTS.items():
        c, r = _get(cand, path), _get(ref, path)
        if c is None or r is None:
            # Dimensao indefinida num dos lados: a forma nao ocorre na
            # amostra. Fica fora da distancia e e declarada, em vez de
            # entrar como desvio maximo.
            skipped.append({"dim": path, "cand": c, "ref": r,
                            "motivo": "sem ocorrencia da forma na amostra"})
            continue
        c, r = float(c), float(r)
        d = min(abs(c - r) / scale, 1.0)
        rows.append({"dim": path, "cand": c, "ref": r,
                     "desvio_norm": round(d, 4), "peso": w})
        num += w * d
        den += w
    rows.sort(key=lambda x: -x["desvio_norm"] * x["peso"])
    return {
        "distancia": round(num / max(den, 1e-9), 4),
        "dimensoes_usadas": len(rows),
        "dimensoes": rows,
        "dimensoes_ignoradas": skipped,
    }


def reference_from_lexicon(out_dir):
    """Monta o vetor de referencia a partir do lexicon medido no corpus."""
    lex = json.load(open(os.path.join(out_dir, "persona", "lexicon.json"),
                         encoding="utf-8"))
    o, red, acc = lex["ortografia"], lex["reducoes"], lex["acentuacao"]
    neg = lex["negacao"]
    sig = lex["base"]["signal_lines"]
    kkk = lex["marcadores_de_voz"]["risada"].get("kkk", {}).get("lines", 0)
    return {
        "n_linhas": sig,
        "len_media": lex["comprimento"]["media_chars"],
        "len_mediana": lex["comprimento"]["mediana"],
        "len_p95": lex["comprimento"]["p95"],
        "maiuscula_inicial_pct": o["comeca_com_maiuscula_pct"],
        "pontuacao_final_pct": o["termina_com_pontuacao_pct"],
        "virgula_pct": o["usa_virgula_pct"],
        "emoji_pct": o["usa_emoji_unicode_pct"],
        "risada_kkk_pct": round(100.0 * kkk / sig, 2),
        "diminutivo_pct": round(100.0 * o["diminutivo_linhas"] / sig, 2),
        "alongamento_pct": round(100.0 * o["alongamento_vocalico_linhas"] / sig, 2),
        "emotes_por_linha": round(lex["emotes"]["total"] / sig, 3),
        # voice_score medio do corpus: so temos a distribuicao por marcador,
        # entao usamos o valor medido na amostra real (ver run_eval.py, que
        # substitui este campo pelo da amostra held-out).
        "voice_score_medio": None,
        "reducao_pct": {k: red[k]["preferencia_reduzido_pct"]
                        for k in ORTHO if k in red},
        "acento_mantido_pct": {k: acc[k]["mantem_acento_pct"]
                               for k in ACCENT if k in acc},
        "negacao_num_pct": round(
            100.0 * neg.get("num", 0) / max(neg.get("num", 0) + neg.get("nao_com_til", 0), 1), 1
        ),
    }
