# Verificação Sigstore/Fulcio offline

O perfil separado de [ancoragem de checkpoints de memo no Rekor](../../docs/ARC-MEMO-REKOR.md)
usa `memo-rekor-cli.mjs`, chave P-256 efémera e raiz obtida por TUF. Não altera a
política Fulcio abaixo. Inclui submissão real e verificação offline combinada
de Rekor, MMR e memo em Rust.

Este adapter usa `@sigstore/verify` **4.1.2**, `@sigstore/bundle` **5.0.0** e
`@sigstore/protobuf-specs` **0.5.0**, fixados no lockfile da raiz. Não exige o
executável Cosign. Requer Node `^22.22.2`, `^24.15.0` ou `>=26.0.0`.
Nesta máquina foi validado com o Node 24.19.0 do runtime do Codex; o Node 24.13.0
do PATH original não atende ao requisito do pacote.

## Executar e reproduzir

Na raiz, usando um Node compatível no PATH:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @arkhe/sigstore-verifier test
node integrations/cosign/cli.mjs verify-blob integrations/cosign/test/fixtures/artifact.txt --bundle integrations/cosign/test/fixtures/message.sigstore.json --trusted-root integrations/cosign/test/fixtures/trusted-root.public.json --policy integrations/cosign/test/fixtures/policy.public.json
```

O teste positivo usa `hello, world!`, assinado com certificado **Fulcio público**,
SCT, timestamp RFC 3161 público e prova Rekor v2. A cadeia é validada contra o
snapshot oficial do projeto `sigstore/root-signing`, não contra uma CA gerada
para a PoC. [Origem, commits, licença e hashes](test/fixtures/SOURCES.md).
Nenhuma assinatura nova ou publicação é feita. Os testes bloqueiam sockets,
HTTP e `fetch`, inclusive no processo CLI do teste positivo.

Para um GGUF do subconjunto Arkhe com bundle Sigstore próprio:

```powershell
cargo build -p arkhe-verify-cli --locked
node integrations/cosign/cli.mjs verify-gguf model.gguf --bundle model.sigstore.json --trusted-root trusted_root.json --policy policy.json --arkhe-verifier D:/arkhe/target/debug/arkhe-verify.exe
```

Em outras plataformas, informe o caminho do executável nativo correspondente.
O adapter envia os mesmos bytes em memória para `arkhe-verify inspect-gguf -`
via stdin e para Sigstore. Não reabre o modelo entre inspeção e assinatura.
Todos os caminhos são argumentos; nenhum é interpretado como comando de shell.
As leituras têm limites: artefato 16 MiB, bundle/root 1 MiB e política 16 KiB.
O relatório JSON só é emitido após sucesso; falhas saem com código 1.

## Política externa obrigatória

```json
{
  "certificateIdentity": "https://github.com/ORG/REPO/.github/workflows/release.yml@refs/tags/v1.0.0",
  "certificateOidcIssuer": "https://token.actions.githubusercontent.com",
  "trustedRootSha256": "<SHA-256 hexadecimal dos bytes exatos do trusted_root.json>",
  "earliestSigningTime": 0,
  "latestSigningTime": 0
}
```

Substitua identidade, emissor, fingerprint e limites Unix por valores aprovados
para o artefato. Identidade e emissor são comparados **literalmente**; não se
aceitam regex, curingas ou política omitida. Campos desconhecidos são erro.
A política deve chegar por canal autenticado independente do bundle. O hash
fixa os bytes exatos da raiz, inclusive whitespace. Trocar política e root juntos
por arquivos de um atacante elimina a garantia.

O verificador não resolve raízes a partir do bundle e não atualiza TUF durante a
verificação. A distribuição/atualização autenticada da política e das raízes é
responsabilidade do operador. O snapshot em `test/fixtures` serve para reproduzir
testes históricos, não como configuração padrão de produção.

## Verificações obrigatórias

- Assinatura do artefato e digest SHA-256 declarado no `messageSignature`.
- Cadeia X.509 até CA Fulcio explicitamente confiável, usos/extensões e validade
  no timestamp autenticado, por meio da biblioteca oficial.
- Identidade SAN e emissor OIDC exatos; pelo menos um SCT válido na CT confiável.
- Pelo menos um timestamp autenticado, proveniente de SET Rekor ou TSA RFC 3161;
  a política limita a janela de assinatura. O certificado pode estar expirado
  hoje se era válido no momento autenticado da assinatura.
- De uma a oito entradas Rekor distintas, cada uma com prova de inclusão e
  checkpoint assinado. SET isolado não é aceito. Cada `logId` restringe a
  autoridade usada naquela verificação; índices do registro e da prova coincidem.
- Vínculo entre corpo da entrada Rekor, assinatura e bytes do artefato.

`verify-gguf` acrescenta os gates de estrutura/metadados restritos em Rust e
calcula BLAKE3 e digest dos metadados canônicos. A assinatura Sigstore cobre o
GGUF completo; os digests adicionais são derivados localmente desses bytes.

## Limites demonstrados

São aceitos bundles protobuf Sigstore `messageSignature` com certificado X.509.
Bundles com chave pública simples, envelopes DSSE/in-toto e o bundle Ed25519
próprio de `arkhe-gguf-lab@1` são rejeitados. DSSE exigiria política adicional
para vincular os subjects da atestação ao modelo.

A execução positiva real foi feita sobre a fixture pública `hello, world!`.
O caminho GGUF foi testado com parsing válido e rejeição de assinatura
transplantada; não há no repositório um GGUF assinado por identidade Fulcio real.
Assinar um modelo requer a identidade OIDC do produtor e uma publicação própria,
que este adapter de verificação não realiza.

Isso não demonstra builder isolado, SLSA L3, SBOM, ausência de comportamento
malicioso dos pesos, consistência entre checkpoints ou revogação em tempo real.
Uma verificação bem-sucedida não autoriza execução/deploy nem grava diretamente
no WormGraph: continuam necessários os caminhos de admissão do kernel.

O wrapper POSIX `verify-blob.sh` agora exige **artefato, bundle, root e política**;
o contrato antigo de assinatura/certificado destacados foi removido.

Referências: [Sigstore verifier oficial](https://github.com/sigstore/sigstore-js/tree/main/packages/verify),
[verificação com Cosign](https://docs.sigstore.dev/cosign/verifying/verify/).
