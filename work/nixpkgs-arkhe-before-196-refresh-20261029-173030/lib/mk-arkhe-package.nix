# Construtor único dos pacotes Arkhe para Nix.
#
# Determinismo aplicado:
#   - `--locked` + `cargoLock.lockFile`: cada crate é resolvido pelo checksum
#     registrado no Cargo.lock; não existe versão flutuante.
#   - sandbox sem rede + `CARGO_NET_OFFLINE=true`.
#   - `SOURCE_DATE_EPOCH` fixo.
#   - `--remap-path-prefix` remove caminhos absolutos do binário.
#   - `RUSTFLAGS` explícito também neutraliza o `-Dwarnings` de
#     `.cargo/config.toml` do monorepo: política de desenvolvimento não deve
#     quebrar o empacotamento quando o rustc do nixpkgs difere do
#     `rust-toolchain.toml`.
{ lib, rustPlatform }:

{
  pname,
  crate ? pname,
  bin ? null,
  version ? "0.1.0",
  src,
  contentAddressed ? false,
  features ? [ ],
  noDefaultFeatures ? false,
  doCheck ? false,
  cargoBuildFlags ? [ ],
  cargoTestFlags ? [ ],
  nativeBuildInputs ? [ ],
  buildInputs ? [ ],
  extraAttrs ? { },
  meta ? { },
}:

let
  featureFlags =
    lib.optionals noDefaultFeatures [ "--no-default-features" ]
    ++ lib.optionals (features != [ ]) [ "--features" (lib.concatStringsSep "," features) ];
in
rustPlatform.buildRustPackage (
  {
    inherit pname version src;

    cargoLock = {
      lockFile = "${src}/Cargo.lock";
      allowBuiltinFetchGit = false;
    };

    cargoBuildFlags =
      [ "--locked" "-p" crate ]
      ++ lib.optionals (bin != null) [ "--bin" bin ]
      ++ featureFlags
      ++ cargoBuildFlags;

    cargoTestFlags = [ "-p" crate ] ++ featureFlags ++ cargoTestFlags;

    inherit doCheck nativeBuildInputs buildInputs;

    SOURCE_DATE_EPOCH = 315532800;
    CARGO_INCREMENTAL = "0";
    CARGO_NET_OFFLINE = "true";
    TZ = "UTC";
    LC_ALL = "C";

    preBuild = ''
      export RUSTFLAGS="''${RUSTFLAGS-} --remap-path-prefix=$PWD=/build/source --remap-path-prefix=$NIX_BUILD_TOP=/build"
    '';

    passthru = {
      inherit crate bin contentAddressed;
    };

    meta =
      {
        homepage = "https://github.com/rafael-arkhe/nixpkgs-arkhe";
        license = lib.licenses.asl20;
        platforms = lib.platforms.linux;
        sourceProvenance = [ lib.sourceTypes.fromSource ];
      }
      // lib.optionalAttrs (bin != null) { mainProgram = bin; }
      // meta;
  }
  // lib.optionalAttrs contentAddressed {
    __contentAddressed = true;
    outputHashMode = "recursive";
  }
  // extraAttrs
)
