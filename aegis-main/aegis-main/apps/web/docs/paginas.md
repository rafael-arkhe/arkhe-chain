# Páginas e funcionalidades

11 rotas. Cada uma documentada com URL, tema, layout, painéis e ações.

---

## 1. `/` — Início

**Tema:** escuro. **Função:** visão única do estado atual da unidade.

**Linha 1 — KPIs**
- BOs nas últimas 24h (delta vs. 7d)
- Mandados em aberto na unidade
- Viaturas ativas
- Alertas críticos pendentes
- Operadores online

**Linha 2 — 3 cartões grandes**
- **Mapa mini** — mini `/geo` com pontos quentes e viaturas ao vivo; clique abre `/geo`
- **Alertas em destaque** — top 5 de `/alertas`
- **Câmeras prioritárias** — mosaico 2×2 ao vivo (selecionáveis em `/admin`)

**Linha 3 — Linha do tempo unificada**
- Eventos correntes: BO registrado · alerta novo · mandado cumprido · objeto vigiado alterado · briefing publicado · relatório fechado
- Filtros: por unidade, por papel, por gravidade
- Auto-refresh 30s

---

## 2. `/buscar` — Buscar

**Tema:** claro. **Função:** busca universal de objetos.

**Layout: 3 colunas (240px / fluida / 480px)**

### Coluna esquerda — Filtros
- Palavra-chave com modo `matches | exact | starts-with | regex`
- Tipo de objeto (multi): Pessoa, Veículo, Telefone, Endereço, Documento, BO, Mandado, Processo, Arma, Evento, Organização, Embarcação, Mídia
- Entidade (sub-filtro do tipo)
- Local (autocomplete bairro/AISP/município)
- Período (presets 24h, 7d, 30d, 12m + custom)
- Propriedades dinâmicas (idade, sexo, cor da pele, alcunha, tipificação penal)
- **+ Adicionar data / local / propriedade**
- **Salvar busca** · **Criar alerta a partir desta busca** (vira feed em `/alertas`)

### Coluna central — Lista
- Cabeçalho: "X resultados", ordenação (relevância / recência / gravidade), seletor lista/cartão/tabela
- Item: ícone, título, snippet (3 props-chave), tags de classificação, miniatura
- Checkbox multi-seleção → barra de ação:
  - Abrir em nova aba / janela
  - Adicionar a conjunto existente
  - Adicionar a novo conjunto
  - Baixar `.docx` / `.xlsx` / `.csv`
  - Adicionar a relatório
  - Adicionar a quadro de Rede
  - Remover do conjunto
  - Excluir (com permissão)

### Coluna direita — Detalhe do item focado
- Cabeçalho: nome, tipo, **Ações ▾** (editar, vigiar, exportar, excluir)
- Abas: **Visão geral · Propriedades · Vínculos · Mapa · Mídia · Histórico · AVA**
- Vínculos: contadores agrupados (Crimes·4, Organizações·5, Documentos·8…)
- Artefatos relacionados: dossiês/redes/mapas onde o objeto aparece

### Atalhos
- `J / K` próximo/anterior · `O` abrir nova aba · `Espaço` preview · `Shift+A` adicionar a conjunto

---

## 3. `/ficha/[id]` — Ficha

**Tema:** claro. **Função:** perfil customizável por tipo.

**Layout: 3 painéis (paleta · canvas · inspetor)** — reaproveita o padrão Palantir-quality já presente em `workshop/edit`.

### Cabeçalho do objeto
- Ícone + nome + tipo + selo de classificação
- Abas: **Visão geral · Propriedades · Vínculos · Mapa · Mídia · Histórico · AVA**
- **Ações ▾**: editar, vigiar, compartilhar, excluir, exportar PDF, anexar a relatório

### Painel esquerdo — Paleta de widgets
Categorias: Propriedades, Vínculos, Mídia, Mapa, Cronologia, Documentos, Tabelas, Gráficos, Custom.
Arrastar para o canvas.

### Canvas central — Grade configurável
Widgets prontos para SP:
- Identificação (RG, CPF mascarado, alcunhas, datas)
- Antecedentes criminais (BOs + tipificação)
- Mandados (em aberto, cumpridos, vara, CNJ)
- Veículos associados (placa, modelo, situação RENAVAM)
- Endereços conhecidos (mapa mini + lista)
- Telefones e contatos (CDR-ready: chamadas, contagem, peers)
- Vínculos familiares e sociais (mini grafo)
- Foto / face-match (galeria + score)
- Detecções LPR (placas associadas vistas em câmeras)
- Linha do tempo de eventos (BOs, mandados, prisões, audiências)
- Processos judiciais (CNJ, comarca, fase)
- Armas associadas (registro, calibre, situação)
- Organizações vinculadas (facção, empresa, ONG)
- Notas operacionais (texto livre, com classificação)
- Artefatos relacionados (dossiês, redes, mapas)

Cada widget: título editável · toggle de visibilidade por papel · permissão por atributo.
Salvar layout como template do tipo de objeto, compartilhável entre equipes.

### Painel direito — Inspetor
- Widget selecionado: fonte de dados, filtro, layout
- Canvas vazio: metadados do objeto (criado por, data, classificação, hash assinado, versão)

---

## 4. `/explorador` — Explorador

**Tema:** escuro permanente. **Função:** drill-down em conjuntos grandes via pipeline visual.

**Layout: 3 colunas**

### Coluna esquerda — Propriedades do conjunto
- Abas: **Tipos · Propriedades · Vínculos · Mapa · Linha do tempo · Buscar**
- Lista de propriedades com contador (Nacionalidade, Etiqueta, Cor dos olhos, Estado civil, Endereço, Nome, Sexo, Apelido, Altura, Cor de pele, Data de nascimento, URL, Comentário…)
- Clique → carrega central

### Coluna central — Visualização da propriedade
- Visões: **Histograma · Tabela · Lista de valores**
- Distribuição de valores (e.g., "Estado civil: solteiro 23, casado 5, divorciado 12")
- **Adicionar como filtro** empurra valores selecionados para o pipeline da direita
- **Limpar seleção** · **Adicionar ao caminho de filtros**

### Coluna direita — Pipeline de exploração
- "Nova exploração" + **Salvar** + "Voltar para início"
- Fonte: "Todos os objetos"
- Cada estágio empilhado:
  - "Mantendo Objetos correspondentes a Pessoa — 22.299 → 786"
  - "Mantendo Objetos com Cor dos olhos correspondente a Azul — 786 → 175"
  - "Mantendo Objetos com Nacionalidade correspondente a Brasileira — 175 → 47"
- Estágio: editar, duplicar, remover · **Limpar tudo**
- Resultados (47) com **Ações ▾**: enviar a `/rede`, criar relatório, salvar como conjunto, virar alerta, exportar

### Alerta a partir do pipeline
- "Criar alerta de objeto" — quando novo objeto satisfizer todo o pipeline, notifica em `/alertas`

---

## 5. `/rede` — Rede

**Tema:** escuro. **Função:** análise de vínculos em canvas livre.

### Barra superior (ribbon)
- Menus: **Arquivo · Editar · Visualizar · Inserir · Seleção · Suporte** | título da investigação | **Salvar**
- Direita: **Compartilhar** + selo de classificação
- Toolbar: **Organizar · Anotações · Estilo de nó · Estilo de aresta · Estilo de anotação · Fonte/cor**

### Canvas central
- Arrastar objetos da `/buscar` ou `/ficha`
- Nós: ícones por tipo (pessoa, banco, veículo, endereço, telefone, arma, evento, documento, organização)
- Arestas com rótulo ("pai de", "trabalha em", "ligou para", "morava com")
- **Menu de contexto** (right-click):
  - Adicionar seleção como filtro
  - Selecionar no grafo
  - **Buscar em torno ▸** Documentos / Entidades / Eventos / Propriedades / Rastreamento de registro / Artefatos relacionados / Mais…
  - Estilo · Editar rótulo · Mesclar · Desmesclar · Remover
- Layouts: força dirigida, hierárquico, circular, manual
- Mini-mapa de canvas (canto inferior direito)

### Painel direito — Helpers (abas)
- **Histograma**
  - Tipos de objeto (contagem): Pessoa 27 · Banco 4 · Veículo terrestre 1 · Arma 1 · Telefone 1 · Evento 1 · Cidade/Vila 1
  - Valores de propriedade: # de pessoas, Alcunha, Função na célula, País — barras de frequência
- **Seleção** — mini-Ficha do nó focado
- **Histórico** — quem mudou o quê e quando (replay)
- **Tabela** — todos os nós como linhas, colunas configuráveis, export `.csv`
- **Linha do tempo** — eventos dos nós, faixas por propriedade, bin year/month/day
- **Anotações** — texto livre em qualquer ponto do canvas

### Ações de rede inteira
- Exportar HTML standalone (compartilhar com promotor sem login)
- Exportar PNG / SVG
- Adicionar quadro inteiro a um relatório
- Comparar versões (diff entre dois snapshots)

---

## 6. `/geo` — Geo

**Tema:** mapa claro com painéis sobrepostos escuros. **Função:** mapa operacional / C2.

### Barra superior
- Abas: **Camadas do mapa · Fontes de dados · Ferramentas**
- Busca: "Localizar objetos e locais no mapa" (autocomplete em endereço, placa, BO, nome)
- Seletor de símbolo para tagueamento
- Modo: **Visão · Editar**

### Painel esquerdo — Camadas e dados
- Árvore de camadas (toggle):
  - Casos abertos (e.g., "Caso #2.1224 — Última localização da pessoa desaparecida · Carro")
  - Mandados em aberto
  - BOs últimas 24h (pin por gravidade)
  - Câmeras CCTV (online/offline)
  - Viaturas (BFT — posição ao vivo + status)
  - Pontos sensíveis (escolas, hospitais, bancos)
- Fundo base: **Ruas · Satélite · Carto escuro · Híbrido**
- Camadas custom: importar **SHP · KML · KMZ · LYR · GeoJSON**

### Canvas central — Mapa
- Toolbar flutuante: zoom · selecionar · desenhar polígono · raio (km) · rota · medir · pin · texto · cluster
- Heatmap toggle (densidade em janela temporal)
- Replay temporal (slider com play/pause)
- Tagueamento geográfico: clique georeferencia objeto sem geo
- Soltar para investigar: arrastar objeto de `/buscar` e georreferenciar

### Painel direito — Detalhe
- Pin clicado: mini-Ficha
- Área desenhada: contagem de objetos dentro + filtro por tipo + **Criar alerta de cerca** (geofence)
- "Buscar em torno deste ponto" com raio configurável

### Modo "Caso"
Agrupa pins, rotas e polígonos sob um número (e.g., "Caso #2.1224"); export como mapa estático ou camada compartilhável.

---

## 7. `/cameras` — Câmeras

**Tema:** escuro. **Função:** vídeo / CCTV / FMV com overlays de IA.

**Layout: 3 painéis (320 / fluido / 360)**

### Painel esquerdo — Tagueamento
- **Ações ▾** (parar, salvar, exportar)
- Lista de tagueamentos do operador (e.g., "Esconderijo · Localização")
- Detalhe do tagueamento ativo:
  - Classificação (selo)
  - Intervalo de tempo (e.g., `12:31:01 — 12:39:00 · 8 seg`)
  - Localização (lat/long ou nome)
  - Data, nome do objetivo, contagem inicial
  - Estado da análise + resumo do analista
  - **Vinculado a:** objeto (link)
  - **+ Adicionar observação**
- Lista de observações detectadas por IA aguardando triagem: confirmar / rejeitar / mesclar

### Canvas central — Player
- Nome da câmera + ID + timestamp no topo
- Vídeo em tela cheia
- **AR overlays** ligáveis:
  - Reconhecimento de placa (caixa + texto)
  - Match facial (caixa + nome + score)
  - Posição de viaturas / agentes
  - Áreas sensíveis destacadas
  - Pontos georreferenciados (esconderijo, hospital, torre, HLZ Alpha)
  - Detecções de IA com confidência
  - Telemetria (coordenadas, azimute, distância)
- Toolbar inferior: pause / play / -10s / +10s / velocidade (¼, ½, 1×, 2×, 4×, 10×) / live
- Histograma de detecções na linha do tempo do player

### Painel direito — Anotações e exportação
- Lista de anotações com timestamp clicável
- **Soak Tool**: heatmap acumulado das detecções em intervalo
- Comparar dois intervalos da mesma câmera lado a lado
- **Exportar clipe**: queima overlays (as-seen), opção de redação/blur, MP4 ou HLS

### Modo multi-stream
- Mosaico até 16 streams (sala de COPOM)
- Sincronização temporal entre streams para mesma janela

---

## 8. `/alertas` — Alertas

**Tema:** claro. **Função:** caixa unificada de feeds e notificações.

**Layout: 3 colunas (260 / 380 / fluida)**

### Coluna esquerda — Canais e feeds
- Busca de feeds
- **Todas as mensagens**
- **Solicitações**
- **Tópicos de alta prioridade**
- **Compartilhados comigo**
- **Feeds de objeto** (objetos vigiados)
- **Feeds de busca** (consultas salvas)
- **Feeds de artefato** (dossiê / rede / mapa que opero)
- **Correlações** — agrupamentos automáticos por AISP / batalhão / DP, editáveis pelo cliente

Cada canal: contador de não-lidos.

### Coluna central — Lista
- Filtros: **Filtros · Sem agrupamento**
- Itens com remetente, snippet, data, indicador de alta prioridade
- Hover: marcar lido, arquivar, encaminhar, abrir no app de origem

### Coluna direita — Detalhe
- Cabeçalho do alerta (e.g., "Suspeito X teve 1 alteração")
- Abas: **Visão geral · Propriedades · Vínculos · Mídia · Artefatos · Notas · Pistas · Fontes · AVA · Mais**
- **Histórico** detalhado: "Adicionado 7 vínculos · Aparece em vínculo entre X e entidade desconhecida · Adicionado 30 itens de mídia"
- **Resolver** + "Abrir no aplicativo de origem"

### Tipos de alerta (criados em outras rotas)
- Feed de busca (em `/buscar` ou `/explorador`)
- Watch em objeto (em `/ficha`)
- Geofence (em `/geo`)
- Compartilhamento (alguém compartilhou um artefato com você)

---

## 9. `/briefings` — Briefings

**Tema:** claro com slide preview. **Função:** apresentações com dados vivos.

**Layout: 3 painéis**

### Painel esquerdo — Estrutura
- Aba **Slides · Outline**
- Campo "Encontrar campo de formulário"
- Árvore do template (lê do template ativo):
  - Informação preliminar e produtos adicionais
    - Tipo de operação · Sumário · Forças hostis · Forças amigas
    - Informação da missão
  - Execução
    - Conceito de operação · Rotas (INFL/EXFL) · Solicitação e alocação de ativo · Linha do tempo · OPSKED · Avaliação de risco
  - Apoio
    - Apoio médico · Heliponto médico · Apoio de emergência

### Painel central — Configuração da seção
- Tipo de operação (dropdown)
- Estênceis relacionados (anexar)
- Mapas relacionados (arrastar de `/geo`)
- Planilhas relacionadas
- Produtos adicionais (CSV, PDF, imagem)
- **+ Adicionar estêncil / mapa / planilha / produto**

### Painel direito — Visual do slide
- Banner de classificação no topo
- Slide com placeholders inteligentes auto-populados:
  - Nome da missão · Tipo · Local · Horário de início · Declaração · Propósito expandido · Geometria do campo
- Edição inline (texto, mídia, mapa embutido, rede embutida)
- **Modo Apresentar** (broadcast a viewers; transição de apresentador entre operadores)
- Export PDF / PPTX (com classificação queimada)
- Comentários inline + track changes

### Templates
- Briefing diário · Briefing de operação · Pós-ação · Operação especial

---

## 10. `/relatorios` — Relatórios

**Tema:** claro. **Função:** editor colaborativo de dossiês.

### Barra superior
- Menus: **Arquivo · Visualizar · Navegar · Suporte** | título do relatório | **Salvar**
- Direita: **Compartilhar** + selo de classificação + modo só-leitura

### Toolbar do editor
- Cabeçalho (H1–H4) · **B · I · S · U** · Lista · Citação · Código · **Inserir** (objeto, mapa, rede, gráfico, link, tabela) · Comentário · Anchor link

### Sumário esquerdo
- Lista de seções (clica e pula)
- Template padrão (OPORD-style adaptado): **SITUAÇÃO · MISSÃO · EXECUÇÃO · APOIO E SUPORTE · COMANDO E SINAL**
- Outros templates: Investigação preliminar · Relatório circunstanciado · Pós-ação · Operação especial · Termo de apreensão

### Área central — Editor
- @-mention de objeto vira pílula colorida (ícone + nome) — link vivo
- Renomear/atualizar objeto reflete no relatório; revogado fica tachado
- Arrastar de `/rede` → recorte embutido com botão "Abrir em Rede" (mantém interatividade)
- Arrastar de `/geo` → recorte de mapa embutido
- Anexar mídia com selo de cadeia de custódia
- Múltiplos operadores editam ao vivo (cursores coloridos)
- Histórico (versões), comparar, restaurar
- Comentários por trecho (abertos/resolvidos)

### Painel direito — Inspetor
- Pílula selecionada: mini-Ficha
- Metadados: criado por, data, classificação, versão, hash assinado
- Lista de leitores autorizados

### Recursos auxiliares (compartilhados com /rede)

#### Buscar em torno
Menu de contexto em qualquer nó/linha:
- Documentos que mencionam · Entidades ligadas (1/2/3 saltos) · Eventos envolvendo · Propriedades compartilhadas · Rastreamento de registro · Artefatos relacionados · Mais…

#### Linha do tempo embutida
- Barras empilhadas por propriedade (Data · Idade · Local de nascimento · Data de nascimento · Data de óbito · Papel · Texto · Ocupação)
- Bin: dia · semana · mês · ano
- Clique numa barra filtra o canvas atual

### Export
- PDF (selo queimado), Word (`.docx`), Markdown
- Imutável após "Fechar relatório" (gera hash, congela)

---

## 11. `/admin` — Administração

**Tema:** claro. **Função:** governança, integrações, automações.

### Sub-rotas (tabs)
- **Acessos** — usuários, papéis (Investigador, Analista, Comandante, Auditor), permissões por atributo
- **Classificação** — níveis (público / restrito / confidencial / sigiloso), regras de herança, redação automática
- **Auditoria** — log imutável (quem leu o quê, quando, IP, dispositivo), exportável para CGU/correição
- **Federação** — conectores: SINESP-Infoseg, BNMP, RENAJUD, RENACH, RENAVAM, INFOPEN, CNJ DataJud, MP-link, CCTV municipal, ANPR
- **Unidades** — DPs, batalhões, comarcas, GCM, MP — hierarquia
- **Templates** — fichas, relatórios, briefings, dashboards
- **Automações** — alertas globais (e.g., "veículo em mandado entrando em AISP X notifica COPOM")
- **Tokens / OSDK** — chaves de integração (UI, sem CLI: gerar, listar, revogar)
