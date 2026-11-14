"""Passagem 1: classifica cada linha do corpus e anota o que sobra.

Entrada : memory.md cru (uma mensagem por linha, sem autor, sem timestamp).
Saidas  : out/corpus/normalized.jsonl  (linhas de sinal, anotadas)
          out/corpus/stats.json        (buckets, emotes, voz, palavras, topicos)

Provenancia: cada registro carrega `ln`, o numero da linha 1-indexado no
corpus original. Nada no pipeline inteiro afirma algo sem poder apontar a
linha de onde veio.

O corpus nao tem timestamp. A ordem das linhas e cronologica ascendente
(o fim do corpus fala do Arkhe govtech, o inicio nao), entao usamos
`epoch` = decil da posicao como tempo ordinal. NAO e data.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P  # noqa: E402

MIN_LEN = 12


def classify(stripped):
    """Devolve o nome do bucket de ruido, ou None se a linha e sinal."""
    if not stripped:
        return "empty"
    if P.BRAILLE_ART.search(stripped):
        return "ascii_art"
    if P.COMMAND.match(stripped):
        return "command"
    if P.URL_ONLY.match(stripped):
        return "url_only"
    if P.is_all_noise(stripped):
        return "emote_or_laugh"
    if P.NON_WORD.match(stripped):
        return "nonword"
    if len(stripped) < MIN_LEN:
        return "too_short"
    return None


def run(corpus_path, out_dir):
    corpus_dir = os.path.join(out_dir, "corpus")
    os.makedirs(corpus_dir, exist_ok=True)

    with open(corpus_path, encoding="utf-8", errors="replace") as fh:
        raw = fh.read().split("\n")
    total = len(raw)

    buckets = Counter()
    emotes = Counter()
    voice = {cat: Counter() for cat in P.VOICE_RE}
    words = Counter()
    topics = Counter()
    moves = Counter()
    elong = 0
    dimin = 0
    fp_count = 0
    sens_count = Counter()
    # Blocklist de palavras: nomes de emote em minuscula poluem a contagem.
    emote_lower = {e.lower() for e in P.GLOBAL_EMOTES}

    out_path = os.path.join(corpus_dir, "normalized.jsonl")
    kept = 0
    with open(out_path, "w", encoding="utf-8") as out:
        for idx, line in enumerate(raw):
            s = line.strip()

            # Voz e emotes medem-se sobre TODAS as linhas, inclusive ruido:
            # "kkkkk" sozinho e ruido semantico mas e sinal de idioleto.
            for e in P.emote_tokens(s):
                emotes[e] += 1
                emote_lower.add(e.lower())
            for cat, group in P.VOICE_RE.items():
                for name, rx in group.items():
                    if rx.search(s):
                        voice[cat][name] += 1
            if P.ELONGATION.search(s):
                elong += 1
            if P.DIMINUTIVE.search(s):
                dimin += 1

            bucket = classify(s)
            if bucket is not None:
                buckets[bucket] += 1
                continue
            buckets["kept"] += 1
            kept += 1

            ln_topics = [t for t, rx in P.TOPIC_RE.items() if rx.search(s)]
            ln_sens = [c for c, rx in P.SENSITIVE_RE.items() if rx.search(s)]
            ln_moves = [m for m, rx in P.REASONING_RE.items() if rx.search(s)]
            fp = bool(P.FIRST_PERSON.search(s)) and not P.NOT_SELF.search(s)

            for t in ln_topics:
                topics[t] += 1
            for m in ln_moves:
                moves[m] += 1
            for c in ln_sens:
                sens_count[c] += 1
            if fp:
                fp_count += 1

            for w in P.WORD.findall(s.lower()):
                if len(w) >= 4 and w not in P.STOPWORDS and w not in emote_lower:
                    words[w] += 1

            rec = {
                "ln": idx + 1,
                "epoch": (idx * 10) // max(total, 1),
                "text": s,
                "topics": ln_topics,
                "sens": ln_sens,
                "moves": ln_moves,
                "fp": fp,
            }
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # Palavras: remove o que sobrou de emote em minuscula.
    words = Counter({w: c for w, c in words.items() if w not in emote_lower})

    stats = {
        "corpus_path": os.path.abspath(corpus_path),
        "total_lines": total,
        "kept_lines": kept,
        "buckets": dict(buckets.most_common()),
        "first_person_lines": fp_count,
        "sensitive_hits": dict(sens_count.most_common()),
        "topic_hits": dict(topics.most_common()),
        "move_hits": dict(moves.most_common()),
        "voice": {cat: dict(c.most_common()) for cat, c in voice.items()},
        "voice_elongation_lines": elong,
        "voice_diminutive_lines": dimin,
        "emotes_top": dict(emotes.most_common(120)),
        "emote_distinct": len(emotes),
        "emote_total": sum(emotes.values()),
        "words_top": dict(words.most_common(600)),
        "words_distinct": len(words),
    }
    with open(os.path.join(corpus_dir, "stats.json"), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=2)

    print(f"[normalize] {total} linhas -> {kept} de sinal ({kept/total:.1%})")
    print(f"[normalize] primeira pessoa: {fp_count}")
    print(f"[normalize] emotes distintos: {len(emotes)}  total: {sum(emotes.values())}")
    return stats


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
