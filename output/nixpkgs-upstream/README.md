# Contribuição ao NixOS/nixpkgs

Proposta inicial: `arkhe-verify: init at 0.1.0-unstable-2026-10-29`.
O executável instalado é `arkhe-verify`; o crate Cargo é `arkhe-verify-cli`.

Validação concluída em WSL Ubuntu x86_64-linux: build, testes Cargo/golden,
teste passthru BLAKE3, schema de mantenedores, nixfmt e diff sem erros.
`nix-build --check` reconstruiu a saída com sucesso e identidade bit a bit.
Hash NAR: `sha256-aVjRxtMiLJv/rvdYT+qPMMWF3zDMCaCeWbEN3cK5ak8=`.
Logs e revisões exatas estão em `D:\arkhe\output\nixpkgs-upstream\results.json`
e nos arquivos ao lado dele. Isso não comprova reprodução em outra máquina.

A contribuição oficial contém somente o cadastro de mantenedor e a receita
`pkgs/by-name/ar/arkhe-verify/package.nix`. O workspace Rust não será adicionado
à árvore do Nixpkgs: é baixado de uma revisão pública imutável, com hash real.
WASM, SDD e os demais pacotes continuam no overlay já validado.

## Fontes publicadas com autorização

- Integração e evidências anteriores: branch `arkhe/nix-packages-integration`,
  commit `9c1d848c9b08ff7c9ac9b685c3f586717ed6d082` em
  https://github.com/rafael-arkhe/nixpkgs-arkhe.
- Snapshot somente dos fontes: branch `arkhe/source-2026-10-29`, commit
  `228da8e803e9f81041066e3a3a50f61e6ff4201c` no mesmo repositório.
  É exatamente a árvore `arkhe/source` do commit de integração, agora na raiz.
  O manifesto correspondente continua no commit de integração.
- Hash NAR da fonte: `sha256-IX8kHrWuRQn9jOb1mwXwJ9eoMkelO+1PpFlbu/dEiiI=`.
- Hash Cargo: `sha256-J2aSDP8/OcFVQdilWyYs+4f8VXwhxEhT9uSh+8egyH8=`.

O fork hospeda temporariamente os fontes desenvolvidos localmente. O commit de
fontes não contém a árvore do Nixpkgs. Não foi inventada uma tag v0.1.0:
a versão do pacote indica explicitamente um snapshot unstable.

## Checkout e verificação

Checkout Linux: `/home/arkhen/nixpkgs-upstream-arkhe/nixpkgs`, no WSL Ubuntu.
Branch local: `arkhe-verify-init`.
Base NixOS/nixpkgs: `0470df609861fede4cec47148a001f04513bdabc`.

```sh
export PATH="$HOME/.nix-profile/bin:$PATH"
export NIX_CONFIG='experimental-features = nix-command flakes'
cd /home/arkhen/nixpkgs-upstream-arkhe/nixpkgs
nix-build -A arkhe-verify --no-out-link
nix-build -A arkhe-verify.tests --no-out-link
nix-build -A arkhe-verify --check --keep-failed --no-out-link
nix-build lib/tests/maintainers.nix --no-out-link
nix-shell -p nixfmt --run 'nixfmt --check pkgs/by-name/ar/arkhe-verify/package.nix maintainers/maintainer-list.nix'
git diff --check
```

`reproduce.sh` executa os testes do pacote, registra o hash NAR antes/depois e
exige sucesso de `nix-build --check`. A comparação feita pelo Nix verifica a
saída reconstruída; comparar apenas o caminho no store não bastaria.

Esta receita usa o `rustPlatform` padrão do Nixpkgs, Rust 1.99.0 nessa revisão.
O overlay permanece fixado no Rust 1.96.0 de `rust-toolchain.toml` e tem suas
próprias evidências. Não se confunde a validação dos dois compiladores.
O Cargo.lock original é validado pelo cargoSetupHook; a vendorização é fixada
por cargoHash e o build/teste usa `--frozen`, offline, em sandbox.

O checkPhase executa os testes de arkhe-core, arkhe-verify-core e do CLI.
Exige também golden_vectors e golden_contract com ao menos um teste aprovado.
O teste passthru verifica o digest BLAKE3 conhecido da entrada vazia.

Não se habilita `__contentAddressed` no pacote oficial: isso imporia o recurso
experimental ca-derivations ao consumidor. Fonte e dependências são fixed-output;
a saída é uma derivação normal, cuja reprodutibilidade é verificada por rebuild.
A variante CA experimental continua disponível no overlay.

Não houve execução desta receita oficial em outra máquina/VM, aarch64 ou Darwin.
Não foi executado nixpkgs-review. Não foi rodado `nix flake check` da árvore
inteira do Nixpkgs; esse não é um teste limitado ao novo pacote.

## Revisão humana e envio

`pull-request.md` contém a descrição proposta, com divulgação do uso de Codex.
Os commits de mantenedor e pacote terão trailers `Assisted-by:`.
Antes do envio ao NixOS/nixpkgs, o responsável deve revisar o diff e a descrição,
conforme CONTRIBUTING.md, seção Automation/AI policy. O envio da branch da
contribuição e a abertura do PR aguardam essa revisão e autorização.

Política: https://github.com/NixOS/nixpkgs/blob/0470df609861fede4cec47148a001f04513bdabc/CONTRIBUTING.md#automationai-policy
