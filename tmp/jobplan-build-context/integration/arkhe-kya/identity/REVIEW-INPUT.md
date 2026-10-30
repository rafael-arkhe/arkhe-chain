# Revisão da proposta evaluate_icp_brasil (2026-10-23)

Não incorporar a função proposta como verificador: cnpj, hash, revoked=false e fetched_at podem ser fabricados sem CMS ou CRL. Passar esses campos ao Rust/WASM não autentica sua origem. O adapter existente verifica a evidência original no host e limita a conclusão ao teste sintético.

## API instalada: @kya-brasil/core@0.11.0

checkRevocation recebe um objeto {crlDer,serial,issuerCertificate,now}, não argumentos posicionais. verifyIcpSignature retorna serial_number e issuer_certificate. anchors é um array. O adapter exige requireChain:true. Não existe fetchCrl exportado nessa versão.

## Fixture existente

fixture.mjs gera CA descartável, certificado CNPJ, CMS detached e cinco CRLs. generate-fixtures.mjs exporta somente artefactos públicos. Não é necessário cert-panel nem guardar chave PEM. Raízes ITI reais não autenticam a CA sintética. O sucesso não promove identidade jurídica ou autorização; require_icp_brasil continua a rejeitar. O advisory alto transitivo de node-forge permanece bloqueador de produção (README.md).

## Cache e validade

thisUpdate/nextUpdate são assinados pela CA; now e max_crl_age_seconds vêm da política independente do verificador. fetched_at recente não torna uma CRL antiga válida. TTL de Bitstring Status List é uma regra de cache de outra estrutura, não de CRL X.509. A Recommendation fixada v1.0 de 2025-05-15 tem ttl opcional, sem default de 300000 ms:
https://www.w3.org/TR/2025/REC-vc-bitstring-status-list-20250515/

Três testes adicionais rejeitam resultados declarados, atualização declarada de CRL expirada e política de idade ausente. Alterações locais, sem mudar a release pública ou E02.
