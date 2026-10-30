# O que o agente precisa de saber para operar o AEGIS

> Isto **não** é o manual do produto. O manual é `docs/REFERENCIA.md`, que é
> **gerado do código** e verificado na build — se este ficheiro e ele
> discordarem, **ele ganha**, e a discordância é um defeito deste ficheiro.
>
> Aqui fica só o que não se deduz de uma lista de comandos: **quem decide o quê**,
> **como se lê uma recusa**, e **o que nunca se faz**.

---

## 1. As três camadas, e só uma decide

| camada | o que é | o que ela decide |
|---|---|---|
| **`aegis mcp`** | a autoridade | **tudo.** É o único que sabe a licença, a política e o que a ilha aceita |
| **CUA** | a mão | nada. Move o rato e as teclas; não julga |
| **console** | a casca | nada sobre o produto. Responde ao pedido de permissão com um cartão que o humano lê |

Tu falas com a **autoridade** pelas ferramentas. A mão é de quem lê o ecrã.

🔴 **Se uma resposta te parece errada, ela não fica errada por tua leitura.**
O código de recusa é um **código fechado**: o mesmo motivo dá sempre o mesmo
código, e o mesmo código dá sempre a mesma frase e o mesmo gesto. Tu não tens
a terceira tradução para fazer — se a fizesses, estarías a dizer ao operador
uma coisa que o produto não disse.

---

## 2. Como se lê uma recusa

Toda a recusa traz **três** coisas, e as três são contrato:

- **`codigo`** — o identificador fechado. É por ele que a tela traduz.
- **`frase`** — o que o produto diz, em português, para o operador.
- **`gesto`** — o que o operador pode fazer a seguir.

O `gesto` **não é opcional** e não é enfeite. Houve uma recusa que mandava
*"renovar a licença"* para um gesto que não existia — e o operador foi procurar
uma renovação que não resolvia o problema dele.

**Regra dura:** se a ferramenta devolveu `codigo`, o que se diz ao operador é a
`frase` e o `gesto` **tal como vieram**. Não trocar por palavras tuas, não
resumir, não melhorar. Um `codigo` que **não** reconheças **não** existe — e
isso é um defeito do produto, não um código novo: **diz que não reconheces** e
não inventes.

Os motivos estão todos em `docs/REFERENCIA.md`, e são **cinco famílias**:
`licenca.*`, `pronto.*`, `pagina.*`, `montagem.*`, `ponte.*`.

---

## 3. O portão

Sem licença válida, o `aegis mcp` **não arranca**. Não é uma ferramenta que
falha: é o processo que não existe.

🔴 **Não contornes, não reintentes, não procures outro caminho.** Uma
licença vencida ou ausente não é um obstáculo técnico, é a resposta certa. Pedir
licença ao parceiro é o `gesto`, e é o único.

---

## 4. A lista de ferramentas é fechada

O que este servidor sabe fazer está no `tools/list`, e a lista sai **da mesma
tabela** que despacha. 🔴 **Não inventes nomes de ferramentas** e não adivinhes
parâmetros: se a ferramenta não está na lista, ela não existe. Para a ver sem
arrancar nada: `aegis mcp --lista`.

---

## 5. O que nunca se faz

1. 🔴 **Não decidas política.** Não perguntes *"devo abrir o portão?"* — pergunta
   à ferramenta, e obedece ao `gesto`. A regra que diz se o portão abre está
   escrita no produto, em forma de código fechado, e não na tua cabeça.
2. 🔴 **Não escrevas na ilha por fora das ferramentas.** A ferramenta de página
   chama a **única** via de escrita que existe, e é a que regenera o
   `vertical.yaml`. Editar o `vertical.yaml` à mão é perder o registo do que o
   produto aceita — e o próximo `cargo test` reprova a página inteira.
3. 🔴 **Não toques em Cameras pela via do sistema.** Câmaras são operação do
   produto: listar, acrescentar e remover pelas ferramentas. Um ficheiro de
   configuração de câmara editado por fora é configuração que o produto não
   conhece.
4. 🔴 **Não repitas um pedido que deu `saida: 3`.** O `3` é *não posso*, e a
   diferença entre *não posso* e *não consegui* é a diferença entre uma ação e
   um erro. O `1` é *não consegui* — e aí o caminho é outro.
5. 🔴 **Não uses o nome de um vertical.** O produto que este servidor serve
   está **declarado** — e um agente que o escreve no código transforma um dado
   em código, e um dado que virou código deixa de ser dado.

---

## 6. Onde está a verdade

| pergunta | onde se responde |
|---|---|
| o que este produto é | `vertical_manifesto` — e o manifesto é **dado**, não código |
| o que a ilha tem | `ilha_tipos`, `ilha_pagina`, `ilha_vertical` |
| se a ilha está pronta | `ilha_saude` — e ela **recusa** quando não está |
| porque é que uma recusa-recusa | `diagnostico` — que é a conferência, e a conferência **não** recusa por a ilha estar mal: é para isso que existe |
| a lista de tudo o que o produto recusa | `docs/REFERENCIA.md`, gerada do código |

🔴 **A conferência não é o gate.** `/health` também não é. Se a Ilha não está
pronta, isso é uma **resposta com motivo**, não um erro genérico — e a diferença
entre os dois é a diferença entre "a ferramenta está errada" e "o produto ainda
não foi aplicado".
