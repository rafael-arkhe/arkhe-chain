# E02 / M3 + M20 — execução remota verificada

[GitHub Actions: 40091638278](https://github.com/rafael-arkhe/arkhe-os/actions/runs/40091638278) concluiu com **success**, no commit `8cbef9258ef34fcb133f759585f49a25d40f9ba0`, branch `ci/e02-m3-m20`.

| Gate | Resultado observado |
|---|---|
| Rust nativo ↔ Rust/wasm32 | 165 casos; 20 aceitos, 145 rejeitados |
| Fluxo E02 e contagens | 20 testes, 20 pass, 0 fail |
| TypeScript | exit 0 |
| Build de produção | exit 0 |
| UI Chromium | 9 cenários funcionais + 4 análises axe; zero violações nas regras executadas |

Todos os cinco gates têm exit code 0 no [manifest do runner](artifact/docs/evidence/ci-e02/results.json). O WASM foi compilado no próprio job para Node e web antes dos testes. Os testes de contagem incluem divergência entre folhas, dataset, REF e ANCHOR, e uma expectativa externa incompatível com um pacote coerente.

## Artefactos e integridade

- [Metadados do run](run.json) e [log do job](job.log).
- [Arquivo original baixado](artifact.zip), artefacto GitHub `12558469095`.
- SHA-256 do ZIP conferido com o digest do provedor: `7bda77ef3b19a2f06bd927af44039608fab5c61781e64bcb9279915e0b1dd9dd`.
- [Verificação local do arquivo e das fontes](verification.json), vinculada ao run ID e commit acima.
- [Paridade nativo/WASM](artifact/docs/evidence/ci-e02/native-wasm.log), [veredictos dos 165 casos](artifact/docs/evidence/ci-e02/native-wasm-result.json).
- [Testes TAP](artifact/docs/evidence/ci-e02/test.log), [TypeScript](artifact/docs/evidence/ci-e02/typecheck.log), [build](artifact/docs/evidence/ci-e02/build.log), [UI](artifact/docs/evidence/ci-e02/ui.log), [axe e cenários](artifact/docs/evidence/ci-e02/ui-result.json).

Os 98 caminhos de fontes do [manifest de origem](artifact/SOURCE-MANIFEST.json) foram comparados com o código local e com os blobs do [Git tree publicado](source-tree.json). **A publicação normalizou CRLF para LF em 19 ficheiros.** O manifest de origem contém hashes dos bytes locais; os hashes do runner representam os bytes LF do checkout. A verificação compara o SHA-256 local original e o Git blob SHA-1 do conteúdo normalizado. Não se afirma identidade byte a byte entre o Windows e o checkout Linux. O ZIP foi preservado sem alterações; esta nota delimita a frase “original source bytes” presente no manifest de origem.

## Escopo

Foi publicado um snapshot limitado em `environments/e02-audit`: fontes dos quatro crates necessários e dos componentes E02, com workspace Cargo reduzido, lockfiles próprios e layout de teste da rota pública. O resultado não é um build completo do monorepo ou da branch principal. A publicação conservou os workflows existentes; o `formal.yml` herdado continua a apresentar uma falha independente antes de criar jobs, como no histórico anterior. A conclusão aqui se refere exclusivamente ao workflow E02 identificado acima.

Axe: wrapper `@axe-core/playwright` 4.10.2, motor axe 4.10.3; regras WCAG A/AA nos estados registrados. Não substitui leitor de ecrã ou testes em outros browsers. Verificação offline testada após aquecimento. Confiança nos recibos RPC, autenticação de root e consenso continuam fora do fluxo. O resultado é evidência de execução remota, não prova matemática.
