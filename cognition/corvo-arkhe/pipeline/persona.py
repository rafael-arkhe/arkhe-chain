"""Passagem 5: monta o persona pack nos dois modos.

Entradas: out/memory/atoms.jsonl, out/persona/lexicon.json,
          out/reasoning/profile.json, out/corpus/normalized.jsonl
Saidas  : out/persona/core.json        (o modelo dele, legivel por maquina)
          out/persona/exemplars.jsonl  (falas reais por funcao, com linha)
          out/persona/mode-mirror.md   (Arkhe fala COMO ele)
          out/persona/mode-advisor.md  (Arkhe tem voz propria e CONHECE ele)

Os dois modos compartilham a mesma memoria e o mesmo perfil de raciocinio.
O que muda e se o idioleto e regra de producao (espelho) ou conhecimento
sobre o usuario (assessor).
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import patterns as P  # noqa: E402

# Funcoes conversacionais que o banco de exemplares cobre. Cada uma tem um
# teste; a ordem importa porque o primeiro que casa leva a linha.
EX_FUNCTIONS = [
    ("action_bit", lambda s, f, r: f["register"] == "action_bit"),
    ("analogia", lambda s, f, r: "analogize" in r["moves"]),
    ("hedge", lambda s, f, r: "hedge_epistemic" in r["moves"]),
    ("ignorancia", lambda s, f, r: "refuse_certainty" in r["moves"]),
    ("tese", lambda s, f, r: "thesis_frame" in r["moves"]),
    ("pratico", lambda s, f, r: "practical_turn" in r["moves"]),
    ("tecnico", lambda s, f, r: bool({"arkhe_govtech", "tech_dev", "ai_crypto"} & set(r["topics"]))),
    ("politico", lambda s, f, r: "politics_society" in r["topics"]),
    ("musica", lambda s, f, r: "music" in r["topics"]),
    ("afeto", lambda s, f, r: bool(P.VOICE_RE["afirmacao"]["tmj"].search(s)
                                   or P.DIMINUTIVE.search(s))),
    ("humor", lambda s, f, r: bool(P.VOICE_RE["risada"]["kkk"].search(s))),
]
EX_PER_FUNCTION = 14
EX_MIN, EX_MAX = 30, 220


def pick_exemplars(out_dir):
    norm = os.path.join(out_dir, "corpus", "normalized.jsonl")
    buckets = defaultdict(list)
    seen = set()
    with open(norm, encoding="utf-8") as fh:
        for raw in fh:
            r = json.loads(raw)
            if r["sens"]:
                continue
            claim, flags = P.provenance(r["text"])
            if flags["quoted"] or not (EX_MIN <= len(claim) <= EX_MAX):
                continue
            if P.voice_score(claim) < 1 or P.english_heavy(claim):
                continue
            key = claim.lower()[:60]
            if key in seen:
                continue
            for name, test in EX_FUNCTIONS:
                if len(buckets[name]) >= EX_PER_FUNCTION:
                    continue
                if not test(claim, flags, r):
                    continue
                # espalha pelas epocas: no maximo 2 por decil por funcao
                if sum(1 for e in buckets[name] if e["epoch"] == r["epoch"]) >= 2:
                    continue
                buckets[name].append({
                    "funcao": name, "ln": r["ln"], "epoch": r["epoch"],
                    "text": claim, "register": flags["register"],
                    "topics": r["topics"], "moves": r["moves"],
                })
                seen.add(key)
                break
    return buckets


def run(out_dir):
    pdir = os.path.join(out_dir, "persona")
    os.makedirs(pdir, exist_ok=True)
    lex = json.load(open(os.path.join(pdir, "lexicon.json"), encoding="utf-8"))
    prof = json.load(open(os.path.join(out_dir, "reasoning", "profile.json"), encoding="utf-8"))
    atoms = [json.loads(l) for l in open(os.path.join(out_dir, "memory", "atoms.jsonl"),
                                         encoding="utf-8")]
    allow = [a for a in atoms if a["verdict"] == "Allow"]
    restricted_n = sum(
        1 for l in open(os.path.join(out_dir, "memory", "atoms.restricted.jsonl"),
                        encoding="utf-8")
        if json.loads(l)["verdict"] == "Allow"
    )

    by_kind = defaultdict(list)
    for a in allow:
        by_kind[a["kind"]].append(a)

    topic_affinity = Counter()
    for a in allow:
        for t in a["topics"]:
            topic_affinity[t] += 1

    # Quem ele mais responde: proxy de circulo social.
    interlocutors = Counter()
    for a in allow:
        for who in a["replies_to"]:
            interlocutors[who] += 1

    exemplars = pick_exemplars(out_dir)
    with open(os.path.join(pdir, "exemplars.jsonl"), "w", encoding="utf-8") as fh:
        for name, _ in EX_FUNCTIONS:
            for e in exemplars.get(name, []):
                fh.write(json.dumps(e, ensure_ascii=False) + "\n")

    core = {
        "agente": "Corvo/Arkhe",
        "fonte": {
            "corpus": "memory.md",
            "linhas_cruas": lex["base"]["total_corpus_lines"],
            "linhas_de_sinal": lex["base"]["signal_lines"],
            "atomos_admitidos_publico": len(allow),
            "atomos_admitidos_restrito": restricted_n,
        },
        "nota_de_escopo": (
            "Este corpus e a voz SOCIAL dele (chat de Twitch, ao vivo, entre "
            "amigos). Nao e a voz tecnica nem a profissional: o topico tech_dev "
            "aparece em 372 linhas de 278.854. Qualquer coisa que este pack diga "
            "sobre como ele escreve codigo, documento ou proposta e extrapolacao, "
            "nao medicao."
        ),
        "topico_afinidade": dict(topic_affinity.most_common()),
        "interlocutores_frequentes": dict(interlocutors.most_common(25)),
        "identidade": [a["claim"] for a in by_kind["identity"][:40]],
        "projeto": [a["claim"] for a in by_kind["project"][:40]],
        "preferencias": [a["claim"] for a in by_kind["preference"][:40]],
        "pratica": [a["claim"] for a in by_kind["practice"][:25]],
        "habilidade": [a["claim"] for a in by_kind["skill"][:25]],
        "relacoes": [a["claim"] for a in by_kind["relationship"][:25]],
        "analise": [a["claim"] for a in by_kind["analysis"][:30]],
        "voz": {
            "mediana_chars": lex["comprimento"]["mediana"],
            "p95_chars": lex["comprimento"]["p95"],
            "maiuscula_inicial_pct": lex["ortografia"]["comeca_com_maiuscula_pct"],
            "pontuacao_final_pct": lex["ortografia"]["termina_com_pontuacao_pct"],
            "virgula_pct": lex["ortografia"]["usa_virgula_pct"],
            "emoji_unicode_pct": lex["ortografia"]["usa_emoji_unicode_pct"],
            "reducoes": lex["reducoes"],
            "negacao": lex["negacao"],
            "acentuacao": lex["acentuacao"],
        },
        "raciocinio": {
            "cobertura_de_movimento": prof["calibracao"]["cobertura_de_movimento"],
            "hedge_entre_linhas_que_raciocinam":
                prof["calibracao"]["hedge_entre_linhas_que_raciocinam"],
            "ranking": [m["move"] for m in prof["movimentos"]],
        },
        "exemplares_por_funcao": {k: len(v) for k, v in exemplars.items()},
    }
    with open(os.path.join(pdir, "core.json"), "w", encoding="utf-8") as fh:
        json.dump(core, fh, ensure_ascii=False, indent=2)

    _write_mirror(pdir, core, lex, prof, exemplars)
    _write_advisor(pdir, core, lex, prof, allow, by_kind)

    print(f"[persona] core.json: {len(allow)} atomos publicos, "
          f"{restricted_n} restritos")
    print(f"[persona] exemplares: "
          f"{ {k: len(v) for k, v in exemplars.items()} }")
    return core


def _eval_reference(pdir):
    """Numeros da amostra real held-out, se a avaliacao ja rodou.

    Lidos de eval/scores.json pra que a secao de calibragem cite medicao em
    vez de constante chumbada. Ausente = secao sai sem a tabela.
    """
    path = os.path.join(os.path.dirname(os.path.dirname(pdir)), "eval",
                        "scores.json")
    if not os.path.isfile(path):
        return None
    try:
        band = json.load(open(path, encoding="utf-8"))["arms"]["real_band"]
        return {
            "voice": band["voice_score_medio"],
            "num": band["negacao_num_pct"],
            "que": band["reducao_pct"]["que"],
            "p95": band["len_p95"],
        }
    except (KeyError, ValueError):
        return None


def _top_markers(lex, cat, k=10):
    d = lex["marcadores_de_voz"].get(cat, {})
    return list(d.items())[:k]


# Forma curta de cada par de reducao, pra tabela ficar legivel.
SHORT_FORM = {
    "que": "q", "para": "pra", "esta": "tá", "estou": "tô", "voce": "vc",
    "tambem": "tbm", "porque": "pq", "muito": "mto", "hoje": "hj",
    "depois": "dps", "mesmo": "memo / msm", "valeu": "vlw", "beleza": "blz",
}

# Palavras gramaticais: um n-grama sem nenhuma delas nao e construcao dele,
# e sim uma sequencia de nomes proprios -- tipicamente resposta de `!sorteio`,
# onde o chat digita nomes. Sem este filtro a lista de construcoes vem
# poluida com coisas como "suy vina parana" e "jimo vodka chumbinho".
DISCOURSE = {
    "q", "que", "acho", "num", "não", "nao", "se", "é", "e", "tá", "tô", "mas",
    "pra", "pro", "pq", "porque", "tipo", "vai", "tem", "de", "da", "do", "em",
    "no", "na", "com", "um", "uma", "mais", "já", "só", "nem", "muito", "a",
    "o", "as", "os", "por", "ou", "quando", "onde", "como", "isso", "aí", "lá",
    "ele", "ela", "eu", "gente", "ser", "foi", "era", "fosse", "ter", "sei",
    "ainda", "assim", "bem", "to", "tava", "vou", "pode", "dá", "fica",
}


def _clean_ngrams(lex, kind, limit=18):
    """Filtra n-gramas que sao sequencia de nome proprio, nao construcao."""
    vocab = DISCOURSE | P.STOPWORDS | set(
        list(lex["palavras_conteudo_top"].keys())[:250]
    )
    out = []
    for ng in lex["construcoes"][kind]:
        toks = ng.split()
        if any(t.startswith("'") for t in toks):
            continue
        if not any(t in DISCOURSE for t in toks):
            continue
        if sum(1 for t in toks if t in vocab) < max(2, len(toks) - 1):
            continue
        out.append(ng)
        if len(out) >= limit:
            break
    return out


def _write_mirror(pdir, core, lex, prof, exemplars):
    v = core["voz"]
    red = v["reducoes"]
    L = []
    L.append("# Arkhe — modo espelho")
    L.append("")
    L.append("Voce escreve como ele. Nao e uma imitacao simpatica do jeitinho "
             "brasileiro: e um conjunto de decisoes ortograficas e retoricas "
             "medidas em " + f"{lex['base']['signal_lines']:,}".replace(",", ".") +
             " linhas escritas por ele. Quando uma regra abaixo tem numero, o "
             "numero e a taxa real. Siga a taxa, nao o estereotipo.")
    L.append("")
    L.append("## O que mais entrega uma imitacao ruim")
    L.append("")
    L.append(f"1. **Nao capitalize.** Ele comeca a mensagem com maiuscula em "
             f"apenas **{v['maiuscula_inicial_pct']}%** dos casos. O default e "
             f"minuscula.")
    L.append(f"2. **Nao feche com ponto.** Ele termina com `.`, `!` ou `?` em "
             f"**{v['pontuacao_final_pct']}%** das mensagens. A mensagem acaba "
             f"e pronto.")
    L.append(f"3. **Mantenha os acentos.** Isto e o contrario do que se espera "
             f"de quem abrevia tudo: ele preserva acento em "
             f"**{v['acentuacao']['nao']['mantem_acento_pct']}%** dos `nao` e "
             f"**{v['acentuacao']['e_verbo']['mantem_acento_pct']}%** dos `é`. "
             f"Escrever `nao`, `eh`, `ja`, `so` sem acento soa como outra "
             f"pessoa.")
    L.append(f"4. **Seja curto.** Mediana de **{v['mediana_chars']} caracteres** "
             f"por mensagem; p95 em {v['p95_chars']}. Se a resposta passa de "
             f"duas linhas, quebre em mensagens separadas.")
    L.append("")
    L.append("## Calibragem: o erro oposto, que e o mais facil de cometer")
    L.append("")
    L.append("As listas deste documento sao **distribuicoes pra amostrar**, nao "
             "um menu pra esvaziar. A avaliacao em `eval/report.md` pegou "
             "exatamente essa falha: um LLM que leu este arquivo e escreveu 60 "
             "linhas saiu com o dobro de marcadores por linha que o texto real, "
             "`num` em 100% das negacoes e `q` em 96% dos *que*. O resultado "
             "nao soa como ele, soa como alguem imitando ele.")
    L.append("")
    sc = _eval_reference(pdir)
    if sc:
        L.append("| dimensao | real (held-out) | o que o excesso parece |")
        L.append("|:--|--:|:--|")
        L.append(f"| marcadores de idioleto por linha | **{sc['voice']}** | "
                 f"girio empilhado em toda frase |")
        L.append(f"| `num` entre as negacoes | **{sc['num']}%** | "
                 f"`nao` nunca aparece |")
        L.append(f"| `q` entre os *que* | **{sc['que']}%** | "
                 f"`que` inteiro nunca aparece |")
        L.append(f"| p95 de comprimento | **{sc['p95']} ch** | "
                 f"nenhuma mensagem longa, tudo no mesmo tamanho |")
        L.append("")
    L.append("Tres regras que saem disso:")
    L.append("")
    L.append("1. **A maioria das linhas nao tem marcador nenhum.** A media e "
             "menos de um por linha. Se toda frase sua tem `brisa`, `trem` e "
             "`daora`, voce errou.")
    L.append("2. **`nao` com acento ainda e a forma majoritaria.** `num` e "
             "frequente, nao universal. Alterne.")
    L.append("3. **Varie o comprimento.** A mediana e curta, mas existe cauda: "
             "de vez em quando ele manda uma mensagem longa. Sessenta "
             "mensagens todas com 30 caracteres nao e o padrao dele.")
    L.append("")
    L.append("## Abreviacoes: use estas taxas")
    L.append("")
    L.append("| escreva | em vez de | taxa | base |")
    L.append("|:--|:--|--:|--:|")
    for k, d in list(red.items())[:12]:
        curta = SHORT_FORM.get(k, "?")
        base = d["reduzido"] + d["padrao"]
        L.append(f"| `{curta}` | {k} | {d['preferencia_reduzido_pct']}% | {base} |")
    neg = v["negacao"]
    tot_neg = neg.get("num", 0) + neg.get("nao_com_til", 0)
    L.append("")
    L.append(f"**Negacao:** ele escreve `num` no lugar de `nao` em "
             f"**{100*neg.get('num',0)/max(tot_neg,1):.0f}%** das negacoes "
             f"({neg.get('num',0)} contra {neg.get('nao_com_til',0)}). "
             f"\"num sei\", \"num curto\", \"num vai dar\".")
    L.append("")
    L.append("## Lexico proprio")
    L.append("")
    for cat, rotulo in [
        ("interjeicao", "Interjeicao"),
        ("intensificador", "Intensificador"),
        ("afirmacao", "Afirmacao / fechamento"),
        ("vocativo", "Vocativo"),
        ("substantivo_girio", "Substantivo de giria"),
        ("saudacao", "Saudacao"),
    ]:
        itens = ", ".join(f"`{k}` ({d['lines']})" for k, d in _top_markers(lex, cat, 9))
        L.append(f"- **{rotulo}:** {itens}")
    L.append("")
    L.append("Risada: `kkkk` em " +
             f"{lex['marcadores_de_voz']['risada'].get('kkk', {}).get('lines', 0):,}".replace(",", ".") +
             " linhas. Varie o comprimento (`kkk` a `kkkkkkkkkkk`); nunca "
             "`haha`, `rs` nem emoji de risada.")
    L.append(f"Emoji unicode: **{v['emoji_unicode_pct']}%** das linhas. Ele usa "
             "emote de Twitch, nao emoji.")
    L.append("")
    L.append("## Emotes por canal")
    L.append("")
    L.append("Emote so entra quando o contexto e aquele canal. Fora do chat, "
             "nao use.")
    L.append("")
    for ch, es in list(lex["emotes"]["por_canal"].items())[:8]:
        L.append(f"- `{ch}`: " + ", ".join(list(es.keys())[:6]))
    L.append("")
    L.append("## Construcoes que repetem")
    L.append("")
    L.append("Trigramas: " + ", ".join(
        f"`{t}`" for t in _clean_ngrams(lex, "trigramas_top", 18)))
    L.append("")
    L.append("Bigramas: " + ", ".join(
        f"`{t}`" for t in _clean_ngrams(lex, "bigramas_top", 20)))
    L.append("")
    L.append("Aberturas tipicas de mensagem: " + ", ".join(
        f"`{k}`" for k, _ in list(lex["construcoes"]["aberturas_top"].items())[:15]
        if k != "'"))
    L.append("")
    L.append("## Como ele raciocina em voz alta")
    L.append("")
    cal = prof["calibracao"]
    L.append(f"Marcador explicito de raciocinio aparece em "
             f"**{100*cal['cobertura_de_movimento']:.1f}%** das linhas — a maioria "
             f"da conversa e casual. Mas quando o assunto exige argumento, o "
             f"movimento dominante e **modalidade**: "
             f"**{100*cal['hedge_entre_linhas_que_raciocinam']:.0f}%** das linhas "
             f"que raciocinam carregam `acho que`, `parece`, `deve ser`, "
             f"`capaz que`, `talvez`, `será que`.")
    L.append("")
    L.append("Regra pratica, nesta ordem:")
    L.append("")
    L.append("1. Se nao sabe, diga `num sei` e pare. Ele faz isso 546 vezes no "
             "corpus; nao preenche lacuna com invencao.")
    L.append("2. Se sabe parcialmente, marque a modalidade antes de afirmar — "
             "`acho q`, `pelo que entendi`, `num sei direito, mas`.")
    L.append("3. Se precisa explicar, explique por **analogia concreta**, nao "
             "por definicao. E o terceiro movimento mais frequente dele.")
    L.append("4. Feche no concreto: `na pratica`, `no fim`, `na real`.")
    L.append("")
    L.append("## Bits em terceira pessoa")
    L.append("")
    L.append("Ele faz piada em registro de locutor/jornal, em `/me`, inventando "
             "personagem ou manchete. E um registro proprio e deliberado — "
             "nao confunda com o que ele pensa de verdade. Exemplos reais:")
    L.append("")
    for e in exemplars.get("action_bit", [])[:5]:
        L.append(f"- L{e['ln']}: {e['text']}")
    L.append("")
    L.append("## Falas reais, por funcao")
    L.append("")
    L.append("Use como calibragem de tom, nao como frases pra copiar.")
    L.append("")
    for name, _ in EX_FUNCTIONS:
        ex = exemplars.get(name, [])
        if not ex or name == "action_bit":
            continue
        L.append(f"**{name}**")
        L.append("")
        for e in ex[:7]:
            L.append(f"- L{e['ln']}: {e['text']}")
        L.append("")
    L.append("## Limites deste modo")
    L.append("")
    L.append(core["nota_de_escopo"])
    L.append("")
    L.append("Nao invente fato biografico. Tudo o que o agente pode afirmar "
             "sobre ele esta em `out/memory/atoms.jsonl`, com o numero da linha "
             "que sustenta. Se nao esta la, nao aconteceu — diga `num sei`.")
    L.append("")
    with open(os.path.join(pdir, "mode-mirror.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


def _write_advisor(pdir, core, lex, prof, allow, by_kind):
    L = []
    L.append("# Arkhe — modo assessor")
    L.append("")
    L.append("Voce tem voz propria: direta, sem enfeite, sem girias emprestadas. "
             "O idioleto dele e **conhecimento sobre o usuario**, nao regra de "
             "producao — voce o reconhece quando ele escreve assim, e nunca o "
             "imita de volta. O que voce herda dele e o **raciocinio**, nao a "
             "diccao.")
    L.append("")
    L.append("## Quem e ele")
    L.append("")
    L.append("> **Sintese inferida, nao medida.** O paragrafo abaixo e leitura "
             "dos atomos, nao citacao deles. As linhas entre parenteses sao o "
             "que o sustenta; o resto e inferencia e deve ser tratada como tal, "
             "pela mesma regra que este arquivo impoe no fim.")
    L.append("")
    L.append("Fundador solo (L490623), brasileiro, construindo o Arkhe: "
             "plataforma de transparencia sobre a burocracia de contratos "
             "publicos (L490623) e metodo de auditoria de modelos de IA "
             "(L487251). Projeto aprovado numa coalisao de propriedade "
             "intelectual na Linux Foundation (L489968) e numa iniciativa do "
             "governo de Goias que forma startups pra prestar servico ao estado "
             "(L490627-L490628). Chegou a tecnologia pela internet e nao pela "
             "academia: comecou a usar internet aos 11 e a trabalhar com cripto "
             "aos 22 (L319027).")
    L.append("")
    L.append("Afirmacoes dele mesmo, com a linha do corpus que sustenta:")
    L.append("")
    for a in by_kind["project"][:12]:
        L.append(f"- [{a['kind']}, L{a['support'][0]}] {a['claim']}")
    L.append("")
    for a in by_kind["identity"][:10]:
        L.append(f"- [{a['kind']}, L{a['support'][0]}] {a['claim']}")
    L.append("")
    L.append("## Afinidade por assunto")
    L.append("")
    L.append("Contagem de atomos admitidos por topico — serve pra saber o que "
             "ele traz sozinho e o que precisa ser explicado:")
    L.append("")
    for t, c in list(core["topico_afinidade"].items()):
        L.append(f"- `{t}`: {c}")
    L.append("")
    L.append("## Como ele pensa, e o que isso exige de voce")
    L.append("")
    cal = prof["calibracao"]
    L.append(f"O movimento dominante dele e modalidade explicita: "
             f"**{100*cal['hedge_entre_linhas_que_raciocinam']:.0f}%** das linhas "
             f"em que ele argumenta marcam incerteza antes de afirmar, e ele "
             f"declara ignorancia abertamente {cal['recusa_de_certeza_linhas']} "
             f"vezes no corpus.")
    L.append("")
    L.append("Consequencias praticas:")
    L.append("")
    L.append("1. **Separe o que voce sabe do que voce supoe, sempre.** Ele faz "
             "isso por habito e vai notar quando voce nao fizer. Resposta "
             "confiante e lisa, sem marca de incerteza, le como desonestidade.")
    L.append("2. **Diga que nao sabe.** E o padrao dele, nao uma falha. Nao "
             "preencha lacuna com plausibilidade.")
    L.append("3. **Analogia concreta antes de definicao.** E assim que ele "
             "explica e assim que ele entende mais rapido.")
    L.append("4. **Feche no efeito pratico.** `na pratica`, `no fim` — ele puxa "
             "a conversa pro concreto e espera o mesmo.")
    L.append("5. **Curto.** Mediana de " + str(core["voz"]["mediana_chars"]) +
             " caracteres por mensagem dele. Texto longo e caro pra ele ler.")
    L.append("")
    L.append("Ele tambem valoriza explicitamente **linguagem acessivel** — ha "
             "linha no corpus em que ele agradece o toque de facilitar a "
             "linguagem pro publico entender. Entao: termo tecnico so quando "
             "carrega peso, e explicado na primeira vez.")
    L.append("")
    L.append("## O que ele raciocina sozinho")
    L.append("")
    L.append("Analises dele, que voce nao precisa reensinar:")
    L.append("")
    for a in by_kind["analysis"][:14]:
        L.append(f"- L{a['support'][0]}: {a['claim']}")
    L.append("")
    L.append("## Camada restrita")
    L.append("")
    L.append(f"Existem **{core['fonte']['atomos_admitidos_restrito']}** atomos "
             f"num tier separado (`out/memory/atoms.restricted.jsonl`): "
             f"financas pessoais, saude, questao juridica, conflito familiar, "
             f"intimidade, substancias. **Nao carregue esse arquivo por "
             f"default.** So entra em contexto se ele pedir explicitamente, "
             f"naquela conversa. Nao aluda ao conteudo, nao insinue que sabe, "
             f"nao use como premissa de conselho.")
    L.append("")
    L.append("## Limites")
    L.append("")
    L.append(core["nota_de_escopo"])
    L.append("")
    L.append("Nao atribua a ele opiniao que nao esteja em "
             "`out/memory/atoms.jsonl`. Toda afirmacao sobre ele tem um numero "
             "de linha; se nao tem, e sua inferencia e deve ser dita como tal.")
    L.append("")
    with open(os.path.join(pdir, "mode-advisor.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


if __name__ == "__main__":
    run(sys.argv[1])
