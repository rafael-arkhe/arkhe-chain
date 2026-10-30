# AEGIS Console

> **Isto é um fork do [OpenMausBot](https://github.com/milind-soni/OpenMausBot),
> sob Apache-2.0. Não é um fork com que se pode fazer o que se quiser com as
> mãos atrás das costas — ver `LICENCA-ESTE-FORK.md`.**

O que a Safe Core mudou em cima do upstream, e **porque** cada coisa.

---

## O que este fork é

O **console** do AEGIS: a janela de chat por onde o integrador fala com a
ilha dele. O que o console **não** tem: regra de produto.

Toda a autoridade está no binário `aegis`, em Rust, e o console fala com ele
por **MCP** em stdio. O que muda o console é a **marca** e a **configuração** —
e nada mais, porque:

> **Se tem invariante AEGIS dentro, é teu. O resto é adopting.**

| peça | dono | licença |
|---|---|---|
| console (chat, approvals, painel de computador) | este fork | Apache-2.0 |
| motor (agente, ferramentas, permissões) | **opencode** (MIT) | configuração |
| mãos (tela, teclado, janela) | **cua-driver** (MIT) | configuração |
| autoridade (recusa, licença, diário) | **`aegis`** | código |

🔴 **O `enterprise/` foi apagado.** É a pasta *source-available* do upstream
(A `OpenMausBot Enterprise License`, não Apache), e o próprio `LICENSING.md`
deles diz que *"hosting it for third parties or white-labelling the product
needs a partner agreement"* e que *"delete the folder and what remains is the
open-source edition"*. Uma forked sem ele é a edição de código aberto — que é
o que se quer.

🔴 **O nome e a marca não são nossos.** `MAUS`, `SupaMaus` e o mascote são
registos do autor, e a Apache-2.0 (§6) **não** dá direitos de marca. Por isso
o que se vê no ecrã é AEGIS, e o `NOTICE` fica aqui intacto.

---

## A configuração que é **dado**, e que o fork consome

Nada disto é código do produto. É o que a casa chama *"um vertical é dado,
nunca código"* — a mesma regra, noutro sítio.

| ficheiro | o que é | quem o lê |
|---|---|---|
| `equipa/AEGIS.md` | o **team**: quem é cada bot, o que sabe fazer, o que **não** faz | o `opencode` |
| `equipa/skills/**/SKILL.md` | as skills, uma por assunto | o `opencode` |
| `equipa/mcp.json` | o registo do `aegis mcp` e as suas permissões | o `opencode` |
| `equipa/engine.json` | o motor: binário, `cwd`, provider | o fork |
| `equipa/PATCHES-AEGIS.md` | a lista do que este fork mexeu no upstream | nós |

🔴 **O motor é configuração, não código.** O `opencode` fala ACP em stdio
(`opencode acp`) e o upstream diz que *"any ACP-speaking CLI or
OpenAI-compatible endpoint plugs in through config"*. Trocar de motor é
mudar um ficheiro — e é por isso que `aegis` não ganhou um driver no fork.

---

## O orçamento de divergência

🔴 **Este fork deixa de sincronizar com o upstream quando deixa de ser
sincronizável.** E a única forma de saber isso é **medir**, e não sentir.

```
ferramentas/divergencia.sh          # quanto nos afastámos do upstream
ferramentas/divergencia.sh --ci    # falha acima do orçamento
```

| | |
|---|---|
| tag de origem | `upstream/863f94c` (ver `equipa/PATCHES-AEGIS.md`) |
| orçamento | **12 ficheiros** e **400 linhas** |
| o que conta | ficheiros **rastreados** que diferem da tag, e o `diff --numstat` |

Passar o orçamento **não** é um aviso: é a decisão de que o fork passou a ser
nosso, e a de deixar de fingir que sincroniza.

---

## Regras que este fork não pode quebrar

1. 🔴 **Nenhuma regra de produto em TypeScript.** Tudo o que decide é Rust, no
   `aegis`, e vem por MCP. Um `.ts` que diga *"se a licença não confere,
   recusa"* é a segunda tradução — e a casa mediu que a segunda tradução
   diverge no primeiro caso de borda.
2. 🔴 **A recusa tem `codigo`, frase e `gesto`.** Um `isError: true` sem gesto
   obriga o modelo a inventar o que fazer a seguir, e o modelo inventa mal.
3. 🔴 **`AGPL` não entra.** A extensão de percepção do `cua-driver` (OmniParser)
   é AGPL-3.0. O driver é MIT e entra; a percepção não.
4. 🔴 **O nome de um terceiro não aparece ao operador.** O motor chama-se
   **AIP** na cara de quem o vê — a regra do `CLAUDE.md` da casa, e a mesma
   que `modelLabels.ts` já cumpre no frontend.

---

## O que este fork **não** faz

- 🔴 **Não decide.** Nem licença, nem vertical, nem recusa. Fala com o `aegis`
  e mostra o que ele disse.
- 🔴 **Não é o DAG.** O fork dá o *agent manager* e o *chat*; o grafo é
  tijolo 6 e é separado (ver o plano).
- 🔴 **Não substitui o overlay acoplado ainda.** A garantia está em
  `PATCHES-AEGIS.md` e a decisão é do dono, com medição no cliente.
