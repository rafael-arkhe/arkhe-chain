# ADR 0001 — Manter o leitor Blossom limitado

Data: 2026-10-23. Estado: aceite para o experimento `arkhe-p2p`.

## Contexto

O consumidor exige teto de bytes durante leitura, prazo total, origens
permitidas, redirects desativados, HTTP 200 para objeto completo e dupla
verificação SHA-256/BLAKE3 antes de expor qualquer byte. Downloads públicos
não devem exigir acesso a uma chave de publicação.

Foi inspecionado `blossom-rs 0.6.1`, fonte distribuída no crates.io,
`src/client/mod.rs`. `download` acumula `Response::bytes().await` antes de
retornar `Vec<u8>` sem teto parametrizável. O cliente HTTP é privado, não
expõe configuração de redirects e exige `BlossomSigner`. Um mismatch SHA-256
encerra o método em vez de tentar o próximo fornecedor.

## Decisão

Manter `BlossomTransport` de leitura com reqwest e as restrições já testadas.
Não acrescentar `blossom-rs` nem o seu grafo transitivo nesta etapa. Esta é uma
decisão de compatibilidade de contrato, não um advisory contra a biblioteca.

## Alternativas e consequências

Um wrapper pós-download não impõe limites durante a acumulação interna.
Um fork resolveria a API, mas acrescentaria manutenção antes de haver necessidade
de uploads. O adaptador próprio tem menos funcionalidades e deixa a manutenção
do seu contrato e testes a cargo do Arkhe. Não oferece servidor, QUIC ou PKARR.

## Critérios para reconsiderar

- API de stream/response com cliente HTTP ou política de redirects injetável.
- Teto de bytes e deadline durante leitura, sem confiar só em Content-Length.
- Leitura pública sem signer e fallback após conteúdo inválido.
- Necessidade concreta de uploads ou outra funcionalidade fora do leitor atual.

Qualquer avaliação futura começa com versão exata,
`default-features = false, features = ["client"]`, num lockfile separado.
Verificar features transitivas, licenças, fontes e advisories da resolução real;
nenhuma feature de telemetria/servidor deve ser presumida ausente só pelo nome.

Evidência e limites: [avaliação de dependências](../../DEPENDENCY-REVIEW.md).
Fonte: [cliente publicado 0.6.1](https://docs.rs/crate/blossom-rs/0.6.1/source/src/client/mod.rs).
