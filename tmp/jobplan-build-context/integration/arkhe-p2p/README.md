# arkhe-p2p — aquisição verificável de blobs pequenos

Experimento Rust **fora de `arkhe-e02@1`**. Workspace independente, com lockfile
próprio. Não altera o manifest congelado nem a publicação Hashtree existente.

O protótipo de serviço gratuito e contador de observações está em
[phase0/README.md](phase0/README.md): servidor HTTP de três evidências públicas,
cliente que usa este transporte Rust e verificação E02, sem alegar peers
independentes, procura orgânica ou SLA a partir de um contador local.

## O que existe

| Módulo | Comportamento |
|---|---|
| `verify::DualVerifier` | Lê `AsyncRead`, acumula SHA-256 e BLAKE3, retém bytes até EOF válido e só então produz `VerifiedBlob` opaco |
| `verify::BaoVerifier` | Decodifica combined Bao offline, autentica chunks contra BLAKE3 fixado e compara SHA-256 do plaintext antes de devolver `VerifiedBlob` |
| `transport::BlossomTransport` | Download GET do blob em origens explicitamente permitidas; HTTPS por padrão, sem redirects; limites de tempo e bytes; apenas HTTP 200 para objeto completo |
| `discovery::NostrDiscovery` | Consulta NIP-94 kind 1063 por `#x`; valida ID e assinatura BIP-340 com `nostr::Event::verify`, kind, digest e tags não ambíguas; deduplica URLs |

`BlossomTransport::acquire` tenta até 32 candidatos dentro de um prazo total.
Esgotar fornecedores produz `Incomplete`, não `NotFound` global. A descoberta
devolve candidatos, EOSE por relay e diagnósticos de observação incompleta.
As respostas WebSocket têm limite de 64 KiB por mensagem/frame; a consulta tem
limites de relays (8), mensagens (256), candidatos (32) e tempo por relay.
O limite total de frames pode encerrar a consulta antes de obter EOSE.

Os digests esperados são entrada do chamador. O BLAKE3 esperado **não é aprendido
do mesmo evento que fornece o URL**. Metadados assinados identificam quem fez a
alegação, não dão autoridade sobre o conteúdo. A API não converte um BLAKE3
num SHA-256: o chamador precisa fornecer a associação de compromissos/locators.
Um locator direto configurado pode ser usado sem descoberta Nostr.

## Fronteiras importantes

- Os dois hashes descrevem os **mesmos bytes brutos**. Este módulo não decodifica
  uma árvore Hashtree, não desencripta CHK e não compara ciphertext com o digest
  do dataset em plaintext. O repositório continua a ser distribuído por Hashtree.
- O buffer de leitura de 16 KiB é apenas uma escolha de I/O. `DualVerifier`
  continua a ler bytes brutos; não é Bao nem autentica ranges. `BaoVerifier`
  aceita explicitamente o formato combined Bao, com chunks BLAKE3 de 1024 bytes.
  Os dois digests esperados descrevem o plaintext decodificado, nunca o encoding.
  Nenhuma das APIs expõe bytes antes de concluir ambas as verificações.
  O máximo aceito é 16 MiB.
- Bao nesta fase é síncrono para entradas finitas/offline. Não ligar sockets
  bloqueantes à API: não oferece deadline cancelável. O header não autenticado
  só serve para rejeitar tamanho excessivo; há limite de leitura do encoding
  e rejeição de bytes finais adicionais. HTTP Blossom continua a usar o formato
  bruto e a sua própria verificação: nenhum servidor é presumido fornecer Bao.
- `VerifiedBlob` tem campos privados e acesso apenas de leitura; o consumidor
  não pode construir nem modificar esse selo diretamente.
- A política permite HTTP/WS sem TLS apenas em IP loopback literal e mediante
  opção explícita, usada nos testes. A allowlist de origens deve ser configurada
  pelo operador; não é defesa completa contra DNS rebinding ou proxy malicioso.
- `m`, tamanho declarado e publisher são metadata; não comandam alocação
  antecipada nem alteram o digest esperado. Tags `x`, `url`, `m` ambíguas são
  rejeitadas. Tags adicionais de NIP-94 são ignoradas neste perfil de leitura.
- Não há upload, assinatura de publicações, cache persistente, penalização,
  DHT, PoW, erasure coding, daemon, nem rede direta entre peers implementados.
- Não há novo selo para factura real. O verificador E02 e o seu aviso RPC
  continuam inalterados. A execução E02 verifica entradas, não autentica recibos.

## Reproduzir

Requisitos: Rust 1.96.0 do workspace e Node para o teste de composição E02.
Na raiz `D:/arkhe`:

```powershell
cargo test --manifest-path integration/arkhe-p2p/Cargo.toml --locked
cargo clippy --manifest-path integration/arkhe-p2p/Cargo.toml --locked --all-targets -- -D warnings
cargo fmt --manifest-path integration/arkhe-p2p/Cargo.toml --check
node specs/e02/verify_manifest.mjs
cargo audit --file integration/arkhe-p2p/Cargo.lock
cargo deny --manifest-path integration/arkhe-p2p/Cargo.toml --config integration/arkhe-p2p/deny.toml --locked check --warn unmaintained
```

São **18 testes de integração (13 de aquisição + 5 de Bao) e um doctest de rejeição de construção direta**:

- igualdade dos bytes locais/HTTP, blob vazio e leitura em múltiplos buffers;
- SHA-256 correto/BLAKE3 errado e o inverso;
- truncamento, corrupção, limite excedido e stream bloqueado;
- HTTP 404/500/206/302 rejeitados, header de tamanho excessivo;
- origem não permitida, credenciais no URL e locator errado rejeitados;
- primeira origem com conteúdo errado e segunda correta; lista vazia incompleta;
- relay WebSocket real em loopback: assinatura alterada, hash diferente,
  deduplicação, timeout, EOSE e limite de candidatos;
- configuração sem orçamento rejeitada;
- composição local NIP-94 -> Blossom -> dupla verificação -> CLI E02 usando
  os recibos reais do smoke e o dataset BLAKE3 fixado independentemente como
  `022fe7a7311d8e1834f39f4ca4a9de6bc8d8c4f6c5c97ce792c1259768fdcfa8`;
- `compile_fail`: campos privados impedem forjar `VerifiedBlob` por struct literal.
- Bao: vazio e fronteiras de chunks, root e SHA-256 incorretos, truncamento,
  header alterado, bytes adicionais e tamanho excessivo; parent hash adulterado
  rejeitado antes de ler 1 KiB de um encoding de plaintext de 1 MiB.

Os testes não usam relays/servidores públicos e não publicam eventos externos.
O teste de composição usa uma cópia temporária dos bytes verificados; preserva
os ficheiros do smoke ancorado. Um smoke público deste novo adaptador e a ligação
à UI permanecem pendentes; não se inferem da publicação anterior do repo.

A avaliação de `blossom-rs 0.6.1` e dos advisories Nostr está em
[DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md). Não foi acrescentado um relay pool.
O audit do lockfile em 2026-10-23 encontrou zero vulnerabilidades e um aviso de
dependência sem manutenção (`instant 0.1.13`, via `nostr`); não é auditoria externa.

## Política automatizada de dependências

`deny.toml` aplica-se apenas a esta crate, incluindo dependências de testes e
de outros targets resolvidos. Usar `cargo-deny 0.20.2`. A lista de licenças
permitidas aceita alternativas permissivas de pacotes com licença dupla;
expressões exclusivamente GPL/AGPL/LGPL não passam. Não há exceções de licença.
Só crates.io está permitido como registry; dependências Git não são permitidas.
Dependências wildcard e versões retiradas do registry bloqueiam o check;
múltiplas versões transitivas ficam como aviso, sem pins artificiais.

O comando documentado usa `--warn unmaintained` explicitamente: **todos** os
advisories de manutenção são avisos visíveis, enquanto vulnerabilidades,
unsoundness e violations de política continuam bloqueantes. A lista `ignore`
está vazia. Executar sem essa flag é mais estrito e atualmente falha por `instant`.

O workflow `.github/workflows/arkhe-p2p-dependencies.yml` está preparado para
push/PR de alterações nesta crate/política e execução manual. Foi validado
localmente; não foi publicado nem executado em GitHub Actions nesta ronda.
Não constitui monitoramento periódico enquanto o workspace não estiver num
repositório com Actions ativo. Atualizações da base de advisories são consultadas
quando o check é executado; não existe promessa de alerta entre execuções.

O acompanhamento de `instant`, o procedimento de atualização e as evidências
estão em [DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md). A decisão do transporte
está formalizada no [ADR 0001](docs/adr/0001-bounded-blossom-reader.md).

## Correções ao texto de proposta

NIP-94 é um perfil opcional de metadata de ficheiro. O repo Hashtree publicado
usa eventos de root HTS-01 (kind 30064) e anúncio NIP-34; não foi anunciado como
ficheiro NIP-94 e este discovery não pretende resolvê-lo automaticamente.

BUD-02 atual exige que o servidor compute SHA-256 dos bytes recebidos; o cliente
continua a verificar downloads sem confiar no servidor. Auth Blossom (kind
24242/BUD-11) e HTTP auth NIP-98 (kind 27235) não são o mesmo protocolo. Este
cliente não implementa uploads nem solicita chaves de publicação.

Nem Nostr nem a assinatura Ed25519 opcional do dataset provam veracidade de um
artefacto ou representação de empresa. BLAKE3 é digest, não sistema de identidade.
CHK não implica anonimato, negação legal ou segredo para conteúdo público.

Referências consultadas em 2026-10-23:

- [NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md).
- [BUD-01](https://github.com/hzrd149/blossom/blob/master/buds/01.md).
- [BUD-02](https://github.com/hzrd149/blossom/blob/master/buds/02.md).
- `docs/P2P-ARCHITECTURE-REVIEW.md` e a spec HTS-01 ali referida.
