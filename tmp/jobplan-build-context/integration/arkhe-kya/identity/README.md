# Principal sintético: CMS, cadeia e CRL

Implementação local experimental; não incluída na release pública arkhe-kya-poc-v0.1.1. Usa @kya-brasil/core@0.11.0 no host Node, sem converter JavaScript em WASM. O Rust/WASM verifica primeiro o recibo e o contexto e deriva um desafio separado por domínio que vincula digest do recibo, audiência, ação e nonce. O CMS assina esse desafio. Não há flags Checked fornecidas pelo emissor.

## Reprodução

Use Node >=24.15 (validado com 24.22.1), Rust e wasm-bindgen 0.2.126. A partir de integration/arkhe-kya:

```powershell
npm --prefix identity ci --ignore-scripts
node scripts/build-wasm.mjs
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
node --import ./tests/deny-network.mjs --test identity/identity.test.mjs wasm-parity.test.mjs
node identity/generate-fixtures.mjs
```

O último comando cria identity/fixtures/generated e recusa sobrescrever um diretório existente. Produz certificado público, issuer público, CMS, cinco CRLs e inputs.json. Chaves privadas são efémeras, nunca exportadas. A CA é descartável e o CNPJ é um valor público de teste, sem relação com o candidato ao piloto. As chaves aleatórias tornam cada geração diferente em bytes. O relógio é o da fixture histórica do recibo; os certificados não são válidos para uso atual.

## Fronteira de confiança

verifySyntheticPrincipal(receiptJson, contextJson, evidence, trust) exige trust_profile=synthetic-test-pki@1. evidence contém apenas cms_base64 e crl_base64; trust é fornecido independentemente pelo verificador: anchors, expected_cnpj, now e max_crl_age_seconds. Recibo/contexto e evidências têm limites de bytes. O relógio deve coincidir com context.now.

O adapter exige requireChain=true, assinatura CMS válida sobre o desafio exato, CNPJ esperado e validade do certificado. Verifica assinatura/issuer da CRL e acrescenta rejeição de thisUpdate futuro, nextUpdate ausente ou expirado e idade acima da política. CRL ausente ou inválida falha fechada. Não consulta rede nem aceita raízes declaradas dentro da apresentação. A API instalada exporta verifyIcpSignature e checkRevocation; não exporta fetchCrl. Aquisição/cache de CRL seriam responsabilidade do host. signed_at da API é o instante de avaliação, não um timestamp autenticado da assinatura.

Resultado positivo: SYNTHETIC_CMS_CHAIN_AND_CRL_PASSED, principal_legal_identity=NOT_VERIFIED, authorization_granted=false. Não prova identidade ICP-Brasil real, situação cadastral, execução do modelo, ancoragem ou consumo de nonce. require_icp_brasil continua a rejeitar no policy engine. Integração de confiança real e composição de todos os eixos continuam PENDING. Nenhum estado/relógio/declaração de êxito foi acrescentado ao container do emissor.

## Evidência desta execução (2026-10-23)

- 33 testes Rust no workspace: 28 no pacote raiz e 5 no crate de status; clippy sem warnings.
- 15 testes de identidade e 10 de paridade nativo/WASM passaram com rede bloqueada.
- Positivo CMS+cadeia+CRL; negativos para revogação, ausência, expiração, futuro, idade, CNPJ errado, CA não confiável, CMS/CRL alterados, recibo inválido, bypass de cadeia e relógios divergentes.
- A primeira execução detectou versões distintas do registro ASN.1 (2.3.15/2.11.0), quebrando leitura da chave RSA da CRL. Alinhamento e lock em 2.11.0 corrigiram a fixture; não foi removida a verificação de assinatura.

## Dependência bloqueia produção

npm audit aponta node-forge 1.4.0 transitivo com severidade alta (também atribui o impacto ao pacote direto @kya-brasil/core). São dois nós afetados pelo mesmo advisory, não duas falhas independentes. [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) não lista versão corrigida. Esta execução sintética não demonstra explorabilidade nem ausência de risco no caminho utilizado. Não promover este adapter para produção até resolver a dependência e rever o caminho efetivo. Não foi feito downgrade automático para uma API diferente.

## TTL e estado

O perfil existente de status permanece independente. Na [Recommendation W3C Bitstring Status List v1.0 de 2025-05-15](https://www.w3.org/TR/2025/REC-vc-bitstring-status-list-20250515/), credentialSubject.ttl é opcional, em milissegundos; não há padrão normativo de 300000 ms quando ausente. Cache TTL não substitui validade assinada, relógio confiável nem piso de sequência. O high-water mark permanece estado local do verificador conforme ADR-007.
