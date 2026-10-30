# Shell global

Estrutura presente em todas as rotas do `security-app/`. Inspirada em ambientes operacionais, sem similaridade visual com a sidebar do AEGIS ou do politicians-app.

## Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│ [logo]   [⌘K busca universal]      ▒ CLASSIFICAÇÃO ▒    🔔  👤 ▾   │ ← header 40px
├──┬────────────────────────────────────────────────────────────────────┤
│  │                                                                     │
│ s│                                                                     │
│ i│                   conteúdo da rota                                  │
│ d│                                                                     │
│ e│                                                                     │
│ n│                                                                     │
│ a│                                                                     │
│ v│                                                                     │
│  │                                                                     │
├──┴────────────────────────────────────────────────────────────────────┤
│ tenant · 17:42 UTC / 14:42 -03 · srv-sp-01 · v0.4.2                   │ ← rodapé 24px
└───────────────────────────────────────────────────────────────────────┘
```

## Header (40px)

| Zona | Conteúdo |
|---|---|
| Esquerda (240px) | Logo do produto + nome curto (clica → vai para `/`) |
| Centro-esquerda (fluida) | Barra de busca universal `⌘K` com autocomplete em pessoa/veículo/telefone/endereço/BO/mandado/processo |
| Centro (320px) | **Banner de classificação** — cor dinâmica (verde/amarelo/laranja/vermelho) reflete o maior nível em tela |
| Direita | Notificações (sino com contador) → abre dropdown com 5 últimos alertas de `/alertas` |
| Extrema direita | Avatar do operador → menu: trocar unidade ativa, trocar papel, configurações pessoais, sair |

## Sidenav (56px colapsada / 220px expandida)

11 itens em ordem fixa:

| Ícone | Rota | Rótulo | Atalho |
|---|---|---|---|
| dashboard | `/` | Início | `G H` |
| search | `/buscar` | Buscar | `G B` |
| user | `/ficha` (último aberto) | Ficha | — |
| funnel | `/explorador` | Explorador | `G E` |
| share-2 | `/rede` | Rede | `G R` |
| map | `/geo` | Geo | `G G` |
| video | `/cameras` | Câmeras | `G C` |
| bell | `/alertas` | Alertas | `G A` |
| layout-template | `/briefings` | Briefings | — |
| file-text | `/relatorios` | Relatórios | — |
| shield | `/admin` | Administração | — |

**Indicadores na sidenav**
- Contador de não-lidos em `/alertas` (badge vermelho)
- Ponto verde em `/rede` / `/relatorios` quando há co-operador ativo no artefato do operador
- Sublinhado azul `primary` no item ativo (sem preenchimento de fundo)

**Rodapé da sidenav**
- "Investigações abertas" do operador (lista 3 últimas, link para mais)
- Toggle colapsar/expandir

## Paleta de comandos (`⌘K` / `Ctrl+K`)

Modal central, ~640px de largura, fundo escuro semi-transparente. Comandos:

- **Ir para** — qualquer rota (`>painel`, `>buscar`, `>geo`…)
- **Abrir objeto** — por ID, CPF (mascarado), placa, nome (autocomplete)
- **Criar** — novo relatório / briefing / quadro de rede / alerta / geofence
- **Última ação** — repete último ação do operador (refazer busca, abrir mesma ficha)
- **Sair / Trocar unidade**

Atalho dentro da paleta:
- `Enter` executa
- `Cmd+Enter` abre em nova aba
- `Tab` autocompleta

## Banner de classificação (centro do header)

Visualização:

```
▒▒▒▒▒▒▒▒▒▒▒  CONFIDENCIAL — INVESTIGAÇÃO Nº 2026.1224  ▒▒▒▒▒▒▒▒▒▒▒
```

- Cor de fundo: `#C8341F` sigiloso · `#E97D2A` confidencial · `#E8B33B` restrito · `#3D9F58` público
- Texto: nível + contexto curto (e.g., número da investigação ativa, "ALERTA ATIVO", "OPERAÇÃO XYZ")
- Reflete o **maior** nível dentre os objetos visíveis na rota atual
- Clicável → abre tooltip explicando por que aquele nível

## Comportamento ao mudar de classificação

- Transição visual de 200ms na cor do banner
- Toast inferior: "Você entrou em ambiente CONFIDENCIAL. Cadeia de custódia gravada."
- Operador sem nível suficiente é redirecionado para `/buscar` com toast: "Acesso negado a esse objeto. Solicite escalonamento de privilégio em Administração."

## Rodapé (24px)

- Nome do tenant (e.g., "PC-SP / 13ª DP")
- Hora UTC + hora local
- Servidor servindo a sessão (e.g., `srv-sp-01`)
- Versão do painel
- Status de conexão com `ontology-module` (verde / amarelo / vermelho)

## Responsividade

Painel é **desktop-first**. Mínimo: 1280×800. Abaixo disso, banner de aviso ocupa a tela: "Este painel requer 1280×800 ou superior." Não há mobile.
