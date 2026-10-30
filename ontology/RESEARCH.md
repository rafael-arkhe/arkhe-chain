# Pesquisa e implementação — 25 de outubro de 2026

Fontes primárias consultadas para a ontologia v5, source-map v3 e o perfil offline:

| Fonte | Aplicação no Arkhe Twin |
|---|---|
| [DSSE protocolo](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md) e [envelope](https://github.com/secure-systems-lab/dsse/blob/master/envelope.md) | Assinatura Ed25519 sobre PAE; `keyid` é dica não autenticada e não define confiança. |
| [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) | Verifica tipo da declaração e SHA-256 do artefato em `subject`. |
| [SLSA Build Provenance](https://slsa.dev/spec/v1.2/build-provenance) | Verifica builder/buildType e fonte em `buildDefinition.resolvedDependencies`. O URI do predicado continua `/provenance/v1`. |
| [SCITT RFC 9943](https://www.rfc-editor.org/rfc/rfc9943.html) | Arquitetura de transparência; os campos do catálogo são um plano de adapter Arkhe, não um formato de receipt implementado. |
| [Sigstore Bundle](https://docs.sigstore.dev/about/bundle/) | Planejamento de material de verificação offline. Sigstore keyless, Fulcio e Rekor não são suportados pelo novo perfil. |
| [CycloneDX](https://cyclonedx.org/specification/overview/) | Família de SBOM com URI oficial de predicado; parser e validação completa permanecem pendentes. |
| [TCG DICE](https://trustedcomputinggroup.org/wp-content/uploads/DICE-Attestation-Architecture-Version-1.1-Revision-18_pub.pdf) | Arquitetura de atestação; requisitos dependem do perfil e do hardware. Nenhum verifier DICE/CoVE implementado. |

O catálogo preserva 49 skills. As dez famílias de predicados não concedem
`CHECKED`; somente in-toto/SLSA têm um perfil restrito implementado. Contratos
de agentes são propostas locais, sem afirmar que MCP define esses mecanismos.

Correções à proposta recebida:

- Dependências SLSA ficam em `buildDefinition.resolvedDependencies`; o artefato
  é vinculado por `Statement.subject`, não por campos inventados do predicado.
- A política distingue requisitos conjuntos de alternativas CycloneDX/SPDX e
  SCITT/Rekor. Uma lista de famílias não exige automaticamente todas elas.
- Counterexample de RLS não satisfaz prova de isolamento do schema em produção.
- Execução verificável de zkVM não implica privacidade por si só.
- Evidências DICE precisam de um perfil explícito; JSON arbitrário não substitui
  uma quote validada por cadeia de confiança e freshness.

O perfil implementado é deliberadamente menor que uma avaliação SLSA completa:
ele não aplica níveis SLSA, política de parâmetros externos, isolamento do
builder, revogação, timestamps, transparência ou todos os campos normativos.
Uma chave confiável pode assinar uma declaração falsa. Seu resultado significa
que a declaração passou pelas verificações listadas, não que o build é seguro.

O contrato Arkhe de atestação v2 permanece `definition-only`: autenticar uma
declaração SLSA não implementa o contrato de claims, o vínculo humano, o
avaliador de competências, `prove`, ZK ou integração ao ContainmentGate.
