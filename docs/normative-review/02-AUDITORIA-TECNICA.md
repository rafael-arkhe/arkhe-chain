# Auditoria técnica — corpus Arkhe

**Estado: revisão documental com verificações locais; não certificação. Data: 16/10/2026.**

Fonte primária: `Texto colado.txt`, 19,221 linhas, 714,416 bytes.
SHA-256 dos bytes originais: `e2ba86120a90cbe151bafff8ec112487c951d97fdba5db6d4e0615f33458c852`.
Referências `Lx–Ly` apontam exclusivamente para essa cópia, sem renumeração.
O SHA-256 é identificador de proveniência desta revisão, não um digest AKG.

## 1. Método e limites

Todos os bytes foram identificados e todas as 19.221 linhas receberam uma faixa de classificação editorial. O índice inclui os títulos do corpus inteiro. A análise semântica se concentrou nas passagens referenciadas: snapshot inicial, emendas, matrizes, M6, arquitetura e alegações externas. Isso não equivale a prova formal exaustiva de cada frase.

Foram consultadas fontes primárias selecionadas. Não foram executados o kernel Arkhe, verificador WASM do protocolo, parser GGUF, assinaturas AKG, propagation audits completos ou testes B.1/B.2. Nenhuma alteração foi feita no app ou no anexo original.

Os achados factuais abaixo não recebem `severity` como campo normativo. P0/P1, usados no plano, são prioridades editoriais de trabalho; não são `FindingDisposition` autenticadas. Não existe aqui PolicyBinding fechado para emiti-las como objetos do protocolo.

## 2. Resultado

O corpus contém uma direção candidata consistente, mas não uma especificação wire autocontida pronta para freeze. Há conflitos resolvíveis por precedência e lacunas genuínas. Há também selos e afirmações de pesquisa que não são acompanhados de artefatos verificáveis.

A tese “restam somente dois itens normativos” (L1277) precisa ser limitada: esses são dois bloqueios explícitos do snapshot. Importação, matriz completa, normalização, execução dos audits e condições operacionais ainda exigem evidência ou decisão.

## 3. Achados rastreáveis

### F01 — Status de freeze e aprovação sem evidência

**Classe:** `AUTHORITY_GAP`. **Fonte:** L5–49; L7185–7200; L1217–1277; L18363–18542.

**Observação:** Candidato, emenda proposta, selos FROZEN e READY TO FREEZE coexistem. Não há assinatura de ratificação, manifesto de release nem relatórios executados anexos.

**Tratamento proposto:** Preservar status CANDIDATE_NOT_FROZEN. Exigir fontes versionadas, aprovação e evidências de execução.

### F02 — Imports não materializados como fontes autenticadas

**Classe:** `IMPORT_GAP`. **Fonte:** L11–49; L5625–5625; L7727–7770; L15950–15960.

**Observação:** Há referências a RFC-0001 frozen e B.0.1, mas citações de conversa não comprovam o conteúdo completo e a versão dos artefatos importados.

**Tratamento proposto:** Materializar imports por identificador, versão, digest e localização; completar matriz sem adivinhação.

### F03 — PolicyRef e PolicyCore históricos conflitam com o candidato

**Classe:** `SUPERSEDED_CONFLICT`. **Fonte:** L138–220; L5660–5684; L9836–9866; L1013–1030.

**Observação:** O candidato preserva PolicyRef como policy_id/version, separa PolicyDigest e não define PolicyCore; matrizes históricas assumem o contrário.

**Tratamento proposto:** Excluir essas linhas históricas da superfície normativa. Manter PolicyResolutionProfile pendente.

### F04 — VerificationMethod contém aliases ainda sem definição exata

**Classe:** `OPEN_SCHEMA`. **Fonte:** L503–636; L1425–1439; L3786–3826.

**Observação:** O candidato mantém tipos nominais distintos e result_digest; trechos anteriores introduzem result_value e declaram fechamento. O preimage de result_digest continua aberto.

**Tratamento proposto:** Definir/importar os seis aliases e o preimage; não converter tudo para uma union genérica por conveniência.

### F05 — SubjectRef obrigatório ou com quatro variantes reaparece

**Classe:** `SUPERSEDED_CONFLICT`. **Fonte:** L292–325; L5777–5807; L6437–6457.

**Observação:** O candidato permite apenas digest/id e Finding.subject_ref opcional; a matriz o marca obrigatório e uma resolução propõe quatro variantes.

**Tratamento proposto:** Aplicar a correção explícita antes de gerar schemas e vetores; omissão e null precisam de casos negativos distintos.

### F06 — Namespace de ClaimRef foi inferido e depois rejeitado

**Classe:** `SUPERSEDED_CONFLICT`. **Fonte:** L327–351; L3750–3768; L1454–1460.

**Observação:** Uma resolução impõe claims pertencentes ao candidate_intent; o candidato rejeita essa inferência sem emenda.

**Tratamento proposto:** Preservar text_id e o contexto normativo existente; resolução ambígua não autoriza escolher um owner silenciosamente.

### F07 — Cardinalidades de VerificationRequest têm regras opostas

**Classe:** `SUPERSEDED_CONFLICT`. **Fonte:** L638–660; L3854–3878; L6574–6600.

**Observação:** O candidato exige cinco coleções não vazias; resolução anterior permite vazio salvo exigência de policy.

**Tratamento proposto:** Exigir pelo menos um elemento em cada coleção. Policy só pode aumentar os mínimos.

### F08 — Propagação factual/política não foi executada

**Classe:** `AUDIT_EVIDENCE_GAP`. **Fonte:** L353–451; L1036–1093; L6213–6264.

**Observação:** Separação Finding/Disposition está declarada, mas PASS_CANDIDATE não é relatório de auditoria semântica. A matriz contém preferência editorial por finding_refs.

**Tratamento proposto:** Auditar cada uso decisional e esquema; justificar binding, referência e ausência de severity no fato. Sem PolicyBinding fechado, a triagem deste relatório é editorial.

### F09 — Profile e contextos de policy ainda não são reproduzíveis

**Classe:** `OPEN_CRYPTO_BINDING`. **Fonte:** L193–220; L1095–1162; L6015–6034; L6061–6075.

**Observação:** Computação exata de PolicyDigest não está fechada; policy_ref/digest aparecem em múltiplos níveis, sem regra completa de igualdade, escopo ou override.

**Tratamento proposto:** Definir perfil completo e consistência entre enclosing e nested context. Binding inalcançável ou incompatível bloqueia elegibilidade.

### F10 — Ordenação CBOR mistura dois perfis

**Classe:** `STANDARD_MISSTATEMENT`. **Fonte:** L2115–2125; L13604–13612.

**Observação:** Uma passagem descreve ordem bytewise de encodings; outra atribui length-first à seção 4.2.1. RFC 8949 distingue as duas opções.

**Tratamento proposto:** Congelar opção exata para mapas e não confundir com sort de semantic sets. Testar chaves mistas que diferenciam as regras.

As chaves de campo propostas são textuais (L5611–5612). Nesse subconjunto, as duas ordenações podem coincidir. F10 corrige a atribuição ao padrão e exige selecionar o perfil; não demonstra que os objetos AKG atuais já tenham digests diferentes. O exemplo local de chaves mistas distingue as regras gerais e não é um objeto AKG válido.

### F11 — Normalização global pode alterar identidade opaca

**Classe:** `SEMANTIC_WIRE_CONFLICT`. **Fonte:** L5605–5625; L5691–5707; L7288–7330.

**Observação:** Regra global NFC e NFC de IdentityRef.value coexistem com proibição de alterar a identidade definida pelo scheme.

**Tratamento proposto:** Definir política por scheme e tratamento de entrada não canônica. Não normalizar bytes assinados silenciosamente.

### F12 — Field matrix, bounds e enums não estão autocontidos

**Classe:** `OPEN_WIRE_PROFILE`. **Fonte:** L1149–1162; L5605–5625; L5639–5654; L6305–6370.

**Observação:** Status CLOSED para itens wire não fornece todos os limites, sort keys, definições text_id/text_name e imports B.0.1 exigidos pelo gate.

**Tratamento proposto:** Produzir matriz completa e registry fechado por campo. Não importar números de versões históricas sem seleção explícita.

### F13 — Comprimentos e registries de domínios já regrediram

**Classe:** `CRYPTO_DOMAIN_DRIFT`. **Fonte:** L982–1011; L3525–3590; L3945–3973.

**Observação:** O histórico registra contagens erradas; DomainPolicy reaparece apesar do adiamento explícito.

**Tratamento proposto:** Derivar comprimento do hex; preservar NUL real; não incluir DomainPolicy. A conferência local de bytes não prova ratificação do registry.

### F14 — Closure exige snapshot estável e universo completo

**Classe:** `OPEN_OPERATIONAL_PRECONDITION`. **Fonte:** L761–805; L14159–14269; L15755–15818.

**Observação:** Há equação finita e inflacionária, mas é necessário materializar B/F/R/P, interpretação do intervalo, completude de dependências e validade dos certificados durante a avaliação.

**Tratamento proposto:** Congelar entradas, política e resolução. Definir base ambígua, limites e referências ausentes sem declarar elegibilidade por truncamento.

### F15 — Comutação depende de domínio e estado ainda perfilados

**Classe:** `OPEN_PROOF_OBLIGATION`. **Fonte:** L696–735; L7492–7557; L14273–14321; L17398–17478.

**Observação:** Quantificação universal é requerida; perfis completos de estado/domínio não estão materializados. Texto arquitetural anterior usa estado relevante e equivalence.

**Tratamento proposto:** PoC usa igualdade canônica exata e precondições de habilitação. Sem profile/prova, comutação fica indisponível; usar caminho autorizado de independência ou ordenação.

### F16 — Identidade, assinatura e atualização de estado têm obrigações diferentes

**Classe:** `OPEN_AUTHORIZATION_BINDING`. **Fonte:** L866–944; L6015–6075; L6137–6198; L7561–7723.

**Observação:** Hash do core e assinatura externa não especificam sozinhos autorização vigente, resolução de chave, freshness nem verificação atômica do branch alvo.

**Tratamento proposto:** Separar integridade, autorização, validade contextual e commit. Propor precondição atômica de versão/digest, sem inventar campos como já normativos.

### F17 — Arquitetura contém regressões de autoridade e capacidade

**Classe:** `ARCHITECTURE_CONFLICT`. **Fonte:** L17356–17409; L17994–18064; L18379–18515; L18924–18926; L19007–19023.

**Observação:** Kernel único gestor de chaves, impossibilidade de WASM com hardware e garantias universais de side-channel reaparecem após correções. Classificação da TCB depende do caminho real de confiança.

**Tratamento proposto:** Manter papéis separados. WASM não recebe autoridade automaticamente; implementação nativa não garante segurança por linguagem ou formato.

### F18 — Ausência de bibliografia resolúvel e artefatos de benchmark

**Classe:** `UNVERIFIED_EXTERNAL_CLAIM`. **Fonte:** L18888–18896; L19025–19036; L19092–19109; L19123–19221.

**Observação:** A varredura integral encontra zero URLs explícitas. Benchmarks, fontes vazias, paper, CVEs e versões de pacotes são citados sem artefatos reproduzíveis.

**Tratamento proposto:** Registrar fonte primária, versão, DOI quando aplicável, hardware, comando e saídas. Não transformar ausência de confirmação em prova de inexistência.

### F19 — Paridade e artefato assinado não demonstram correção ou segurança de parser

**Classe:** `CLAIM_SCOPE_ERROR`. **Fonte:** L15939–15946; L18024–18064; L18407–18451; L19025–19038.

**Observação:** O corpus corrige paridade herdada do WASM e evidência embutida circular, mas conclusões finais voltam a generalizar formato seguro e conformidade como inovação.

**Tratamento proposto:** Comparar implementações independentes, manter evidência detached ou definir projeção excludente, testar parsers hostis e limitar claims de novidade.

### F20 — Camada de produto e camada normativa não são equivalentes

**Classe:** `SCOPE_BOUNDARY`. **Fonte:** L18519–18531; L18861–18884.

**Observação:** O roadmap normativo exige bytes, verificador e enforcement. Não há neste anexo evidência de que o app de criadores implemente essas fases.

**Tratamento proposto:** Manter roadmap do protocolo separado de Design.md e da demonstração Devnet. Não usar UI, deploy ou testes de hashing como certificação AKG.

## 4. Conferências externas delimitadas

Fontes acessadas em 16/10/2026. Uma confirmação limitada não valida o corpus inteiro.

| ID | Afirmação | Resultado |
|:---|:---|:---|
| E01 | RFC 8949 determina uma única ordenação chamada “canônica” | A seção 4.2.1 usa bytewise lexical dos encodings; 4.2.3 define alternativa length-first. Fixar perfil. |
| E02 | Tamanhos e verificação Ed25519 | RFC 8032 sustenta o algoritmo e comprimentos. Autorização, perfis e domínios Arkhe continuam locais. |
| E03 | COSE_Sign1 e mensagem AKG seriam intercambiáveis | RFC 9052 usa Sig_structure próprio. Não trocar a mensagem sem profile específico. |
| E04 | WASM garante determinismo/paridade automaticamente | A documentação Wasmtime exige escolhas de execução determinística. Paridade de implementações é uma obrigação separada. |
| E05 | CVE-2025-53630 em llama.cpp/GGUF | Confirmado pelo advisory dos mantenedores. Isso não demonstra sanitização implementada no Arkhe. |
| E06 | ruvector-cognitive-container existe e está em 2.3.0 | Existência apoiada por documentação publicada. Versão 2.3.0 e garantias declaradas não confirmadas nesta revisão. |
| E07 | CVE-2026-65315 está associado ao Ollama | Associação não estabelecida. A consulta direta falhou; não concluir inexistência. |
| E08 | Paper “Specify, Don't Simulate...” publicado em Zenodo | Registro primário/DOI não confirmado pelas buscas realizadas. Não concluir inexistência. |
| E09 | Benchmarks Ed25519/ML-DSA e overhead universal | Não reproduzidos; faltam fontes resolúveis, hardware e comandos no anexo. Não usar como garantia ou fundamento obrigatório. |
| E10 | Arkhe inaugura classe sem antecedentes | Não demonstrado; conformance vectors não provam anterioridade ou novidade histórica. |

### Fontes primárias consultadas

- **E01 — RFC 8949 §4.2.1–4.2.3:** [https://www.rfc-editor.org/rfc/rfc8949.html](https://www.rfc-editor.org/rfc/rfc8949.html). Estado: `CONSULTED`. Core deterministic bytewise ordering and length-first ordering are distinguished. Does not decide Arkhe collection semantics or scheme identity.
- **E02 — RFC 8032 §5.1.7:** [https://www.rfc-editor.org/rfc/rfc8032.html](https://www.rfc-editor.org/rfc/rfc8032.html). Estado: `CONSULTED`. Ed25519 sizes and verification rules; does not define AKG profile names or authorization.
- **E03 — RFC 9052 §4.4:** [https://www.rfc-editor.org/rfc/rfc9052.html](https://www.rfc-editor.org/rfc/rfc9052.html). Estado: `CONSULTED`. COSE uses its own Sig_structure; not automatically the same signing message as raw AKG prefix plus digest.
- **E04 — Wasmtime deterministic execution:** [https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html](https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html). Estado: `CONSULTED`. Determinism depends on runtime configuration; portable execution alone is not cross-implementation evidence.
- **E05 — llama.cpp maintainers advisory:** [https://github.com/ggml-org/llama.cpp/security/advisories/GHSA-vgg9-87g3-85w8](https://github.com/ggml-org/llama.cpp/security/advisories/GHSA-vgg9-87g3-85w8). Estado: `CONFIRMED_LIMITED`. CVE-2025-53630 and GGUF parser overflow confirmed. No Arkhe implementation is validated by this advisory.
- **E06 — Published crate metadata:** [https://docs.rs/crate/ruvector-cognitive-container/latest/target-redirect/i686-pc-windows-msvc/ruvector_cognitive_container/](https://docs.rs/crate/ruvector-cognitive-container/latest/target-redirect/i686-pc-windows-msvc/ruvector_cognitive_container/). Estado: `EXISTENCE_SUPPORTED_VERSION_2_3_0_UNVERIFIED`. Searchable package documentation exists. Corpus version 2.3.0 and security properties were not confirmed.
- **E07 — CVE-2026-65315 record lookup:** [https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/2026/65xxx/CVE-2026-65315.json](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/2026/65xxx/CVE-2026-65315.json). Estado: `LOOKUP_FAILED_UNVERIFIED`. Fetch failed and search did not establish the claimed Ollama association. Not proof that the CVE does not exist.
- **E08 — Claimed Zenodo paper:** registro identificável não localizado. Estado: `NOT_CONFIRMED`. Exact-title searches did not locate an authoritative record with DOI/version. This is not proof of nonexistence.

A lista de URLs externas foi produzida nesta revisão. O anexo contém zero URLs explícitas detectadas pela varredura, embora cite títulos, projetos e arquivos de conversa. Isso indica falta de rastreabilidade bibliográfica no anexo, não prova que toda afirmação seja falsa.

## 5. Verificações locais e contraexemplos

O script `verify_review.py` executa verificações de proveniência, cobertura de linhas, domínios e consistência dos arquivos desta entrega. Também produz testemunhos matemáticos pequenos:

- Chaves CBOR mistas separam bytewise de length-first.
- Operações podem comutar no estado-base e falhar após outro prefixo.
- Igualdade de uma observação imediata pode falhar após continuação.
- Uma projeção unsigned pode excluir attestations sem autorreferência.
- Dois rótulos de policy iguais podem apontar a conteúdos diferentes.

Esses exemplos **não são vetores B.1 oficiais**, não usam BLAKE3 para identidade AKG e não implementam o protocolo. Testam distinções lógicas e a consistência documental. Resultados e limites estão em `verification-results.json`.

## 6. Threat model antes da implementação

| Ameaça | Fronteira afetada | Controle necessário | Evidência de aceite |
|:---|:---|:---|:---|
| Regra antiga volta ao schema | Histórico → norma | Manifesto de fontes e regra selecionada única | Mudança histórica não altera schema ou digest normativo |
| Policy mutável ou substituída | Resolução → avaliação | Artefato e dependências vinculados por profile fechado | Substituição de bytes é detectada |
| Duas canonicalizações aceitas | Entrada → identidade | Perfil exato, rejeição e bounds | Vetores negativos de CBOR e normalização |
| Finding promove bloqueio por conta própria | Verificador → decisão | Fato imutável; classificação separada e vinculada | Mudança de policy não altera o fato |
| Contexto muda antes do commit | Assessment → estado protegido | Precondição de estado e commit atômico | Assessment antigo não promove estado novo |
| Bootstrap vira prova de produção | Teste → elegibilidade | Classes separadas e não promovíveis | Evidência observada é recusada no caminho de produção |
| Host apresenta resultado falso do WASM | Interface → enforcement | Core revalida entradas e evidência conforme trust model | Resposta alterada não autoriza transição |
| Model/parser hostil | Payload → runtime | Bounds, parser atualizado, isolamento e testes negativos | Artefato assinado malformado é rejeitado |

A tabela contém controles a implementar/verificar. Não afirma que já existam no repositório ou no produto publicado.
