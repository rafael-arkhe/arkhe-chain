# Revisão para publicação — 26 de outubro de 2026

Destino solicitado: https://github.com/Safe-Core/arkhe-aegis

**Publicação concluída em repositório privado.**

Após a revisão inicial, o usuário solicitou nova tentativa de publicação.
O envio para `main` foi confirmado pela API do GitHub no commit
`da7e57acb6eb86c127e73f2a4c78f8980231e0a0`:
https://github.com/Safe-Core/arkhe-aegis/commit/da7e57acb6eb86c127e73f2a4c78f8980231e0a0

A distribuição foi preparada em `D:\arkhe\aegis-publicacao-20261026`, com
14.981 arquivos e histórico derivado exclusivamente do import sanitizado do
console (`706040a`), sem a pasta restrita. O projeto e histórico originais
foram preservados em `D:\arkhe\arkhe-aegis`; as correções também foram
aplicadas aos seus fontes, sem commit ou push desse histórico original.

Foram corrigidos: contexto Docker e versão Rust, inclusão explícita dos
lockfiles Cargo, exclusão local de ZIPs e da edição restrita, textos e escopo
de licença na raiz e exemplo de caminho Ollama. Um novo gate de publicação
foi incluído no CI. O job principal recebeu banco de teste separado e a raiz
pública dos fixtures. O primeiro envio expôs um YAML inválido no workflow da
imagem frontend; o segundo commit corrigiu `with:` do login e tratou a versão
manual como variável de ambiente validada.

As verificações de publicação, arquitetura, metadados Cargo, manifesto e
divergência do console passaram na cópia isolada. Os oito testes de quatro
faces passaram com a raiz pública configurada. O CI do commit final foi
iniciado; sua conclusão ainda não foi confirmada. PostgreSQL e build de
contêiner completos permanecem sem validação local, pois o socket Podman
estava indisponível. Não foi alterada a visibilidade privada do repositório.

## Revisão inicial e evidências

**Parecer inicial: publicação bloqueada até resolver os achados P1 abaixo.**

Revisão inicial da árvore de trabalho em Windows, sem modificar código da plataforma,
índice, histórico ou remotos. Base local: `f525dd2a4`. Os resultados locais não
equivalem à validação de um clone limpo nem à aprovação de produção.

## Achados

### P1 — Conteúdo de terceiro com proibição expressa de redistribuição

`aegis/apps/console/enterprise/LICENSE:17` declara “No redistribution”.
Existem dez arquivos dessa pasta no índice Git, incluindo implementação,
testes e um emissor de licenças. Em contraste,
`aegis/apps/console/NOTICE-AEGIS.md:34` e `LICENCA-ESTE-FORK.md` afirmam que
a pasta não integra o fork. Um push do histórico atual levaria esse conteúdo
ao destino, mesmo que a pasta fosse apagada apenas em um novo commit.

Antes da publicação, resolver a permissão de distribuição ou preparar um
histórico de distribuição sem esse conteúdo. Preservar a cópia de trabalho
e os avisos de terceiros; não reescrever o histórico compartilhado sem definir
uma estratégia. Acrescentar uma verificação explícita de ausência da pasta
ao processo de release quando ela não for autorizada.

### P1 — O contexto Docker omite membros necessários do workspace Cargo

`.dockerignore:1` exclui tudo e reintroduz somente determinadas árvores.
Ficam de fora `integration/`, `aegis/` e
`integrations/aegis-python-runtime/bridge/`, todos membros declarados no
`Cargo.toml`. `ops/runtime/Dockerfile:4-5` copia esse contexto e executa
`cargo build --release --locked -p aegis-runtime`. Cargo precisa carregar os
manifests dos membros do workspace antes de selecionar o pacote; portanto,
o build a partir desse contexto não dispõe dos manifests necessários.

Corrigir a inclusão dos fontes/manifests necessários e verificar um build de
imagem sem cache. A imagem de construção também declara Rust 1.96, enquanto
o projeto fixa 1.97.0; alinhar essas versões para evitar depender de instalação
adicional pela resolução do rustup. O problema do contexto foi identificado
por inspeção; não foi executado um build de imagem nesta revisão.

### P1 — A migração atual ainda não está representada no índice Git

O status observado contém 4.417 entradas modificadas, 3.381 removidas e
1.742 entradas não rastreadas. Estas últimas podem representar diretórios
inteiros. `apps/aegis-intra/package.json` e
`kernel/aegis-core/Cargo.toml` existem em disco, mas `git ls-files
--error-unmatch` não os encontra. Seus caminhos anteriores aparecem como
removidos. Os checks executados em disco, assim, não comprovam a integridade
do conteúdo que seria publicado a partir do índice atual.

Preparar e revisar um commit completo da migração, sem inclusão indiscriminada
de artefatos locais. Validar esse commit em clone limpo. O único remoto
registrado é uma configuração promisor de OpenMausBot sem URL; não existe
`remote.origin.url`. Configurar o destino somente após validar o acesso.

### P2 — A licença declarada no workspace não tem textos na raiz

`Cargo.toml:54` declara `Apache-2.0 OR MIT`, mas não há `LICENSE`,
`LICENSE-MIT` ou `LICENSE-APACHE` na raiz. Os textos existentes em subárvores
não deixam explícito o escopo da concessão do projeto agregado.

Documentar o licenciamento do código próprio com os textos correspondentes
e delimitar componentes de terceiros e exceções. A declaração do workspace
não deve ser apresentada como licença uniforme de todos os diretórios.

## Validação local

| Verificação | Resultado |
|---|---|
| `python scripts/check_architecture.py` | PASS: 39 crates, 8 pacotes Node, 18 migrações |
| `python scripts/check_branding.py` | PASS: 14.978 arquivos inspecionados |
| `python scripts/static_audit.py` | PASS |
| `python scripts/check_boundaries.py` | PASS |
| `python scripts/check_configs.py` | PASS |
| `python verification/scripts/verify-vectors.py` | PASS: 10 vetores, contrato estático |
| `python scripts/check_ai_release.py` | PASS: RAG privado desabilitado |
| `python scripts/check_gov_release.py` | PASS: capacidades não qualificadas continuam bloqueadas |
| `python -m unittest discover -s scripts/tests -v` | PASS: 235 testes |
| `node --test scripts/security_hardening.test.mjs` | PASS: 7 testes |
| `node --test apps/aegis-intra/tests/*.test.mjs` | PASS: 126 testes |
| `cargo fmt --all --check` | PASS |
| `cargo check --workspace --locked` | PASS |
| `pnpm build:adapters` | PASS |
| `pnpm test:adapters` | PASS: 12 testes, usando WASM disponível localmente |
| `pnpm build:apps` | PASS: Preflight, Melodic Lab e Intra, incluindo tipos e páginas Next.js |
| `cargo test --workspace --locked` | Inconclusivo para a suíte completa: inicialmente falhou por falta da raiz pública de licença; com ela, parou na exigência de PostgreSQL descartável |

## Higiene e limites

- A listagem dos arquivos rastreados e candidatos não contém `.env` privados
  nem arquivos acima de 50 MiB. Os ZIPs locais dependem de `*.zip` no ignore
  global da máquina, e não de regra própria do repositório. Tornar essa exclusão
  explícita no projeto para que o resultado não dependa da máquina do autor.
- As duas chaves `.key` encontradas estão em
  `aegis/crates/aegis-license/fixtures/chaves/` e são identificadas como teste.
  O README declara publicamente a raiz de teste. A busca por marcadores de
  chave privada também encontrou código que manipula PEM e testes; isso não
  constitui evidência de vazamento de credenciais reais.
- Não foi realizada uma auditoria completa de segredos em todo o histórico,
  nos ZIPs ignorados ou em objetos Git inacessíveis. Não há certificação de
  ausência de segredos ou vulnerabilidades.
- A leitura do destino pela API do conector GitHub retornou 404. Isso não
  distingue repositório inexistente de falta de permissão. Não foi feito push.
- O build Next.js detectou `D:\arkhe\pnpm-lock.yaml` como raiz externa e carregou
  `.env.production.local` e `.env.local`. Uma validação de release deve usar
  checkout e configuração isolados. O Melodic Lab excedeu seu orçamento de
  aviso de bundle por 34,63 kB.
- Não foram executados nesta revisão: CI remoto, instalação limpa de todas
  as dependências, auditoria atualizada de dependências, reconstrução de WASM,
  migrações em PostgreSQL descartável ou qualificação operacional do runtime.

## Sequência de liberação

1. Resolver a redistribuição do conteúdo `enterprise` e a composição do histórico.
2. Corrigir e validar o contexto e a imagem Docker.
3. Definir os textos e o escopo de licença do projeto.
4. Consolidar a migração em commit revisável e confirmar acesso ao destino.
5. Reexecutar os gates em clone limpo e executar CI no commit candidato.
6. Publicar somente o candidato verificado, sem transferir conteúdo restrito.
