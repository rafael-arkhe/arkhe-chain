# Stage 10 — verificação GGUF offline (PoC)

A PoC `arkhe-gguf-lab@1` verifica bytes de um GGUF sintético por quatro gates.
O núcleo é puro: recebe artefato, bundle e política de confiança; não lê arquivos,
não acessa rede, não consulta relógio e não carrega o modelo para inferência.
O CLI fornece os bytes e retorna erro com o gate responsável se houver rejeição.

O [adapter Sigstore/Fulcio real](../integrations/cosign/README.md) acrescenta o
perfil `arkhe-gguf-sigstore@1`: mantém a inspeção Rust restrita e verifica bundles
Sigstore padrão com cadeia Fulcio, identidade/emissor exatos, SCT, tempo
autenticado e prova Rekor com checkpoint assinado. O comando de laboratório
descrito abaixo continua disponível para reproduzir as fixtures sintéticas.

## Executar

Na raiz do repositório, em PowerShell:

```powershell
cargo test -p arkhe-verify-core --locked
cargo run -p arkhe-verify-core --locked --example stage10 -- output/stage10-gguf
cargo run -p arkhe-verify-cli --locked -- verify-gguf-artifact output/stage10-gguf/synthetic.gguf output/stage10-gguf/bundle.json output/stage10-gguf/trust.lab.json
```

O gerador exige um diretório novo para evitar sobrescrever resultados. Para repetir,
escolha outro diretório. Ele produz `synthetic.gguf`, `bundle.json`,
`trust.lab.json` e `report.json`. O CLI verifica novamente os arquivos exportados
e imprime um relatório JSON somente após aprovação dos quatro gates. Falhas
retornam código de saída diferente de zero.

O comando anterior `verify-gguf <json_file>` continua sendo exclusivamente um
canonicalizador de metadados. A verificação binária está no comando novo
`verify-gguf-artifact`.

## Gates

| Gate | Verificação | Fronteira |
|---|---|---|
| 1 | Magic, versão, parsing limitado, tipos, nomes, duplicatas, padding, dimensões, alinhamento, limites e sobreposição dos tensores | Subconjunto GGUF v3 little-endian; até 16 MiB, 256 tensores F32, 128 metadados, strings de até 4096 bytes |
| 2 | SHA-256 e BLAKE3 de todo o arquivo; SHA-256 dos metadados em CBOR determinístico | Os três digests devem coincidir com a declaração assinada |
| 3 | Ed25519 estrito sobre declaração com domínio próprio, perfil, identidade do builder e digests | Chave e identidade fixadas pela política externa; não é Sigstore/Fulcio |
| 4 | Assinatura do checkpoint local, identidade/chave do log, limites externos de tempo/tamanho e prova Merkle SHA-256 RFC 6962 | Folha inclui declaração e assinatura do builder; árvore de laboratório com duas folhas |

Somente metadados string e `general.alignment` uint32 são aceitos neste perfil.
`general.architecture` é obrigatório. Nomes de metadados usam ASCII alfanumérico,
ponto e underscore; strings vazias, controles e UTF-8 inválido são rejeitados.
Arrays, floats em metadados, quantizações, outros tipos de tensor e versões são
rejeitados explicitamente. Nenhum template ou instrução de metadado é executado.
Os limites são deliberadamente pequenos para a PoC e excluem modelos comerciais
grandes e grande parte dos GGUF reais.

## Confiança e limites

As chaves privadas `[10; 32]` e `[11; 32]` são fixtures públicas, distintas para
builder e log. O arquivo `trust.lab.json` acompanha o exemplo por conveniência,
mas em uma implantação real a política deve chegar por canal autenticado
independente. Trocar bundle e política juntos por dados de um atacante elimina
as garantias. Os timestamps 900–1100 são números de laboratório, não datas atuais;
o auditor fornece limites de frescor externamente.

A assinatura de proveniência prova atribuição à chave confiável e vínculo com
os bytes. Não demonstra isolamento do builder, execução de testes, qualidade de
entropia, segurança dos pesos ou correspondência com código-fonte. Não há
certificado Fulcio, OIDC, validação Sigstore/Rekor real, atestação SLSA L3, SBOM
ou admission Kubernetes nesta PoC. O checkpoint usa um envelope de assinatura
próprio e árvore RFC 6962; não é um Signed Tree Head do serviço Rekor. A prova de
inclusão não prova consistência entre checkpoints nem impede equivocação do log.

Esse limite descreve o perfil `arkhe-gguf-lab@1`. A validação Sigstore/Fulcio real
é implementada separadamente no adapter acima; a evidência positiva pública e os
limites do teste GGUF estão documentados nele.

Não há execução de modelos ou escrita automática no WormGraph: uma transição
protegida continua dependente do caminho de autorização/admissão do kernel.

## Validação

Os testes cobrem aprovação dos quatro gates, todos os prefixos truncados do
artefato, versão/counts inválidos, metadados duplicados/controles/tipos não
suportados, dimensões inválidas/overflow, tipo/alinhamento de tensor, trailing
bytes, adulteração de pesos/digests, builder incorreto, chave incorreta, assinatura
inválida, log incorreto, checkpoint antigo, árvore abaixo do mínimo e provas
incompletas, excessivas ou adulteradas. Árvores com uma e três folhas exercitam
também o caso desbalanceado do algoritmo de inclusão.

## Referências

- [GGUF — especificação oficial ggml](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md?plain=1)
- [RFC 6962 — árvores Merkle e provas de inclusão](https://www.rfc-editor.org/rfc/rfc6962.html#section-2.1)
