# Reexporta o construtor para uso por terceiros:
#
#   let arkheLib = import (nixpkgs-arkhe + "/lib") { inherit pkgs; };
#   in arkheLib.mkArkhePackage { ... }
{ pkgs }:

{
  mkArkhePackage = pkgs.callPackage ./mk-arkhe-package.nix { };
}
