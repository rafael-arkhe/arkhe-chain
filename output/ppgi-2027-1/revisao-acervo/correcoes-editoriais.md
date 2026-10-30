# Correções editoriais propostas para o acervo

Preparadas em 28/10/2026. Material de trabalho para revisão autoral; não é pré-projeto de seleção, nova evidência experimental ou versão publicada. Originais e autoria foram preservados. Os trechos em inglês permanecem em inglês para integração nos respectivos textos. Afirmações sobre sua contribuição e uso de IA precisam ser confirmadas pelos autores; nenhuma declaração foi inventada.

## 22884311 — Protocolo de conhecimento verificável

Fonte: https://zenodo.org/records/22884311. Revisão dirigida apoiada no parecer anterior de 38 páginas.

### Metadado: afiliação

Remover `Universidade de Brasília` da afiliação de Rafael Oliveira. O autor confirmou neste chat que não possuía vínculo. Proposta: `Pesquisador independente, Brasil`, consistente com a folha de rosto. Preservar nome, ORCID e demais campos. A correção da afiliação foi aplicada e verificada publicamente em 28/10/2026.

### Resumo: status do plano

Substituir a qualificação do ensaio como pré-registrado por:

> Apresenta-se um plano de validação experimental, ainda não executado, com controle ativo, alocação aleatória e avaliação cega. O pré-registro, a adaptação dos instrumentos, a verificação do cálculo amostral e a aprovação ética aplicável constituem etapas anteriores ao recrutamento. Não se apresentam resultados causais de aprendizagem ou metacognição nesta versão.

Justificativa: o resumo diz pré-registrado; §§3.1, 6.7 e Declarações apresentam registro e materiais como futuros. Inserir identificador/dataversão caso exista pré-registro externo efetivo, em vez de presumir sua inexistência.

### Tabela 6: diversidade

Substituição proposta para a célula de métrica:

> A diversidade será descrita separadamente pelo número de implementações e pela distribuição de participação entre elas. Entropia normalizada e número efetivo não serão usados como sinônimos. A fórmula, a unidade de contagem, os critérios de independência e os limiares serão definidos antes da avaliação. Nesta versão, não se estabelece meta numérica para um indicador ainda não operacionalizado.

Isso remove a incompatibilidade entre entropia normalizada e meta ≥ 2 sem inventar um critério de aprovação. Não declarar que ter duas implementações demonstra independência epistêmica.

### §7.3: registro retrospectivo

Substituição proposta:

> Serendipidade registrada retrospectivamente: distinguir data declarada do evento, data de observação e data de gravação. Um registro criado depois do evento pode ser retrospectivo sem ser fraudulento; a classificação deve depender da alegação de contemporaneidade e das evidências disponíveis. Carimbo temporal da gravação não comprova, por si só, quando o evento ocorreu. A verificação preservará essas distinções e registrará atrasos e incertezas.

### L3: critério de replicação

Uniformização proposta: reservar L3 para replicação concluída por pelo menos dois grupos externos independentes. Uma replicação externa concluída deve ser registrada explicitamente como intermediária; não apresentar o mesmo fato como confirmação comunitária por múltiplos grupos. Esse é ajuste substantivo proposto, não resultado já obtido.

### Medidas e análise

Acrescentar aos limites:

> A adaptação do HCTA ao domínio demanda evidências para a versão utilizada. Autorrelato no MAI, desempenho de avaliação crítica e calibração comportamental são medidas distintas. A rubrica de protoafirmações será analisada como conformidade a um procedimento treinado, sem substituir medidas independentes de transferência. A versão final do plano deverá fixar unidade de randomização, possíveis agrupamentos, modelos de análise e parâmetros reproduzíveis de poder. Ausência de significância estatística não será interpretada automaticamente como demonstração de efeito nulo.

Referência corrigida: Perez et al. (2022), *Red Teaming Language Models with Language Models*, arXiv:2202.03286. O identificador 2104.06390 atualmente impresso pertence a outro artigo. Fonte: https://arxiv.org/abs/2202.03286.

## 22887710 — Documento Mestre como Prompt

Fonte: https://zenodo.org/records/22887710. Aplicar o mesmo ajuste de conteúdo nas duas versões linguísticas; não contar traduções como estudos independentes.

### §6.3: promessa dos gates

PT:

> O tutorial não garante ausência de alucinação nem detecção integral de erros. Os gates rejeitam violações das propriedades efetivamente verificadas, nos limites dos testes e ferramentas utilizados. Erros sem cobertura, requisitos inadequados e comportamentos semanticamente incorretos podem permanecer. Cada alegação de verificação deverá identificar propriedade, oráculo, versão, resultado e limitações.

EN:

> The tutorial does not guarantee hallucination-free generation or complete error detection. Gates reject violations of the properties they actually check, within the limits of the test or verification method. Uncovered defects, inadequate requirements and semantically incorrect behavior may remain. Verification claims must identify the property, oracle, version, result and limitations.

### Resumo e conclusão: natureza do estudo

PT:

> Este trabalho apresenta um protocolo técnico e um tutorial operacional. A organização do corpus e a possibilidade de segmentação são verificáveis; a superioridade do DMCP sobre estratégias alternativas e a execução integral do pipeline não são demonstradas nesta versão. Os limites de contexto e de tentativas são parâmetros iniciais de projeto, sujeitos a avaliação.

EN:

> This work presents a technical protocol and an operational tutorial. Corpus identity and segmentation are checkable; superiority over alternative workflows and end-to-end pipeline efficacy are not established in this version. Context and retry budgets are initial design parameters requiring evaluation.

Na revisão atual, o hash público, a contagem de caracteres e as 50 âncoras foram confirmados. A contagem por `splitlines()` é 68.261; 68.262 pode decorrer de outra convenção de contagem. Explicitar a convenção, sem apresentar diferença de uma linha como adulteração. Não afirmar medição exata de tokens onde houve estimativa por caracteres.

## 22803255 — Trabalho que reivindica a primeira AGI

Fonte: https://zenodo.org/records/22803255. Prioridade alta: §4.1 exige D1+D2+D3 e afirma que D2+D3 sem D1 é infraestrutura; §§4.2 e 5.1 admitem D1 apenas especificada, mas conservam a reivindicação de primeira AGI.

### Título proposto

> Arkhe as a Proposed Architecture for Verifiable AI Agents: Cognitive Requirements, Governance, and Limits of the Constitutive AGI Definition

O título substitui a reivindicação de prioridade sem apagar a discussão conceitual. A revisão bibliográfica comparativa necessária para qualquer alegação de pioneirismo não foi demonstrada nesta análise.

### Resumo substitutivo proposto

> This position paper examines a proposed definition of artificial general intelligence in which demonstrated cognitive generality, governance and independently checkable evidence are treated as joint requirements. Arkhe is discussed as an architectural research program that separates cognitive proposals from mechanisms for containment, provenance and verification. The current material does not demonstrate general cognitive capability or establish chronological priority over other architectures. Under the definition adopted in the paper itself, specified cognitive modules do not satisfy a requirement for demonstrated generality. The contribution is therefore an architectural proposal, a discussion of operational requirements and an evaluation agenda. Cryptographic evidence can support artifact identity, provenance and specified properties under explicit trust assumptions; it does not by itself establish semantic truth, cognitive generality, legal compliance or production qualification. Further work requires versioned artifacts, independently designed evaluations, adversarial testing and explicit separation of implemented, tested, externally reviewed and proposed components.

### §4.2: conclusão lógica substitutiva

> The proposed definition requires D1, D2 and D3 jointly. The present material does not establish D1, and the scope and operational qualification of D2–D3 must be assessed property by property. Consequently, it does not follow that Arkhe currently satisfies the proposed AGI definition. An integrated specification is an architectural artifact, not a demonstration of the specified capability. No claim of being the first AGI or the first architecture of its kind is established here. The evaluation criteria below describe future evidence requirements rather than a completed confirmation.

### Consequências obrigatórias da revisão

- Remover reivindicações equivalentes do cabeçalho, resumo, introdução, tabelas 1/6 e conclusão. Trocar “By design, omits nothing” por uma lista explícita de dimensões ainda fora do escopo.
- Figura 5: manter representação esquemática, mas retirar “maximal verification depth” sem escala operacional comparativa. Não atribuir pontuações quantitativas a sistemas sem medição.
- Tabela 5: distinguir falta de evidência, falha num teste e refutação da hipótese. Falta de replicação, isoladamente, é ausência de confirmação.
- Corrigir a frase “Eleven days after the second anniversary” sobre evento de fevereiro de 2025 e anúncio em setembro de 2026: a cronologia é incompatível. Manter somente datas verificadas.
- Relações com legislação e normas são mapeamentos exploratórios, não certificação ou demonstração automática de conformidade. Não é necessária alteração da tese de pesquisa para manter essa distinção.
- Reconciliar cada alegação de TEE, pagamentos, treinamento, governança de 51 agentes e verificação formal com artefato, versão e execução. O estado local de outubro não comprova automaticamente alegações de setembro.

Esse conjunto é uma proposta de reformulação substantiva. Não basta corrigir apenas o título mantendo o argumento antigo no corpo.

## 23049119 — FDF-AGI

Fonte: https://zenodo.org/records/23049119. A tese de perda de informação por agregação pode ser preservada com hipóteses explícitas. As simulações relatadas permanecem resultados do autor, sem reprodução independente nesta revisão.

### §3: formulação matemática substitutiva para revisão autoral

> Let q be the number of groups, let pi be a fixed vector of strictly positive group weights summing to one, and let x in [0,1]^q describe group outcomes. Consider the restricted aggregation model s(x)=pi^T x and D(x)=x. This explicit link between score and outcomes is an additional assumption; it is not implied by defining task accuracy and social outcomes separately.
>
> Proposition 1 (non-identification in the restricted aggregation model). If q≥2 and the admissible domain contains an interior point, the scalar score does not identify the full group-outcome vector. The kernel of the linear map x↦pi^T x has dimension q−1. For q=1, under this same score–outcome relation, the outcome is identified by the score.
>
> Proof. The map has rank one because pi is nonzero. Rank–nullity gives q−1 kernel dimensions. For q≥2 choose a nonzero v in the kernel and an interior x. A sufficiently small nonzero epsilon keeps x+epsilon v in [0,1]^q. The scores agree because pi^T v=0, while the outcome vectors differ. For q=1, pi_1=1 and s(x)=x. At boundaries or under additional feasibility constraints, the attainable equal-score set may have smaller dimension than the ambient kernel. This proposition concerns identifiability; it does not invoke statistical sufficiency for a probabilistic parameter model.

Conservar separadamente as definições gerais de `acc` e `out`, mas não alegar que o resultado de q=1 ou o núcleo q−1 decorre delas sem estabelecer a relação adicional. Não introduzir a prova corrigida como se já fosse a prova publicada ou uma descoberta inédita.

### §3.3: score e deterioração

> An aggregate score can improve while one or more groups deteriorate. In the restricted model with fixed positive weights, it cannot improve if every group outcome weakly decreases. If the benchmark instead measures an accuracy proxy distinct from the group outcomes, its relation to those outcomes must be specified before inferring any distributional consequence.

O texto atual mistura os dois casos. Com pesos positivos e score igual à média dos mesmos desfechos, melhora do score com deterioração de todos os grupos é impossível.

### §5: pluralismo

> Extensivity requires set inclusion, M_t ⊆ M_(t+1), verified by stable identifiers and a record of additions and removals. Nondecreasing cardinality alone is insufficient: replacing every approach with a different one can leave the count unchanged. Governance-authorized removal is a separate transition and must not be described as an extensive proliferation step.

### §6: resultados e reprodução

Renomear seção para `Synthetic-model demonstrations and reported numerical results`. Substituir “reproducible from a fixed repository command” por uma descrição que inclua efetivamente URL, commit, comando, dependências, sementes, entradas e saídas. Enquanto o pacote não for identificado no depósito, usar:

> Numerical values in this section are reported from the source draft. The present deposit does not identify the complete executable package needed to independently reproduce all six experiments. These values must therefore be distinguished from independently reproduced results. The synthetic model illustrates the consequences of its assumptions; it does not by itself validate the complete FDF governance cycle, design-fiction efficacy or outcomes in deployed systems.

Não substituir por números novos inventados. O check independente desta revisão verifica apenas exemplos racionais e propriedades lineares, não os seis ensaios.

### §6.3: razão 600

> The loss–gain ratio depends on the weights of the groups being compared. For two exhaustive groups with minority weight 0.001 and majority weight 0.999, the ratio is 999. A ratio of 600 is compatible, for example, with compared weights 0.6 and 0.001 and additional groups carrying the remaining weight. State the complete weight vector, the groups that absorb the compensation and the normalization before interpreting the reported ratio. Minority share alone does not determine 600.

### Auditoria bibliográfica e conclusão

- Um DOI construído por suposição retornar 404 não demonstra inexistência de um título. Registrar como falha daquele identificador; distinguir busca não localizada de prova de inexistência.
- A conclusão inverte a relação central ao dizer que propriedades distributivas são invariantes a mudanças medidas pelo benchmark. Formulação coerente: `group outcomes may change while the aggregate score remains unchanged`.
- Não denominar `if and only if q>1` uma conclusão geral sobre toda avaliação; restringir ao modelo assumido e à disponibilidade de variações admissíveis.
- Evitar que a palavra “empirical” sugira dados observacionais ou experimento com pessoas quando são demonstrações sintéticas.

## 20971457 — Cathedral OS

Fonte: https://zenodo.org/records/20971457. Revisão dirigida de resumo, fundamentação do CGF e declarações finais; monografia de 222 páginas ainda não revisada integralmente.

Nota de escopo substitutiva para resumo e fundamentação:

> The motivating design-fiction case suggests behavioral hypotheses about sustained contextual framing; it does not establish model-internal pathways or a generally validated CGF coefficient. The proposed drift monitor must be evaluated as an operational proxy against independent annotations and baselines. Cryptographic signatures and hardware attestation concern identity, integrity and execution properties under stated assumptions. They do not certify the semantic truth of an inference or transfer PDE error bounds to language-model interpretation. Implemented countermeasures must be distinguished from specifications and must identify reproducible code, platform, versions and executed tests.

Retirar “empirically confirmed” onde herda a confirmação excessiva de H1–H3. Conferir em cada capítulo se α é grandeza observável, parâmetro ajustado ou variável teórica; não chamar a mesma coisa de medição e hipótese. A declaração `IACR ePrint Submitted` exige confirmação documental e não equivale a aceitação ou publicação.

## 21520919 — Metaphoric Scaffolding

Fonte: https://zenodo.org/records/21520919. Revisão dirigida de alegações no início e §§9–11; não é validação dos resultados relatados.

Nota de escopo proposta:

> Cross-domain correspondences in this manuscript are conceptual models unless explicit source and target structures, preserved operations and derivations are supplied. A metaphorical mapping is not established as a mathematical theorem merely by listing analogous components. Reported training gains, hardware performance and energy estimates require separately identified datasets, evaluation procedures, executable artifacts and uncertainty. They must not be treated as reproduced findings in the absence of that evidence package. Conceptual usefulness does not establish physical realization, consciousness or general intelligence.

Pontos para revisão autoral: p.13, Theorem 9.2 mapeia camadas por analogia; p.20, mínimo grau não demonstra que um vértice é ponto de articulação; p.21, precisão igual a um exige definição operacional e avaliação, não enumeração de analogias. O ganho de 28,6 pontos na conclusão precisa de dataset, comparação, N, métricas e execução rastreáveis. Não declarar que é falso apenas por não ter sido reproduzido nesta revisão.

## 22906639 — Constituição e governança

Fonte: https://zenodo.org/records/22906639. Registro contém um modelo constitucional e um ensaio acompanhante.

Descrição substitutiva proposta para o depósito:

> Este depósito reúne um modelo conceitual de instrumento constitucional para governança de sistemas de IA e um ensaio de discussão. Os campos entre colchetes são placeholders de um modelo e não indicam adoção por Estados, tratado vigente, autoridade pública, endosso institucional ou instituição efetivamente constituída. Os textos devem ser lidos como propostas acadêmicas para discussão; sua validade jurídica e aplicação institucional não foram estabelecidas neste depósito.

Rever o título para identificar `Modelo conceitual de constituição para governança de IA — proposta para discussão`. No ensaio, preencher ou retirar `[INSTITUIÇÃO]` e `[E-MAIL DO AUTOR CORRESPONDENTE]` com informação verdadeira e autorizada. Não inventar dados de contato. Esta correção evita atribuir adoção real ao modelo, sem emitir parecer jurídico sobre seus dispositivos.

## Regras transversais de revisão

Manter as diferenças entre proposta, simulação, execução, resultado reproduzido e revisão externa. Preservar coautoria e identificar contribuições sem inferir concordância de coautor. Nenhuma revisão por IA deve ser descrita como revisão editorial de periódico. Preservar versões históricas e usar notas de correção claras; dados, afiliações, aprovações éticas, pré-registros e certificações não podem ser acrescentados por conveniência narrativa.

## Atualização de execução

As notas corretivas e os ajustes de metadados foram aplicados aos sete DOIs. Os trechos destinados aos PDFs continuam como propostas para integração aos fontes; os arquivos históricos não foram substituídos. Consulte resultado-aplicacao-por-doi.md.
