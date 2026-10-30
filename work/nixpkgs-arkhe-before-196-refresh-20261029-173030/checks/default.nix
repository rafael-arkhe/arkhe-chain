# Checks executados por `nix flake check`.
#
# Cada pacote é o próprio check (build completo). O artefato WASM fica de fora
# porque depende de uma toolchain com std para `wasm32-unknown-unknown`.
{ pkgs, packages }:

let
  inherit (pkgs) lib;

  checkable = lib.filterAttrs (
    name: value: lib.isDerivation value && name != "arkhe-verify-wasm"
  ) packages;
in
checkable
// {
  smoke = pkgs.runCommand "arkhe-verify-smoke" { } ''
    mkdir -p $out
    ${packages.arkhe-verify}/bin/arkhe-verify --help > $out/help.txt
  '';
}
