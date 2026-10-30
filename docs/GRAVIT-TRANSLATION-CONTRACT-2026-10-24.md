# Primeiro contrato executável Gravit → Arkhe

Nota de versão: este relatório registra o recorte v1 e seus resultados históricos. O código atual usa byte strings CBOR e domínio v2; ver [projeção binária v2](GRAVIT-CBOR-PROJECTION-2026-10-24.md). As evidências v1 foram preservadas.

Implementado exclusivamente em `kernel/arkhe-kernel/tests/gravit_translation_contract.rs`. Não há módulo de produção, rota, adaptador instalado ou alteração de comportamento do ContainmentGate. `sha3` foi acrescentado apenas às dev-dependencies do kernel; Cargo.lock registra essa dependência de teste.

## Domínio e bytes

O recorte fixa `AKG:GRAVIT:EXTERNAL:v1\0` como domínio BLAKE3-256, incluindo o byte NUL final. O perfil é explicitamente `digest-binding-test-only-v1`. A projeção é um mapa codificado por `arkhe_core::canonical::encode_value`, com:

- `profile`, `verifier_commit` e `subject` como strings;
- `request_bytes` e `decision_bytes` como arrays de inteiros de 0 a 255 contendo todos os bytes capturados;
- `artifact_sha3_256` como SHA3-256 completo, hexadecimal minúsculo sem prefixo, recomputado sobre o conteúdo;
- `parameters_digest` e `policy_digest` como Digest32, codificados como byte strings pelas regras existentes do Arkhe.

Os bytes JSON embutidos não são recodificados para calcular o compromisso: `0.88`, `0.880000` e espaços diferentes geram compromissos diferentes. Isso fixa a identidade desta captura sem pretender resolver diferenças semânticas de parsing ou o preimage de assinatura do Gravit. Floats não são enviados ao encoder CBOR inteiro do Arkhe. Uma implementação futura deve preservar também os preimages assinados e validar a representação upstream; este teste não os reconstrói nem verifica assinaturas.

## Tradução e fronteiras verificadas

1. A tradução produz um WER candidato, com `input_digest` igual ao compromisso completo acima, `output_digest` igual ao digest dos parâmetros propostos e `evidence_refs` contendo o compromisso. `execution_id` deriva do compromisso; `confidence_bps` fica ausente. `decision_id` permanece nos bytes externos e não vira identidade de operação.
2. A fronteira de admissão de teste exige `SUCCESS` **e** `Verified Fact`, sujeito correspondente e todos os hashes de evidência iguais ao SHA3-256 recomputado do artefato. Exigir todos é uma regra conservadora deste recorte, não uma política definitiva para exclusões no Gravit.
3. Um hash inválido recusa a admissão. Ao tentar autorizar a intenção protegida, o ContainmentGate real responde `missing admitted analysis evidence`. O gate não interpreta `integrity_hash`; a rejeição de conteúdo ocorre antes dele.
4. Um candidato com digest correspondente só passa pelo gate quando a política de teste permite. Negação de governança, ausência de admissão e troca dos parâmetros continuam sendo rejeitadas.

O sujeito, os parâmetros, a política e a versão do verificador são fixos na fixture. Não foi criada uma API genérica com valores fornecidos por um chamador externo.

## Sete testes e resultado

| Caso | Resultado esperado e observado |
|---|---|
| `SUCCESS` reproduzido com hash inválido | Admissão recusada; gate rejeita falta de evidência admitida |
| Controle com digest correspondente | Allow somente com admissão e governança de teste; negação e bypass rejeitados |
| Hash com 64 hex incorreto / conteúdo substituído | Recusa por digest, sem depender apenas de sintaxe |
| Parâmetros alterados após admissão | Gate rejeita o vínculo com a proposta |
| Bytes diferentes com decisão externa idêntica | Compromisso e WER diferentes; separação de domínio preservada |
| Resposta capturada substituída sem novo WER | Compromisso não corresponde, admissão recusada |
| SUCCESS em estado inferior / sujeito diferente | Recusa explícita no recorte de admissão |

Comando executado: `cargo test -p arkhe-kernel`. Resultado: **31 aprovados, 0 falhas**, incluindo os 7 novos testes. A configuração padrão não habilita `sqlite-broker`; os testes dessa feature não foram executados. Log em `evidence/2026-10-24-gravit-translation/kernel-tests.log`.

## Proveniência e limites

As duas fixtures foram extraídas da sondagem `nonempty_nonhash_is_not_recomputed` de `docs/evidence/2026-10-24-gravit-review/contract-probes.json`. Os valores foram serializados uma vez para JSON UTF-8 sem BOM; não são uma captura bruta do transporte original. Os bytes dessas fixtures são a referência preservada pelo novo teste. A decisão realmente reproduzida é `SUCCESS` / `Verified Fact` apesar de `integrity_hash = not-a-cryptographic-digest`.

O controle positivo altera o hash para corresponder ao conteúdo local. Isso invalida as assinaturas originais: ele é **sintético e exclusivo do teste de vínculo**, não um novo resultado Gravit assinado válido. O teste não concede autoridade a essas assinaturas.

Ainda faltam, antes de uma integração operacional: validação de assinaturas e associação requisição/resposta à execução confiável; registro/raiz e respectivos digests no compromisso; compatibilidade do quórum com PolicyResolver; relógio aceito e freshness obrigatórios; regras completas para estados, contradições e exclusões; registro persistente, revogação e reavaliação. O quórum 3 de 5 era da fixture e não é propriedade universal do formato. Regras temporais de Bitstring Status List não se aplicam automaticamente a todo WER.

Este resultado demonstra o encadeamento **digest recomputado → admissão → gate**, no perfil de teste. Não demonstra ainda compatibilidade operacional integral entre Gravit e Arkhe. A reprodução anterior demonstra concordância no corpus publicado, não uma prova geral de correção do Gravit.
