# KYA PoC — release pública corrigida, 2026-10-23

[Repositório Hashtree / Iris Git](https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-kya).
Usar a tag **arkhe-kya-poc-v0.1.1**. O npub é identidade de publicação, não
atestado de identidade jurídica. Não há release GitHub hospedada.

## Correção preservada no histórico

A primeira tag v0.1.0 omitiu `src/bin` devido ao ignore global do publicador.
Os testes locais tinham esses ficheiros, mas o clone público revelou o defeito.
O log está em `public-rust-v0.1.0-failed.txt` e a publicação inicial em
`publication-v0.1.0-incomplete.json`. A tag não foi movida/regravada.

A v0.1.1 inclui os dois ficheiros, declaração explícita do binário e verificação
de componentes obrigatórios no manifest. O empacotamento conferiu ainda todos
os ficheiros locais de fontes contra a lista Git, para não repetir a omissão.

## Evidência da v0.1.1

- `publication.json`: refs, root/evento Hashtree, hash do manifest, cleanup e escopo.
- `public-clone-v0.1.1.txt`: clone com cache Hashtree novo, sem chave do publicador,
  156 objetos Git recuperados; aviso de orçamento do índice não impediu a recuperação.
- `public-manifest-v0.1.1.txt`: 106 ficheiros listados conferidos e zero dependências
  por caminho externo. O manifest não inclui a si próprio; Git tem 107 ficheiros.
- `public-rust-v0.1.1.txt`: **32 testes** passados no clone público.
- `public-wasm-v0.1.1.txt`: **9 casos** nativo/WASM passados.
- `public-anchor-v0.1.1.txt`: **13 testes** passados sem sockets.
- `public-clone-checks-v0.1.1.json`: resultados; reutilizou-se somente o cache de
  build Cargo, com os pacotes locais compilados a partir do novo clone público.
- `clippy-v0.1.1.txt`, `format-v0.1.1.txt`: checks pré-publicação aprovados.

Runtime Node 24.22.1 e Rust 1.96.0. O Node padrão 24.13.0 não satisfaz o requisito
declarado do SDK Sigstore e não foi usado para validar esta release. Dependências
Rust/npm permanecem lockadas; o primeiro build pode exigir acesso a registries.

O manifest e a tag são não assinados. A publicação Nostr assina o evento de
distribuição pela chave existente; isso não é auditoria de código. A root
Hashtree não é uma root MMR de um passaporte ou publicação pública no Rekor.

## Reproduzir

```powershell
git clone htree://npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-kya
cd arkhe-kya
git checkout arkhe-kya-poc-v0.1.1
npm ci --ignore-scripts
node verify-release.mjs
cargo test --workspace --locked
node --test wasm-parity.test.mjs
node --import ./tests/deny-network.mjs --test anchor/anchor.test.mjs
```

Requer o helper git-remote-htree e as versões de runtime do README da release.

Não se publicou o workspace inteiro, chave privada, state file operacional ou
dados da contraparte indicada. O candidato ao piloto foi registado apenas em
`ops/local`, sem contacto ou alegação de aceite. Permanecem pendentes identidade
real, TEE, modelo real validado, estado live, consumidor com aceite e VERIFIED
de produção. As observações de disponibilidade são desta ronda, sem SLA futuro.
