# Recibos Pix — integração opcional, 2026-10-24

## Implementação real

O Enterprise deste workspace está no app Next.js `apps/arkhe-intra`, com SQLite e uma organização por instalação. Não há crate `arkhe-enterprise-core`, tabela RLS de recibos ou árvore `crates/finance` implementados aqui. Mantivemos o workspace criptográfico independente em `integration/arkhe-pix`, sem mover crates nem alterar E02/KYA.

- `/verificar/pix`: consumo local de WASM no Intra, sem sessão ou envio de recibo para servidor.
- `/enterprise/recibos`: mesma verificação local e botão explícito para avaliação autenticada com a política do operador.
- `GET /api/enterprise/receipts/policy`: informa limites da política da instalação, sem chave privada.
- `POST /api/enterprise/receipts/verify`: recebe somente `{receipt: string}`, limite 32 KiB, sessão e origem same-origin exigidas. Não aceita chave, tenant, flag Checked ou decisão fornecidos pelo cliente.

O servidor recalcula assinaturas no mesmo WASM, com chave pública fixada por variável do operador. Não confia no resultado do browser. Ausência de chave/motor falha fechada. Não há calls PSP/BCB e não se usa @kya-brasil/core para declarar identidade. Dois botões têm fronteiras de confiança distintas e explicitadas na UI.

## Opt-in e operação

Desativado por padrão. Configure no ambiente do processo que serve o app (não expor chave de assinatura, seed ou PEM):

```text
ARKHE_PIX_RECEIPTS=1
ARKHE_PIX_SIGNER_PUBLIC_HEX=<chave pública Ed25519 confiável, 64 hex minúsculos>
ARKHE_PIX_REQUIRE_SETTLEMENT=1
```

O último requisito é verdadeiro também se a variável estiver ausente. Apenas `0` permite aceitar para demonstração sintética; não confirma pagamento nem concede autorização. Nenhum setor foi obrigado a usar Pix e nenhum onboarding é alterado. A chave de fixture `[7;32]` do arkhe-pix é pública e serve só para testes, nunca como pin de um comerciante real.

Compile o workspace arkhe-pix conforme seu README e execute `node apps/arkhe-intra/scripts/sync-pix.mjs` antes do build do app. O sync copia módulos web para public/pix, runtime Node para lib/pix-runtime e verifica igualdade SHA-256 dos binários WASM. O manifest browser é de integridade, não assinado. O runtime Node deve acompanhar a instalação; esta alteração não alega validação standalone/container. Uma instalação sem runtime retorna 503 ao avaliar; o módulo permanece opt-in.

## Decisões e dados

- `REJECT`: estrutura, assinatura ou pin inválidos.
- `REJECT_SETTLEMENT_UNVERIFIED`: assinatura sintética válida, política exige liquidação.
- `ACCEPT_SYNTHETIC_ONLY`: aceitação limitada ao perfil de demonstração quando o operador desliga explicitamente o requisito de liquidação.

Todos os resultados têm `paymentConfirmed=false` e `onboardingEligible=false`. A UI nunca mostra “pagamento verificado”. `purpose_hash` e `passport_digest` continuam claims do emissor; a integração não obtém datasets ou passaportes e não prova autorização. E2E não dá acesso a um registro público de liquidação.

Recibos e referências de partes não são arquivados. A avaliação server-side acrescenta à trilha existente somente actor autenticado, perfil, decisão e digest em caso de assinatura válida. A auditoria global continua exclusiva da governança existente. Não há endpoint para listar recibos ou consulta por tenant arbitrário.

## Pendências que continuam explícitas

Arquivo histórico de recibos, filtro por propósito, resolução de passaporte, multi-tenancy, migração PostgreSQL/RLS e projeção CQRS não foram implementados. O módulo não simula essas garantias com um campo tenant no JSON. Antes de persistir recibos entre organizações, implementar autenticação/escopo de organização, testes cruzados e migração sob o modelo de implantação escolhido.

Liquidação autenticada via PSP, chave real de emissor, revogação/rotação, conciliação de devoluções, replay/deduplicação e validação KYA independente exigem trabalho próprio. Deploy, publicação Hashtree e rollout em ambiente existente não foram efetuados. As alegações do anexo sobre 5 testes ainda pendentes estavam desatualizadas: o núcleo já tinha 12 testes e 4 de CLI/WASM executados em 2026-10-23.

## Validação

`node --test tests/pix.test.mjs tests/enterprise.test.mjs tests/fullstack.test.mjs tests/e02.test.mjs` no diretório do app: 33 testes passaram. Pix tem 5 subtestes e 1 agrupador; isso não representa 6 cenários independentes. Cobre sessão/CSRF/flag, ausência de pin, rejeição de flags/chave do cliente, limite de bytes, assinatura sintética válida, exigência de liquidação, adulteração, pin errado e conteúdo mínimo da auditoria. Typecheck e build Next.js 15.5.28 passaram. Smoke browser na rota /verificar/pix do app compilado confirmou positivo sintético, remoção do resultado ao editar e rejeição de montante adulterado. Evidências em validation/pix-2026-10-24/. A UI Enterprise autenticada não foi exercitada no browser; seu endpoint e a política foram exercitados pelos testes.
