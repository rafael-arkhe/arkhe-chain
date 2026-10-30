# Projeto editorial

## Posicionamento

**Título de trabalho:** Arkhe: evidência e governança para agentes de IA.  
**Subtítulo:** Um manual de implementação com certificados verificáveis, políticas e limites de confiança.

**Promessa:** ajudar o leitor a transformar uma proposta de agente em uma decisão
de autorização auditável, com contratos explícitos, evidência verificável e
tratamento dos efeitos externos.

Leitor principal: engenheiro de plataforma ou arquiteto que integra agentes a
sistemas com autoridade de escrita. Leitores secundários: segurança e governança.
Pré-requisitos: leitura básica de Rust, hashes, assinaturas, JSON e transações.
O texto explica MMR e canonicalização antes de usá-los. Os exemplos começam
offline e não exigem chaves reais, pagamentos ou infraestrutura de produção.

A tese comercial é que exemplos executáveis e limites precisos reduzem o esforço
de avaliação técnica. Essa utilidade deve ser validada com leitores; não é
promessa de conformidade, economia garantida ou correção geral de agentes.

## Sumário contratado para a redação

Orçamento original: 53.000 palavras, incluindo apêndices e preliminares.
Edição completa ampliada entregue: 49.012 palavras por separação em espaços,
incluindo código, títulos e bibliografia; ver [entrega](18-complete-edition.md).
Referência de diagramação: 195–220 páginas a cerca de 240–270 palavras/página;
código, tabelas e figuras podem alterar essa projeção. EPUB será refluível.

| Parte / capítulo | Objetivo e artefato entregue ao leitor | Palavras | Estado |
|---|---|---:|---|
| Preliminares | Como usar, versão do código, convenções e limites | 1.000 | Redigido em en-US, edição de trabalho |
| I.1 — Quando um log não basta | Cenário fictício de ação indevida; mapa de perguntas de auditoria | 2.200 | Redigido em en-US, edição de trabalho |
| I.2 — Evidência, confiança e responsabilidade | Modelo de ameaça, autoridades e checklist de proveniência | 2.400 | Redigido em en-US, edição de trabalho |
| I.3 — Governança sem promessa de certificação | Matriz orientativa GOVERN/MAP/MEASURE/MANAGE e obrigações a investigar | 2.000 | Redigido em en-US, edição de trabalho |
| II.4 — Mapa do ambiente Arkhe | Diagrama de camadas, dois workspaces e fronteiras de autoridade | 3.000 | Redigido em en-US, edição de trabalho |
| II.5 — Identidades que sobrevivem ao transporte | WorkIntent, WER, CBOR e vetores; exercício de adulteração | 3.000 | Redigido em en-US, edição de trabalho |
| II.6 — WormGraph e inclusão verificável | Checkpoint retido, prova offline, limites de consistência e posição | 3.200 | Redigido em en-US, edição de trabalho |
| II.7 — Do resultado à autorização | Laboratório PCO aritmético, execução, rejeições e limites | 3.000 | Integrado à Part II em en-US; amostra separada preservada |
| III.8 — Integrar o ContainmentGate | PolicyBinding, admissão, erro fechado e revisão humana | 3.200 | Redigido em en-US, edição de trabalho |
| III.9 — Identidade da operação e efeitos externos | Journal, reserva, crash, replay e reconciliação de resultado incerto | 3.400 | Redigido em en-US, edição de trabalho |
| III.10 — Construir um adaptador de evidência | WER → envelope; autenticação, persistência e testes negativos | 3.000 | Redigido em en-US, edição de trabalho |
| III.11 — Verificar no cliente | APIs WASM, raízes confiáveis e o que a verificação offline não sabe | 2.800 | Redigido em en-US, edição de trabalho |
| IV.12 — Políticas de admissão | Dono da política, versionamento, rotação e revogação | 2.800 | Redigido em en-US, edição de trabalho |
| IV.13 — Conflito, equivocação e adjudicação | Distinguir retry de declarações incompatíveis; contrato futuro de sanção | 2.000 | Redigido em en-US, edição de trabalho |
| IV.14 — Custos que podem ser auditados | Ledger, unidades, fonte de medição e planilha conceitual de custo | 2.000 | Redigido em en-US, edição de trabalho |
| V.15 — Agentes de código | Mandato, revisão e release: laboratório separado de deploy real | 3.200 | Redigido em en-US, edição de trabalho |
| V.16 — DePIN sem saltos de confiança | DTO sintético, normalização e inclusão; contrato de integração real pendente | 2.400 | Redigido em en-US, edição de trabalho |
| V.17 — Proveniência de conteúdo | Perfil Arkhe de claim; fronteira com padrões completos de proveniência e assinatura | 2.400 | Redigido em en-US, edição de trabalho |
| VI.A — Glossário | Termos e contraexemplos | 1.500 | Redigido na edição completa en-US |
| VI.B — Referência de contratos | Tipos por workspace e versão; evitar enum Binding inventado | 2.000 | Redigido na edição completa en-US |
| VI.C — Checklist de implementação e operação | Aceite técnico, evidência e recuperação | 1.500 | Redigido na edição completa en-US |
| VI.D — Referências e reprodução | Fontes externas, manifest de código e resultados | 1.000 | Redigido na edição completa en-US |

Cada capítulo terá: problema concreto, contrato, implementação, exercício
reproduzível, resultado esperado, rejeição relevante e seção “o que isso não prova”.
Casos inventados serão identificados como fictícios. Nenhum benchmark será
publicado sem ambiente, comando, amostra e saída preservados.

## Decisões de escopo

- O workspace principal é a trilha didática padrão. Exemplos de `agi-coder` recebem
  indicação explícita de tipos, perfil e diretório; não se copiam raízes MMR entre ambos.
- O capítulo DePIN ensina o adaptador sintético existente. Redes externas de armazenamento e conectividade entram
  somente como contratos de pesquisa, sem instruções de APIs não implementadas.
- Assinaturas híbridas e replay de inferência não entram na promessa da edição 1.
- Slashing é discussão de evidência e adjudicação; não mecanismo econômico entregue.
- Não incluir dados privados, credenciais ou extratos operacionais em exemplos.
- Monografia/Zenodo não foi fornecida nesta tarefa. Qualquer aproveitamento posterior
  exige identificar versão, licença, autoria e diferenças para o código atual.

## Plano de produção

Estimativa de oito semanas editoriais, iniciadas quando houver disponibilidade
do autor; não representa prazo automaticamente agendado.

| Etapa | Entrega | Critério de saída |
|---|---|---|
| Semana 1 | Amostra com leitores técnicos e entrevistas | Dúvidas registradas; laboratório executado por pelo menos três leitores independentes |
| Semanas 2–3 | Partes I–II | Termos consistentes; toda promessa vinculada a fonte e fronteira |
| Semanas 4–5 | Parte III | Exemplos reproduzidos em ambiente limpo; falhas relevantes demonstradas |
| Semana 6 | Partes IV–V | Sem integrações imaginadas; caso de código distingue simulação e efeito real |
| Semana 7 | Apêndices e revisão técnica | Manifest por exemplo; links, licenças e revisão de segurança concluídos |
| Semana 8 | Edição, EPUB e preparação comercial | EPUBCheck e Kindle Previewer, metadados e direitos fechados |

Responsabilidades: autor decide posicionamento e assina a revisão; revisor técnico
reproduz exemplos sem usar o resultado esperado como oráculo único; editor cuida
da leitura e consistência; operador de publicação confere os formulários do KDP.
Uma pessoa pode acumular funções, mas deve registrar as verificações separadamente.

## Controle de edição

Cada release editorial fixa hashes dos arquivos usados pelos exemplos, comandos,
toolchain e resultados. Alteração de contrato exige revisar capítulo, exercício e
saída esperada. Erratas recebem versão, data, impacto e instrução de atualização.
Atualizações D2C precisam de período e escopo definidos antes de serem vendidas;
não prometer manutenção vitalícia ou acesso privado que ainda não existe.
