# Gates da proposta versus estado executado

O anexo recebido em 2026-10-23 termina pedindo status + quatro testes, mas esse
código já existe. Foi feito um replay direcionado e registada a evidência,
em vez de criar outra implementação concorrente.

| Pilar da proposta | Estado Arkhe | Evidência / limite |
|---|---|---|
| Status e staleness | Quatro gates locais reproduzidos | [Relatório](../../docs/evidence/2026-10-23-kya-status-gates/README.md); codec v1.0 em envelope próprio, não VC interoperável |
| Principal real | Decisão escrita; integração pendente | ADR-010 escolhe avaliar biblioteca local com versão exata; nenhum certificado/CRL real validado |
| SafeTensors | Pendente | Não se carregou modelo real nem se verificou proveniência nesse formato |
| Política TEE por consumidor | Implementada para o PoC | Policy recalcula os checks, rejeita TEE obrigatório e aceita com limitações se opcional; quote/plataforma real continuam pendentes |
| Rekor público | Pendente | Há adaptador testado com log/witnesses locais; não houve publicação pública KYA |

Não se classifica o conjunto dos pilares como resolvido. Os testes de status
não promovem identidade legal, runtime, interoperabilidade ou demanda a factos.

## Ajustes ao modelo proposto

- A idade máxima é política do **verificador**, não uma permissão do emissor.
  A validade assinada da lista e o limite local de idade são ambos aplicados.
- Um timestamp de obtenção local não substitui a data da observação da fonte.
  O módulo distingue início/fim de validade assinados e instante de avaliação;
  não afirma ter consultado uma fonte externa de cadastro ou revogação.
- Verificar assinatura Ed25519 e expiração de credencial de terceiro não equivale
  a reproduzir cadeia ICP-Brasil/CRL, nem a confirmar estado live. Cada camada
  precisa de trust material e evidência próprios.
- `NOT_ATTESTED` é uma declaração de limite, não autorização. Enquanto não existir
  política geral de aceitação, o resultado criptográfico não deve ser usado como
  aprovação automática de pagamentos ou de outras ações.
- Inclusão em log não significa imutabilidade ou ausência universal de split
  views. A política e o histórico de checkpoints/witnesses permanecem necessários.

O próximo trabalho distinto, caso se prossiga na ordem proposta, é avaliar a
integração da biblioteca KYA Brasil segundo o
[ADR-010](../../docs/adr/ADR-010-kya-brasil-consume-or-mirror.md), não reimplementar
status. Esse trabalho não foi iniciado por inferência a partir do anexo.
