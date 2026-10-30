# ADR-006 — VERIFIED é um objetivo condicionado por evidência real

Data: 2026-10-23. Estado: aceite como direção de produto; implementação de
`VERIFIED` de produção pendente. Nesta ronda o utilizador pediu **apenas fixtures
sintéticas**. Elas não validam identidade legal, TEE ou implantação pública.

## Decisão e tabela de decisão

Separar o resultado criptográfico, a aceitação pela policy e a autorização de
uma ação. `authorization_granted` permanece false neste verificador. Um eventual
`VERIFIED` também não constitui autorização financeira ou parecer jurídico.

| Evidência recalculada | Exigência | Decisão |
|---|---|---|
| Inválida, revogada, suspensa, obsoleta ou incompatível com pins/desafio | Qualquer | `REJECT` |
| Eixo obrigatório `NOT_CHECKED`/não implementado | Obrigatório | `REJECT` |
| Eixo opcional não verificado | Opcional | No máximo `ACCEPT_WITH_LIMITATIONS`, com limites explícitos |
| Todos os eixos mandatórios de um perfil de produção implementado, com evidência válida, fresca e vinculada | Perfil de produção | Futuro `VERIFIED` qualificado por perfil/policy |
| Fixtures, test keys ou perfil `synthetic-poc` | Qualquer | **Nunca `VERIFIED` de produção** |

Flexibilizar `require_tee` ou `require_icp_brasil` não fabrica evidência nem
promove um eixo a verificado. Os flags atuais têm efeito: obrigá-los rejeita.
Eles não são decorativos e não serão removidos por esse motivo.

## Gates por eixo para um futuro perfil de produção

| Eixo | Evidência necessária | Situação atual |
|---|---|---|
| Chaves, mandato e contexto | Assinaturas estritas, vínculo agente/principal/mandato, audiência/ação, desafio fresco consumido pelo host | Checks criptográficos sintéticos implementados; consumo de desafio operacional pendente |
| Principal ICP-Brasil | Posse da chave sobre contexto/mandato, cadeia/uso/validade, estado de certificado e confiança de issuer explícitos; cadastro separado e fresco se exigido | Apenas principal de teste. ADR-010 orienta integração; ICP real não executado |
| Artefacto do modelo | Bytes identificados, parser próprio do formato e digests/proveniência validados sob policy | Hash declarado/vínculo assinado; modelo real não validado nesta etapa |
| Runtime | Quote e endorsements de uma plataforma escolhida, medições, vínculo agente/modelo/contexto, nonce e avaliação por verificador adequado | `NOT_ATTESTED`. Nome de observer ou digest de trust root não bastam |
| Estado da credencial | Binding assinado, lista autenticada, propósito/índice corretos, validade, idade local e piso persistente | Perfil local assinado implementado; VC interoperável/estado live pendentes |
| Ancoragem | Inclusão e checkpoint autenticados sob trust distribuído, quórum/política de witnesses e premissas de consistência explícitas | Composição local Sigstore/C2SP testada; publicação KYA e operadores reais pendentes |

Status e revogação não são artificialmente contados como duas validações
independentes. Suspensão e revogação são propósitos distintos da mesma camada
de estado, cada um com policy própria.

Não se fixa NRAS, PPCIE ou uma plataforma específica por menção num anexo;
qualquer perfil TEE exige fontes, threat model, trust material e fixtures próprias.

## Evidência e próximos gates

Testes não são teoremas de segurança. O que existe é evidência funcional local
para casos nomeados. Não se criará `verified_when_all_axes_checked` injetando
booleans fictícios para afirmar que as integrações existem. O teste positivo
de produção fica pendente até existirem os adaptadores e evidências reais.
Os testes atuais de obrigatoriedade/rejeição continuam executados.

O consumidor operacional do PoC é o operador local da CLI, com state file
próprio. Não há provider de pagamentos identificado ou formato aceito por cliente.
Metas de ICP-Brasil/provedor/TEE são gates de execução, não promessas de prazo.
