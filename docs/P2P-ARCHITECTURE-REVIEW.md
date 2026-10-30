# P2P Arkhe — revisão da proposta, 2026-10-23

**Status:** proposta de evolução; não altera `arkhe-e02@1`, não é implementação
de uma rede nova nem prova de resistência a Sybil/eclipse.

## Estado demonstrado

- E02 verifica compromissos, datasets e inclusão MMR localmente. Os scripts E02
  inspecionados não implementam obtenção de dataset por IPFS.
- O repositório E02 foi publicado via Hashtree/Blossom e anunciado em Nostr.
  Um leitor com cache novo e sem chave do publicador recuperou 155 objetos Git,
  verificou os 101 ficheiros do manifest e executou 109 testes com sucesso.
  Evidência: `docs/evidence/2026-10-23-e02-hashtree/`.
- Esse clone demonstra distribuição pública observada via servidores Blossom;
  não demonstra transferência direta entre peers, DHT própria, Bao, diversidade
  de sub-rede, PoW, erasure coding ou sobrevivência à perda de um servidor.

Portanto, “fase 0 já existe: IPFS no E02” é incorreto para a base inspecionada.
“Nenhum componente foi implementado ou testado” também ignora o transporte
executado, embora as novas crates propostas de Arkhe não estejam implementadas.

## Correções à arquitetura

### 1. Integridade e disponibilidade são propriedades distintas

Verificação rejeita bytes incompatíveis com um compromisso esperado. Não evita
que todos os fornecedores deixem de responder. Replicação melhora a chance de
recuperação sob hipóteses explícitas; recibo de armazenamento ou hash de conteúdo
não prova retenção futura. Não apresentar resiliência como sinónimo de verificação.

O digest esperado deve vir de uma referência fixada ou de uma fonte cuja
autoridade esteja definida pelo chamador. Obter bytes e o seu digest do mesmo
peer e compará-los demonstra apenas consistência com a alegação desse peer.

### 2. Os identificadores não são intercambiáveis

| Tipo | Semântica |
|---|---|
| `HashtreeCid` | SHA-256 dos bytes armazenados e chave CHK opcional; nós de árvore e ciphertext não são o ficheiro lógico reconstruído |
| `BlobDigest` | BLAKE3 dos bytes exatos do artefacto/dataset reconstruído que o consumidor espera |
| `MmrRoot` | Root calculada sob domínios, bagging e contagem de `arkhe-mmr@1` |
| `ProviderIdentity` | Identidade específica do protocolo de distribuição; não autoridade sobre a veracidade do artefacto |

HTS-01 exige SHA-256; não substituir esse algoritmo por BLAKE3 no adaptador.
Verificar a árvore/transporte nativos, reconstruir os bytes lógicos e então
comparar o BLAKE3 esperado pela aplicação. Não comparar diretamente as duas roots.
Nostr usa identidade secp256k1/Schnorr; um `PeerId` Ed25519/libp2p não representa
automaticamente o publicador Nostr. Preservar namespaces e tipos distintos.

IPFS é compatibilidade futura, não dependência inicial. A verificação deve seguir
o multihash/codec e a estrutura do CID usados pelo perfil; “SHA-256 do ficheiro”
não descreve universalmente um CID IPFS de ficheiro UnixFS fragmentado.

### 3. Discovery, transporte e aceitação

Discovery devolve candidatos e o estado da observação, nunca a validade do conteúdo.
Separar consulta de publicação. Uma publicação futura precisa de um registo
assinado com domínio/versão, digest e algoritmo, fornecedor, locator, validade e
regras de replay; `sign(hash)` isolado não especifica esse contrato.

O fetch deve impor prazo total e por tentativa, máximo de candidatos, limite de
bytes, regras para redirects/locators e cancelamento. A lista retornada não pode
ser ilimitada. `NoResult` ou esgotamento dos candidatos significa observação
incompleta, não ausência global. Não criar cache negativo permanente.

Um `VerifiedBlob` deve ter campos privados e construtor restrito ao verificador;
campos públicos permitem forjar o selo por construção direta. O cache deve ser
por identidade de conteúdo tipada, verificar bytes recuperados e não elevar
resultados de consultas anteriores a autoridade atual.

### 4. HTTP incremental não é Bao

Hashear incrementalmente bytes HTTP comuns permite comparar o digest só ao fim.
Não autentica imediatamente um range isolado. Antes de haver provas de chunks,
reter/quarentenar o objeto dentro de um limite e não o entregar como verificado.

Bao permite entregar ranges/chunks autenticados contra uma root externa, mas
isso não equivale a declarar o objeto inteiro completo. Separar `VerifiedRange`
de `VerifiedBlob`; tratar truncamento, ordem, offsets e tamanho explicitamente.
Na especificação Bao combined, o prefixo é o tamanho little-endian de 8 bytes;
a root esperada é fornecida pelo verificador, não confiada a um header do peer.
O tamanho anunciado não pode comandar alocação ilimitada nem ser tratado como
autenticado antes das verificações exigidas pela spec.

### 5. Parâmetros de defesa continuam hipóteses locais

PoW, quotas por chave, diversidade de prefixos e múltiplas fontes aumentam custos
ou reduzem concentração sob determinadas hipóteses; não demonstram ausência de
Sybil/eclipse. Três IPs podem partilhar operador/ASN, NAT pode penalizar honestos
e várias chaves contornam uma quota por chave. Não fixar “30 s CPU”, “3 peers por
/24” ou “3 falhas = isolamento” como garantias de segurança do Arkhe.
Timeout ou indisponibilidade não prova comportamento malicioso: manter sinais
de disponibilidade separados de evidência de bytes incompatíveis.

O README atual do InfoMesh descreve duração de PoW dependente do hardware e
explicita que três bootstraps independentes são objetivo de implantação; o
default incluído tem um bootstrap. O exemplo não valida os parâmetros do Arkhe.

SR-DHT-Store no artigo localizado protege a operação de publicação/provide.
O próprio resumo distingue defesas adicionais do lookup, vulnerável a terminação
antecipada. Não atribuir ao nome do mecanismo toda a proteção de queries.
A página integral retornou 403 nesta ronda; a conclusão aqui limita-se ao resumo
indexado do editor, sem alegação de reprodução do estudo.

RedStuff tem overhead aproximado de 4,5 sob o modelo e parâmetros Walrus; não é
um parâmetro universal de “replicação 4,5x”. Uma versão “Red Stuff-like” do Arkhe
precisaria de desenho, autenticação de fragmentos, testes e análise próprios.

## Próximo incremento recomendado

Uma fronteira pequena de aquisição verificável sobre o transporte existente:

```text
referência fixada + BLAKE3 esperado + limite de bytes
  -> descoberta de candidatos/locators (observação incompleta possível)
  -> Hashtree/Blossom: verificar SHA-256/CHK e reconstruir ficheiro lógico
  -> quarentena limitada -> BLAKE3 dos bytes exatos -> aceitar ou rejeitar
  -> verificador E02 inalterado: dataset + memos + inclusão MMR
```

Critérios para implementar esse incremento fora do freeze:

1. Digest e locator independentes: bytes bons aceitos; alteração de um byte,
   digest errado, truncamento e tamanho excedido rejeitados antes da aceitação.
2. Mesmo contrato com fonte local e um transporte remoto; falha da primeira
   fonte pode tentar a segunda dentro do orçamento total.
3. Timeout/zero candidatos retorna `Incomplete` com diagnóstico; não `NotFound`.
4. Cache corrompido não produz `VerifiedBlob`; nenhum consumidor recebe dados
   brutos com esse tipo; lookup/reputação não altera a regra de integridade.
5. Bytes do dataset E02 são preservados; resultado continua `synthetic-poc` e
   mantém o aviso de recibos RPC não autenticados.

Isso é proposta de incremento, não código entregue nesta ronda. Iroh/Bao só
entram após demonstrar a necessidade de grandes objetos/ranges. DHT própria,
PoW e erasure coding ficam adiados. Não há justificativa atual para abrir sete
crates, criar uma nova identidade global ou substituir a distribuição publicada.

## Fontes e limites

- [HTS-01, snapshot consultado](https://git.iris.to/#/nhash1qqsvuddqcf2kesm3pajrvpw4vg4zcy5k8vy8vmet99x09kjcxdjxxfs3shap5/docs/HTS-01.md?snapshot=1): §§2, 5, 6 e 11. SHA-256, CHK, identificadores e NoResult. Também inspecionado `hashtree-core` 0.2.91 do registry local.
- [Bao spec](https://github.com/oconnor663/bao/blob/master/docs/spec.md): combined encoding, tamanho e garantias do decoder.
- [iroh-blobs protocol](https://docs.rs/iroh-blobs/latest/iroh_blobs/protocol/index.html): verified streaming e grupos de 16 KiB, detalhe de perfil/versão, não propriedade de todo transporte QUIC.
- [InfoMesh](https://github.com/dotnetpower/infomesh): descrição das defesas e limitações de bootstrap, não auditoria independente.
- [Active Sybil attack and efficient defense strategy in IPFS DHT](https://www.sciencedirect.com/science/article/abs/pii/S1389128626002896): resumo indexado; corpo do artigo inacessível nesta ronda.
- [RedStuff properties](https://docs.wal.app/docs/system-overview/red-stuff-parameters): overhead, parâmetros e autenticação dos slivers no modelo Walrus.

As referências externas são pesquisa, não evidência de que Arkhe implementa
essas defesas. Nenhuma transação, novo push ou nova rede foi iniciada nesta ronda.

## Evolução posterior — implementação local dos três módulos

Após esta revisão e o pedido subsequente, foi criada a crate experimental
`integration/arkhe-p2p`, com workspace/lockfile independentes e três módulos:
`DualVerifier`, `BlossomTransport` de leitura e `NostrDiscovery` NIP-94.
O caminho de blobs simples verifica SHA-256 e BLAKE3 sobre os mesmos bytes;
não decodifica Hashtree nem altera a distribuição já publicada do repositório.

Validação local: 13 testes de integração aprovados, um doctest `compile_fail`
impedindo construção direta de `VerifiedBlob`, rustfmt e Clippy sem avisos.
O teste de composição usa relay e HTTP em loopback, os bytes preservados do
dataset do smoke devnet e o CLI E02 existente, com resultado `VERIFIED` e aviso
RPC presente. O manifest de 101 ficheiros de `arkhe-e02@1` continua íntegro.
Detalhes e reprodução em `integration/arkhe-p2p/README.md`.

Essa evolução não demonstra descoberta em relays públicos, download deste novo
adaptador de um servidor público, autenticação dos recibos E02, Bao, DHT própria,
replicação ou integração com o dashboard. Não foi publicada na tag congelada.

## Evolução posterior — Bao offline e avaliação de dependências

Foi acrescentado `BaoVerifier` separado, com `bao = 0.13.1`: combined encoding,
root BLAKE3 independente, SHA-256 do plaintext e retorno opaco só após validação
completa. Cinco testes adicionais cobrem rejeição antecipada de parent hash
adulterado, fronteiras, truncamento, tamanho e framing. O total passou para
18 testes de integração e um doctest; o transporte HTTP bruto não mudou.
Bao em rede continua pendente. O relato anterior de ausência de Bao descreve
a etapa anterior, não o estado atual.

`blossom-rs 0.6.1` foi inspecionado e não adotado: o download público da API
acumula o corpo sem teto parametrizável e requer signer. Os advisories citados
afetam `nostr-relay-pool`, ausente do lockfile desta crate. A avaliação e o aviso
de manutenção transitivo encontrado por `cargo audit` estão registados em
`integration/arkhe-p2p/DEPENDENCY-REVIEW.md`.

## Evolução posterior — verificação de árvore Hashtree (D1), 2026-10-29

`integration/arkhe-p2p` ganhou `hashtree::HashtreeVerifier`: SHA-256 por bloco,
CHK com verificação da chave convergente, nós MessagePack estritos e
reconstrução de ficheiros fragmentados, com a regra desta revisão mantida
(`HashtreeCid` e `BlobDigest` verificados cada um no seu protocolo, BLAKE3
esperado vindo do chamador). Os 108 ficheiros da publicação E02 reconstroem os
bytes do commit Git; o mirror público `htree-mirror` obteve os 435 blocos de
`upload.iris.to` sem chave do publicador. Total: 25 testes de integração e um
doctest. Continua sem DHT, sem resolução da root mutável e sem prova de
disponibilidade. Detalhes em `integration/arkhe-p2p/README.md`.
