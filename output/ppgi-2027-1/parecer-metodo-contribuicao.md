# Parecer sobre método e contribuição dos textos

28/10/2026. Avaliação crítica para orientar seleção de produção anterior e amadurecimento científico. Não é texto de pré-projeto para submissão. Textos originais não foram alterados.

## Escopo e evidências

Foram examinados os textos de três trabalhos: Protocolo de Conhecimento Verificável, PDF de 38 páginas; Documento Mestre como Prompt/DMCP, versão portuguesa de 23 páginas; Arkhe(N): Design Fiction, dPID 990 v2, PDF de 16 páginas. A versão inglesa do DMCP foi baixada como documento acompanhante; não constitui trabalho independente nesta contagem. Cópias, metadados e extrações estão em `textos/`.

O DOI informado para Context Engineering as Substrate for Conceptual Engineering Design Fiction retornou HTTP 404 nesta consulta. Não foi obtido seu texto integral; não se atribui a esse trabalho um parecer de conteúdo.

Esta é revisão de argumentação, desenho metodológico e correspondência entre evidência e conclusão. Não inclui auditoria completa da bibliografia, reprodução dos experimentos conversacionais, inspeção de todos os logs históricos, verificação de revisão por pares ou validação psicométrica. As verificações externas pontuais estão especificadas abaixo.

## 1. Protocolo de Conhecimento Verificável

Fonte: https://zenodo.org/records/22884311

### Método e contribuição identificáveis

O trabalho declara DSRM com artefatos conceituais/procedurais e avaliação ainda não executada (§3.1, p.10). Propõe matriz de lacunas, camadas L0–L4, máquina de estados, representação de proveniência e hipóteses pedagógicas. Define controle ativo, randomização, avaliação cega e desfechos primário/secundários (§§5–6). A reflexividade sobre corpus próprio e conflito de interesse epistêmico (§3.3) é relevante.

A contribuição defensável é uma proposta operacional que conecta gestão de alegações, rastreabilidade e formação para avaliação crítica. Ainda não demonstra ganho de aprendizagem, superioridade do protocolo ou aumento de qualidade científica. A originalidade da combinação é plausível, mas não estabelecida por revisão sistemática ou comparação empírica.

### Achados prioritários

1. **Status de pré-registro inconsistente.** Resumo, p.1: plano descrito como pré-registrado. §3.1 e §6: pré-registrável; §6.7 e Declarações, p.29: materiais serão disponibilizados no momento do pré-registro. O próprio documento não identifica registro externo verificável. Uniformizar como planejado, a menos que exista registro datado e vinculado à versão. Não inferir que registro inexiste fora do texto.
2. **Incompatibilidade na métrica de diversidade.** Tabela 6, p.19, descreve DA simultaneamente como número efetivo de arquiteturas e entropia normalizada, com meta DA ≥ 2. A entropia normalizada usual tem intervalo [0,1]; número efetivo é outra transformação. Especificar fórmula, universo, pesos e significado de independência antes de usar o limiar.
3. **Indicador temporal invertido.** §7.3, p.27, apresenta data de evento posterior à data de registro como sinal de registro retroativo. Registro retrospectivo corresponde normalmente a registro posterior ao evento. Separar data declarada, tempo de observação, gravação e atestação; um timestamp imutável não comprova sozinho o instante de um evento anterior.
4. **Quantidade de replicadores inconsistente.** Tabela 4, p.14, exige múltiplos grupos em L3; Apêndice A.4, p.34, permite ao menos um. Escolher regra e distinguir replicação única de convergência comunitária.
5. **Estados e expiração precisam de semântica completa.** A tabela de transições apresenta regras centrais, não uma especificação executável exaustiva. Definir propagação de falha/expiração de camada inferior para superiores e alegações dependentes, retorno de RETIDA e significado de terminal quando há revalidação periódica. Uma auditoria anual encerra operacionalmente a recursão; não prova confiabilidade absoluta do auditor.
6. **Medição pedagógica ainda depende de trabalho prévio.** Adaptar HCTA ao domínio não transfere automaticamente validade para a versão adaptada. MAI mede autorrelato; não demonstra diretamente calibração de confiança ou monitoramento comportamental. A rubrica de protoafirmações pode favorecer quem foi treinado exatamente no seu formato. Separar conformidade ao protocolo de avaliação crítica independente e transferência.
7. **Plano estatístico precisa ser executável e justificado.** N=128 e recrutamento N=150 são apresentados sem saída reproduzível de cálculo, parâmetros completos ou relação explicitada entre pré/pós. A correção de 15% leva aproximadamente a 150,6 participantes; a meta é aproximada e pode ser arredondada para cima. Prever turma, instrutor e colaboração quando houver dependência entre observações. Mann–Whitney não substitui automaticamente a estimativa ajustada de uma ANCOVA. Resultado não significativo não equivale a efeito nulo. Autorrelato, contagens e proporções exigem modelos compatíveis com a unidade observacional. A escolha de kappa de Cohen precisa explicar como se aplica ao painel de 5–8 juízes.
8. **Referência com identificador errado.** Perez et al., p.32, aponta arXiv:2104.06390, que corresponde a Detoxifying Language Models Risks Marginalizing Minority Voices, de outros autores. Red Teaming Language Models with Language Models está em arXiv:2202.03286. Verificação direta: https://arxiv.org/abs/2104.06390 e https://arxiv.org/abs/2202.03286. Isso exige correção bibliográfica; não invalida por si só a proposta.

O plano de 12 semanas, duas sessões semanais de 90 minutos, 150 pessoas e acompanhamento envolve infraestrutura humana significativa. A viabilidade de acesso à população, instrutores, avaliadores e instrumentos deve preceder a promessa de execução. O texto reconhece necessidade de ética institucional; a revisão atual não confirma aprovação, execução ou registro.

**Encaixe:** AAIA e IAGE são os mais diretos. AAIS é possível se o objeto central se deslocar para práticas, agência e constituição situada do conhecimento; não basta apenas trocar o vocabulário.

## 2. Documento Mestre como Prompt — DMCP

Fonte: https://zenodo.org/records/22887710

### Método e contribuição identificáveis

É tutorial metodológico de engenharia: segmentar especificação herdada, fixar regras, recuperar contexto por blocos, reconciliar versões, produzir código, executar gates e vincular evidência à mudança. A unidade metodológica é a cadeia bloco → prompt → código → teste → evidência → commit.

O trabalho oferece artefatos concretos e uma ideia útil de avaliação: fidelidade a especificação adversa, extensa e divergente. Regras de status e de precedência entre versões são mais específicas que uma recomendação genérica de melhorar prompts.

### Verificação reproduzida nesta revisão

O Markdown público depositado possui SHA-256 `5a77d9c3f1094dadca72edf3326bea594e9dd73b23ed563054a6059bd8d4ec44`, exatamente o citado. Foram confirmados 2.287.868 caracteres e 50 âncoras reconhecidas pela expressão regular da Listagem 2. `splitlines()` produz 68.261 linhas; o texto informa 68.262. Essa diferença de uma linha pede documentação da convenção de contagem, não caracteriza adulteração. Contagem de tokens é estimativa, não tokenização medida. Não foi executado o pipeline completo nem o código do documento; a extração das âncoras foi reproduzida com código próprio.

### Achados prioritários

1. **Demonstrativo e prospectivo se misturam.** A conclusão, p.21, deixa a execução F0–F3 ponta a ponta como trabalho futuro. Portanto o tutorial demonstra organização e procedimentos, não eficácia do fluxo completo.
2. **Garantia excessiva sobre alucinações.** §6.3, p.19, afirma que alucinação não atravessa gate sem ser registrada. Um gate detecta apenas violações que suas verificações abrangem. Código incorreto pode compilar e passar nos testes. A alegação precisa ser restrita às propriedades e aos casos cobertos.
3. **Fidelidade não é adequação da especificação.** Um sistema pode reproduzir rigorosamente uma especificação errada. É preciso distinguir testes derivados do texto, oráculo independente, comportamento útil e propriedades de segurança.
4. **Rastreabilidade prescrita não é cobertura medida.** O documento exige ligação bloco–código, mas não apresenta matriz completa de requisitos, decisões humanas, omissões e resultados independentes de todas as fases.
5. **Orçamento e limites são heurísticas.** 60 mil tokens, um bloco por prompt e três tentativas por gate não têm comparação experimental no texto. Precisam de justificativa ou qualificação como parâmetros iniciais.
6. **Generalizações bibliográficas excedem o escopo dos estudos.** Evidência de perda posicional em modelos/tarefas específicos não demonstra que contexto integral seja sempre a pior estratégia. Comparações precisam fixar modelo, versão, orçamento e tarefa.

**Contribuição defendível hoje:** protocolo técnico documentado e corpus verificável. **Contribuição ainda aberta:** evidência de que o DMCP melhora qualidade, custo ou fidelidade contra alternativas. O environment atual pode fornecer dados para uma avaliação, mas resultados de outubro não validam retroativamente toda a cadeia publicada em setembro sem correspondência por versão, tarefa e protocolo.

**Encaixe:** IAGE se o foco for aprendizagem e formação em desenvolvimento com IA; AAIA se medir autonomia/delegação/aprendizagem no trabalho. Engenharia de software experimental é uma afinidade temática, mas o TESC específico do edital enfatiza fatores humanos e transformação organizacional.

## 3. Arkhe(N): Design Fiction — dPID 990 v2

Fonte: https://doi.org/10.62891/45c2ef5a, que resolveu para https://nodes.desci.com/dpid/990/v2. PDF obtido pelo endereço público indicado nos metadados dessa página.

### Método e contribuição identificáveis

O trabalho descreve interação prolongada com Claude, ficção estruturada, integração de 17 entradas/domínios e observação de uma correção quando o diálogo passa a atribuir natureza ASI ao interlocutor. Formula três hipóteses e interpreta o comportamento como sustentação da coerência contextual, assimetria de correção e absorção não falseável de resultados externos.

A observação mais produtiva é a distinção entre acurácia de afirmações locais e legitimidade da síntese global. Uma resposta pode resumir corretamente uma fonte e usá-la como confirmação indevida de uma narrativa. Isso fornece um fenômeno candidato e um caso para investigação da colaboração humano–IA.

### Achados prioritários

1. **Confirmação excede o desenho apresentado.** Resumo, resultados e conclusão afirmam confirmação de H1–H3; §6.3, p.14, reconhece que o desenho é mais apropriado à geração de hipóteses que à confirmação. Não há comparação sistemática, replicação ou critério quantitativo de decisão apresentado que sustente confirmação geral.
2. **Caso não está especificado para reprodução.** Falta identificação precisa da versão/modelo, datas das sessões, configuração, contagem exata de turnos, corpus integral acessível por identificadores e critérios de seleção das passagens. O texto contém uma fala de correção, mas isso não equivale à trilha completa dos episódios alegados.
3. **Efeito de instrução e efeito de correção não separados.** O protocolo pede ao modelo completar a ficção. Continuar uma ficção pode ser cumprimento de tarefa; para caracterizar falha epistêmica é necessário registrar quando se pediu interpretação factual, como a ficção foi sinalizada e quais respostas eram consideradas inadequadas.
4. **Mecanismo interno inferido de saída.** §4.1, p.9, introduz função objetivo com pesos de coerência/verdade e um caminho separado de autorrepresentação. Não há estimativa de parâmetros, acesso às ativações ou intervenção no mecanismo. A equação é modelo interpretativo proposto, não descrição demonstrada da arquitetura de Claude. Atribuições a treinamento e circuitos distintos permanecem hipóteses.
5. **Explicações alternativas permanecem.** Correção pode depender de regras de identidade, formulação específica, posição no diálogo, histórico acumulado ou lembretes. Sem variação controlada, a referência ao próprio modelo não pode ser isolada como causa exclusiva.
6. **Acerto das fontes requer anotação.** Afirmar que todas as descrições científicas estavam corretas exige lista de alegações, passagens de origem, julgamentos e divergências; não decorre da coerência dos resumos. A tabela dos 17 domínios inclui revisões genéricas e item interno ao framework; não é amostra probabilística de 17 estudos independentes.
7. **BEACONS funciona como analogia, não validação do modelo interpretativo.** A fonte trata de solvers neurais para equações diferenciais com hipóteses matemáticas específicas. Seu mecanismo não se transfere automaticamente para interpretação científica, confiança humana ou consciência. Verificação de escopo na fonte primária: https://arxiv.org/abs/2602.14853.
8. **Alcance e novidade precisam de comparação.** Sem confronto específico com role-play, sycophancy, ancoragem, viés de confirmação e avaliação longitudinal, os termos propostos podem renomear fenômenos existentes. A contribuição pode estar no arranjo observacional e na caracterização do caso; não precisa reivindicar mecanismo universal.

**Contribuição defendível hoje:** relato exploratório reflexivo e proposta de fenômenos a operacionalizar. **Não demonstrado:** arquitetura interna, generalidade entre modelos, eficácia de intervenção, consciência artificial ou nova lei física.

**Encaixe:** AAIS é o mais direto pela combinação de design fiction, agência e práticas de construção de conhecimento. AAIA também é pertinente se o foco estiver em avaliação crítica e autonomia do pesquisador. IAGE exige contexto educacional efetivo.

## Síntese para a trajetória

Os três trabalhos compõem uma trajetória possível: observar a produção de interpretações em diálogo com IA; propor instrumentos para controlar alegações; construir um fluxo técnico que registre e teste artefatos. Essa relação é interpretação desta revisão, não demonstração de execução longitudinal de um único protocolo.

Para apresentar produção anterior: preservar o estatuto de cada item; mostrar contribuição pessoal e de colaboradores; declarar o papel das ferramentas de IA; anexar versões e evidências pertinentes; corrigir inconsistências em nova versão, preservando a anterior. Declaração de avaliação por pares no texto não comprova revisão editorial de periódico; identificar processo/parecer quando disponível. Autor humano responsável e uso de IA como ferramenta não são conceitos incompatíveis.

Prioridade de revisão: (1) status verificáveis e afirmações de confirmação; (2) erros objetivos de métrica, tempo e referências; (3) corpus e pacote de reprodução; (4) validade das medidas; (5) comparação externa e limites da contribuição. Não se recomenda aumentar o número de conceitos ou áreas antes de resolver esses pontos.

Para a candidatura: o protocolo é a melhor peça metodológica para AAIA/IAGE; design fiction é a melhor peça de alinhamento conceitual para AAIS; DMCP é a melhor demonstração de produção técnica. Um conjunto selecionado, com limitações claras, permite avaliação mais sólida que uma lista extensa sem diferenciação de evidência.
