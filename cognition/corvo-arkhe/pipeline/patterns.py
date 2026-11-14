"""Padroes empiricos calibrados sobre o corpus memory.md (490.633 linhas).

Toda constante aqui foi derivada de uma passagem exploratoria sobre o corpus,
nao de suposicao. Onde o padrao e palpite, esta marcado no honesty-note.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Ruido: emotes, risada, comandos, arte ASCII
# ---------------------------------------------------------------------------

# Emotes de canal Twitch/BTTV: prefixo minusculo + CamelCase (wallba3Surpreso).
EMOTE_CHANNEL = re.compile(r"^[a-z0-9_]{2,}[A-Z][A-Za-z0-9]*$")

# Emotes globais observados no corpus (freq >= 100 na passagem exploratoria).
GLOBAL_EMOTES = {
    "KEKW", "catJAM", "dogJAM", "catDisco", "peepoHappy", "peepoSad", "peepoCry",
    "peepoClap", "peepoRain", "peepoLeave", "peepoRun", "peepoPls", "peepoFAT",
    "pepePoint", "pepeLa", "PepeLa", "Prayge", "Sadge", "monkaS", "Weird",
    "GNOME", "MrDestructoid", "TableHere", "FortOne", "PokAegislash",
    "alienPLS", "AlienPls", "FeelsDankMan", "WidePeepoHappy", "widepeepoHappy",
    "EZ", "Pog", "PogChamp", "OMEGALUL", "OMEGALULW", "Clap", "LULW", "LUL",
    "BibleThump", "Kappa", "4Head", "PepeHands", "Pepega", "COPIUM", "HUHH",
    "Aware", "Chatting", "Madge", "Okayeg", "Stare", "NODDERS", "VIRE",
    "x01action", "chosenGone", "barriguinhaPls", "tmJj", "Pepepains",
}

LAUGH = re.compile(
    r"^(k{3,}|kk|(ha){2,}h?|(hue){2,}|(rs){2,}|lol|lmao|lmfao|kek|haha)$", re.I
)
COMMAND = re.compile(r"^!\w")
URL_ONLY = re.compile(r"^\s*(https?://\S+\s*)+$")
NON_WORD = re.compile(r"^[^\wÀ-ÿ]+$")
BRAILLE_ART = re.compile(r"[⠀-⣿]")
URL = re.compile(r"https?://\S+")
MENTION = re.compile(r"[@'’]@?\w+")


_PUNCT = ".,!?:;()[]" + chr(34) + chr(39)


def emote_tokens(line):
    out = []
    for t in line.split():
        t = t.strip(_PUNCT)
        if not t:
            continue
        if t in GLOBAL_EMOTES or EMOTE_CHANNEL.match(t):
            out.append(t)
    return out


def is_all_noise(line):
    toks = [t for t in line.split() if t]
    if not toks:
        return True
    return all(
        t in GLOBAL_EMOTES or EMOTE_CHANNEL.match(t) or LAUGH.match(t)
        for t in toks
    )


# ---------------------------------------------------------------------------
# Primeira pessoa: separa auto-relato de comentario sobre terceiros
# ---------------------------------------------------------------------------

FIRST_PERSON = re.compile(
    r"(?:^|\W)(?:"
    r"eu|m[ei]u|minha|meus|minhas|mim|comigo|"
    # "to" sem acento e comum nele ("to fazendo"), mas colide com o "to" do
    # ingles em texto colado. Exige complemento pt-BR depois.
    r"t[oô]u?\s+(?:\w+ndo|com|sem|numa|num|de|na|no|pra|pro|aqui|ali)|"
    r"tô|tou|tava|estou|estava|"
    r"sou|fui|tenho|tinha|tive|fa[cç]o|fiz|fazia|"
    r"vou|vim|venho|quero|queria|gosto|gostei|odeio|adoro|prefiro|"
    r"acho|achei|acredito|penso|sinto|senti|lembro|esqueci|sei|aprendi|"
    r"comecei|terminei|consegui|perdi|ganhei|comprei|vendi|morei|moro|"
    r"trabalho|trabalhei|estudei|estudo|peguei|deixei|parei|voltei|"
    r"preciso|precisava|devia|consigo|posso|podia|costumo|costumava"
    r")(?=\W|$)",
    re.I,
)

# Marcas de que a linha NAO e auto-relato (2a pessoa, pergunta ao chat).
NOT_SELF = re.compile(
    r"(?:^|\W)(?:voc[eê]s?|vc|vcs|tu|teu|tua|algu[eé]m sabe|"
    r"cad[eê]|quem [eé] que)(?=\W|$)",
    re.I,
)


# ---------------------------------------------------------------------------
# Atomos de memoria: kind -> padroes que o reconhecem
# ---------------------------------------------------------------------------

ATOM_PATTERNS = {
    "identity": [
        r"\beu (?:sou|era) (?:um |uma |o |a )?\w",
        r"\bsou (?:taurino|ariano|geminiano|canceriano|leonino|virginiano|"
        r"libriano|escorpi[aã]o|sagitariano|capricorniano|aquariano|pisciano)\b",
        r"\bascendente em\b",
        r"\bmeu (?:nome|signo|apelido|nick|cargo|t[ií]tulo)\b",
        r"\beu me (?:considero|identifico|chamo)\b",
    ],
    "biography": [
        r"\beu (?:j[aá] )?(?:fui|tive|morei|trabalhei|estudei|passei|cheguei|nasci)\b",
        r"\b(?:quando eu|na [eé]poca que eu|antes eu|eu (?:era|fazia))\b",
        r"\beu comecei a\b",
        r"\bh[aá] \d+ anos\b.*\beu\b",
        r"\beu (?:perdi|ganhei|consegui|desisti de|larguei)\b",
    ],
    "preference": [
        r"\beu (?:gosto|adoro|amo|curto|prefiro|odeio|detesto)\b",
        r"\b(?:gosto|adoro|amo|curto|prefiro|odeio|detesto) (?:de|muito|demais)\b",
        r"\bn[aã]o (?:gosto|curto|suporto|aguento)\b",
        r"\bmeu (?:favorito|predileto|preferido)\b",
        r"\bminha (?:favorita|predileta|preferida)\b",
        r"\bo que eu mais (?:gosto|curto|amo)\b",
    ],
    "project": [
        r"\barkhe\b",
        r"\beu (?:t[oô]u?|estou) (?:criando|construindo|fazendo|montando|desenvolvendo)\b",
        r"\bminha (?:plataforma|startup|empresa|ferramenta|stack)\b",
        r"\bmeu (?:projeto|produto|reposit[oó]rio|c[oó]digo|sistema|app)\b",
        r"\b(?:edital|licita[cç][aã]o|govtech|contrato p[uú]blico)\b",
    ],
    "relationship": [
        r"\bm(?:eu|inha) (?:primo|prima|irm[aã]o|irm[aã]|m[aã]e|pai|tia|tio|"
        r"av[oó]|av[oô]|sobrinh[oa]|amig[oa]|parceir[oa]|namorad[oa]|esposa|"
        r"marido|filh[oa])\b",
        r"\bm(?:eu|inha) (?:fam[ií]lia|galera|turma|time|s[oó]cio)\b",
    ],
    "belief": [
        r"\b(?:eu )?(?:acho|acredito|penso) que\b",
        r"\b(?:pra|para) mim,?\b",
        r"\bna minha (?:opini[aã]o|vis[aã]o|cabe[cç]a|experi[eê]ncia)\b",
        r"\beu (?:defendo|sustento|duvido)\b",
        r"\bo (?:ponto|problema|detalhe) (?:aqui )?[eé]\b",
    ],
    "practice": [
        r"\beu (?:sempre|nunca|todo dia|toda hora|geralmente|normalmente|"
        r"costumo|costumava)\b",
        r"\b(?:todo dia|todos os dias|toda (?:semana|noite|manh[aã])) eu\b",
        r"\bminha rotina\b",
        r"\beu fa[cç]o (?:isso|assim)\b",
    ],
    "skill": [
        r"\beu (?:sei|aprendi|manjo|domino|entendo de|j[aá] mexi com)\b",
        r"\bn[aã]o (?:sei|manjo|entendo) (?:de|nada de)\b",
        r"\beu consigo\b",
    ],
    "state": [
        r"\beu (?:t[oô]u?|estou) (?:\w+ndo|com|sem|numa|num|de)\b",
        r"\bt[oô] (?:\w+ndo|com|sem|numa|num)\b",
        r"\bmeu (?:plano|objetivo|foco) (?:agora|hoje)\b",
    ],
}

ATOM_RE = {k: [re.compile(p, re.I) for p in v] for k, v in ATOM_PATTERNS.items()}


# ---------------------------------------------------------------------------
# Topicos: vocabulario derivado das palavras de conteudo mais frequentes
# ---------------------------------------------------------------------------

TOPICS = {
    "arkhe_govtech": (
        r"arkhe", r"govtech", r"licita", r"contrato p", r"transpar", r"edital",
        r"prefeitura", r"governo", r"goi[aá]s", r"burocracia", r"startup",
        r"plataforma", r"proveni", r"auditor", r"fiduci", r"compliance", r"cnpj",
    ),
    "tech_dev": (
        r"c[oó]digo", r"\brust\b", r"python", r"javascript", r"\bapi\b",
        r"servidor", r"github", r"software", r"deploy", r"reposit", r"commit",
        r"terminal", r"linux", r"docker", r"banco de dados", r"framework",
        r"\bbug\b", r"\bpatch\b", r"\bmerge\b", r"compil",
    ),
    "ai_crypto": (
        r"\bia\b", r"\bllm\b", r"\bgpt\b", r"claude", r"machine learning",
        r"rede neural", r"blockchain", r"cripto", r"web3", r"\bnft\b", r"token",
        r"smart contract", r"carteira", r"bitcoin", r"ethereum", r"solana",
        r"\bnear\b", r"\bdao\b", r"prompt",
    ),
    "music": (
        r"m[uú]sica", r"musga", r"banda", r"[aá]lbum", r"disco", r"clipe",
        r"\bdj\b", r"\bbeat\b", r"vinil", r"\bshow\b", r"funk", r"\brock\b",
        r"samba", r"\bmpb\b", r"eletro", r"remix", r"playlist", r"spotify",
        r"guitarra", r"bateria", r"cantor", r"refr[aã]o", r"prince",
        r"\bjazz\b", r"\bsoul\b", r"\brap\b", r"\btrap\b",
    ),
    "games": (
        r"\bjogo\b", r"jogar", r"\bjoga\b", r"\bgame\b", r"speedrun", r"\bboss\b",
        r"\bfase\b", r"pokemon", r"zelda", r"mario", r"\bfps\b", r"\brpg\b",
        r"steam", r"console", r"emulador", r"gameplay", r"jogador",
    ),
    "film_tv": (
        r"filme", r"s[eé]rie", r"\bcena\b", r"roteiro", r"cinema", r"diretor",
        r"netflix", r"document[aá]rio", r"epis[oó]dio", r"\bator\b",
        r"atriz", r"audiovisual", r"temporada", r"trilha", r"\bcurta\b",
    ),
    "stream_culture": (
        r"\blive\b", r"\blives\b", r"twitch", r"streamer", r"\bchat\b", r"\bvod\b",
        r"\braid\b", r"\bsub\b", r"emote", r"\bcanal\b", r"inscrito",
        r"sorteio", r"youtube",
    ),
    "food": (
        r"comer", r"comida", r"caf[eé]", r"almo[cç]o", r"janta",
        r"chocolate", r"cerveja", r"\bp[aã]o\b", r"queijo", r"\bcarne\b",
        r"pizza", r"\bvina\b", r"lanche", r"a[cç]a[ií]", r"churrasco",
        r"cozinh", r"receita",
    ),
    "body_fitness": (
        r"treino", r"supino", r"academia", r"muscula", r"corrida", r"alongamento",
        r"agachamento", r"\bdieta\b", r"caminhada", r"halter", r"cardio",
        r"flex[aã]o", r"abdominal", r"postura",
    ),
    "money_work": (
        r"\bgrana\b", r"dinheiro", r"trampo", r"sal[aá]rio", r"cliente",
        r"freela", r"mercado", r"investimento", r"\bpre[cç]o\b",
        r"\bcusto\b", r"or[cç]amento", r"fatur", r"\bpix\b", r"\bconto\b",
    ),
    "politics_society": (
        r"pol[ií]tica", r"corrup", r"\bpovo\b", r"direito", r"\blei\b",
        r"imposto", r"elei[cç]", r"prefeito", r"deputado", r"p[uú]blic",
        r"sociedade", r"desigualdade", r"\bestado\b", r"sindicato", r"\bsus\b",
    ),
    "spirituality": (
        r"\bdeus\b", r"orix", r"umbanda", r"candombl", r"\bog[aã]\b",
        r"terreiro", r"espiritual", r"\bsigno\b", r"astrolog", r"taurino",
        r"ascendente", r"\bkarma\b", r"energia", r"mantra", r"ora[cç][aã]o",
        r"mapa astral", r"\bf[eé]\b",
    ),
    "psych": (
        r"terapia", r"\bmente\b", r"\bmedo\b", r"ansiedade", r"consci[eê]ncia",
        r"trauma", r"emo[cç][aã]o", r"sentimento", r"autoestima",
        r"\bh[aá]bito\b", r"\bfoco\b", r"burnout", r"depress", r"\bsurto\b",
        r"\bluto\b", r"psic",
    ),
    "family": (
        r"primo", r"prima", r"irm[aã]o", r"irm[aã]\b", r"\bm[aã]e\b",
        r"\bpai\b", r"\btia\b", r"\btio\b", r"\bav[oó]\b", r"sobrinh",
        r"fam[ií]lia", r"\bfilh[oa]\b", r"crian[cç]a",
    ),
    "places": (
        r"\brio\b", r"\brj\b", r"carioca", r"goi[aá]s", r"brasil",
        r"s[aã]o paulo", r"\bsp\b", r"minas", r"nordeste", r"\bbairro\b",
        r"\bcidade\b", r"praia", r"\bfavela\b", r"\bmorro\b", r"interior",
    ),
}

TOPIC_RE = {k: re.compile("|".join(v), re.I) for k, v in TOPICS.items()}


# ---------------------------------------------------------------------------
# Camada sensivel
# ---------------------------------------------------------------------------
# Regra: a linha vai pra camada restrita quando bate numa categoria sensivel
# E e auto-relato de primeira pessoa. Mencao generica fica no tier publico.
# Isso evita esvaziar a memoria por excesso de filtro.

SENSITIVE = {
    "finance_private": (
        r"\bd[ií]vida", r"\bdevendo\b", r"\bcalote\b", r"\bfalido\b",
        r"\bquebrei\b", r"sal[aá]rio", r"\bboleto\b", r"cart[aã]o de cr[eé]dito",
        r"\bempr[eé]stimo\b", r"\bnegativado\b", r"\bserasa\b", r"R\$",
        r"\b\d+\s?(?:k|mil|conto|contos|pila|reais)\b", r"\bpenhora", r"\bjuros\b",
    ),
    "legal": (
        r"processo", r"advogad", r"\bjusti[cç]a\b", r"intima[cç]",
        r"\bju[ií]z", r"audi[eê]ncia", r"\bgolpe\b", r"\broubou\b",
        r"\broubaram\b", r"estelionato", r"\bdelegacia\b", r"\bden[uú]ncia\b",
        r"\bliminar\b",
    ),
    "health": (
        r"\brem[eé]dio", r"\bm[eé]dic", r"\bexame\b", r"diagn[oó]stico",
        r"internad", r"\blaudo\b", r"\btdah\b", r"\bsurto\b", r"\bp[aâ]nico\b",
        r"depress", r"ansiedade", r"\bterapia\b", r"psiquiatr", r"psic[oó]log",
        r"\bcirurgia\b", r"\bdoen[cç]a\b", r"anestesia", r"\bluto\b",
        r"\bmorreu\b", r"suic[ií]d", r"ins[oô]nia", r"\bcr[oô]nic",
    ),
    "substances": (
        r"\bchapad", r"maconha", r"\bthc\b", r"\bbeck\b", r"\berva\b", r"\blsd\b",
        r"cogumelo", r"\bb[eê]bado\b", r"bebedeira", r"cocain", r"\bcrack\b",
        r"bad trip", r"canabi", r"\bfumar\b",
    ),
    "intimate": (
        r"\bsexo\b", r"transar", r"\bnamorad", r"\bpelad", r"\bnudes\b",
        r"\bcrush\b", r"\bficante\b", r"divorci", r"\bseparei\b", r"\btra[ií]",
        r"\bvirgem\b",
    ),
    "family_conflict": (
        r"briguei", r"\bbriga\b", r"\bexpulso\b", r"expulsaram", r"abandon",
        r"n[aã]o falo com", r"cortei rela", r"sequestrad", r"maltrat",
        r"\bviol[eê]ncia\b",
    ),
    "identifiers": (
        r"\bcpf\b", r"\brg\b", r"\bcnh\b", r"\bendere[cç]o\b", r"\bcep\b",
        r"conta banc", r"\btelefone\b", r"\bwhats\b",
    ),
}

SENSITIVE_RE = {k: re.compile("|".join(v), re.I) for k, v in SENSITIVE.items()}


# ---------------------------------------------------------------------------
# Movimentos de raciocinio: como ele argumenta
# ---------------------------------------------------------------------------

REASONING_MOVES = {
    "conditionalize": (
        r"\bdepende\b|\bvai depender\b|\bdepender[aá]\b",
        "recusa a resposta unica e condiciona ao contexto",
    ),
    "hedge_epistemic": (
        r"\b(?:parece|deve ser|deve ter|dev[ei]a ser|capaz que|ser[aá] que|"
        r"talvez|acho que|imagino que|suponho|pelo que entendi)\b",
        "afirma com modalidade explicita em vez de certeza",
    ),
    "self_correct": (
        r"\bna verdade\b|\bmentira\b|\bcorrigindo\b|\bou melhor\b|\bpensando bem\b",
        "revisa a propria afirmacao no mesmo turno",
    ),
    "scope_limit": (
        r"\bpelo menos\b|\bno m[ií]nimo\b|\bem parte\b|\bem certo sentido\b|"
        r"\bat[eé] certo ponto\b",
        "delimita o alcance da afirmacao",
    ),
    "thesis_frame": (
        r"\bo (?:ponto|problema|detalhe|caso|neg[oó]cio) [eé]\b|"
        r"\ba (?:quest[aã]o|parada|ideia) [eé]\b|\bresumindo\b",
        "nomeia a tese antes de defender",
    ),
    "concede": (
        r"\bs[oó] que\b|\bpor outro lado\b|\bem contrapartida\b|\bagora,\b",
        "concede o contra antes de seguir",
    ),
    "analogize": (
        r"\b[eé] tipo\b|\b[eé] como\b|\bque nem\b|"
        r"\bmesma (?:coisa|brisa|l[oó]gica)\b|\bna mesma linha\b",
        "explica por analogia em vez de definicao",
    ),
    "causal": (
        r"\b(?:porque|pq|por causa de|j[aá] que|uma vez que)\b",
        "encadeia causa explicita",
    ),
    "conditional": (
        r"\bse\b.{0,60}\b(?:ent[aã]o|a[ií]|fica|vira|d[aá])\b",
        "raciocina por hipotese",
    ),
    "plausibility": (
        r"\bfaz sentido\b|\bn[aã]o faz sentido\b|\bconfere\b|\bbate com\b",
        "testa coerencia antes de aceitar",
    ),
    "practical_turn": (
        r"\bna pr[aá]tica\b|\bno fim\b|\bno final das contas\b|\bna real\b|"
        r"\bo que importa\b",
        "puxa a discussao pro efeito concreto",
    ),
    "quantify": (
        r"\b\d+\s?(?:%|por cento|x\b|vezes)\b|\bordem de\b|\bm[eé]dia\b",
        "ancora em numero",
    ),
    "evidence_call": (
        r"\bfonte\b|\bprova\b|\bevid[eê]ncia\b|\btem (?:estudo|dado|pesquisa)\b|"
        r"\bsegundo o\b",
        "pede ou cita evidencia",
    ),
    "steelman": (
        r"\bo lado dele\b|\bpor outro [aâ]ngulo\b|\bentendo quem\b|"
        r"\bd[aá] pra ver por\b",
        "reconstroi o argumento alheio antes de responder",
    ),
    "refuse_certainty": (
        r"\bn[aã]o sei\b|\bn[aã]o tenho certeza\b|\bn[aã]o manjo\b|"
        r"\bn[aã]o domino\b|\bchuto\b",
        "declara ignorancia em vez de inventar",
    ),
}

REASONING_RE = {k: re.compile(v[0], re.I) for k, v in REASONING_MOVES.items()}


# ---------------------------------------------------------------------------
# Voz: idioleto medido
# ---------------------------------------------------------------------------

VOICE_MARKERS = {
    "risada": {
        "kkk": r"\bk{3,}\b",
        "kk": r"\bkk\b",
        "hue": r"\b(?:hue){2,}\b",
        "rs": r"\b(?:rs){2,}\b",
    },
    "interjeicao": {
        "oxe": r"\boxe\b",
        "ue": r"\bu[eé]\b",
        "mds": r"\bmds\b",
        "eita": r"\beita\b",
        "caraio": r"\bcara[ií]?o\b",
        "caralho": r"\bcaralho\b",
        "porra": r"\bporra\b",
        "pqp": r"\bpqp\b",
        "misericordia": r"\bmiseric[oó]rdia\b",
        "nahralho": r"\bnahralho\b",
        "olooco": r"\bolo+co\b",
        "aff": r"\baff+\b",
        "uai": r"\buai\b",
        "vixe": r"\bvixe\b",
    },
    "afirmacao": {
        "tmj": r"\btmj\b",
        "podexa": r"\bpodex[aá]\b",
        "salve": r"\bsa+[lo]ve\b",
        "bora": r"\bbora\b",
        "vamo": r"\bvamo\b",
        "tamo": r"\btamo\b",
        "deboas": r"\bde ?boas\b",
        "suave": r"\bsuave\b",
        "firmeza": r"\bfirmeza\b",
        "beleza": r"\bbeleza\b",
        "tranquilo": r"\btranquilo\b",
        "siim": r"\bsii+m\b",
    },
    "intensificador": {
        "demais": r"\bdemais\b",
        "brabo": r"\bbrab[oa]\b",
        "foda": r"\bfoda\b",
        "pedrada": r"\bpedrada\b",
        "daora": r"\bdaora\b",
        "super": r"\bsuper\b",
        "mo": r"\bm[oó]\b",
        "monstro": r"\bmonstr[oa]\b",
    },
    "vocativo": {
        "gente": r"\bgente\b",
        "cara": r"\bcara\b",
        "galera": r"\bgalera\b",
        "mano": r"\bmano\b",
        "rapaz": r"\brapaz\b",
        "chat": r"\bchat\b",
        "povo": r"\bpovo\b",
    },
    "substantivo_girio": {
        "trem": r"\btrem\b",
        "trens": r"\btrens\b",
        "brisa": r"\bbris[ao]\b",
        "parada": r"\bparada\b",
        "lance": r"\blance\b",
        "role": r"\brol[eê]\b",
        "papo": r"\bpapo\b",
        "bosta": r"\bbosta\b",
        "merda": r"\bmerda\b",
        "trampo": r"\btrampo\b",
        "grana": r"\bgrana\b",
        "mina": r"\bmina\b",
        "musga": r"\bmusga\b",
        "conto": r"\bconto\b",
        "treta": r"\btreta\b",
    },
    "saudacao": {
        "bodia": r"\bbo+ ?dia\b",
        "boa_noite": r"\bboa noite\b",
    },
    "reducao": {
        "memo": r"\bmemo\b",
        "tava": r"\btava\b",
        "to": r"\bt[oô]\b",
        "num": r"\bnum\b",
        "ne": r"\bn[eé]\b",
        "pra": r"\bpra\b",
        "pro": r"\bpro\b",
        "tbm": r"\btbm?\b",
        "pq": r"\bpq\b",
        "vc": r"\bvc\b",
        "ta": r"\bt[aá]\b",
    },
}

VOICE_RE = {
    cat: {name: re.compile(rx, re.I) for name, rx in group.items()}
    for cat, group in VOICE_MARKERS.items()
}

# Alongamento vocalico (saaalve, siiim, olooco) e diminutivo afetivo.
ELONGATION = re.compile(r"([aeiouAEIOU])\1{2,}")
DIMINUTIVE = re.compile(r"\w{3,}(?:inho|inha|zinho|zinha)\b", re.I)

WORD = re.compile(r"[0-9A-Za-zÀ-ÿ']+")


# ---------------------------------------------------------------------------
# Stopwords pt-BR para contagem de palavras de conteudo
# ---------------------------------------------------------------------------

STOPWORDS = set(
    """a o as os um uma uns umas de do da dos das em no na nos nas por pro pra para com sem sob sobre
    e ou mas que se como quando onde quem qual quais porque porem porem entao entao ja ja nao nao sim ta ta
    to to eu tu ele ela nos nos vos eles elas me te se lhe lhes meu minha meus minhas teu tua seu sua seus
    suas nosso nossa isso isto aquilo esse essa este esta aquele aquela ai ai la la aqui ali tem ter tinha
    tenho teve ser sou era eh e foi sendo estar esta esta estou estava ficar fica ficou vai vou vamos ir indo
    muito mais menos pouco tudo todo toda todos todas nada nenhum algum alguns alguma coisa coisas
    ne ne so so ate ate depois antes agora hoje ontem amanha amanha sempre nunca talvez tipo mesmo
    bem mal bom boa melhor pior grande pequeno novo nova velho ver vi vendo fazer faz fez feito faco
    dar dou deu dando diz disse dizer falar fala falou pode podia posso poder quer quero queria
    acho achei acha sei sabe sabia saber dai dai pq pqp vc vcs voce voce tbm tb tambem tambem
    eram seria serem foram fosse fossem haver havia tinham
    numa num pelo pela pelos pelas dele dela deles delas nisso disso nesse nessa desse dessa
    assim ainda entre contra desde cada outro outra outros outras qualquer
    kkkk kkkkk kkkkkk kkk https http www com br""".split()
)


# ---------------------------------------------------------------------------
# Proveniencia da linha: registro em que ela foi dita
# ---------------------------------------------------------------------------
# O corpus mistura quatro registros que NAO podem ser lidos como auto-relato:
#   action_bit : /me do Twitch (\x01ACTION ... \x01). Ele usa pra fazer piada
#                em terceira pessoa, inventar personagem, imitar locutor.
#                Material de personalidade otimo, fato biografico pessimo.
#   cheer      : mensagem com bits (Cheer30 ...), muitas vezes copypasta.
#   quoted     : a linha e majoritariamente citacao entre aspas.
#   reply      : resposta com mencao no inicio ('@nick ...). E dele; a mencao
#                sai do claim e vira metadado.

# O export do corpus escapou o byte 0x01 como o TEXTO literal "\x01" (quatro
# caracteres). Aceitamos as duas formas pra nao depender do exportador.
ACTION_WRAP = re.compile(
    r"^(?:\x01|\\x01)ACTION\s*(.*?)\s*(?:\x01|\\x01)?$", re.S
)
CHEER_PREFIX = re.compile(r"^((?:Cheer|uni|Kappa|Party|Corgo|Doodle)\d+\s+)+", re.I)
REPLY_PREFIX = re.compile(r"^[\u0027\u2019]?@([A-Za-z0-9_]{2,25})[,:]?\s+")
QUOTED_SPAN = re.compile(r"[\u0022\u201c\u201d][^\u0022\u201c\u201d]{8,}[\u0022\u201c\u201d]")


def provenance(text):
    """Devolve (claim_limpo, flags). flags inclui 'register' e 'reply_to'."""
    flags = {"register": "plain", "reply_to": None, "cheer": False, "quoted": False}
    s = text

    m = ACTION_WRAP.match(s)
    if m:
        flags["register"] = "action_bit"
        s = m.group(1)

    m = CHEER_PREFIX.match(s)
    if m:
        flags["cheer"] = True
        s = s[m.end():]

    m = REPLY_PREFIX.match(s)
    if m:
        flags["reply_to"] = m.group(1)
        if flags["register"] == "plain":
            flags["register"] = "reply"
        s = s[m.end():]

    quoted_chars = sum(len(x) for x in QUOTED_SPAN.findall(s))
    if s and quoted_chars / len(s) >= 0.5:
        flags["quoted"] = True

    return s.strip(), flags


# ---------------------------------------------------------------------------
# Deteccao de texto colado de fora
# ---------------------------------------------------------------------------
# O corpus tem colagens: materia de jornal, blurb de VC em ingles, resposta
# de LLM, copypasta de chat. Nenhuma delas e afirmacao dele, mas todas passam
# pelos filtros de primeira pessoa quando contem um "eu" qualquer.
#
# Base empirica (passagem sobre as 278.854 linhas de sinal): 62% das linhas
# nao tem nenhum marcador de idioleto, entao voice_score==0 sozinho nao
# filtra nada. Mas por faixa de comprimento:
#     curta  (<100 ch): 63% com voice_score 0
#     media  (100-180): 40%
#     longa  (>=180)  : 81%   <- aqui o sinal e forte
# Linha longa sem UM marcador de idioleto nao e ele escrevendo.

PASTED_REGISTER = re.compile(
    r"\b(?:segundo (?:o|a|os|as|dados)|de acordo com|ao portal|em entrevista|"
    r"publicad[oa] n[ao]|revelou que|afirmou que|declarou que|informou que|"
    r"reportagem|comunicado oficial|nota oficial|press release|"
    r"termos de servi[c\u00e7]o|pol[i\u00ed]tica de privacidade|viola os|"
    r"como modelo de linguagem|n[a\u00e3]o posso ajudar com|"
    r"segundo especialistas|pesquisadores d[ao])\b",
    re.I,
)

EN_FUNCTION = re.compile(
    r"\b(?:the|of|and|for|with|is|are|that|this|from|will|would|have|has|"
    r"our|your|their|about|which|been|were|they|there|more|than|into|"
    r"to|an|be|can|what|when|while|should|could|these|those|them|its)\b",
    re.I,
)
PT_FUNCTION = re.compile(
    r"\b(?:que|n[a\u00e3]o|com|uma|para|pra|mas|como|mais|j[a\u00e1]|ent[a\u00e3]o|"
    r"porque|pq|tamb[e\u00e9]m|sobre|quando|muito|ainda|at[e\u00e9]|isso|"
    r"tem|ser|est[a\u00e1]|foi|vai|\u00e9)\b",
    re.I,
)


def voice_score(line):
    """Quantos marcadores distintos de idioleto a linha carrega."""
    n = 0
    for group in VOICE_RE.values():
        for rx in group.values():
            if rx.search(line):
                n += 1
    return n


def english_heavy(line):
    en = len(EN_FUNCTION.findall(line))
    pt = len(PT_FUNCTION.findall(line))
    return en >= 3 and en > pt * 2


# ---------------------------------------------------------------------------
# Tokenizador canonico do indice
# ---------------------------------------------------------------------------
# Tem de ser O MESMO na construcao do indice (atoms.py) e na consulta
# (loader/corvo_memory.py), senao "contratos publicos" nunca casa com
# "contrato publico" -- que foi exatamente o que aconteceu na primeira versao.
#
# Faz duas coisas e nada mais: tira diacritico e desfaz plural. Nao e stemmer
# de verdade; nao reduz radical verbal. Suficiente pro portugues de chat,
# onde o que mais atrapalha e acento e plural.

import unicodedata as _ud

_PLURAL_RULES = (
    ("oes", "ao", 5),   # transmissoes -> transmissao
    ("aes", "ao", 5),   # capitaes -> capitao
    ("ais", "al", 4),   # nacionais -> nacional
    ("eis", "el", 4),   # papeis -> papel
    ("ns", "m", 4),     # homens -> homem
)


def strip_accents(s):
    return "".join(
        c for c in _ud.normalize("NFKD", s) if not _ud.combining(c)
    )


def norm_token(w):
    w = strip_accents(w.lower())
    for suf, rep, minlen in _PLURAL_RULES:
        if len(w) > minlen and w.endswith(suf):
            return w[: -len(suf)] + rep
    if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


_STOP_NORM = {strip_accents(w) for w in STOPWORDS}


def index_tokens(text, minlen=4):
    """Tokens canonicos pra indexacao e consulta."""
    out = []
    for w in WORD.findall(text.lower()):
        if len(w) < minlen:
            continue
        t = norm_token(w)
        if len(t) < 3 or t in _STOP_NORM or t in STOPWORDS:
            continue
        out.append(t)
    return out
