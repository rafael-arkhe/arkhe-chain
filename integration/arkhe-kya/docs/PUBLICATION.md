# Release de código publicada — 2026-10-23

Tag recomendada: **arkhe-kya-poc-v0.1.1**.
[Repositório Hashtree](https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-kya).

A release em `releases/arkhe-kya-poc-v0.1.0` (diretório de trabalho inicial,
atualmente no commit de v0.1.1) inclui snapshots dos fontes locais necessários,
manifests npm/Rust, schemas, WASM Node e um manifest SHA-256. O clone público
validou 106 entradas do manifest, 32 testes Rust, 9 casos WASM e 13 de ancoragem.
Não há dependências por caminho fora do repositório distribuído; registries
ainda podem ser necessários no primeiro build.

A tag v0.1.0 ficou incompleta por ignore global de `src/bin`. O replay público
detectou o problema; a v0.1.1 corrigiu-o com novo commit/tag. A anterior foi
preservada, não reescrita. Ver
[evidência completa](../../../docs/evidence/2026-10-23-kya-release/README.md).

O desenvolvimento neste diretório pode continuar a usar paths do workspace
original; isso não descreve o pacote distribuído. Publicação não significa
aceitação por cliente, implantação de dashboard, identidade ICP real, TEE ou
VERIFIED de produção. As fixtures continuam sintéticas por instrução do utilizador.
