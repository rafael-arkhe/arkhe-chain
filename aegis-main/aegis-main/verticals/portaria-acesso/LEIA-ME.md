# Controlo de acesso por LPR — o vertical que está no campo

> 🔴 Este ficheiro é a **explicação**; o `vertical.yaml` ao lado é o **dado**.
> A separação é deliberada: o manifesto é gerado, e um YAML que vai e volta
> por uma estrutura perde comentários a cada gravação. A explicação vive aqui
> para não ser perdida.

Este é o produto que a guarita usa. Nasceu de uma seed de **1.015 linhas de
Python** (`seed_portaria_acesso.py`, no núcleo anterior) e aqui é um manifesto
de **158 linhas**. É a mesma porta de cliente, descrita como dado.

## O que este vertical descreve

- **Cadastro** — `pessoa`, `unidade`, `local`, `dispositivo`. Quem entra, onde
  mora, e o que tem consigo.
- **Acesso** — o `evento` de leitura de uma placa, e a `matricula` que o liga a
  uma pessoa e a uma unidade.
- **A câmara** — a `camera` de demonstração, e o `dispositivo` que publica o
  fluxo.

As páginas são quatro, e cada uma tem o seu intervalo de atualização — que é a
metade do que faz uma tela de guarita ser *ao vivo*:

| Página | Frequência | Para que |
|---|---|---|
| `ao-vivo` | 15 s | o que está a entrar agora |
| `acessos` | 30 s | o histórico da última hora |
| `veiculos` | 60 s | quem tem queircular |
| `cadastro` | 120 s | o registo, que muda pouco |

🔴 **`refresh_segundos: 0` é recusado.** Zero não é "sem refresh" — é um pedido
de atualização a cada zero segundos, e uma página que pede isso nunca mais
responde. A seed antiga tinha `refresh_seconds: 15` e o formato de página **não
tinha campo para isso**; a tela da guarita ia deixar de ser ao vivo sem ninguém
dar por isso, e a única pista seria um operador a dizer que a tela parou de
atualizar.

## As três coisas que a conversão encontrou

**Metade da seed era conhecimento de outros produtos.** Ela apagava as páginas
do vertical anterior e, para saber o que tinha de apagar, **importava as seeds
dos outros**. O comentário do próprio código diz *"deriving beats listing"* — e
a derivação **era** o import. Um produto que lê o código de outro deixa de ser
um produto e passa a ser um grafo de dependências: trocar a ordem de instalação
muda o resultado, e ninguém descobre até a tela abrir errada.

A cura é responder à pergunta certa — **de quem é a culpa?** Não é do produto
novo: é da **instalação**. Os tipos que o manifesto declara são seus, e todo o
resto pertence a quem saiu (`repo.aposar_tipos_de_aposado`). O produto nunca
menciona o anterior, nem pelo nome.

**Havia um tenant por produto, e eles conviviam.** Na troca medida — esta
portaria instalada, a hotelaria por cima — os tipos do produto anterior
ficaram na ilha ao lado dos do novo. É literalmente o bug que a docstring da
seed descreve: *"o cliente abriria o produto da contagem dentro da guarita"*.
Agora há **um tenant só** (`TENANT_DA_ILHA`) e o produto vive na coluna
`vertical` dele.

**A licença não é a do produto.** A licença da hotelaria **não** instala a
portaria — mesma máquina, mesmo parceiro, mesma Chave OEM — e a recusa diz
`licenca.seed-uso`, que é o motivo certo.

## O que este vertical ainda NÃO prova

Escrito para não se fingir: os dois verticais são de **demonstração**. Nada disto
diz que um carregamento de dados de campo sobrevive a uma migração, nem que a
licença que o parceiro emissor real emite se comporta como a de teste. São os
tijolos seguintes.

## Como se usa

```sh
aegis vertical ver verticals/portaria-acesso     # o manifesto, em JSON
aegis ilha instalar --vertical verticals/portaria-acesso \
  --licenca <desta máquina> --chave-oem <do parceiro>
```

E o `vertical.yaml` **não se edita à mão**: muda-se pelo Construtor, que
regenera o manifesto a partir do que foi montado. O que muda à mão perde-se no
guardado seguinte — sem erro, sem aviso.
