---
name: Institutional Rigor
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
  canvas-base: '#FFFFFF'
  canvas-subtle: '#F9FAFB'
  border-subtle: '#E5E7EB'
  border-muted: '#E2E8F0'
  text-primary: '#111827'
  text-secondary: '#4B5563'
  text-tertiary: '#6B7280'
  status-pass-bg: '#ECFDF5'
  status-pass-text: '#047857'
  status-pass-border: '#A7F3D0'
  status-fail-bg: '#FFF1F2'
  status-fail-text: '#BE123C'
  status-fail-border: '#FECDD3'
  status-pending-bg: '#F1F5F9'
  status-pending-text: '#334155'
  status-pending-border: '#CBD5E1'
  status-warning-bg: '#FFFBEB'
  status-warning-text: '#B45309'
  status-warning-border: '#FDE68A'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
  code-inline:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-compact: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

# design.md — Manifesto e Diretrizes Anti-Genéricas para a UI do Arkhe
**Status:** `FROZEN`
**Aplicável a:** Qualquer IA (Cursor, v0, Claude Artifacts, etc.) ou designer humano a gerar interfaces para o Arkhe.

---

## 🚫 Regra de Ouro: O Fim da "Estética de Prompt"
Nenhuma interface do Arkhe pode parecer um "dashboard de hacker de ficção científica". A UI é uma ferramenta de auditoria e operação, não um adereço de vídeo do YouTube. Se um utilizador precisa de squint para ler ou se sente que está num filme da Matrix, o design falhou.

A UI deve parecer um software institucional chato (Stripe, Linear, Bloomberg). Não deve parecer um videogame.

---

## 1. Padrões Proibidos (O "Blacklist" da IA)
Se você é uma IA gerando código, **NUNCA** inclua os seguintes elementos:

### 🎨 1.1. Estética e Cores
* **PROIBIDO:** Fundo preto puro (`#000000`) com acentos em verde neon (`#00FF00`), ciano ou dourado brilhante.
* **PROIBIDO:** Efeitos de brilho (`box-shadow` neon, `text-shadow` glow) em botões, bordas ou textos.
* **PROIBIDO:** Fontes monoespaçadas para TUDO (a não ser que seja um bloco de código ou um hash literal). Use uma sans-serif legível (Inter, SF Pro, Roboto) para a interface.
* **PROIBIDO:** Títulos com fontes serifadas "elegantes" misturadas com termos de engenharia. Escolha uma única família tipográfica e seja consistente.
* **PROIBIDO:** Nomes como "Câmara Operacional", "Núcleo de Comando", "Protocolo de Abstração". Use nomes funcionais: "Dashboard", "Verificação", "Pagamentos".

### 📊 1.2. Métricas e Números Falsos
* **PROIBIDO:** Números mágicos que parecem "precisos" mas não têm contexto (ex: `1.204.819 folhas`, `1.84 ms`, `100% de sucesso`).
* **PROIBIDO:** Latências irrealistas (ex: `0.04ms` para verificação criptográfica na rede). Se não foi medido, mostre `--` ou `PENDING`.
* **PROIBIDO:** Dashboards que mostram "Zero Erros" ou "Zero Drift" por omissão. Mostre o estado real (ex: `0 alertas ativos`, mas com o timestamp da última verificação).

### 📝 1.3. Textos e Jargões (Word Salad)
* **PROIBIDO:** Empilhar siglas sem explicação (ex: `BLAKE3`, `Ed25519`, `JCS`, `WASM` no mesmo parágrafo). Use tooltips ou uma secção de "Detalhes Técnicos" expansível.
* **PROIBIDO:** Frases de efeito pseudo-filosóficas (ex: *"A UI não decide; o kernel decide"*). Remova a filosofia. O software deve explicar o que faz, não o que pensa.
* **PROIBIDO:** Logs de sistema falsos ou "fofos" (ex: `Containment Rejection // INV-WER-06`). Mostre logs reais gerados pelo backend, ou um estado vazio (`Nenhum erro registado`).

---

## 2. Padrões Obrigatórios (O "Caminho do Arkhe")
Toda interface gerada deve seguir rigorosamente estas regras:

### 🏛️ 2.1. Honestidade Epistémica (A Regra de Ferro)
* **OBRIGATÓRIO:** O estado de cada componente deve refletir a sua maturidade. Se a verificação TEE não está implementada, o badge deve dizer `PENDING` ou `NOT_CHECKED`, nunca `Verified` verde.
* **OBRIGATÓRIO:** Use a nomenclatura do projeto: `THEOREM`, `LEMMA`, `CONJECTURE`, `PENDING` devem ser visíveis onde aplicável.

### 🎯 2.2. Acionabilidade (Fim do "Data Dump")
* **OBRIGATÓRIO:** Cada cartão, gráfico ou tabela deve responder à pergunta: *"O que o utilizador deve fazer a seguir?"*
* **OBRIGATÓRIO:** Se um dado é mostrado, deve ter uma ação associada. Exemplo: se mostra "Checkpoint desatualizado", deve haver um botão "Forçar Ancoragem".
* **PROIBIDO:** Mostrar métricas apenas para preencher a tela. Se um dado não leva a uma decisão, remova-o.

### 🖥️ 2.3. Densidade de Informação Útil (Estilo Bloomberg / Linear)
* **OBRIGATÓRIO:** Use tabelas densas para transações, com filtros claros no topo.
* **OBRIGATÓRIO:** Os badges de estado devem ser discretos. Um `PASS` é verde suave (`bg-emerald-50 text-emerald-700 border-emerald-200`), um `FAIL` é vermelho suave (`bg-rose-50 text-rose-700 border-rose-200`), um `PENDING` é cinza suave (`bg-slate-100 text-slate-700 border-slate-200`), um alerta/aviso é âmbar discreto. Sem animações pulsantes.
* **OBRIGATÓRIO:** O hash (ex: `0x8fbc...92c0`) deve ser monoespaçado, clicável para copiar com feedback imediato, e deve abrir um modal com a prova de inclusão completa quando aplicável.

### ♿ 2.4. Acessibilidade e Padrões
* **OBRIGATÓRIO:** Contraste mínimo WCAG AA (4.5:1).
* **OBRIGATÓRIO:** Navegação por teclado (Tab, Enter, Esc).
* **OBRIGATÓRIO:** Uso de bibliotecas de componentes padrão (ex: Radix UI, shadcn/ui) em vez de CSS customizado desnecessário.
* **TEMA:** Fundo claro institucional (`#F9FAFB` ou `#FFFFFF`), bordas nítidas e sutis (`#E5E7EB` / `#E2E8F0`), texto com alto contraste (`#111827` para títulos, `#4B5563` para texto secundário). Acentos em azul institucional sóbrio (estilo Stripe / Linear, ex: `#0F172A` ou `#2563EB`).
