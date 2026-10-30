# Reconciliação de features e fechamento P0

Data: 22/10/2026. [Matriz completa de 118 itens](BACKLOG.md) · [Dados e dependências](features.json) · [Entrada preservada](source.md) · [Resultados locais](../evidence/2026-10-22-feature-backlog/RESULTS.md).

Esta reconciliação distingue o workspace principal do AGI, os perfis criptográficos congelados, implementação de biblioteca, testes sintéticos e qualificação operacional. Não converte proposta, nome de struct ou documentação em capacidade executada.

## Correções e implementação

- MMR: validação de shape, posição da folha, tamanho/count e caminho; regressões de adulteração em todas as posições; roots congelados preservados.
- GGUF: fixture mínima de 24 bytes explicitamente rejeitada pelo perfil lab, que exige tensores. Suporte geral v2/v3, quantizações e metadados amplos continua distinto do subconjunto implementado.
- Predicados no gate: licença SPDX e PaymentMandate AP2 v0.2 opt-in, com verificação independente, envelope admitido, vínculos a intent/worker/política e reconfirmação da spec.
- Licença: interpretação de expressões SPDX por obrigações fornecidas pela governança, hash do SBOM no WER e artefato ligado ao root package por SHA256. Certificado transparente; ZK exigido e indisponível é recusado.
- AP2: Direct/Autonomous no Payment Mandate leg por atestação autenticada de role externo; o Arkhe não reimplementa assinaturas/constraints AP2. Inputs e execução concretos vinculados, checkpoint confiável e consumo único anterior ao efeito.
- Broker: gate, mandato, executor no host e journal; SQLite WAL/FULL standalone opcional com owner, replay, concorrência e reabertura. O journal PostgreSQL existente não foi substituído.
- Jules/AGI: conversor para WER sem assinatura com OperationId pré-dispatch e horário do evento de conclusão; callback de registro do nome imediatamente após create, sem retry automático em erro incerto.
- Infraestrutura: registro de arquitetura sincronizado ao crate CRM existente; Clippy estrito e checker do backlog no CI; correções locais de lints sem mudar APIs estabelecidas. Novos critérios de maturidade, índice MMR e ADR-018.

## Decisões e limites

SPDX e AP2 v0.2 foram escolhidos pelo usuário durante esta tarefa. O primeiro perfil de licença é um subconjunto SPDX-2.3 JSON, não certificação Lite/3.x completa. A tabela de obrigações deve ser revisada pela governança; os exemplos são sintéticos. Não se deduz cumprimento jurídico da mera existência de um SBOM.

A ponte AP2 confia num role identificado e autenticado para validar protocolo, credenciais, assinaturas, disclosures e constraints. Os testes usam tokens opacos sintéticos e role de laboratório. Interoperabilidade com um role real, emissão/revogação das atestações e construção do efeito financeiro são gates de ativação separados.

O tempo anterior do mandato depende da fonte confiável do checkpoint e da observação autenticada do role. Inclusão MMR não estabelece tempo absoluto nem prova de execução. A verificação local não movimenta dinheiro nem produz uma prova de solvência.

Os P0 operacionais remanescentes ficam expressos como bloqueadores de ativação, sem falsa conclusão: isolamento real de credenciais/sandbox, qualificação de executor externo, role AP2 real, origem autenticada e política real de SBOM, e persistência de sessão do host AGI live. Nenhuma chave de produção ou permissão é criada para fechar esses itens por aparência.

Guia técnico: [predicados SPDX/AP2](../FORMAL-PREDICATES.md), [broker](../ACTION-BROKER.md), [Jules](../JULES-COMPLETION.md), [critérios](../MATURITY-CRITERIA.md), [journal](../adr/ADR-018-journal-persistence.md).
