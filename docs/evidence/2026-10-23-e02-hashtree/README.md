# E02 — publicação pública em Hashtree, 2026-10-23

[Repositório no Iris Git](https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-e02)

Remote público:

```text
htree://npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-e02
```

Foi publicado apenas `releases/arkhe-e02-v1`, não o workspace inteiro.
`main` continua no commit `18ec972dd62f7cc76dfcae6588823f7cd4ecb815`.
As duas tags anotadas foram preservadas, sem novo commit nem movimento de tag.
O manifest original e todos os seus 101 ficheiros mantêm os bytes congelados.

## Evidência

- `publication.json`: remote, root Hashtree, eventos Nostr, refs e verificações.
- `manifest-check.txt`: 101 ficheiros conferidos no clone público.
- `test-replay.txt`: 109 testes passados no clone público, decomposição por ficheiro.
- `public-repository.png`: página pública com main, 2 tags e 3 commits.

O leitor usou configuração e cache novos em `ops/local/e02-hashtree-reader`,
sem ficheiro de chave do publicador. O helper reportou 155 objetos Git novos,
zero objetos em cache. O clone está em `releases/arkhe-e02-hashtree-check`.

O upload Blossom foi confirmado em `https://upload.iris.to`; os anúncios
Nostr foram aceitos por `wss://nos.lol`. A configuração antiga de leitura
encontrou timeouts em índices de terceiros; foi usado cache de publicador
isolado e um relay atual documentado para a publicação. O clone público usou
os três relays atuais padrão. Uma advertência sobre o orçamento de observação
de índices não impediu encontrar o evento de root assinado nem recuperar o repo.

O helper oficial `git-remote-htree` 0.2.92 foi compilado do pacote crates.io,
com Rust 1.96.0, em `ops/local/hashtree-helper/bin/git-remote-htree.exe`.
O CLI opcional `htree` 0.2.157 também foi compilado e instalado localmente;
a segunda compilação redundante do helper foi interrompida quando o helper
standalone já estava funcional. Nenhum daemon foi iniciado.

Foi reutilizada a identidade Nostr local existente. Nenhuma chave Nostr ou
seed Solana foi publicada. O link local temporário para a chave usado pela
configuração isolada foi removido após o envio; a chave original foi preservada.

## Reproduzir localmente

Com o helper disponível no PATH (instalação oficial: `cargo install git-remote-htree`):

```powershell
git clone htree://npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-e02
cd arkhe-e02
node specs/e02/verify_manifest.mjs
node replay-tests.mjs
```

Para conferir este clone já obtido, executar os dois comandos Node dentro de
`releases/arkhe-e02-hashtree-check`.

O evento Nostr assina a publicação pelo npub; não converte o manifest original
em manifest assinado nem prova a identidade jurídica do autor. A root Hashtree
é de distribuição do código, distinta da root MMR ancorada em Solana. Esta
publicação não é um lançamento de token, deploy de dashboard ou auditoria.
Disponibilidade futura depende de retenção/replicação por servidores e peers;
o relatório estabelece disponibilidade e reprodução observadas nesta ronda.
