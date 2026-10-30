# Arkhe — confronto dos pareceres com a especificação v0.2

Data: 29/10/2026. Este parecer verifica o estado dos artefatos; não certifica conformidade regulatória ou prontidão operacional.

## Conclusão

Os anexos reforçam a necessidade de reprodução, mas o segundo usa um estado anterior da especificação para declarar sete decisões ainda abertas. A v0.2 já as documenta. Decisão documentada não equivale a implementação concluída: o módulo de conciliação permanece por implementar e testar.

## Matriz de rastreabilidade

| Objeção | Evidência na v0.2 | Pendência real |
|---|---|---|
| Contrato e interface ausentes | Decisão 1: ArkheCheckpointAnchor, record, Recorded e records | Integrar no novo módulo e fixar hashes dos artefatos usados |
| Envelope v2 sem mapeamento | Decisão 2: tabela dos 27 campos do candidato v3; v2 explicitamente excluído | Publicar schemas/vetores do módulo e verificar compatibilidade v3 |
| Ameaças abstratas | Decisão 3: tabela de ameaças e limites | Exercitar cenários e registrar resultados |
| Reorg sem regra | Decisão 4: depth >= 3, releitura e REFERENCE_BLOCK_CONFLICT | Implementar snapshot/revert e ramo alternativo |
| Adulteração ambígua | Decisão 5: testes separados de hash, replay e allowlist | Implementar os três mecanismos |
| Tempo indefinido | Decisão 6: epoch UTC, intervalos semiabertos e época fixa | Vetores de fronteira temporal |
| Volume indefinido | Decisão 7: três volumes, integração de 100 transferências e medições | Executar e publicar medições; nenhum SLO comercial comprovado |
| Regras sem governança | Decisão 8: mantenedor e allowlist externa | Governança de produção permanece pendente |
| Chaves sem método | Decisão 9: seeds sintéticas públicas e domínios | Exportar fixtures e testar; sem segurança operacional |

## Disponibilidade pública

Consulta direta à API GitHub confirmou os seguintes arquivos no commit 3096ba0a54eb33fc0e8c35081eef1cab9b67c634:

- arkhe/contracts/ArkheCheckpointAnchor.sol
- arkhe/protocol/src/rbb/header.rs
- arkhe/protocol/src/rbb/mmr.rs
- arkhe/protocol/src/rbb/trust.rs
- arkhe/protocol/Cargo.lock
- arkhe/run-tests.ps1

Referência: https://github.com/rafael-arkhe/rbb-arkhe/tree/3096ba0a54eb33fc0e8c35081eef1cab9b67c634/arkhe

Ausência de resultado em buscador não comprova indisponibilidade. Os arquivos confirmados são do núcleo e da integração experimental, não do novo motor de conciliação. Sua presença e lockfiles também não demonstram build bit a bit reproduzível.

## Âncora e reprodução

LOCAL_OPERATOR_ATTESTED demonstra verificação de uma declaração assinada sob uma configuração de confiança externa. Com chaves públicas de teste, qualquer pessoa pode produzir declarações válidas do fixture. Esse perfil exercita a mecânica de validação, não autenticidade adversarial, existência independente da âncora ou consenso QBFT.

O relatório futuro deve separar `attestation_signature_valid`, `chain_observation_independently_verified` e `test_keys_public`. No modo offline inicial, o segundo é false; o primeiro nunca pode ser apresentado como comprovação independente de ancoragem.

Há três propriedades distintas: replay determinístico do mesmo pacote; build reproduzível do código; reprodução independente por outra pessoa/organização. Nenhuma substitui as demais. Replay não prova qual software o produtor executou originalmente; demonstra que a conclusão pode ser recalculada com regras identificadas e entradas fornecidas.

## Ajuste editorial regulatório

O primeiro anexo mistura entrada em vigor da alteração com data de início da vedação. A referência já consultada distingue efeitos da alteração do art. 91 em 1º/10/2026 e vedação a partir de 6/11/2026; não é necessário supor uma alteração posterior para explicar as duas datas. Este parecer não realizou nova pesquisa regulatória nem verificou regulamentação superveniente sobre condições de reporte.

## Sequência de entrega

1. Versionar a especificação e suas decisões, com referência ao núcleo público.
2. Implementar schemas, vetores, normalização, regras, empacotamento e replay; testar localmente durante o desenvolvimento.
3. Publicar o código e instruções versionadas do novo módulo.
4. Executar a qualificação em ambiente limpo, com versões, comandos e hashes registrados.
5. Publicar pacotes e resultados, distinguindo execução pelo autor de reprodução independente.

Publicação é necessária para qualificação pública por terceiros; não impede testes locais de desenvolvimento antes dela. Não há evidência nova de implementação, benchmark ou reprodução independente nesta revisão documental.
