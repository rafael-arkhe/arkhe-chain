# Ler uma recusa

> Uma recusa **não** é uma falha. É o produto a responder, e a resposta tem
> forma. Esta é a forma.

---

## A forma

```
codigo:  pronto.seed-desatualizado
frase:   O conteúdo declarado pelo vertical ainda não foi aplicado.
gesto:   Aplicar o vertical
```

🔴 **O `gesto` é o que se diz ao operador.** Não é a tua ideia do que
resolveria, não é um resumo, não é *"tenta outra vez"*. É a ação que o produto
escreveu — e a casa já pagou por uma recusa que mandava o operador procurar um
gesto que não resolvia o problema dele.

Os três campos andam **juntos**. Uma recusa sem `gesto` é um defeito do
produto — e nesse caso diz-se isso; não se inventa o gesto.

---

## Casos que se confundem

### *"A ferramenta devolveu erro"* não é *"o produto recusou"*

O `saida: 3` é **não posso**: o pedido era legítimo e quem não pode soube
dizer porquê. O `saida: 1` é **não consegui**: o pedido era legítimo e foi o
ambiente que falhou. 🔴 A diferença muda a ação — e uma delas não se resolve a
repetir o pedido.

| | o que significa | o que se faz |
|---|---|---|
| `3` | não posso | lê-se o `gesto` e **obedece-se** |
| `1` | não consegui | o caminho é ambiente: serviço, rede, disco |

### *"A ilha não está pronta"* não é *"a ferramenta está errada"*

`ilha_saude` **recusa** quando a ilha ainda não está no estado que o pedido
exige — e a recusa traz o **motivo**: banco a fora, tenant inativo, seed
desatualizada, verificação por passar.

🔴 E a conferência (`diagnostico`) é o contrário: ela **não recusa** por a ilha
estar mal, porque **é para isso que existe**. Uma ferramenta que só pode ser
chamada quando não há nada a explicar é inútil no único momento em que há.

### *"A página não tem essa variável"* é sempre um **dado** que falta

`pagina.variavel-pendente` significa que a página usa uma variável que não
existe. O conserto é dar-lhe um nome próprio **naquela página** — não é criar
uma ferramenta nova, nem "corrigir" a página por fora. E a página é montada
pela ferramenta de montagem, que é a **única** via de escrita.

---

## O que **não** se faz

- 🔴 Não traduzir o `codigo` por palavras tuas e apresentá-las como se fossem
  do produto. A frase do produto é a frase do produto.
- 🔴 Não inventar um `codigo` que não esteja na lista. Se chegou um que não
  conheces, **diz que não reconheces** — isso é um defeito a investigar, não uma
  variante nova.
- 🔴 Não repetir o pedido a tentar "sair pelo lado" depois de um `3`.
- 🔴 Não tratar `licenca.*` como um problema técnico. É o portão, e o portão
  não se contorna.
