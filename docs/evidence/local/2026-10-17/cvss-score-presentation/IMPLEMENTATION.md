# Revisão de Roundup e score decimal

## Escopo solicitado

Inspecionar o arredondamento de `classification.rs` e adicionar uma representação
decimal auditável ao WER produzido pelo analisador classificado.

## Constatações e alterações

- O algoritmo anterior já seguia o Apêndice A da FIRST: `round()` em escala
  100000 seguido de `div_ceil(10000)`, retornando décimos inteiros. A extração
  para `roundup_tenths` tornou isso explícito sem alterar a equação.
- Teste direto cobre os exemplos de fronteira da norma, ruído binário e teto.
- `CvssPresentation` deriva `score_decimal` do score recalculado, sem receber
  float nem string decimal do chamador. Inclui `10.0`, não `10`.
- CLI local e CLI Ollama retornam `cvss` com vetor, décimos e decimal.
- O WER classificado inclui esse JSON em `uncertainty_note` antes do attestor.
  O teste do hook confere os campos e o digest; adulterar apenas `score_decimal`
  posteriormente muda o hash. A verificação Ed25519 existente continua vinculada
  ao hash integral do registro.
- Não houve alteração do schema genérico de WER, das projeções v1 da
  classificação/política, de migrações ou da política de autorização.

## Fontes e correção do anexo

[FIRST CVSS 3.1, Apêndice A](https://www.first.org/cvss/v3.1/specification-document#appendix-a---floating-point-rounding)
fundamenta as duas etapas de arredondamento.

A [página HackenProof de smart contracts](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/smart-contracts)
prevê CVSS para problemas não cobertos pela tabela. A página não determina uma
versão CVSS; não se adotaram como fatos as alegações contrárias do anexo.

## Evidência e limites

Resultados reais, logs e identidades de entrada: [RESULTS.md](RESULTS.md).
Os testes usam servidor HTTP Ollama simulado, sem inferência real, assinatura
institucional ou chamadas ao HackenProof. A exigência obrigatória do perfil
classificado no gate continua pendente de governança tipada e aprovada.
