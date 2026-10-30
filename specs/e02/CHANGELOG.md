# Changelog — arkhe-e02

## arkhe-e02@1 — FROZEN local, 2026-10-23

Perfil devnet de compromisso em memo, distinto de E01. O memo transporta
compromisso, não prova MMR completa; v1 admite apenas `synthetic-poc`.

Decisões fechadas:

1. `anchor_ref`: assinatura base58 canónica da transação de âncora, 64 bytes.
2. Proveniência opcional e declarativa; `signed` não autentica o publisher.
3. Devnet: dataset público no repo e digest dos bytes exatos no memo de âncora.
   Release assinada/URL fixa para E03 permanece direção futura, fora de E02.
4. Devnet: publisher de chave única com aviso, sem quórum. Mainnet exige
   multisig 2-of-3 e não é autorizado pelo perfil E02.
5. Statements PT-BR/EN fixados; implementação atual usa PT-BR.

E02-13 acrescenta aviso obrigatório na saída e na UI: recibos RPC não são
autenticados pelo verificador; fidelidade on-chain depende do canal de
observação. Um tripleto fabricado coerente pode produzir `VERIFIED`.

Foram corrigidas a aplicação do limite de 16 MiB em UTF-8, a rejeição de
provas pré-computadas divergentes e a captura de exceções no verificador Node.
Cobertura funcional: 27 casos obrigatórios, dois ramos do caso 26, quatro
casos adicionais; 32 ficheiros de conformidade, 14 vetores de fio e propriedades
de implementação. Validação: 109 testes aprovados e typecheck da UI aprovado.

Smoke real de 2026-10-23: ANCHOR slot 514359515 e REF slot 514359520,
ambas finalizadas; dataset assinado de duas folhas; verificação offline e
paridade Node/browser reproduzidas sem alterar os bytes ancorados.

Freeze local sem auditoria externa e sem tag/release: este workspace não tem
checkout Git. Não inclui publicação de dashboard, token ou operação mainnet.
