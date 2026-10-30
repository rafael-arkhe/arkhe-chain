# Classificação HackenProof × CVSS

O anexo do usuário contém 250 tópicos de engenharia e várias versões anteriores
de auditorias. Essas versões não são prova do estado atual. A implementação local
foi inspecionada antes de aplicar o ajuste final proposto no anexo.

## Fontes e interpretação

Conferidas em 2026-10-17:

- [HackenProof Web & Mobile](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/web-and-mobile): usa CVSS na avaliação e apresenta severidades típicas de problemas aceitos.
- [Smart contracts](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/smart-contracts) e [Blockchain protocols](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/blockchain-protocols): descrevem CVSS para problemas não cobertos pelas tabelas.
- [FIRST CVSS 3.1](https://www.first.org/cvss/v3.1/specification-document): métricas Base, equações e arredondamento do Apêndice A.

Permitir tabela e vetor simultaneamente em WebMobile é uma escolha explícita
deste perfil Arkhe. A documentação não declara que a combinação seja obrigatória.
As tabelas têm severidades típicas; o programa e os fatos concretos podem exigir
outra avaliação. Este perfil conservador rejeita discordâncias, sem corrigir a
severidade automaticamente.

## Contrato implementado

`integration/arkhe-bugbounty/src/classification.rs` fornece `Domain`,
`SeverityBasis`, `CvssEvidence`, `TriageAnalysis` e `ClassificationPolicy`.

| Domínio | Tabela | Tabela + CVSS | CVSS sem tabela |
|---|---|---|---|
| WebMobile | Permitida conforme política | Optional / Required / Forbidden na política | Somente se `web_cvss_only=true` |
| SmartContracts | Permitida | Rejeitada neste perfil | Fallback com justificativa |
| BlockchainProtocols | Permitida | Rejeitada neste perfil | Fallback com justificativa |

A evidência vincula o digest do relatório e dos parâmetros, incluindo o estado
proposto. A linha deve existir na configuração confiável para aquele domínio.
Tabela, proposta e severidade derivada do vetor devem concordar. O score é
armazenado em décimos inteiros e recalculado; um número isolado não é evidência.

### Arredondamento e apresentação auditável

O cálculo usa `roundup_tenths`: primeiro reduz o ruído numérico à precisão
intermediária de cinco casas e depois arredonda **para cima** com divisão inteira.
Isto implementa a recomendação do Apêndice A da FIRST. O `round()` presente na
etapa intermediária não é o arredondamento final do score. Testes de fronteira
incluem `4.02 → 4.1`, `4.00 → 4.0`, ruído de `0.1 + 0.2` e o teto `10.0`.

`CvssPresentation` é uma saída derivada e validada com `vector`, `score_tenths`
e `score_decimal`. O último é uma string com exatamente uma casa decimal,
como `"8.8"`, `"0.0"` ou `"10.0"`, construída por aritmética inteira. O vetor
é recalculado antes de produzir essa apresentação. Não se aceita uma string
decimal fornecida pelo chamador como evidência.

Os comandos `validate_triage` e `ollama_triage` expõem essa apresentação em
`cvss` (`null` se não houver vetor). Para análise classificada, o WER inclui
`cvss={...}` em **`uncertainty_note`**, junto dos digests de classificação e
política, antes de chamar o attestor. Logo a representação decimal está coberta
pelo digest do WER e pelo recibo que o assina. Alterá-la altera esse digest.
A apresentação decimal continua neste texto. A etapa posterior de governança
adiciona um vínculo tipado opcional ao WER, descrito abaixo; o gate não interpreta
este texto como autorização.

O contrato de entrada de `CvssEvidence` continua tendo somente `vector` e
`score_tenths`; fornecer `score_decimal` nesse objeto é erro de schema.
As projeções canônicas e os domínios v1 da classificação e da política foram
preservados. A apresentação adicional só integra novos outputs e novos WERs;
registros e assinaturas anteriores não são reescritos.

Suporta **CVSS 3.1 Base completo** (oito métricas). Rejeita vetores incompletos,
duplicados, valores desconhecidos, grupos Temporal/Environmental e outras versões,
incluindo CVSS 4.0. Não descarta métricas nem interpreta silenciosamente outra
versão. A atribuição do CVSS é da FIRST, usado conforme sua especificação.

As páginas HackenProof consultadas não fixam uma versão CVSS. O uso de 3.1 Base
é uma escolha deste perfil. Além disso, a página HackenProof de smart contracts
**menciona CVSS como fallback** para problemas não cobertos. Portanto, a afirmação
do novo anexo de que smart contracts nunca usam CVSS não corresponde a essa fonte.
Uma matriz de outra publicação Hacken não substitui automaticamente o contrato
HackenProof adotado aqui. A proibição de tabela + CVSS nesses domínios permanece
uma decisão explícita de perfil, não uma proibição atribuída à documentação.

O arquivo `config/triage-classification.example.json` é um exemplo parcial,
**não uma política ativa ou tabela oficial completa**. A aplicação não o carrega
automaticamente. A política deve vir de configuração confiável, separada do
relatório e do modelo. O hash da política identifica conteúdo, não sua aprovação.

## Uso

Validação local, sem modelo ou chamadas externas:

```powershell
cargo run --locked -p arkhe-bugbounty --bin validate_triage -- report.json analysis.json trusted-policy.json High Triaged
```

`analysis.json` precisa dos digests reais obtidos de `ReportDetails::digest()` e
`TriageParams::digest()`. Exemplo da forma da base (não de um relatório válido):

```json
{
  "kind": "HackenProofTable",
  "table_row": "web.ssrf",
  "cvss": {
    "vector": "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H",
    "score_tenths": 88
  }
}
```

Para análise Ollama com esse perfil:

```powershell
cargo run --locked -p arkhe-bugbounty --bin ollama_triage -- report.json High Triaged analysis.json trusted-policy.json
```

Em Rust, use `OllamaAnalyzer::with_classification(analysis, policy)`. O contrato é
validado antes da inferência. Os digests da classificação e da política integram
o artefato e o WER antes do hook de assinatura. O perfil sem classificação continua
disponível por compatibilidade, marcado `UNVERIFIED_LEGACY_PROFILE` no WER.

## Limites e pendências

- Isto valida consistência da classificação, não exploitabilidade, impacto real
  ou autorização de execução. Uma justificativa de fallback não prova ausência
  da vulnerabilidade em toda a tabela.
- O perfil `VerifiedTriagePolicy` agora exige os campos tipados de classificação
  e política, além de proveniência, admissão e vínculo relatório/proposta. Seu
  construtor verifica quórum Ed25519 contra registro com digest fixado por canal
  independente. O gate não interpreta `uncertainty_note`. Os candidatos estão em
  `governance/profiles/triage-report-v1` e `governance/trust-registry`; faltam chaves
  reais, assinaturas e confiança/ancoragem independentes. Não há ativação implícita.
- Não houve expansão da allowlist MCP, inclusão automática de `get_program_info`
  ou chamada ao HackenProof real. Verificação de escopo do programa permanece
  pendente de implementação e de acesso autenticado.
- A alegação sobre perda de reputação por classificação errada permanece
  **CONJECTURE**; não é premissa do validador.
- Não foram adotados os CVEs citados no anexo como fatos sem verificação.
- Os 250 tópicos são um catálogo de revisão, não 250 controles implementados,
  vulnerabilidades comprovadas ou testes aprovados. O inventário preservado em
  `engineering-topics.json` os mantém explicitamente como `NOT_ASSESSED`.

Nenhuma migração, operação remota, identidade de operação, freeze ou atestação de
produção decorre deste ajuste.

## Perfil de governança tipado

O WER possui `classification: Option<ClassificationBinding>`, com
`classification_digest` e `policy_digest`. `None` é omitido da serialização e da
projeção canônica, preservando os vetores legados byte a byte. Quando presente,
os dois digests são bytes CBOR e fazem parte do hash assinado do registro.

O executor coloca esses mesmos valores em contextos tipados
`SeverityClassification` e `ClassificationPolicy`. Sob o perfil verificado, o gate
exige correspondência exata, uma entrada de cada tipo e o digest da política
classificatória aprovada. Campos ausentes, duplicados ou divergentes são rejeitados.
O perfil legado não satisfaz essa exigência apenas por escrever texto no WER.

A classificação também integra `TriageParams::digest_for` sob o domínio
`AKG:TRIAGE:CLASSIFIED-PARAMS:v1`. A análise continua vinculando o relatório aos
parâmetros-base; seu WER vincula a proposta efetiva, que inclui a classificação.
O `operation_id` v2 permanece estável. Alterar a classificação/política na mesma
requisição produz conflito de parâmetros, sem uma segunda escrita externa.

O perfil é específico para `TriageReport`, solicitante e módulos permitidos.
Sua validade é conferida em cada autorização; o registro deve ser recarregado em
revogações. O pin fornecido pelo operador não é prova automática de administração
independente ou de ancoragem Rekor. Esses requisitos continuam sendo de implantação.

[Artefato candidato e procedimento de aprovação](../../governance/profiles/triage-report-v1/README.md).
