{ }:
let
  flake = builtins.getFlake "path:/mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe";
  nixpkgs = flake.inputs.nixpkgs;
  system = "x86_64-linux";
  vm = nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [
      (nixpkgs.outPath + "/nixos/modules/virtualisation/qemu-vm.nix")
      ({ pkgs, lib, ... }: {
        networking.hostName = "arkhe-repro-vm";
        system.stateVersion = "26.05";
        services.openssh.enable = true;
        services.openssh.settings = { PermitRootLogin = "prohibit-password"; PasswordAuthentication = false; };
        users.users.root.openssh.authorizedKeys.keys = [ (builtins.readFile /home/arkhen/.cache/arkhe-repro/id_ed25519.pub) ];
        nix.settings.experimental-features = [ "nix-command" "flakes" "ca-derivations" ];
        nix.settings.sandbox = true;
        nix.settings.max-jobs = 1;
        nix.settings.cores = 3;
        environment.systemPackages = [ pkgs.git pkgs.jq pkgs.python3 ];
        virtualisation = {
          memorySize = 6144;
          cores = 4;
          diskSize = 65536;
          graphics = false;
          useNixStoreImage = true;
          mountHostNixStore = false;
          writableStore = true;
          writableStoreUseTmpfs = false;
          sharedDirectories = lib.mkForce { };
          forwardPorts = [ { from = "host"; host.address = "127.0.0.1"; host.port = 22429; guest.port = 22; } ];
        };
      })
    ];
  };
in vm.config.system.build.vm