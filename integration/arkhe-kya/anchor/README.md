# Ancoragem KYA experimental — verificação offline

Implementação separada do freeze E02. `rekor.mjs` valida bundles de chave pública
no formato Rekor v1 com o SDK oficial Sigstore já fixado em `integrations/cosign`.
`witness.mjs` verifica um subconjunto explícito de cosignatures C2SP Ed25519.
`verify.mjs` compõe os dois e chama o WASM KYA existente.

**Estado:** testes locais executados, não publicação no Rekor público nem
implantação de witnesses independentes. O nome de um log na policy não é prova
de que a sua chave pertence ao operador real. A raiz Sigstore, o publisher,
nomes/chaves dos witnesses e a política chegam por canal independente confiável.
Não existe função de upload, descoberta de confiança ou aquisição automática.

## Contrato do compromisso

O `checkpoint` do anchor tem exatamente `profile`, `label`, `mmr_root`,
`leaf_count`. O artefacto assinado é UTF-8, sem newline, do array JSON:

```json
["ARKHE:KYA:ANCHOR:v1","arkhe-kya-experimental@1","synthetic-poc","<root hex lowercase>",3]
```

Não contém CPF/CNPJ, nome, mandato ou passaporte. A assinatura do publisher é
P-256 e a chave SPKI tem SHA-256 fixado na policy. Isto autentica o publisher
configurado, não a identidade legal do principal do passaporte.

O adaptador exige um único `hashedrekord 0.0.1`, assinatura do artefacto,
digest vinculado aos bytes exatos, SET, caminho de inclusão e checkpoint
assinado. O SDK verifica os componentes criptográficos; o adaptador aplica
os pins, URL do log, limites e associação dos campos. Índice global e índice
local da shard são tratados separadamente. Uma inclusion promise sozinha
não é aceita. Não se reinventou a verificação RFC 6962 nesta implementação.

A policy do log tem `trustedRootSha256`, `signerSpkiSha256`, `logBaseUrl`,
`earliestSigningTime`, `latestSigningTime`. A root externa pode ter sido obtida
por TUF validado, mas este caminho offline não atualiza TUF nem descobre trust.

## Witnesses

O note cosignado deve ter exatamente o mesmo corpo do checkpoint autenticado
pelo log. O formato aceito é o checkpoint de três linhas, seguido de assinaturas
signed-note. Não são aceitas extension lines nesta versão. Para cada witness
Ed25519, a identificação da chave usa tipo `0x04`, nome e chave pública; a
assinatura cobre o domínio `cosignature/v1`, timestamp e corpo completo, conforme
[C2SP tlog-cosignature 1.1.0](https://c2sp.org/tlog-cosignature@v1.1.0) e
[tlog-checkpoint 1.1.0](https://c2sp.org/tlog-checkpoint@v1.1.0).

Mínimo de duas chaves distintas, de um conjunto de até 16 witnesses. Aliases
da mesma chave, assinatura duplicada, assinatura inválida de chave reconhecida,
timestamp futuro/antigo e quórum insuficiente falham. Assinaturas de chaves
desconhecidas não contam. As datas do contexto KYA e policy de witness devem
coincidir; cosignatures anteriores à integração da entrada não são aceitas.

A policy de witness tem `origin`, `quorum`, `now`, `maxAgeSeconds`, `witnesses`;
cada witness tem `name` e `publicKeyPem`. A idade máxima é positiva e até 24h.
O consumidor deve definir uma janela apropriada; não é garantia de estado atual.

As assinaturas são afirmações dos witnesses sobre a consistência histórica.
Este cliente não reexecuta o histórico, não opera o protocolo `add-checkpoint`,
não mantém estado monotónico nem busca provas de consistência. A independência
dos operadores é uma premissa de governança do trust set, **não** algo que se
deduz de duas chaves. Não há alegação de não-equivocação global.

## Composição com o KYA

O contexto de `verifyAnchoredPassport` mantém principal, audiência, ação,
challenge, tempo e hash esperado do modelo fornecidos pela contraparte, mas
**não aceita** `expected_root`/`expected_leaf_count`: deriva-os do compromisso
cuja inclusão e quórum foram verificados. O parser Rust continua a receber o
texto original do contexto, preservando a rejeição de campos duplicados.

O resultado continua `CRYPTOGRAPHIC_CHECKS_PASSED`, qualificado pelo perfil e
`synthetic-poc`. Só `anchor_authenticity` sobe para
`LOG_INCLUSION_AND_WITNESS_QUORUM_VERIFIED`. Identidade legal, runtime e revogação
continuam sem validação; replay continua a exigir consumo do desafio pelo host.

## Reproduzir

Pré-requisitos: o WASM KYA gerado e as dependências Sigstore já descritas nos
READMEs de KYA e `integrations/cosign`; Node e Rust do workspace. Na raiz:

```powershell
node --import ./integrations/cosign/test/deny-network.mjs --test integration/arkhe-kya/anchor/anchor.test.mjs
node integration/arkhe-kya/anchor/cli.mjs passport.json context-without-root.json anchor.json trusted-root.json log-policy.json witness-note.txt witness-policy.json
```

Os nomes da segunda linha são ficheiros de entrada que o operador deve fornecer,
não artefactos de publicação existentes. A CLI não emite nem revoga credenciais.
O exit code é 0 só quando todas as verificações passam; erros produzem
`NOT_VERIFIABLE`. A leitura de todos os ficheiros tem limites explícitos.

Executados: 13 testes Node, incluindo a CLI offline. O positivo gera um log de teste de uma folha em formato
Sigstore v1, SET/checkpoint assinados e três witnesses locais (também testa 2-of-3),
depois verifica com SDK oficial e o WASM real. Negativos adulteram root, SET,
checkpoint, log ID, pin do publisher, trust root, witness note e timestamp;
quórum insuficiente/aliases/duplicação e passaporte adulterado são rejeitados.

## Interoperabilidade ainda pendente

Este é um perfil restrito, não um cliente Rekor genérico. O parser C2SP só aceita
origins sem espaços e checkpoints de três linhas; origins legadas de Rekor v1
que incluam espaços são recusadas. Rekor v2/`hashedrekord 0.0.2`, bundles Fulcio
keyless e cosignatures ML-DSA-44 também não são suportados neste adaptador.
O teste positivo é local; **não demonstra compatibilidade de ponta a ponta com
uma instância pública ou witnesses de terceiros**. C2SP recomenda ML-DSA-44 para
novas implantações; usar Ed25519 aqui é uma restrição do experimento.

Antes de alegar ancoragem pública: escolher a instância/perfil efetivamente
suportado, distribuir trust material com autenticação, obter entrada real e
cosignatures de operadores independentes, conservar evidência e testar offline
com esses bytes. A adaptação de versões deve ter revisão e fixtures próprias.

Outras fontes primárias: [Sigstore — Rekor](https://docs.sigstore.dev/logging/overview/),
[Rekor v2 — requisitos de cliente](https://github.com/sigstore/rekor-tiles/blob/main/CLIENTS.md),
[C2SP — protocolo witness](https://c2sp.org/tlog-witness@v1.1.0).
