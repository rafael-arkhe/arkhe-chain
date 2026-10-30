{
  description = "Pacotes Arkhe para Nix: builds reprodutíveis e endereçados por conteúdo";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;

      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      forAllSystems = lib.genAttrs systems;

      pkgsFor = system: import nixpkgs { inherit system; };

      packagesFor = system: import ./default.nix { pkgs = pkgsFor system; };

      contentAddressedFor =
        system:
        import ./default.nix {
          pkgs = pkgsFor system;
          contentAddressed = true;
        };
    in
    {
      overlays.default = import ./overlay.nix { };
      overlays.contentAddressed = import ./overlay.nix { contentAddressed = true; };

      packages = forAllSystems (
        system:
        let
          p = packagesFor system;
        in
        (lib.filterAttrs (_: lib.isDerivation) p) // { default = p.arkhe; }
      );

      # `ca` fica fora de `packages` de propósito: instanciar uma derivação
      # endereçada por conteúdo exige `ca-derivations`, que ainda é
      # experimental. Assim `nix flake check` continua funcionando em uma
      # instalação padrão.
      legacyPackages = forAllSystems (
        system:
        let
          p = packagesFor system;
          ca = contentAddressedFor system;
        in
        p // { ca = lib.filterAttrs (_: lib.isDerivation) ca; }
      );

      checks = forAllSystems (
        system:
        import ./checks/default.nix {
          pkgs = pkgsFor system;
          packages = packagesFor system;
        }
      );

      apps = forAllSystems (system: {
        arkhe-verify = {
          type = "app";
          program = "${(packagesFor system).arkhe-verify}/bin/arkhe-verify";
        };
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              cargo
              clippy
              gnumake
              jq
              nix
              rustc
              rustfmt
            ];
          };
        }
      );

      # API para consumidores que trazem a própria fonte (por exemplo um
      # tarball de release fixado por hash).
      lib = {
        mkPackages =
          {
            pkgs,
            src,
            contentAddressed ? false,
          }:
          import ./default.nix { inherit pkgs src contentAddressed; };

        mkOverlay = args: import ./overlay.nix args;
      };

      nixosModules = {
        default = {
          imports = [
            ./modules/arkhe-node.nix
            ./modules/arkhe-audit.nix
          ];
        };
        arkhe-node = ./modules/arkhe-node.nix;
        arkhe-audit = ./modules/arkhe-audit.nix;
      };
    };
}
