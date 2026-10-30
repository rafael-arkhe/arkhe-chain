# Run-02 candidato v2 — cinco repetições, ainda sem execução

O parecer foi incorporado ao plano, sem tratar suas referências não fornecidas
como normas ou resultados reproduzidos. Cinco repetições são escolha deste piloto,
não garantia de estabilidade. O threshold kappa >=0,80 continua candidato interno;
não foi promovido a limite universal ou aprovação de qualidade.

## Alterações

- Critérios e plano atuais passam de três para cinco repetições. O arquivo
  `run-02-criteria.v1.md` preserva os bytes anteriores, conferidos contra o hash
  do manifesto v1. Os pacotes de fontes históricos continuam registrando três;
  sua configuração prospectiva é substituída pela versão 2 do plano.
- O cálculo agora produz contagens/taxas por repetição, média, desvio-padrão e
  variância amostrais, com contagem de denominadores definidos.
- Flip rate usa casos com cinco respostas válidas; reporta Wilson 95% descritivo,
  completude e limites de sensibilidade a casos faltantes. ERROR não é voto
  negativo e não será eliminado das tentativas. O resumo de repetições é uma
  função estatística testada, não um runner de inferência já implantado.
- A comparação futura com Slither é explicitamente descritiva, condicionada ao
  corpus e aos rótulos humanos. Não é validação contra oráculo nem justificativa
  para adotar taxas de SAST publicadas em outros estudos.

## Verificações executadas

`python tests/evaluation/test_triage_statistics.py`: **8 testes passaram**,
incluindo cinco repetições com decisão variável, resposta ausente, nenhum caso
completo e denominadores indefinidos.

`python scripts/audit_triage_split.py`: 27 hashes conferidos (24 fontes e três
arquivos do pacote), sete grupos candidatos de proveniência, 18 fontes em
desenvolvimento e seis reservadas. Não há interseção dos grupos declarados nem
duplicatas exatas ou após normalização de CRLF entre os splits. O relatório está
em `run-02-split-audit.json`.

Essas checagens não identificam toda cópia com renomeação, fork, alias ou variante
semântica. `holdout_validated` permanece false. O verificador não afirma que o
modelo nunca viu fontes públicas no treinamento. Uma divisão de seis fontes
reservadas também não assegura os cinco casos por classe exigidos no plano:
composição e controles precisam ser construídos e revisados antes de inferir.

## Estado

Identidade e parecer humano, rótulos, controles negativos, transforms sem pistas,
validação do split e ratificação dos critérios permanecem pendentes. Não houve
Slither, nova inferência, WER assinado, passagem pelo gate ou ativação de política.
As funções estatísticas e o teste de split não completam esses requisitos.

**PRELIMINARY / RUN-02 NOT EXECUTED**.
