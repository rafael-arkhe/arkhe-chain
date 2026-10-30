# Assinaturas Gravit: contrato executável com chaves públicas de teste

O recorte agora verifica em Rust as duas camadas de assinatura do Gravit v0.6.0: assinaturas Ed25519 de raízes sobre o registro de verificadores e assinaturas dos verificadores sobre cada registro de evidência. Há um controle positivo novo com hash de conteúdo correto **e assinaturas válidas**, produzido pelo Python upstream fixado em `7887252fc84def69a794d2e32ce65721eb9a25d9`.

Tudo permanece em testes: `kernel/arkhe-kernel/tests/support/gravit_signatures.rs`, carregado pelo teste de tradução existente. `base64` e `sha2` foram adicionados às dev-dependencies; o kernel de produção não ganhou adaptador, configuração de raízes ou nova permissão.

## O que é assinado

| Objeto | Preimage e verificação neste recorte |
|---|---|
| Registro de verificadores | `gravit-registry-v1\n` seguido dos bytes exatos de registry.json; assinaturas destacadas verificadas contra raízes fixadas |
| Registro de evidência | Linhas UTF-8: domínio `gravit-evidence-v1`, artifact_id, record_id, theta com seis casas, result, timestamp, provenance e integrity_hash; sem newline final |
| DecisionRecord | Não há assinatura nem prova de inclusão dele no registro de verificadores nesse protocolo |

Portanto, não se trata de exatamente duas assinaturas: são **duas classes de assinatura**, com múltiplos signatários de raiz e múltiplas evidências. A fixture exige três raízes distintas entre cinco. Repetir a assinatura de uma raiz não forma quórum. A raiz é fixada por SHA256 dos bytes em configuração de teste, não fornecida pelo registro que se quer validar.

O parser de teste verifica base64 canônico e comprimentos, IDs de chave derivados por SHA256, duplicatas, versões inteiras, operador não vazio e tipo do indicador de revogação. Uma evidência de chave desconhecida ou revogada falha. O perfil de teste exige todas as evidências válidas; isso é mais conservador que a triagem upstream, que pode excluir algumas e avaliar as restantes.

`verifier_id` não faz parte do preimage da evidência. O teste demonstra que mudar esse rótulo não invalida a assinatura; a identidade usada para autenticar vem da chave registrada. Trocar a chave por outra chave registrada sem refazer a assinatura falha. Metadados de operador não provam independência institucional.

## Bytes, theta e controles positivos

O gerador `scripts/gravit_signature_fixtures.py` usa o verificador Python local fixado, as raízes públicas upstream e sementes públicas de teste. Produz registros para chaves válidas, uma chave revogada e uma chave desconhecida, além dos preimages completos de assinatura. Rust reconstrói os preimages e compara byte a byte antes de verificar Ed25519, usando `verify_strict`.

O formatador theta deste recorte aceita apenas o subconjunto decimal não negativo entre 0 e 1 com até seis casas, sem expoentes na representação numérica processada. Não usa arredondamento de float para construir o preimage. Não é um port completo do formatador Python. Os casos documentados de divergência fora desse subconjunto e casos extremos de Ed25519 entre bibliotecas não foram certificados.

O novo controle positivo usa o SHA3-256 real do artefato local e assinaturas refeitas pelo gerador. Diferentemente do controle sintético anterior que só modificava o hash, esse novo controle passa efetivamente pelas duas camadas criptográficas. As chaves continuam públicas e exclusivas de teste: isso não estabelece confiança operacional.

## Limite decisivo: a resposta continua sem assinatura

As assinaturas autenticam o registro de verificadores e as declarações de evidência, **não o resultado da avaliação**. Os campos registry_digest e trust_root_digest do DecisionRecord também não tornam a resposta autenticada por si.

Um teste altera `reason` e recalcula `decision_id` usando o próprio código Python upstream. As assinaturas das evidências continuam válidas: não incluem essa conclusão. Não existe inclusão assinada do DecisionRecord para o Arkhe conferir no formato inspecionado.

Para evitar aceitar essa conclusão adulterada, o caminho de admissão novo só aceita os bytes exatos do par de requisição/resposta de referência gerado pelo replay local fixado. Uma resposta diferente, mesmo mantendo SUCCESS / Verified Fact e um decision_id recalculado, recebe `not the trusted replay fixture pair`.

Essa comparação é **um oráculo de fixture**, não uma reexecução genérica, um recibo de execução ou prova criptográfica da decisão. A integração futura precisará reexecutar o verificador de forma confiável para cada requisição, ou definir uma atestação separada que comprometa inputs, output, versão, bindings e contexto de confiança. Não foi inventada uma assinatura upstream inexistente.

## Oito testes acrescentados

| Caso | Resultado |
|---|---|
| Conteúdo correto + assinaturas de evidência + registro autenticado | Gate real permite apenas com política de teste permissiva; negação de governança continua rejeitando |
| Preimages Python e ambas as camadas Ed25519 em Rust | Bytes coincidem; fixture válida passa; chaves revogada e desconhecida falham |
| Registro alterado, menos de três raízes, raiz repetida, assinatura falsa ou raiz substituída | Falha de autenticação/quórum/pin |
| Alteração de cada campo assinado, artifact_id ou assinatura | Falha de assinatura de evidência |
| Newline em campo assinado, theta fora do subconjunto ou base64 inválido | Recusa explícita |
| Requisição original assinada com hash inválido | Assinaturas passam; admissão por digest falha; gate sem evidência admitida rejeita |
| DecisionRecord adulterado com decision_id recalculado | Evidências continuam autenticadas; comparação com o par de replay fixado recusa a resposta |
| verifier_id alterado / chave registrada substituída | Rótulo não autentica identidade; troca da chave sem assinatura correspondente falha |

O teste anterior `duplicate_keys_cannot_create_ambiguous_cbor` já cobre explicitamente colisão entre grupos: `fields = {"a": null}` e `bytes = [("a", b"x")]` retornam `duplicate canonical map key`. Não foi acrescentado outro teste equivalente.

## Execução, resultados e pendências

Comando: `cargo test -p arkhe-core -p arkhe-kernel`. **47 testes aprovados, 0 falhas**: 7 no core, 40 no kernel; o teste de tradução contém agora 16 casos. Configuração padrão, sem sqlite-broker.

Regeração das fixtures, a partir de D:\arkhe e com o clone fixado disponível:

```powershell
python scripts/gravit_signature_fixtures.py --verifier ops/local/gravit-review-20261024/verifier
```

Fontes: `gravit_verifier/registry.py` e `kernel.py` no clone fixado. Fixtures e manifesto: `kernel/arkhe-kernel/tests/fixtures/gravit/signatures/`. Logs e hashes locais: `docs/evidence/2026-10-24-gravit-signatures/`. O gerador não consulta rede nem usa chaves operacionais. A geração desta rodada usou Python 3.14 e cryptography 50.0.1, registrados nas evidências.

O domínio/projeção binária v2 não mudou. A raiz e o registro são verificados nesta execução de teste e seus SHA256 são registrados, mas **a projeção v2 ainda não inclui esses digests como campos próprios**. O vínculo persistente do WER com esse contexto de confiança continua pendente; esta rodada não afirma tê-lo resolvido.

Continuam pendentes: política operacional de raízes e quórum compatível com PolicyResolver, distribuição/rotação/revogação, digests de raiz/registro/bindings no compromisso, avaliação confiável de respostas arbitrárias, relógio e freshness, regras gerais de exclusões/contradições, persistência e reavaliação. O resultado desta rodada é validação criptográfica das fixtures e discriminação das fronteiras restantes, não um adaptador pronto para produção.
