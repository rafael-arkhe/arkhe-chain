# Broker de proveniência: perfil e fixtures materiais

Status: candidato, 2026-10-29. Esta entrega materializa um recorte offline da
[especificação v3.1](../../../docs/architecture/provenance-broker-v3.1.md).
A v3 foi substituída conceitualmente; anexos históricos não foram movidos.

## Conteúdo

- [Perfil serializado](../../../schemas/provenance-broker/profile-v1.json):
  limites, criptografia, canonicalização, temporalidade e códigos.
- [JSON Schema Draft 2020-12](../../../schemas/provenance-broker/fixture-v1.schema.json):
  envelope fechado de fixture com entrada, sessão, política, observações e saída.
- `fixtures/*.json`: 28 instâncias autocontidas; nenhum merge com uma base externa
  é necessário para executá-las. Cada uma contém saída esperada completa.
- `manifest.json`: SHA-256 dos arquivos materiais e dos schemas; inventário de
  integridade local, sem assinatura ou autenticidade externa implícita.
- [Validador](../../../scripts/validate_provenance_broker.py): auditoria somente
  leitura; não é implementação da função de decisão do broker.
- [Gerador](../../../scripts/materialize_provenance_broker.py): ferramenta explícita
  de autoria; não faz parte da verificação e não deve regenerar saídas no CI.
- Motores de decisão: [Python](../../../scripts/provenance_broker_decision.py) e
  [Node](../../../scripts/provenance_broker_decision.mjs), sem código de regras
  compartilhado e sem acesso aos oráculos.
- [Host local](../../../scripts/provenance_broker_host.py): fontes e identidade de
  teste injetadas fora da entrada do chamador, verificações e barreira de entrega.
- [Relatório executado](conformance-report.json): comparação, testes locais e hashes
  das fontes; não é revisão independente.

## Executar a auditoria

Dependências Python: `jsonschema`, `blake3`, `cryptography`.

```powershell
python scripts/validate_provenance_broker.py
python -m unittest discover -s tests/provenance-broker/v3.1 -p test_material_audit.py -v
python scripts/compare_provenance_broker.py --local-tests --report tests/provenance-broker/v3.1/conformance-report.json
```

Não é necessário acesso à rede, ao banco, a um LLM ou a um serviço externo.
A auditoria valida schemas, manifest, limites exercitados, assinaturas Ed25519,
preimages e digests, inclusão MMR retida, intervalos UTF-8, bindings da avaliação,
snapshots e segurança dos payloads esperados. Falhas materiais intencionais são
explicitadas em `expected_output.material_errors`, sem alterar os bytes para fazê-las
passar. O gerador não é importado pelo validador.

Os campos `expected_output.decision` e `expected_output.delivery` são oráculos de
autoria explícita; o comparador executa os dois motores e os confronta com esses
oráculos sem regenerá-los. A auditoria material isolada não demonstra que uma
integração implementa a regra correspondente. O artefato P-03 usa uma regra de
identidade sobre uma premissa retida: verifica binding e aplicação mecânica mínima,
sem demonstrar extração semântica da premissa a partir de linguagem natural.

Verificação local executada em 2026-10-29: os 28 fixtures passaram na auditoria
material. Seis testes de mutação do auditor confirmam rejeição de validade
estendida, bytes liberados alterados, trecho substituído em AdmitChunksOnly,
política sem atualização de vínculo, chave não fixada e payload em decisão negativa.
Esses seis testes exercitam o auditor. Há também 11 testes de integração local
do host de laboratório com a política: fronteira do pedido, fontes assinadas,
revogação, adulteração, payload parcial e barreira de entrega. Não são testes
contra serviços reais. Os dois motores também concordam nos 28 fixtures e em
30 casos construídos de política/fronteira, incluindo u64 acima de 2^53 e os
limites semiabertos de validade. O relatório retém a execução e os hashes.

## Escolhas concretas do piloto

### Serialização e criptografia

JSON UTF-8; bytes em hex minúsculo; inteiros u64 exatos, sem floats; propriedades
desconhecidas e chaves duplicadas rejeitadas. Implementações JavaScript precisam
preservar inteiros além de 2^53 antes de serializar; não arredondar para Number.
Objetos são canonicalizados por chaves ordenadas, sem espaços; strings mantêm
Unicode, com escapes JSON mínimos e sem normalização. Não há escapes de `/`.
Chaves do schema são ASCII; limites e campos são fechados pelo schema e perfil.

Digests SHA-256 novos têm preimage `ASCII(domínio) || 00 || payload`. Bytes de
fonte/representação/trecho são payload bruto; Claim, suporte, política, âncoras,
observações e derivação usam JSON canônico. Cada domínio está no perfil. Hashes
de registro usam BLAKE3 com os domínios próprios documentados no perfil.

Provas de chunks têm duas folhas sob o perfil nativo congelado `arkhe-mmr@1`:
leaf=BLAKE3(00||record_hash), node=BLAKE3(01||left||right). A prova retém posição,
irmão e direção. A observação de estado tem registro próprio, prova de uma folha
e raiz fixada no fixture. Os pins são dados confiáveis do host de teste, fora de
CandidateInput; não devem ser obtidos do candidato em produção. O verificador
material cobre essas formas concretas, não um verificador MMR genérico.

As observações de autorização/estado e avaliações são assinadas por autoridade
sintética com chave pública fixada no perfil. A seed privada de teste é pública
e determinística; **não usar em produção**. Assinaturas testam autenticidade
relativa ao pin de laboratório; não demonstram verdade, autoridade externa ou
admissão real no WormGraph. Dados de estado histórico são declarações retidas da
autoridade de teste com intervalo e inclusão; completude de histórico de um banco
vivo permanece teste de integração separado.

### Consistência e tempo

Modo escolhido: `BestEffort`, explicitamente aceito pela política e somente para a
combinação de revisões retida. O perfil `frozen-observations-v1` não afirma
snapshot global atômico. Lista de perfis `Guaranteed` aceita: vazia. Habilitar tal
modo exigirá outro perfil revisado, sem inferir garantia do nome de um protocolo.

Garantia temporal escolhida: `ValidatedAt`, intervalo máximo 250 ms. Cada fixture
fixa relógio UTC, observações, suas expirações e tentativa de entrega. A validade é
limitada pelo menor prazo absoluto e pelo TTL máximo de decisão de 1000 ms.
Não há promessa de autorização atomicamente vinculada à liberação.
`max_clock_skew_ms=0` é hipótese do relógio congelado do piloto, não garantia de
relógios distribuídos. Outros perfis precisam definir sua tolerância e semântica.

`authorization_source_available` modela somente a fonte de autorização na entrega;
`other_sources_available` modela estado, política e âncoras. Consulta de autorização
pode ser dispensada por concessão válida de `access_check`, com sujeito, recursos
e finalidade compatíveis. Todas as demais verificações continuam obrigatórias.
O contrato sintético `fixture-lease-v1` garante a concessão até expirar; é uma
hipótese do laboratório, não propriedade atribuída a serviço existente.

As saídas de entrega respeitam a ordem: decisão negativa → bloqueio; concessão
adulterada → bloqueio; snapshot expirado → reavaliação; demais fontes indisponíveis
→ bloqueio; revisão divergente → reavaliação; intervalo de validação expirado →
reavaliação; consulta de autorização necessária e indisponível → bloqueio; demais
casos → liberação. Concessão expirada não dispensa consulta. Uma concessão usada
deve estar válida também no instante da tentativa de entrega.

### Limites e canonicalização

32 trechos de até 32768 bytes; payload total até 65536 bytes; 32 premissas; 64
passos de prova; um milhão de folhas; fonte e representação até 1 MiB; fixture
até 2 MiB. Este conjunto cobre valores pequenos; testes de fronteira materiais
ainda não cobrem todos os limites do perfil.

Itens de transformação, códigos, flags, referências e trechos seguem as ordens
declaradas no perfil; duplicatas são rejeitadas. Rejeição explícita de transformação
precede desconhecimento na agregação; as regras de integridade continuam tendo
precedência sobre transformação na política de decisão.
O JSON Schema verifica forma; a auditoria complementa com canonicalização e
invariantes entre campos. Passar apenas o schema não demonstra essas invariantes.

## Cobertura e revisão

A [extensão versionada v2](extensions-v2/README.md) acrescenta 20 fixtures materiais
para as lacunas prioritárias e dez testes locais. Os 28 materiais v1 não foram
reescritos. Os resultados da extensão ficam em relatório separado.

O [mapa explícito de cobertura](coverage-map.md) distingue contrato ativo, IDs
históricos, gates de política e cenários materiais. Ele registra as lacunas de
N-07 (sem negação literal), P-05 (apenas um trecho seguro), agregação e rollback;
os resultados de conformidade não devem ser interpretados como cobertura completa.

P-02/P-03 incluem todos os pré-requisitos de Assertion, payload com bytes e
avaliação retida. P-04 cobre histórico. P-05 libera apenas `chunk-1`, omitindo Claim
e avaliação da relação, enquanto `chunk-2` está substituído. P-06 permite análise
de contradição. Negativos cobrem adulteração, prova inválida, transformação,
histórico negado/desconhecido e suporte contraditório. Casos D-* cobrem entrega
indisponível, expiração, divergência e concessões válida/expirada/adulterada.

Todos têm `independent_review: {"status":"pending"}`. Saídas foram escritas durante
a autoria e não têm revisão independente. Os motores Python e Node têm algoritmos
separados, mas o mesmo autor. Gerador e auditoria não contam como motores. Fixtures
são públicos; nenhum é apresentado como caso adversarial reservado.

Falha material na admissão impede autorização de liberação. Falha na entrega
bloqueia a entrega sem alterar retroativamente a admissão. Por isso o fixture
D-GRANT-INVALID tem decision=Admit e delivery=Blocked: não há contradição nem
regra global que transforme qualquer material_errors em decisão negativa.

O host local verifica somente o perfil sintético e formas MMR materializadas.
Seu contexto é uma fonte confiável injetada pelos testes, não uma fonte real.
Avaliações ligadas a outra Claim são omitidas do payload de Analysis; Assertion
exige avaliação aceita da Claim exata.

Pendentes: revisão independente e autoria independente adicional se exigida,
fixtures para o restante da matriz e limites, integração real de autenticação/estado/entrega,
conexão GLiNER/Cognee e medição de ganho de recuperação.

Há agora um [experimento de extração separado](../extraction-harness/README.md):
GLiNER foi executado sobre fontes do corpus, mas não integrado ao Cognee nem
promovido a fonte autorizada de SemanticOutcome. A integração autenticada do
avaliador experimental continua bloqueada pela política atual.
