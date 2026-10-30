# E02 v1 — matriz de conformidade, 2026-10-23

Escopo: cobertura dos requisitos de §8 e da fronteira de confiança dos recibos.
Não mede cobertura de linhas/ramos e não constitui auditoria externa.
Este relatório suporta o freeze local `arkhe-e02@1`, registado em
`specs/e02/README.md`; não constitui publicação de release.

## Reprodução

```powershell
node --test scripts/e02_memo_commitment.test.mjs scripts/e02_mmr.test.mjs scripts/e02_verify.test.mjs scripts/e02_anchor.test.mjs scripts/e02_conformance.test.mjs apps/arkhe-intra/tests/e02.test.mjs
npm --prefix apps/arkhe-intra run typecheck
```

Vetores imutáveis durante os testes: `verification/vectors/e02/conformance/`.
`node scripts/e02_generate_vectors.mjs` regenera apenas esses vetores sintéticos,
com seed pública de teste, sem rede. Não executar para atualizar expectativas
automaticamente após falhas: os `reason` esperados estão fixos no gerador.
Os testes não regeneram fixtures e não alteram o dataset ancorado real.

## Casos obrigatórios de §8

| Casos | Ficheiros (prefixos) | Resultado esperado |
|---|---|---|
| 1–3 | `01`, `02`, `03` | `VERIFIED`, n=1/5/7, prova reconstruída validada pelo WASM Rust |
| 4–5 | `04`, `05` | `VERIFIED`, provas pré-computadas coincidentes / proveniência assinada |
| 6–12 | `06`–`12` | Rejeição de tamanho, hex maiúsculo, zero inicial, base58 inválido, versão, vazio, espaço |
| 13–16 | `13`–`16` | `LEAF_NOT_IN_DATASET`, `LEAF_AMBIGUOUS`, `ROOT_MISMATCH`, `N_MISMATCH` |
| 17–20 | `17`–`20` | `PROOF_INVALID`, `ANCHOR_NOT_FOUND`, `ANCHOR_ROOT_MISMATCH`, `ANCHOR_DATASET_MISMATCH` |
| 21–22 | `21`, `22` | `OP_ID_MISMATCH`, `LABEL_OUT_OF_SCOPE` |
| 23 | `23-4097-leaves` | `DATASET_INVALID`, limite de folhas excedido |
| 24 | `24-duplicate-json-key` | `DATASET_INVALID`, chave JSON duplicada |
| 25 | `25-failed-transaction` | `TX_FAILED` |
| 26 | `26-0-memos`, `26-2-memos` | `MEMO_MISSING`, `MEMO_MULTIPLE` |
| 27 | `27` | `ARTIFACT_INVALID`, folha não canónica mas root e memos coerentes |
| 28–31 | `28`–`31` | `ANCHOR_N_MISMATCH`, `DATASET_INVALID` (1041 bytes, 33 passos, formato de proveniência) |

Todos os 32 ficheiros passam pelo runner `e02_conformance.test.mjs` em Node e
no motor browser, com paridade da saída completa. O caso 5 tem assinatura
Ed25519 verificada separadamente usando a chave pública indicada por `kid`.
Os positivos são comparados com `verify_mmr` do WASM Rust; o builder também tem
paridade com os vetores MMR congelados de 1, 3, 4, 5 e 7 folhas em
`e02_mmr.test.mjs`. O caso 17 testa prova de outra folha, não um caminho
arbitrário malformado. Um teste adicional altera prova de folha não referenciada.

## Invariantes

| ID | Positivo | Rejeição ou propriedade |
|---|---|---|
| E02-1 | 1–5 | 6, 10, 11, 26; vetores de fio e separador extra |
| E02-2 | 1–5, round-trip de fio | 7–12, 24, 27; base58 de 63/65 bytes e limites numéricos |
| E02-3 | 1–5 | 13–14 |
| E02-4 | 1–5 | 15, 19; teste de root do memo divergente em `e02_verify.test.mjs` |
| E02-5 | 1–5 | 16, 28 |
| E02-6 | 1–5 | 17, 30; prova divergente para índice não referenciado; WASM rejeita prova/root mutadas |
| E02-7 | 1–5 | 18, 20; teste de reformatação dos bytes do dataset em `apps/arkhe-intra/tests/e02.test.mjs` |
| E02-8 | 1–5 | 21 |
| E02-9 | 1–5 | 22 |
| E02-10 | 1–5 | Todos os negativos; exceção de entrada e WASM produz `NOT_VERIFIABLE` |
| E02-11 | Texto de todos os positivos | Texto exato de todos os negativos; não afirma autoria/veracidade |
| E02-12 | API em processo sem permissão de escrita e com assinatura/geração de chaves proibidas | Entradas congeladas e diretório temporário vazio após execução; estado não alterado em todos os vetores. Ausência de autoridade é requisito de desenho, não teorema demonstrado por teste. |
| E02-13 | Aviso presente em todos os positivos/negativos; UI renderiza o campo | Recibos fabricados coerentes passam com aviso; isso demonstra o limite, não uma rejeição que o perfil não promete |

## Regras de §2.3

| Regra | Cobertura |
|---|---|
| ASCII sem controlos | Vetores de fio `non-ascii`, `control`, `space`; teste explícito de newline |
| Tamanho máximo | Vetor de fio `too-large`, conformidade 6; memo de referência máximo em teste de round-trip |
| Número exato de tokens | Casos 11/26, vetor de fio `extra-field`, teste de `::` e separador final |
| Campos vazios, espaços, `+`, `-`, `0x` | 11/12; teste `memo numeric, separator and encoding rejection cases are explicit` |
| Hex minúsculo com 64 chars | 7; testes de comprimento 63, `0x`, colchete e uppercase |
| n=1..4294967295, sem zero inicial | 8; wire `anchor-max-n`, `overflow`; teste explícito n=0/negativo/positivo com sinal |
| Assinatura base58 de 64 bytes, round-trip | `parser enforces canonical base58`; todos os positivos; inválido 9 e wire `short-signature` |
| Prefixo/versão conhecidos | 10; testes `OTHER`, `NOPE`, `v2` |

Os 14 vetores de fio são comparados também com o parser browser. Base58 tem
representação única: um vetor com os mesmos bytes mas re-encode diferente não
existe sob este alfabeto; não é uma lacuna de conformidade.

## Limites de §4.2 e falhas operacionais

| Limite/propriedade | Teste |
|---|---|
| Dataset 16 MiB | JSON válido com padding até exatamente 16 MiB aceito pelo parser; +1 byte rejeitado pelos dois verificadores; multibyte UTF-8 também medido em bytes |
| 4096 folhas | Parser aceita 4096; rejeita 4097; caso 23 nos dois motores |
| 1040 bytes por folha | Parser aceita 1040; rejeita 1041; caso 29 nos dois motores |
| 32 passos | Parser aceita 32; rejeita 33; caso 30 nos dois motores |
| Proveniência | Formato inválido rejeitado em 31; chave desconhecida/assinatura não autenticada não é erro v1 (teste já existente `provenance is surfaced but does not change the commitment`) |
| Timeout/erro RPC | `confirmation fails closed on error and timeout` em `e02_anchor.test.mjs`: prazo esgotado e RPC rejeitado com `TimeoutError`. O ancorador lança erro; não emite laudo de sucesso. O verificador offline não chama RPC e não produz artificialmente `RPC_UNAVAILABLE`. |
| Exceções | API Node captura exceção de entrada; motor browser captura erro do WASM; ambos falham fechados |
| Smoke real | Teste reproduz os três ficheiros capturados em devnet e compara Node/browser, com o aviso obrigatório. Nenhum envio adicional é necessário. |

Aceitar um limite estrutural no parser não significa aceitar uma folha arbitrária
como artefacto válido nem uma prova arbitrária como inclusão. Cada camada valida
o seu próprio requisito. A UI/API existente aplica ainda um limite de upload de
256 KiB; não se afirma que a UI aceita todo dataset permitido pelo perfil.

## Estado

Validação final nesta ronda: **109 testes, 109 passaram, 0 falhas**; typecheck
da UI (`tsc --noEmit`) aprovado. Nenhuma transação adicional foi enviada.

Cobertura dos 27 casos obrigatórios executada, incluindo os dois ramos do caso
26, mais quatro casos adicionais e propriedades de implementação. O aviso RPC
é obrigatório na saída e visível na UI. O smoke real mantém `VERIFIED` com os
mesmos bytes ancorados. A cobertura não elimina a confiança no canal RPC nem
certifica o software contra todas as entradas possíveis.
