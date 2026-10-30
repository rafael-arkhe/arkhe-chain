# Reconciliação da auditoria — avaliação PRELIMINARY

O caso `origin-corrected` permanece uma previsão divergente do rótulo inicial e
uma contradição textual observável. A confirmação independente de seu rótulo
continua pendente. O self-check deste assistente não conta como segunda revisão
humana. Nenhuma identidade, revisão, assinatura ou independência foi presumida
a partir da resposta do usuário.

## Limites que a auditoria precisa preservar

- A execução chamou `OllamaAnalyzer::assess` pelo CLI, não `analyze`, admissão de
  WER ou `ContainmentGate`. Não produziu análise assinada, perfil aprovado,
  execução autorizada ou passagem real por esses filtros. O perfil continua
  candidato. A tabela da auditoria descreve um risco hipotético, não uma prova E2E.
- O gate verifica vínculos e autorização, não a verdade semântica da justificativa.
  Uma assinatura ou confiança máxima não certifica correção. A falha de qualidade
  pode ter impacto de segurança se decisões posteriores dependerem dela.
- Não foi encontrada uma regra implementada de revisão humana por severidade
  no módulo bugbounty/gate. `State` contém `Triaged`, `Rejected`, `Duplicate`;
  não há `Accepted`. Não se deve afirmar que um revisor já interceptaria o FP.
- A taxa observada de FP é condicionada ao modelo, prompt, corpus, rótulos e
  protocolo. Encaminhamento posterior muda exposição, carga de revisão e dano,
  não retroativamente a matriz de confusão da saída bruta. Relatar ambos.
- Não existe limiar de aceitabilidade aprovado para 12,5%. Revisão humana,
  mesmo se implantada, não torna essa taxa automaticamente aceitável.
- A checagem aritmética confirma contagens, não validade dos rótulos, autoria,
  assinatura, C2PA ou reprodução exata da inferência.

## Complementos executados sem nova inferência

`python scripts/summarize_triage_run.py` reconferiu rótulos e respostas brutas,
sem importar o cálculo do runner. Os resultados continuam TP=4, TN=7, FP=1,
FN=0 e ERROR=0. Preservou a execução original sem alterações.

- Baseline sempre apoiar: precisão 33,33%, recall 100%, oito FP.
- Baseline sempre rejeitar: precisão indefinida, recall 0%, quatro FN.
- Latência por caso: média 19,60 s, mediana 15,83 s, mínimo 11,75 s,
  máximo 56,28 s; soma 235,21 s, incluindo inicialização e overhead do CLI.
- Custo monetário e energia: não medidos; não foram declarados como zero.

Detalhes em `run-01-independent-summary.json`. Esses baselines são regras
constantes, não comparação contra outro auditor ou detector estático.

## Pacote externo fixado e ainda não avaliado

`python scripts/prepare_external_triage_review.py` baixou somente dados, README
e licença do SmartBugs Curated no commit
`230e649123477eff332742a59a1c7cc6dc286cab`:
https://github.com/smartbugs/smartbugs-curated/tree/230e649123477eff332742a59a1c7cc6dc286cab

Seis contratos foram escolhidos deterministicamente: dois por categoria de
controle de acesso, aritmética e reentrância. O pacote em
`tests/evaluation/external-review/smartbugs-curated/<commit>/REVIEW.json` preserva
hashes e anotações upstream; nenhuma inferência ou execução do código foi feita.
Os contratos conservam suas licenças originais, conforme o README upstream;
a licença do repositório não substitui a licença de cada contrato.

As anotações indicam vulnerabilidades, não severidades Arkhe nem negativos
verificados. Não preencher rótulos de proposta automaticamente. Fontes contêm
comentários que revelam respostas: preparar inputs sem esses comentários e
preservar o mapa da transformação antes da avaliação. Seleção pequena por ordem
alfabética não é amostra representativa nem holdout validado.

## Condições para run-02

O plano candidato exige revisão humana de fonte, alegação, severidade, controles
negativos e dependências de compilador. O registro deve conter identidade real,
`role`, hashes em `reviewed_artifacts`, conclusão, justificativa e data. O formato
DID é convenção interna, não requisito legal demonstrado nesta rodada. Não foi
adotada como fato nenhuma alegação regulatória ou protocolo externo do texto
recebido; a revisão humana é condição deste plano de avaliação.

Revisão cega requer um revisor que não tenha visto a decisão anterior, fixando
seu parecer antes da comparação. O autor deste assistente e qualquer pessoa já
exposta à conclusão não podem afirmar cegueira retrospectivamente. O pacote
neutro só omite resultados; não comprova independência ou ausência de exposição.

O plano propõe revisão humana para todas as severidades, nenhuma escrita externa
e confiança sem poder de dispensar revisão. Isso não está implementado como
política de produção nem foi aprovado. Split por proveniência, holdout reservado,
negativos revisados e critérios de aceitação permanecem pendentes. Após fixá-los,
executar no mínimo três repetições, reportando variância e erros. Nenhuma repetição
foi iniciada para dar aparência de revisão concluída.
