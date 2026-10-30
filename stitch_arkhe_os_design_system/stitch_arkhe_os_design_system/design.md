# design.md — Manifesto e Diretrizes Anti-Genéricas para a UI do Arkhe
**Status:** `FROZEN`
**Aplicável a:** Qualquer IA (Cursor, v0, Claude Artifacts, etc.) ou designer humano a gerar interfaces para o Arkhe.
---
## 🚫 Regra de Ouro: O Fim da "Estética de Prompt"
Nenhuma interface do Arkhe pode parecer um "dashboard de hacker de ficção científica". A UI é uma ferramenta de auditoria e operação, não um adereço de vídeo do YouTube. Se um utilizador precisa de squint para ler ou se sente que está num filme da Matrix, o design falhou.
\[
\boxed{\text{A UI deve parecer um software institucional chato (Stripe, Linear, Bloomberg). Não deve parecer um videogame.}}
\]
---
## 1. Padrões Proibidos (O "Blacklist" da IA)
Se você é uma IA gerando código, **NUNCA** inclua os seguintes elementos:
### 🎨 1.1. Estética e Cores
*   **PROIBIDO:** Fundo preto puro (`#000000`) com acentos em verde neon (`#00FF00`), ciano ou dourado brilhante.
*   **PROIBIDO:** Efeitos de brilho (`box-shadow` neon, `text-shadow` glow) em botões, bordas ou textos.
*   **PROIBIDO:** Fontes monoespaçadas para TUDO (a não ser que seja um bloco de código ou um hash literal). Use uma sans-serif legível (Inter, SF Pro, Roboto) para a interface.
*   **PROIBIDO:** Títulos com fontes serifadas "elegantes" misturadas com termos de engenharia. Escolha uma única família tipográfica e seja consistente.
*   **PROIBIDO:** Nomes como "Câmara Operacional", "Núcleo de Comando", "Protocolo de Abstração". Use nomes funcionais: "Dashboard", "Verificação", "Pagamentos".
### 📊 1.2. Métricas e Números Falsos
*   **PROIBIDO:** Números mágicos que parecem "precisos" mas não têm contexto (ex: `1.204.819 folhas`, `1.84 ms`, `100% de sucesso`).
*   **PROIBIDO:** Latências irrealistas (ex: `0.04ms` para verificação criptográfica na rede). Se não foi medido, mostre `--` ou `PENDING`.
*   **PROIBIDO:** Dashboards que mostram "Zero Erros" ou "Zero Drift" por omissão. Mostre o estado real (ex: `0 alertas ativos`, mas com o timestamp da última verificação).
### 📝 1.3. Textos e Jargões (Word Salad)
*   **PROIBIDO:** Empilhar siglas sem explicação (ex: `BLAKE3`, `Ed25519`, `JCS`, `WASM` no mesmo parágrafo). Use *tooltips* ou uma secção de "Detalhes Técnicos" expansível.
*   **PROIBIDO:** Frases de efeito pseudo-filosóficas (ex: *"A UI não decide; o kernel decide"*). Remova a filosofia. O software deve explicar o que faz, não o que pensa.
*   **PROIBIDO:** Logs de sistema falsos ou "fofos" (ex: `Containment Rejection // INV-WER-06`). Mostre logs reais gerados pelo backend, ou um estado vazio (`Nenhum erro registado`).
---
## 2. Padrões Obrigatórios (O "Caminho do Arkhe")
Toda interface gerada deve seguir rigorosamente estas regras:
### 🏛️ 2.1. Honestidade Epistémica (A Regra de Ferro)
*   **OBRIGATÓRIO:** O estado de cada componente deve refletir a sua maturidade. Se a verificação TEE não está implementada, o badge deve dizer `PENDING` ou `NOT_CHECKED`, nunca `Verified` verde.
*   **OBRIGATÓRIO:** Use a nomenclatura do projeto: `THEOREM`, `LEMMA`, `CONJECTURE`, `PENDING` devem ser visíveis (talvez num *tooltip* ou numa coluna de estado) onde aplicável.
### 🎯 2.2. Acionabilidade (Fim do "Data Dump")
*   **OBRIGATÓRIO:** Cada cartão, gráfico ou tabela deve responder à pergunta: *"O que o utilizador deve fazer a seguir?"*
*   **OBRIGATÓRIO:** Se um dado é mostrado, deve ter uma ação associada. Exemplo: se mostra "Checkpoint desatualizado", deve haver um botão "Forçar Ancoragem".
*   **PROIBIDO:** Mostrar métricas apenas para preencher a tela. Se um dado não leva a uma decisão, remova-o.
### 🖥️ 2.3. Densidade de Informação Útil (Estilo Bloomberg)
*   **OBRIGATÓRIO:** Use tabelas densas para transações, com filtros claros no topo.
*   **OBRIGATÓRIO:** Os *badges* de estado devem ser discretos. Um `PASS` é verde suave, um `FAIL` é vermelho, um `PENDING` é cinza. Sem animações pulsantes.
*   **OBRIGATÓRIO:** O hash (ex: `0x8fbc...92c0`) deve ser clicável para copiar, e deve abrir um modal com a prova de inclusão completa, se disponível.
### ♿ 2.4. Acessibilidade e Padrões
*   **OBRIGATÓRIO:** Contraste mínimo WCAG AA (4.5:1).
*   **OBRIGATÓRIO:** Navegação por teclado (Tab, Enter, Esc).
*   **OBRIGATÓRIO:** Uso de bibliotecas de componentes padrão (ex: Radix UI, shadcn/ui) em vez de CSS customizado para modais e botões.
---
## 3. Instruções Diretas para o Gerador de UI (Prompt Rules)
Se você é uma IA gerando o layout, siga estas restrições:
1.  **NÃO GERE** um fundo escuro com neon. **GERE** um fundo branco, cinza claro (`#F9FAFB`) ou um tema escuro sóbrio (`#111827` com texto branco suave).
2.  **NÃO INVENTE** dados. Use *placeholders* claros como `{{data.total_volume}}` ou `--`.
3.  **NÃO USE** termos como "Câmara", "Protocolo", "Vault", "Kernel" no título principal. Use "Painel de Verificação", "Configurações", "API".
4.  **NÃO CRIE** um layout de "hacker". **CRIE** um layout de "ferramenta de auditoria corporativa": Sidebar à esquerda (nomes claros), topbar com perfil do utilizador, conteúdo principal em grelha.
5.  **SEMPRE** inclua um estado vazio (`EmptyState`) explicativo para tabelas e listas.
6.  **SEMPRE** diferencie visualmente a verificação local (WASM) da verificação remota (API). A local deve ser instantânea; a remota deve mostrar um spinner.
---
## 4. Exemplo de Prompt Corrigido para a IA
**❌ Prompt Errado (que gera o lixo anterior):**
> "Crie um dashboard cyberpunk para o Arkhe, com fundo preto, acentos verdes neon, mostrando métricas de latência de WASM de 1.84ms, um feed de transações PIX com hashes BLAKE3 e um monitor de MMR com 1.204.819 folhas. Inclua o título 'Câmara Operacional'."
**✅ Prompt Correto (que gera o Arkhe real):**
> "Crie uma interface de auditoria para o Arkhe, usando React e Tailwind. O tema deve ser claro e profissional, inspirado no Stripe Dashboard. A tela principal é uma visão geral que mostra:
> 1. O estado dos 4 eixos de verificação (TEE, ICP-Brasil, Ancoragem, Status). Use badges: 'Verificado' (verde), 'Pendente' (amarelo), 'Não Verificado' (cinza).
> 2. Uma tabela de transações recentes com: Data, Tipo (PIX, KYA), ID da Operação, Estado da Prova (Verified/Pending/Rejected).
> 3. Um botão primário 'Verificar Novo Recibo' que abre um modal com um dropzone para upload de ficheiro.
> 4. Não invente dados. Use `[Data]`, `[ID]` como placeholders ou um objeto JSON mockado. Não use termos como 'Câmara' ou 'Kernel'. O foco é a clareza e a ação do utilizador."
---
## 5. Checklist de Revisão (Antes de dar o design como concluído)
*   [ ] A interface parece um software dos anos 90 ou um videogame? Se sim, refaça.
*   [ ] Há alguma métrica sem contexto? Remova-a.
*   [ ] Um utilizador novo consegue entender o que é um "eixo de verificação"? Se não, adicione *tooltips* explicativos.
*   [ ] O botão principal da tela está claro? (ex: "Verificar", "Pagar", "Exportar Relatório").
*   [ ] Se eu remover todas as cores, a hierarquia visual ainda funciona? (Teste de contraste e tipografia).
*   [ ] O sistema exibe honestamente estados `PENDING` ou mostra tudo como "perfeito"? (Deve mostrar `PENDING`).
\[
\boxed{\text{Se a interface parece um panfleto de marketing, não é uma ferramenta. É um enfeite.}}
\]
Este documento deve ser a primeira coisa no diretório `/docs` do repositório frontend. Qualquer PR que viole estas regras deve ser rejeitado automaticamente no CI (usando regras de linting de design, como verificar paletas de cores proibidas ou a presença de termos banidos).