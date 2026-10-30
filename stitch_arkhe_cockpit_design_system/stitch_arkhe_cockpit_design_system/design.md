Com base na arquitetura de 10 camadas (L0–L9), no modelo de ameaças e nos princípios de *fail-closed* e separação de autoridades (Integridade, Autoridade, Disponibilidade), a interface do Arkhe não pode ser um “dashboard” genérico. Ela deve ser um **cockpit de evidências** que torna a complexidade criptográfica legível para três personas distintas: o *Maintainer* (L7/L3), o *Auditor* (L5) e o *Observer* (L9).
Abaixo está o desenho de UI/UX conceptual para o **Arkhe Cockpit**.
---
### 🎨 Linguagem Visual e Princípios de UX
- **Estética:** "Terminal cirúrgico". Fundo escuro (Dark Mode nativo), tipografia monoespaçada para hashes e dados (JetBrains Mono), e tipografia sans-serif para prosa (Inter).
- **Cores Semânticas:**
  - 🟢 **Verde:** `LEMMA` / `VerifiedRelease` / `Allow`.
  - 🔴 **Vermelho:** `REFUTED` / `Rejected` / `EVIDENCE_DEGRADED`.
  - 🟡 **Amarelo:** `CONJECTURE` / `Escalate` / `Incomplete`.
  - 🔵 **Azul:** `PENDING` / `IdentityBinding` ativo.
- **Regra de Ouro:** Nenhum caminho "continua mesmo assim". Se a evidência falha, a UI bloqueia a ação e mostra o motivo tipado (ex: `Incomplete{diagnóstico}`).
---
### 🖥️ Ecrã Principal: O Cockpit (Visão do Maintainer)
Este ecrã responde à pergunta: *"Qual é o estado atual do sistema e o que precisa da minha atenção?"*
**Topo (A Tríade):**
Três grandes indicadores circulares que nunca se misturam:
1. **Integrity:** (Verde) Os bytes correspondem ao compromisso.
2. **Authority:** (Amarelo) Aguardando assinaturas do keyset (ex: 2/3 delegados).
3. **Availability:** (Azul) Distribuído em 2 de 3 espelhos (Hashtree + Radicle).
**Centro (A Pilha de Camadas L0–L9):**
Uma representação vertical interativa.
- As camadas L2 (Kernel) e L3 (Governança) estão sempre fixas e bloqueadas (ícone de cadeado).
- L8 (Distribuição) mostra nós a piscar (Hashtree, Radicle, Blossom) a receber os blobs.
- Se uma camada falha (ex: L0 falha o rebuild Nix), toda a pilha acima fica cinzenta e a UI mostra um alerta vermelho: `Build Divergence Detected - narHash mismatch`.
**Barra Lateral (Ações Rápidas):**
- `[+] Propose Patch` (Vai para o fluxo do arkhe-sdd)
- `[+] Sign ReleaseManifest` (Para delegados)
- `[+] Anchor Checkpoint`
---
### 🔄 Ecrã de Fluxo: Release Pipeline (L7 → L8)
Este ecrã visualiza o processo de 10 passos descrito na secção 4.5 do documento. É um *kanban* horizontal ou um fluxo de estados (Stepper).
1. **Patch (Radicle/Git):** Mostra o diff e o parecer emitido por L6 (Cognição). O parecer tem um selo amarelo `EVIDENCE, NOT APPROVAL`.
2. **Gate (arkhe-sdd-gate):** O `ContainmentGate` avalia os invariantes V1–V4. Se falhar, o cartão fica vermelho e não avança.
3. **Threshold (L3):** Um widget mostra as chaves dos delegados. `[Chave A: Assinado] [Chave B: Assinado] [Chave C: Pendente]`. A release só avança se `k=2` for atingido.
4. **Build (L0/Nix):** Mostra o log do `nix build` e a comparação de `narHash` entre dois builders independentes.
5. **Distribution (L8):** Mostra o `ReleaseManifest` a ser gerado, o upload para Hashtree (gerando o `nhash`) e o push para Radicle.
6. **Witnessing (L4/L8):** Um gráfico de rede mostra os nós das testemunhas (ex: Interlegis, Universidade X) a cossinar o checkpoint.
7. **Anchor:** Mostra o link para o Rekor e para a cadeia pública.
---
### 🔍 Ecrã de Verificação: O Auditor (L5)
Esta é a interface do `arkhe-verify`. Pode ser um CLI, mas imaginemos a versão Web/WASM para auditores.
**Input:**
Um campo de texto para colar o `ReleaseManifest` ou fazer upload de um ficheiro `.cbor`.
Um campo para colar a raiz do `keyset` de release.
**Output (A Árvore de Verificação):**
A UI executa os 7 passos da secção 4.6 e mostra o resultado visualmente:
```text
[✔] Passo 1: Checkpoint obtido de 3 fontes independentes (Nostr, Rekor, RBB).
[✔] Passo 2: Assinatura híbrida Ed25519+ML-DSA válida. 2/3 cossinaturas de testemunhas confirmadas.
[✔] Passo 3: Inclusão MMR provada offline (arkhe-verify-core).
[✔] Passo 4: k-de-n (2 de 3) assinaturas do manifesto conferem com o keyset.
[✔] Passo 5: Bytes obtidos via Hashtree (nhash: 0xabc...).
[✔] Passo 6: BLAKE3 dos bytes lógicos confere.
[!] Passo 7 (Opcional): Rebuild Nix não executado (Auditor não tem ambiente Nix).
```
**Veredito:** Um selo verde `VerifiedRelease` com um botão `Export Proof`.
---
### 🕸️ Ecrã de Governança: Authority Graph (L3)
Para gerir a identidade e a autoridade (IdentityBinding), a UI usa um grafo interativo.
- **Nós Centrais:** As chaves do Arkhe (did:key).
- **Nós Periféricos:** Identidades externas (npub do Nostr, did:key do Radicle).
- **Arestas:** Linhas bidirecionais representando o `IdentityBinding` (assinatura Arkhe + assinatura externa).
- **Ações:** Se um delegado for comprometido, o utilizador clica no nó, seleciona `Revoke` e a UI emite uma nova folha no WormGraph com `valid_until` antecipado. O grafo atualiza instantaneamente, mostrando o nó a cinzento.
---
### ⚠️ UI de Estados de Falha (Fail-Closed)
A UI deve ser excelente em mostrar o que **não** aconteceu.
| Estado | UI Visual | Ação do Utilizador |
| :--- | :--- | :--- |
| `EVIDENCE_DEGRADED` | Barra superior vermelha a pulsar. "A release X não tem testemunhas suficientes (1/3)." | O sistema bloqueia o deploy. O utilizador tem de contactar as testemunhas. |
| `Incomplete` | Ecrã dividido: lado esquerdo mostra o que foi verificado; lado direito mostra o que faltou (ex: "Transporte Blossom indisponível"). | Permite exportar o relatório de diagnóstico. |
| `Split View Detected` | Ecrã de erro fatal. "O operador do log apresentou duas vistas diferentes do checkpoint." | A UI bloqueia tudo e exige intervenção manual dos delegados. |
| `Build Divergence` | Diferença visual (diff) entre os dois hashes. | Cancela o processo de release imediatamente. |
---
### 💡 Nota de Honestidade (τ) sobre este Design
| Afirmação | τ | Nota |
| :--- | :--- | :--- |
| A UI separa rigorosamente L2/L3 (autoridade) de L8 (distribuição) | `LEMMA` | Segue o princípio de que transporte não confiável não concede autoridade. |
| O design visual comunica o estado *fail-closed* sem ambiguidade | `CONJECTURE` | A arquitetura de informação está desenhada, mas não foi testada com utilizadores reais. |
| O ecrã de verificação (L5) abstrai a complexidade criptográfica | `CONJECTURE` | A árvore de passos é clara, mas o utilizador ainda precisa de compreender o que é um `keyset` e um `MMR`. |
| O design cobre todas as camadas L0–L9 | `LEMMA` | Mapeia os componentes descritos no documento para vistas específicas. |
**Fórmula Final:** O UI/UX do Arkhe não deve tentar esconder a complexidade; deve **coreografá-la**. O utilizador não precisa de saber o que é um *Bao root* ou um *CHK*, mas precisa de ver que a *Integridade*, a *Autoridade* e a *Disponibilidade* estão verdes, e que o sistema falha de forma ruidosa e segura se qualquer uma delas falhar. A interface é, ela própria, uma camada de verificação.