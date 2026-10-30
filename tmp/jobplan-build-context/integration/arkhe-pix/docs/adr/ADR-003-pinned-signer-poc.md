# ADR-003-pinned-signer-poc

Chave pública vem do chamador, fora do recibo. Fixture usa seed pública [7;32]; é insegura para produção por desenho. verificationMethod é ed25519-pubkey-hex explícito, não DID:key inválido. Não há integração automática com política KYA. Domain separation e verify_strict são obrigatórios.
