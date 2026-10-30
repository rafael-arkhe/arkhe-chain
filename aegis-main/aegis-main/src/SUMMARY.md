# Sumário

> 🔴 **Este livro não tem páginas próprias.** Cada capítulo é um `{{#include}}`
> de um ficheiro que **já está no repo** — o `README.md`, a referência gerada,
> os `LEIA-ME.md` ao lado dos artefactos, o `CLAUDE.md` das regras. É esse o
> ponto: o livro não é uma segunda cópia da documentação, é um **índice** dela.
> Uma cópia diverge; um índice não pode.
>
> E o `{{#include}}` **falha o build** se o ficheiro não existir — o que é
> exactamente o que se quer de uma referência: um livro com um capítulo em
> branco e sem erro é pior do que nenhum, porque parece completo.

# O produto

- [AEGIS](intro.md)
- [A referência do produto](referencia.md)
- [As regras, para quem vai mexer](claude.md)

# Os produtos de cliente

Cada um é **uma pasta** em `verticals/`, e a explicação vive ao lado do que ela
descreve — porque o `vertical.yaml` é um artefacto **gerado**, e a perda de
comentários a cada gravação tem de ser uma coisa esperada e não um estrago.

- [Hotelaria](hotelaria.md)
- [Controlo de acesso por LPR](portaria-acesso.md)
