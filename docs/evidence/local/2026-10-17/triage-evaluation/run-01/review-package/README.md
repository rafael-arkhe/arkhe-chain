# Pacote de revisão de run-01

> Não ajustes os rótulos para coincidir com o modelo. Se discordares, discorda.

Status: PREPARED_NOT_REVIEWED. Nenhum veredicto, concordância ou assinatura humana
foi produzido pelo assistente. Copie review-template.json para review.json ao
iniciar sua revisão; preserve o template e os artefatos originais.

## Antes de começar

Revisor previsto: admin, placeholder não conforme did:arkhe:employee:<base58>.
Independência assumida conservadoramente como false, a confirmar pelo revisor.
profile.json continua REQUIRES-OPERATOR-IDENTITY; preparar este pacote não aprova
política nem promove identidade. Revisão de operador concluída recebe
REVIEWED_BY_OPERATOR; revisão independente continua pendente.

Declare exposição prévia antes de abrir os arquivos. Quem já conhece os rótulos,
as previsões ou a discussão de origin-corrected não pode declarar revisão cega
deste caso. O anexo fornecido já discute o resultado: ordem de leitura não apaga
esse conhecimento. Uma nova pessoa sem exposição pode seguir o protocolo abaixo.

## Protocolo de leitura em cinco passos

1. Leia somente dataset.json. Os 12 IDs são opacos, títulos foram neutralizados,
   e family, rationale e expected_support foram removidos. Corpos e severidades
   foram preservados; as evidências semânticas do próprio relatório permanecem.
2. Preencha support_proposal true/false e justificativa para todos os casos no
   seu review.json. Salve, registre horário e hash antes de revelar os rótulos.
3. Abra labels-sealed.json, compare e registre concordâncias/discordâncias sem
   alterar retrospectivamente seus rótulos. O mapa para IDs históricos está ali.
4. Leia apenas origin-corrected-blind/analysis.txt e registre se o texto sustenta
   a proposta, com justificativa e horário, antes de abrir a decisão agregada.
5. Abra decision-sealed.json e então stdout-raw.json; compare texto, decisão e
   rótulo histórico. Registre o veredicto e se a contradição se confirma.

Os selos são procedimentais: arquivos em texto aberto, sem criptografia ou
controle de acesso. stdout-raw.json também revela a decisão e deve ficar fechado
até o passo 5. É cópia byte a byte do stdout completo preservado da CLI; o run não
reteve uma resposta HTTP bruta do provedor. analysis.txt é assessment.reason sem
reescrita; a própria análise pode expressar semanticamente uma conclusão.

## Comparação e métricas

support_proposal é a resposta do revisor; expected_support é o rótulo histórico;
supports_proposal é a previsão do modelo. Não os confunda. TP/TN/FP/FN exigem
comparar previsão e referência: referência false + previsão true = FP. Dizer que
o modelo deveria rejeitar não transforma essa previsão positiva em TN.
Se o rótulo original estiver errado, registre label_wrong e a correção proposta;
nunca sobrescreva run-01. Qualquer recálculo deve gerar novo artefato vinculado
aos hashes originais. Sem veredicto humano, métricas históricas ficam preservadas.

escalation-policy.json registra NOT_RECORDED_IN_RUN_01: não foi encontrada uma
política versionada ativa nos artefatos retidos. O plano prospectivo run-02 não
é aplicado retroativamente. Não há inferência nova, ratificação ou escrita externa.

## Integridade

package-manifest.json vincula SHA-256 das fontes e de cada arquivo preparado.
O manifesto não é assinatura nem timestamp independente. Para verificar:

```powershell
python scripts/prepare_triage_review.py --verify
```
