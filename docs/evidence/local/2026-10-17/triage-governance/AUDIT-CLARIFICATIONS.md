# Verificações pontuais do candidato

Esta rodada conferiu documentação, parser e rejeição real do candidato. Não
provisionou identidade, registro, pin ou assinaturas e não ativou o perfil.

## Comando que passou

`python scripts/check_triage_candidates.py` retornou 0 e imprimiu:

```text
PASS candidate identities match; empty registry and unsigned approvals are rejected; no active profile.
```

É uma checagem de identidade e rejeição esperada. Não é sucesso de aprovação.
O script passa o digest local apenas para o teste negativo; isso não o torna pin
confiável. `profile.sig` está ausente; o exemplo tem aprovações vazias.

A execução direta foi:

```powershell
& .\target\debug\triage_policy.exe verify-files governance/profiles/triage-report-v1/profile.json governance/profiles/triage-report-v1/profile.sig.example.json governance/trust-registry/public-keys.json (Get-Content governance/trust-registry/REGISTRY-DIGEST.txt -Raw).Trim()
```

Retorno 1, com erro `registry requires at least two distinct governance keys and
a valid quorum`. O construtor rejeita primeiro o registro vazio; esse comando
não isola a rejeição de uma assinatura ausente com registro válido.

## CLI e fronteiras reais

`target/debug/triage_policy.exe --help` retornou 1 e a mensagem de uso. Não existe
handler dedicado de ajuda. Inspeção de `src/bin/triage_policy.rs`: não há entrada
de chave privada, seed ou mnemonic, nem operação de assinatura. `signing-bytes`
apenas emite os bytes; flags desconhecidas não habilitam operações adicionais.

O pin precisa ser não zero e coincidir com os digests do registro e do envelope;
o quórum também é obrigatório. A independência da origem do pin é externa ao
programa. Não existe flag de ativação e o candidato não é carregado automaticamente.

## Duas afirmações da auditoria que o código não sustenta

- O README não está coberto pelo pin do registro ou digest do perfil. A frase
  sugerida afirmaria uma vinculação inexistente; o roteiro agora declara esse
  limite. Vinculá-lo exigiria mudar o protocolo, não apenas escrever uma frase.
- `EmployeeIdentity.did` é `String`, sem validação Base58 ou `Employee::did`.
  O formato solicitado `did:arkhe:employee:<base58>` foi documentado como requisito
  operacional, com a falta de validação mecânica explícita. Nenhuma identidade
  foi inventada ou inserida no candidato.

Estado: **CANDIDATE, NOT APPROVED, NOT ACTIVE**.

## Testes reexecutados nesta rodada

`cargo test --locked -p arkhe-bugbounty --test governance` retornou 0:
**7 passed; 0 failed**. Inclui pin zero/incorreto, quórum insuficiente,
adulteração, validade, escopo e CLI com arquivos sintéticos. Nenhum desses
testes usa aprovação institucional ou realiza chamada HackenProof.
