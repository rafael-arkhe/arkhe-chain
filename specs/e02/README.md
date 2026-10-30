# arkhe-e02@1 — freeze local

**Status: FROZEN. Data: 2026-10-23. Escopo: devnet, synthetic-poc.**

Spec normativa: `docs/E02-PROOF-COMMITMENT.md`.
Decisões e alterações: `specs/e02/CHANGELOG.md`.
Matriz funcional: `docs/E02-CONFORMANCE.md`.
Smoke real: `docs/evidence/2026-10-23-e02-devnet-smoke/`.
Validação desta ronda: `specs/e02/validation/`.

O freeze fixa os bytes locais identificados em `manifest.json`, incluindo
spec, matriz, vetores, implementação e evidência. SHA-256 serve para verificar
integridade do pacote; não substitui BLAKE3 do perfil MMR/dataset, assinatura de
proveniência, nem autenticação de uma distribuição. O manifest não é assinado.

## Verificar

Na raiz do workspace, com Node disponível:

```powershell
node specs/e02/verify_manifest.mjs
node --test scripts/e02_memo_commitment.test.mjs scripts/e02_mmr.test.mjs scripts/e02_verify.test.mjs scripts/e02_anchor.test.mjs scripts/e02_conformance.test.mjs apps/arkhe-intra/tests/e02.test.mjs
npm --prefix apps/arkhe-intra run typecheck
```

Os testes consomem vetores estáticos e incluem o smoke capturado, sem novos
envios. Não regenerar vetores ou reformatar o dataset para reparar um hash
divergente. Investigar a alteração e versionar qualquer mudança normativa.

## Freeze, revisão externa e publicação

Não foi encontrada uma regra específica de E02 exigindo revisão independente
antes deste freeze local. A revisão externa não foi realizada e não é alegada.
Ela permanece pendente para avaliar um futuro release com alegações de
segurança de produção; mainnet exige um perfil próprio e os seus gates.
Cobertura funcional e typecheck não constituem auditoria externa nem prova de
ausência de vulnerabilidades. A cobertura de linhas/ramos não foi medida.

Este diretório não é uma tag/release Git. O workspace não é um checkout Git
e nenhuma publicação externa foi feita. Para transportar o freeze para um
repositório, preservar os ficheiros do manifest, verificá-los e registrar então
commit, tag e release segundo o processo desse repositório. Não há aprovação
implícita de mainnet, lançamento de token ou publicação do dashboard.
