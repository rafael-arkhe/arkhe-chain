# Identidade observada: auditoria offline

Executado audit_proposal_identity.py sobre as três respostas completas da condição schema, sem chamadas ao modelo. O replay diagnóstico percorre todos os pares dos controles conhecidos, enquanto o gate original interrompia no primeiro erro. Não altera aquele resultado, prompt, schema ou política de admissão.

Resultado: 3/3 propostas mantêm a grade em todos os inputs examinados; um único hash de programa. Clique: ambas as mudanças exigidas são omitidas e o NOOP é correto. Cada repetição de movimento: a translação livre falha e o bloqueio é correto. São medidas por proposta, não amostras independentes. Identidade empírica de grade não prova equivalência universal nem ausência de mudança de estado. O relatório registra estado separadamente. Nenhum candidato admitido.

Artefato: D:/arkhe/output/arc3-proposal-identity-audit-20261027/report.json. Classificação local: LEMMA, limitada aos inputs examinados.

## Correções ao anexo

- Já existe feedback semântico: previous_training_feedback inclui FIRST_GRID_MISMATCH, predicted e expected. Falta de feedback não explica o resultado por si só.
- Identidade é uma solução simples, mas o programa recebido tem sete nós; pair(g,s) tem três. Não é o menor programa nessa DSL. Três repetições determinísticas não estimam um prior geral do modelo nem isolam sua causa. Prompt, exemplos de identidade e configuração continuam fatores possíveis.
- Recomendar mudar ao menos uma célula incondicionalmente excluiria transições válidas bloqueadas e NOOP. Um reparo futuro deve apontar apenas mudanças exigidas pelo alvo de treino. Métricas aqui são diagnósticas, não um novo gate.
- intent/expected_delta autodeclarados podem contradizer a execução; não obrigam mudança real. Acrescentá-los muda o contrato e exige validação própria. Não implementados nesta rodada.
- A barreira sintática foi superada nas respostas observadas, não provada eliminada em qualquer geração futura. O gargalo observado é ajuste comportamental; sua causa permanece aberta.

## Fontes verificadas

Schema: https://arxiv.org/abs/2609.39140 relata RHAE de 58,7 para 99,2 com o mesmo modelo e um harness composto de workspace, checagem histórica, planejamento e verificação passo a passo. Isso não isola feedback contra identidade como causa, nem transfere o resultado para esta DSL/modelo.

ChopChop: https://doi.org/10.1145/3776708 e https://arxiv.org/abs/2509.00360 descrevem restrições semânticas por realizabilidade de completamentos. Não implementamos esse decoder. A caracterização de custo necessariamente alto não decorre do resumo, que relata pequeno overhead nas avaliações.

As frases atribuídas a DisasterBench e sobre grounding interno não foram verificadas; permanecem ECHO neste anexo, não fundamento do diagnóstico local.
