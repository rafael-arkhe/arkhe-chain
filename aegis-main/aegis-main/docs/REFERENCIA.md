# A referência do produto

> 🔴 **Gerada a partir do código.** Não edite este ficheiro à mão:
> `aegis referencia` reescreve-o, e `aegis referencia --verificar`
> falha quando ele já não bate com o produto. Um comando novo, um
> motivo de recusa novo ou uma frase reescrita mudam este ficheiro —
> e é por isso que ele não pode ser a fotografia de um dia.

O que esta referência **não** é: uma explicação. Ela é o índice do
que existe. O porquê de cada regra está no `README.md` e na doc de
cada crate.

---

## Os comandos

🔴 Esta árvore é **introspeccionada** do `clap` — a mesma estrutura que
responde ao `--help`. Não há lista escrita à mão, e por isso não pode
haver um comando no programa que não esteja aqui.

### `aegis vertical`

Um vertical: a pasta que o descreve por inteiro

### `aegis vertical listar`

Lista os verticais de uma pasta

| Opção | Para que serve |
|---|---|
| `<pasta>` | Pasta que contém as pastas de vertical |

### `aegis vertical ver`

Mostra o manifesto de um vertical

| Opção | Para que serve |
|---|---|
| `<pasta>` | Pasta do vertical **(obrigatório)** |

### `aegis ilha`

A ilha: banco, vertical e serviço

### `aegis ilha instalar`

Aplica o vertical: licença, migrações, tenant, catálogo e marcador

| Opção | Para que serve |
|---|---|
| `--vertical` | Pasta do vertical a aplicar **(obrigatório)** |
| `--banco` | URL do Postgres. Cai para `AEGIS_BANCO` |
| `--licenca` | A licença desta máquina. **Obrigatória** quando o vertical declara `licenca.exige` — sem ela o gesto recusa com `3` |
| `--chave-oem` | A Chave OEM do parceiro, que autorizou a licença |
| `--machine-id` | Identificador estável da máquina. Cai para o nome do host |

### `aegis ilha servir`

Sobe o serviço da ilha

| Opção | Para que serve |
|---|---|
| `--vertical` | Pasta do vertical a servir **(obrigatório)** |
| `--banco` | URL do Postgres. Cai para `AEGIS_BANCO` |
| `--licenca` | A licença desta máquina. Só é conferida no arranque da ilha |
| `--chave-oem` | A Chave OEM do parceiro, que autorizou a licença |
| `--machine-id` | Identificador estável da máquina. Cai para o nome do host |
| `--porta` | Porta do serviço da ilha |

### `aegis ilha estado`

Diz o estado real, e sai com `3` se não estiver pronto

| Opção | Para que serve |
|---|---|
| `--vertical` | Pasta do vertical instalado **(obrigatório)** |
| `--banco` | URL do Postgres. Cai para `AEGIS_BANCO` |

### `aegis licenca`

A licença: o fingerprint desta máquina, para o pedido

### `aegis licenca fingerprint`

O fingerprint desta máquina, no formato que o emissor usa

| Opção | Para que serve |
|---|---|
| `--machine-id` | Identificador estável da máquina. Cai para o nome do host |

### `aegis licenca conferir`

Confere uma licença e diz o que está em falta — sem instalar nada

| Opção | Para que serve |
|---|---|
| `--vertical` | Pasta do vertical — é dela que sai que licença este produto exige **(obrigatório)** |
| `--licenca` | A licença a conferir |
| `--chave-oem` | A Chave OEM do parceiro, que autorizou a licença |
| `--machine-id` | Identificador estável da máquina. Cai para o nome do host |

### `aegis licenca renovar`

🔴 A renovação, em **dois tempos** — como a ativação

| Opção | Para que serve |
|---|---|
| `<resposta>` | A resposta de quem emite. Sem isto, o gesto escreve o pedido |
| `--licenca` | A licença **instalada** nesta máquina. É dela que sai o pedido **(obrigatório)** |
| `--chave-oem` | A Chave OEM do parceiro. Só no segundo tempo |
| `--machine-id` | Identificador estável da máquina. Cai para o nome do host |

### `aegis camera`

As câmaras da ponte. 🔴 **O mesmo binário.**

### `aegis camera listar`

Lista as câmaras desta máquina, e os endereços de cada uma

| Opção | Para que serve |
|---|---|
| `--pasta` | Pasta onde vive a lista. Cai para `%ProgramData%\AEGIS` |

### `aegis camera adicionar`

Acrescenta uma câmara, ou muda o endereço de uma que já existe

| Opção | Para que serve |
|---|---|
| `<nome>` | O nome como o operador escreve. **Nunca** um endereço **(obrigatório)** |
| `<endereco>` | O endereço: `rtsp://…`, `http://…` **(obrigatório)** |
| `--pasta` | _sem descrição_ |

### `aegis camera remover`

Tira uma câmara pelo nome

| Opção | Para que serve |
|---|---|
| `<nome>` | _sem descrição_ **(obrigatório)** |
| `--pasta` | _sem descrição_ |

### `aegis mcp`

🔴 A face agêntica: o mesmo produto, noutro protocolo

| Opção | Para que serve |
|---|---|
| `--vertical` | Pasta do vertical deste servidor. É dela que sai a licença exigida **(obrigatório)** |
| `--licenca` | A licença desta máquina. **Obrigatória** quando o vertical declara `licenca.exige` — sem ela o gesto recusa com `3` |
| `--chave-oem` | A Chave OEM do parceiro, que autorizou a licença |
| `--machine-id` | Identificador estável da máquina. Cai para o nome do host |
| `--lista` | Escreve as ferramentas e os esquemas, e sai. 🔴 Não serve: é o que o console lê para se configurar, e um servidor cujas ferramentas só se descobrem chamando-as é um servidor que ninguém consegue documentar |

### `aegis referencia`

A referência do produto, **gerada do código**

| Opção | Para que serve |
|---|---|
| `--saida` | Onde escrever. Cai para `docs/REFERENCIA.md` |
| `--verificar` | Não escreve: sai com `3` se o ficheiro já não bater com o código |


## Os códigos de saída

São decididos em `aegis_produto::Resultado::saida()` — **a única função
do produto que decide um número** — e as três faces usam-na.

| Código | Significado |
|---|---|
| `0` | Feito |
| `1` | Falhou — o pedido era legítimo e não foi possível |
| `3` | **Recusado com motivo** — o pedido é legítimo e o estado não o permite |

Uma recusa traz **código**, **frase** e **gesto**. O gesto é o que
separa a recusa da falha: quem recebe *"falhou"* não sabe o que
fazer, e quem recebe *"pedir licença ao parceiro"* sabe.

## O vocabulário de recusa

Tudo o que o produto recusa tem um **código fechado**, e é por ele que a
tela traduz — *nunca* por casamento de texto. Casar dentro da frase
quebraria no dia em que a frase fosse reescrita, e passaria a dizer
outra coisa que a medição não disse.

São **53 motivos** em **5 famílias**.


### Licença

| Código | A tela diz | O que fazer |
|---|---|---|
| `licenca.formato` | Este ficheiro não é uma licença AEGIS. | Pedir um ficheiro novo ao parceiro |
| `licenca.assinatura-oem` | A chave do parceiro não foi assinada pela Safe Core. | Contactar a Safe Core |
| `licenca.sem-seeds` | Esta chave do parceiro não declara nenhum produto. | Pedir um ficheiro novo ao parceiro |
| `licenca.sem-raiz` | Não há como confirmar a licença sem a chave da Safe Core. | Verificar a instalação da licença |
| `licenca.sem-chave-oem` | A licença precisa da chave do parceiro que a autorizou. | Verificar a instalação da licença |
| `licenca.assinatura-parceiro` | A licença não foi assinada por esta chave do parceiro. | Contactar a Safe Core |
| `licenca.assinatura` | A assinatura da licença não confere. | Contactar a Safe Core |
| `licenca.parceiro` | Esta licença é de outro parceiro. | Pedir ao parceiro uma licença para este produto e esta máquina |
| `licenca.seed` | Esta chave do parceiro não cobre este produto. | Pedir ao parceiro uma licença para este produto e esta máquina |
| `licenca.prazo` | A licença vai além do prazo da chave que a autorizou. | Pedir ao parceiro uma licença para este produto e esta máquina |
| `licenca.fingerprint` | Esta licença é de outra máquina. | Pedir ao parceiro uma licença para este produto e esta máquina |
| `licenca.seed-uso` | Esta licença é de outro produto. | Pedir ao parceiro uma licença para este produto e esta máquina |
| `licenca.expirada` | A licença venceu. | Renovar a licença |
| `licenca.ausente` | Não foi apresentada licença para este produto. | Pedir licença ao parceiro |
| `renovacao.sem-pedido` | Não há pedido de renovação pendente nesta máquina. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.pedido-outro` | Esta renovação responde a outro pedido. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.resposta-vencida` | Esta resposta de renovação já não está no prazo. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.decisao-fora` | A resposta de renovação diz uma coisa que não é renovar nem recusar. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.sem-motivo` | A renovação foi recusada sem dizer porquê. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.sem-licenca` | A resposta diz que renova, mas não traz licença nenhuma. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.licenca-outra` | Esta renovação é de outra licença, não desta máquina. | Tirar um pedido de renovação novo e enviá-lo a quem emite |
| `renovacao.encurta` | Esta renovação encurta a licença, e renovação não é downgrade. | Tirar um pedido de renovação novo e enviá-lo a quem emite |

### Prontidão da ilha

| Código | A tela diz | O que fazer |
|---|---|---|
| `pronto.banco-fora` | O banco de dados não está respondendo. | Verificar o serviço de banco |
| `pronto.tenant-inexistente` | Esta ilha ainda não tem o tenant do produto. | Aplicar o vertical |
| `pronto.tenant-inativo` | O tenant desta ilha está desativado. | Ativar o tenant |
| `pronto.seed-desatualizado` | O conteúdo declarado pelo vertical ainda não foi aplicado. | Aplicar o vertical |
| `pronto.saude-falhou` | Uma verificação do produto não passou. | Ver a verificação que falhou |
| `pronto.saude-inconclusiva` | Não deu para verificar o produto. | Conferir o que impediu a verificação |
| `pronto.saude-nao-conferida` | O produto ainda não foi verificado nesta ilha. | Verificar o produto |

### Página

| Código | A tela diz | O que fazer |
|---|---|---|
| `pagina.formato` | Esta página não tem o formato esperado. | Abrir a página no Construtor e guardar |
| `pagina.sem-blocos` | Esta página ainda não tem blocos. | Acrescentar um bloco à página no Construtor |
| `pagina.refresh-invalido` | Esta página pede uma atualização a cada zero segundos. | Pôr um intervalo de atualização maior que zero — ou nenhum |
| `pagina.variavel-duplicada` | Há duas variáveis com o mesmo nome nesta página. | Dar a cada variável um nome próprio nesta página |
| `pagina.campo-obrigatorio` | Falta um campo numa variável desta página. | Abrir a página no Construtor e guardar |
| `pagina.variavel-pendente` | Esta página usa uma variável que não existe. | Dar a cada variável um nome próprio nesta página |
| `pagina.agregacao-de-agregacao` | Só se pode contar um conjunto, não uma contagem. | Contar um conjunto, não uma contagem |
| `pagina.tipo-desconhecido` | Esta página usa um tipo que o produto não declara. | Acrescentar o tipo ao vertical, ou tirar a tabela da página |
| `pagina.coluna-desconhecida` | Esta página pede uma coluna que o tipo não tem. | Acrescentar a propriedade ao tipo, ou trocar a coluna |

### Montagem (Construtor)

| Código | A tela diz | O que fazer |
|---|---|---|
| `montagem.identificador` | Este nome não serve para um produto. | Escolher outro nome para o produto |
| `montagem.sem-licenca` | Este produto não diz que licença exige — e sem isso instala sem licença nenhuma. | Declarar no vertical que produto este é — sem isso, instala sem licença |
| `montagem.sem-tipos` | Um produto sem tipos não tem nada para mostrar. | Acrescentar pelo menos um tipo ao produto |
| `montagem.sem-paginas` | Um produto sem páginas não tem tela. | Acrescentar pelo menos uma página ao produto |
| `montagem.vertical-invalido` | O produto recusou o que foi montado. | Abrir o Construtor e corrigir o que está assinalado |
| `montagem.pagina-invalida` | Uma das páginas recusou o que foi montado. | Abrir o Construtor e corrigir o que está assinalado |
| `montagem.disco` | Não consegui escrever no sítio onde o produto vive. | Verificar se a pasta do vertical é gravável |
| `montagem.serializacao` | Não consegui transformar o que foi montado em ficheiro. | Verificar o que está no campo de texto e guardar |

### Ponte (câmaras)

| Código | A tela diz | O que fazer |
|---|---|---|
| `ponte.nome-nao-e-nome` | `rtsp://192.168.0.5/stream` não é um nome de câmara, é um endereço. O nome é o que se põe na lista — o endereço vai ao lado, separado por `|`. | Pôr um nome curto, sem barras |
| `ponte.nome-vazio` | O nome da câmara ficou vazio. | Pôr um nome curto, sem barras |
| `ponte.url-invalida` | `isto nao e um endereco` não é um endereço de câmara. | Corrigir o endereço da câmara |
| `ponte.nome-repetido` | Já há uma câmara chamada `garagem` na lista. | Usar outro nome, ou remover a que já existe |
| `ponte.inexistente` | Não há câmara chamada `garagem` nesta máquina. | Ver a lista desta maquina: aegis camera listar |
| `ponte.dados` | Não sei onde é a pasta de dados desta máquina. | Defina AEGIS_DADOS, ou aponte --pasta para a bancada |
| `ponte.disco` | Não consegui gravar a lista: acesso negado | Verificar se a pasta de dados é gravável |

🔴 **Só entram aqui os enums de variante unitária.** Os que carregam
dados — `ErroStore::Ligacao { url, fonte }` — não se enumeram sem
inventar a carga, e um catálogo de erros inventados é pior do que
nenhum: parece exaustivo e não é.

🔴 **A lista de cada família é escrita à mão** e o compilador não a
liga ao enum. Um motivo novo entra no `match` e fica de fora daqui. O
que apanha essa omissão é a pessoa que abre esta referência à procura
dele — e é por isso que ela é gerada e verificada.
## Os crates

🔴 A **segunda coluna** é a mais importante, e é uma *constraint*: o que
cada crate **não** faz. Um limite escrito é um limite que se cumpre; um
limite apenas imaginado é um limite que se perde na primeira ida.

| crate | o que é | o que **não** é |
|---|---|---|
| `aegis-vertical` | Lê e valida o `vertical.yaml` | Não conhece banco, rede ou ilha |
| `aegis-ontology` | O contrato e a coação de uma instância | Não conhece nenhum vertical |
| `aegis-identity` | Pseudónimo, papéis e escopo | **Puro** — não toca em banco nem em rede |
| `aegis-license` | Raiz do vendor → Chave OEM → licença → renovação | **Não assina** — nenhuma chave privada entra no núcleo |
| `aegis-pagina` | O formato da página, e a `Montagem` que **grava o `vertical.yaml`** | Não sabe renderizar nem falar de HTTP |
| `aegis-produto` | As operações do produto, com `Resultado` estruturado | Não sabe imprimir — é isso que a torna partilhável |
| `aegis-store` | **Toda** a SQL do sistema | O `PgPool` não sai daqui |
| `aegis-island` | HTTP, `/health`, `/health/ready` e a tela | Não escreve SQL |
| `apps/bin` | A casca da linha de comandos | Não conhece regra de produto — chama a biblioteca |
| `apps/gui` | A janela (Tauri) | Não conhece regra de produto — chama a biblioteca |


---

Para a explicação de cada regra — e para o que esta referência **não**
cobre — ver o `README.md`. Para gerar:

```sh
aegis referencia --saida docs/REFERENCIA.md
aegis referencia --verificar --saida docs/REFERENCIA.md   # falha se divergir
```
