# Revisão dos gates propostos — 2026-10-23

O princípio de integrar evidência externa e explicitar cada limite foi mantido.
Não se aceitam, porém, as classificações `LEMMA` do texto recebido como
evidência executada neste workspace.

## O que avançou

Implementado [adaptador offline de log + witness quorum](anchor/README.md),
com SDK oficial Sigstore, cosignatures Ed25519 no formato C2SP restrito e
composição real com WASM KYA. Treze testes locais passaram sem sockets.
O freeze E02 conserva os 101 ficheiros. Nenhuma publicação externa ocorreu.
Interoperabilidade pública e operação independente dos witnesses estão pendentes.

## Correções às premissas

1. Uma root fornecida pelo chamador não é automaticamente insegura: o problema
   é a sua origem e autenticação. O novo adaptador deriva a root do compromisso
   autenticado, mas ainda depende de pins externos de log, publisher e witnesses.
   Não é possível remover essa política de confiança com o próprio bundle.
2. Inclusão num checkpoint assinado não prova ausência global de split views.
   Witnesses afirmam consistência com o histórico que observaram; independência,
   estado persistente, provas de consistência e distribuição de checkpoints
   continuam necessários ao modelo operacional.
3. Certificado válido é material público, não prova de posse da chave privada.
   Uma futura integração deve verificar assinatura vinculada ao mandato e ao
   contexto, cadeia de confiança, uso de chave, validade e estado aplicáveis.
   Acrescentar `authorized_by` ou um hash de CPF/CNPJ não realiza essa verificação.
   Identificadores de domínio pequeno podem ser enumerados mesmo após hashing;
   não serão publicados como suposta anonimização.
4. Consulta cadastral, estado de certificado e revogação da credencial são eixos
   distintos. Indisponibilidade da fonte não equivale a revogação nem a estado
   ativo. Uma lista de status precisa ter autenticidade, issuer autorizado,
   validade/freshness, vínculo à credencial e limites de download/descompressão
   verificados antes de um bit ser interpretado. A spec reduz correlação, mas
   não permite afirmar privacidade absoluta de toda consulta.
5. Bitstring Status List v1.0 é Recommendation de 2025-05-15; v1.1 está em
   Working Draft de 2026-10-21. Escolher a versão explicitamente em vez de
   tratar a v1.1 como recomendação final. `statusPurpose` não implementa, por si,
   um protocolo de rotação de chaves.
6. Declarar `credentialSubject`, `credentialStatus` e um `proofPurpose` próprio
   não demonstra interoperabilidade W3C. É preciso escolher mecanismo de
   segurança/suite, método DID, resolução e políticas e testar implementações
   independentes. O mandato de teste atual continua a não ser VC.
7. Expiração não substitui desafio imprevisível e consumo único contra replay.
   Uma quote TEE também não liga automaticamente os pesos ao output: é preciso
   verificar medições, endorsements, código que mede/carrega o GGUF, contexto
   e momento da observação. Nenhum campo `Observed` sozinho sobe o outcome.
8. O pipeline GGUF encontrado no código tem subset parser, dupla hash,
   assinatura de builder com chave fixada e log RFC 6962 local. Isso não é
   evidência de Sigstore keyless, witness quorum ou cobertura das CVEs citadas.
   O paper e os identificadores de CVE do anexo não foram verificados nesta
   etapa. Download de modelo de vários GB, execução e integração TEE não ocorreram.

## Gates que continuam abertos

| Gate | Evidência ainda necessária |
|---|---|
| Ancoragem pública | Bundle real num perfil suportado, trust material autenticado e witnesses de operadores independentes |
| GGUF real | Artefacto obtido de fonte identificada, licença/proveniência, digests reproduzidos e parser efetivamente testado |
| Runtime | Evidência de plataforma real, política de medições, desafio fresco e vínculo modelo/processo verificável |
| Revogação | Credencial/suite definidas, lista assinada, tempo/estado e falhas de obtenção testadas |
| Principal | Integração identificada e testada com trust anchors obtidas por canal autenticado, sem dados pessoais em log público |

Fontes primárias consultadas:

- [W3C — série Bitstring Status List](https://www.w3.org/TR/vc-status-list/all/).
- [W3C — Bitstring Status List v1.0](https://www.w3.org/TR/2025/REC-vc-bitstring-status-list-20250515/).
- [Sigstore — Rekor](https://docs.sigstore.dev/logging/overview/).
- [C2SP — cosignatures](https://c2sp.org/tlog-cosignature@v1.1.0).
- [C2SP — witness protocol](https://c2sp.org/tlog-witness@v1.1.0).

Datas/versões externas descrevem as fontes consultadas, não certificação do
Arkhe. A prioridade é uma decisão de engenharia: não há teorema de que a ordem
proposta de pilares seja ótima ou de que todos precisem preceder um piloto.
