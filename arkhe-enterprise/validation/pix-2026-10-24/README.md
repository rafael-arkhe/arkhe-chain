# Integração Pix — evidência local, 2026-10-24

- 33 testes em tests/pix, enterprise, fullstack e e02 passaram. Pix: cinco cenários agrupados (Node conta também o agrupador, total 6). Uma nova execução Pix também confirmou que REQUIRE_SETTLEMENT ausente exige liquidação.
- tsc --noEmit passou; Next.js production build passou, incluindo /verificar/pix e /enterprise/recibos como rotas dinâmicas.
- Browser em 127.0.0.1:3014/verificar/pix, build de produção, WASM servido pelo próprio Intra: fixture válida -> signature_valid_synthetic; editar entrada remove resultado anterior; amount_cents=1 -> signature_invalid.
- Capturas intra-positive.png e intra-tampered.png. Inspeção visual realizada. Smoke pontual, sem alegar suíte browser automatizada ou auditoria.
- Binários web/Node do Pix copiados pelo sync com comparação de SHA-256; manifest sem assinatura.
- Freeze E02: 101 ficheiros continuam conformes com o manifest local.

O primeiro lançamento de servidor com contas e pin de teste foi bloqueado por revisão automática, sem motivo detalhado fornecido. A validação browser foi concluída por modo mais restrito: diretório de dados separado sem contas configuradas e sem pin de operador, somente verificador local público. A avaliação Enterprise autenticada foi executada em testes isolados de API, não nesse servidor browser. O processo de preview é local; não configura nem habilita o módulo em implantação existente.

RLS, histórico de recibos, filtro por propósito, resolução KYA e deploy standalone/container permanecem pendentes. Não houve pagamento ou chamada a PSP; todos os dados são sintéticos. paymentConfirmed e onboardingEligible nunca são true.
