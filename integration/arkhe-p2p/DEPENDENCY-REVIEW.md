# Avaliação de dependências — 2026-10-23

Escopo: experimento independente `integration/arkhe-p2p`. O freeze E02, as suas
tags e a publicação Hashtree não são modificados. Esta avaliação não é auditoria
externa nem aprovação para produção/mainnet.

## Bao: implementado offline

Dependência fixada: `bao = "=0.13.1"`, com resolução no Cargo.lock próprio.
`BaoVerifier` aceita combined encoding e uma root BLAKE3 fornecida pelo chamador.
O decoder autentica chunks internamente; SHA-256 é calculado sobre o plaintext
decodificado. Só o resultado completo pode produzir o `VerifiedBlob` opaco.

O teste negativo de parent hash adulterado rejeita antes de ler 1 KiB de um
encoding cujo plaintext mede 1 MiB. Isto demonstra rejeição antecipada local,
não streaming Bao em rede. HTTP bruto continua no `DualVerifier` assíncrono.
Um endpoint Blossom `GET /<sha256>` não é implicitamente um endpoint Bao: o hash
do encoding pode diferir do hash do plaintext e exige locator/formato explícitos.

O formato usa chunks BLAKE3 de 1024 bytes; o buffer de I/O de 16 KiB não define
a granularidade criptográfica. O leitor offline tem teto de plaintext de 16 MiB,
limite de bytes do encoding e framing estrito sem trailing data. O header de
tamanho não é tomado como evidência autenticada. `std::io::Read` bloqueante não
permite afirmar cancelamento por deadline; por isso sockets não são suportados.

Fonte: [Bao 0.13.1](https://docs.rs/bao/0.13.1/bao/),
[formato Bao](https://github.com/oconnor663/bao/blob/master/docs/spec.md).

## blossom-rs: avaliado, não adotado nesta fase

Inspecionado o código distribuído no crates.io de `blossom-rs 0.6.1`, em
`src/client/mod.rs` e `Cargo.toml`. Não foi adicionado como dependência nem foi
compilado/auditado o seu grafo transitivo nesta avaliação.

O cliente oferece downloads assíncronos e failover, mas `download` devolve
`Vec<u8>` após `Response::bytes().await` sem parâmetro de teto de bytes. O seu
cliente HTTP privado é construído sem política explícita de proibição de
redirects. A API exige `BlossomSigner` e constrói auth também no download.
Um wrapper que só compare BLAKE3 depois do retorno não consegue impor o teto
durante essa acumulação nem substituir a política de redirects do cliente.
Além disso, mismatch SHA-256 retorna erro imediatamente em vez de tentar o
próximo fornecedor; o adaptador Arkhe testa fallback após conteúdo adulterado.

Decisão: manter o pequeno transporte de leitura já testado. Reconsiderar a
biblioteca se houver API de response/stream com cliente injetável, limites
durante leitura e leitura pública sem signer, ou se uploads forem necessários.
Isto é incompatibilidade com o contrato local, não uma alegação de vulnerabilidade.

Os defaults da biblioteca incluem servidor, armazenamento, iroh, PKARR e
telemetria. Uma avaliação futura de cliente mínimo deve começar com
`default-features = false, features = ["client"]`, versão e lockfile fixados,
e auditar a resolução efetiva. A presença dessas features não demonstra que
o fluxo Arkhe de download já usa QUIC/PKARR.

Fonte: [blossom-rs 0.6.1 — fonte publicada](https://docs.rs/crate/blossom-rs/0.6.1/source/src/client/mod.rs),
[manifest publicado](https://docs.rs/crate/blossom-rs/0.6.1/source/Cargo.toml).

Decisão formal: [ADR 0001 — leitor Blossom limitado](docs/adr/0001-bounded-blossom-reader.md).

## Nostr: escopo dos advisories

| Advisory | Pacote afetado | Versão corrigida |
|---|---|---|
| [RUSTSEC-2026-0231](https://rustsec.org/advisories/RUSTSEC-2026-0231.html) | nostr-relay-pool | >=0.44.3 |
| [RUSTSEC-2026-0224](https://rustsec.org/advisories/RUSTSEC-2026-0224.html) | nostr-relay-pool | >=0.44.2 |
| [RUSTSEC-2026-0232](https://rustsec.org/advisories/RUSTSEC-2026-0232.html) | nostr-relay-pool | >=0.44.3 |

O lockfile Arkhe usa `nostr = 0.44.8` diretamente e não contém
`nostr-relay-pool`. Versões de pacotes distintos não devem ser comparadas como
se fossem a mesma dependência. A consulta usa WebSocket diretamente e verifica
ID e assinatura de cada evento antes de aceitar candidatos, sem cache de
verificação e sem fila de desafios AUTH. Frames, mensagens, candidatos, relays
e prazos são limitados. Estes limites não eliminam spam, eclipse ou Sybil.

Há suporte a múltiplos relays configurados; isso não exige concordância entre
relays nem prova disponibilidade global. Web-of-trust não foi implementada:
uma futura allowlist de publishers seria política de descoberta, não substituto
para digest independente nem evidência de veracidade do artefacto.

`cargo audit --file integration/arkhe-p2p/Cargo.lock --json` executado em
2026-10-23: 198 dependências, zero vulnerabilidades encontradas, um aviso
`RUSTSEC-2024-0384` para `instant 0.1.13` sem manutenção, transitivo via
`nostr 0.44.8` (`cargo tree -i instant --target all`). Aviso preservado, não ignorado.
Base consultada: 1351 advisories, commit
`84d943a6deeb8cc6c6f632531aaf4f1c62275239`.
Ausência de advisory no lockfile não prova ausência de falhas.

## Política e acompanhamento de manutenção

Criados `deny.toml` desta crate e o workflow
`.github/workflows/arkhe-p2p-dependencies.yml`, sem alterar os workflows
existentes ou impor esta política ao workspace inteiro. Ferramenta fixada em
`cargo-deny 0.20.2`; lockfile da aplicação permanece inalterado.

Permitir apenas as licenças enumeradas, crates.io e nenhum Git; rejeitar
wildcards e versões yanked. Verificar todos os targets resolvidos e dependências
de testes. Duplicações transitivas são avisos. A flag `--warn unmaintained`
mantém avisos de manutenção visíveis sem bloqueio; **aplica-se a todos esses
avisos**, não apenas a `instant`. Não rebaixa vulnerabilidades ou unsoundness
e não usa `ignore`. O comando sem a flag reprova atualmente por `instant`.

Estado de `RUSTSEC-2024-0384`: aberto para acompanhamento, sem correção local
forçada. Em cada revisão de dependências, executar `cargo tree -i instant
--target all` e rever releases de `nostr`. Quando houver versão adequada,
avaliar atualização numa alteração própria: API/features, lockfile, remoção
efetiva de `instant`, audit, deny, os 18 testes e doctest, Clippy e formatação.
Não adicionar `instant`/`web-time` diretamente nem usar patch para simular
resolução de uma dependência que continua a ser requerida por upstream.
Não há `libp2p` nesta crate a acompanhar como dependência atual.

Validação local da política em 2026-10-23:

- Os quatro grupos de `cargo deny ... --locked check --warn unmaintained`
  passaram. Avisos: `instant` sem manutenção e oito grupos de versões duplicadas
  (`base64`, `cpufeatures`, `getrandom`, `rand`, `rand_chacha`, `rand_core`,
  `webpki-roots`, `windows-sys`).
- Testes negativos com cópias temporárias do metadata Cargo: substituir a licença
  de um pacote por `GPL-3.0-only` falhou com `rejected` (exit 4); substituir a
  fonte por registry não permitido falhou com `source-not-allowed` (exit 8).
  Não se alteraram o manifest ou o lockfile da aplicação nesses testes.
- YAML do workflow analisado localmente e job presente. Não houve execução
  hospedada, publicação deste workflow ou ativação de monitoramento periódico.
- Manifest E02: os 101 ficheiros continuam iguais.

Referência da configuração: [cargo-deny](https://embarkstudios.github.io/cargo-deny/checks/cfg.html).

## Validação e pendências

Executados: 13 testes de aquisição, 5 testes Bao, 1 doctest compile-fail;
`cargo clippy --locked --all-targets -- -D warnings`; formatação Rust;
manifest E02 com os 101 ficheiros preservados.

Continuam pendentes Bao sobre rede com protocolo explícito e cancelamento,
smoke público do novo adaptador, integração UI, política opcional de publishers
e teste positivo de descoberta com fornecedores de dois relays distintos.
O Hashtree já distribui o repo; decodificação nativa de blobs/CHK nesta crate
continua adiada. Dupla hash de um blob não decodifica uma árvore Hashtree.

## Evolução — Fase 0 de serviço gratuito

Acrescentados `src/bin/fetch-proof.rs` e `phase0/`, sem novas dependências Rust
ou alteração do Cargo.lock. O provider Node serve apenas dataset/ANCHOR/REF
públicos do smoke histórico, com pins locais. O probe usa o transporte Rust e
o verificador E02 existentes e conserva o aviso RPC. Não usa descoberta Nostr
neste fluxo de origem configurada, nem Bao na rede.

Quatro testes Node adicionais executaram a composição real e a falha por
conteúdo adulterado. Os 18 testes Rust e doctest, Clippy, formatação e manifest
E02 continuam aprovados. Os logs locais não assinados contam observações, não
provam operadores independentes ou demanda. Documentação e execução:
[phase0/README.md](phase0/README.md). Publicação e smoke público permanecem pendentes.
