# Caminho A: reexecução Gravit por requisição

Implementado em `scripts/gravit_replay.py`. O worker executa novamente o verificador Python v0.6.0 fixado sobre a requisição fornecida e compara os bytes da decisão recalculada com os bytes da decisão recebida. Não consulta uma tabela de pares conhecidos para decidir o resultado. Uma requisição nova, assinada com chaves públicas de teste, passou em dois processos separados com a mesma saída.

É uma ferramenta executável no workspace Arkhe, ainda sem adaptador de produção nem ligação automática do relatório ao ContainmentGate. Os testes Rust anteriores de admissão continuam sendo outro recorte; o helper de fixtures desse teste não foi transformado em uma fronteira operacional confiável nesta rodada.

## Contexto confiável e execução

- Verificador: commit `7887252fc84def69a794d2e32ce65721eb9a25d9`.
- Imagem base local: `0f65c70efd46927afd01a86aa27d7b49e5e84e1189cce56587e2874c96521979`.
- Imagem final de replay: `5d42e9d46af3d58b4dd370b004e9ef55de45f4ee9fd83dddc2edc9066fb4c897`.
- Manifesto confiável: SHA256 `119d0f14d418a14f5febb35bbbd148ae35c6ab95948cb648dd6d2f1441686a09`.
- Os 18 arquivos de runtime — código Python, bindings, raiz, registro e assinaturas destacadas — são conferidos contra hashes aprovados antes da importação do verificador.

`prepare_gravit_replay.py` compara esses arquivos com `sources.json` da reprodução anterior e gera um contexto de build novo. O build usa a imagem base pelo ID e foi executado sem rede. Não instala novas dependências. Código e contexto ficam na imagem, não no volume de inputs.

Os testes e as execuções da CLI usaram Podman rootless, rede desabilitada, filesystem raiz somente leitura, UID 10001, capabilities removidas e no-new-privileges. A CLI usa Python `-I`, carrega explicitamente o código aprovado, monta somente inputs públicos de teste em modo leitura e uma pasta dedicada de saída. O manifesto não pode ser substituído por um argumento da requisição. A requisição também não pode desabilitar o registro autenticado.

Esse isolamento reduz a superfície de execução, mas não é TEE nem atestação remota. A confiança inclui o host, Podman, a imagem selecionada e as bibliotecas do runtime. O relatório registra o ID da base; o ID final efetivamente executado e os controles são registrados separadamente pelo host em `image-inspect.json` e `container-inspect.json`. O worker não prova sua própria identidade de imagem.

## Fluxo e comparação

1. Ler a requisição e a decisão fornecida, limitadas a 1 MiB cada; recusar JSON com chaves duplicadas ou NaN/Infinity.
2. Conferir o contexto aprovado, autenticar o registro com a raiz fixada e carregar bindings em ordem determinística.
3. Construir uma nova VerificationRequest, com no máximo 256 registros, e executar `VerifierKernel.verify`. O próprio upstream verifica/triagem as assinaturas das evidências e pode excluir registros inválidos.
4. Serializar o DecisionRecord recalculado no perfil `gravit-python-sorted-compact-utf8-v1`: JSON UTF-8, chaves ordenadas, separadores compactos, ensure_ascii=false, números não finitos proibidos, **sem newline final**.
5. Comparar os bytes exatos com o arquivo de decisão fornecido. Não normalizar a decisão recebida antes da comparação.

JSON semanticamente equivalente com indentação ou newline adicional é MISMATCH neste perfil. Os bytes da requisição são preservados e recebem SHA256; o parser upstream naturalmente interpreta seus valores, sem alterar o compromisso sobre os bytes capturados.

Após iniciar a execução, MATCH retorna código 0, MISMATCH retorna 1, ERROR retorna 2. A pasta de saída precisa ser nova: sua reutilização é recusada antes de qualquer nova avaliação. O consumidor deve exigir sucesso do processo e conferir o hash da requisição; um arquivo de relatório isolado não constitui prova de execução.

O relatório inclui os hashes da requisição, da decisão recebida e da recalculada, do manifesto, dos bindings, do registro e da raiz, além da versão fixada e do perfil de comparação. São hashes SHA256 de rastreabilidade, **não uma authorization_ref Arkhe**. A saída inclui explicitamente `authorization: not_evaluated`, `execution_attestation: none` e `fallback_used: false`.

## Evidência desta rodada

**9 testes de integração aprovados**, executados dentro da imagem final sem rede:

| Teste | Observado |
|---|---|
| Par assinado conhecido | Decisão recalculada byte a byte, MATCH |
| Decisão adulterada com decision_id recalculado | MISMATCH |
| Campo assinado alterado sem nova assinatura | Decisão recalculada difere, MISMATCH |
| Requisição nova com novo sujeito, hashes e timestamps assinados | MATCH em dois processos; mesmos bytes e hashes |
| Decisão degradada reproduzida | MATCH, mantendo autorização não avaliada |
| Decisão recebida com indentação diferente | MISMATCH pelo perfil de bytes explícito |
| JSON duplicado, NaN, schema inválido ou input excessivo | ERROR; sem fallback nem decisão recalculada residual |
| Código/contexto alterado ou removido em cópia de teste | Recusa antes da avaliação |
| Corpus upstream com registro | 44/44 decisões recalculadas iguais à referência |

Os três vetores restantes do corpus original de 47 operam sem registro e estão fora deste perfil de replay: a requisição não controla essa escolha de confiança. Isso não é uma regressão ou uma nova alegação de 47/47 neste perfil.

A CLI foi ainda executada pelo entrypoint normal da imagem em dois contêineres separados: o novo sujeito teve exit code 0/MATCH; a resposta adulterada teve exit code 1/MISMATCH. As amostras completas, decisões recalculadas, relatórios e logs foram preservados em `docs/evidence/2026-10-24-gravit-replay/`. O corpus e os pares esperados dos testes continuam sendo referências da implementação Python, não um oráculo independente de verdade.

## Uso reproduzível

Com a imagem local já preservada, a partir de PowerShell em D:\arkhe, usando o novo sujeito testado e uma pasta de saída ainda inexistente:

```powershell
podman machine start arkhe-runtime
$replayInput = 'D:/arkhe/docs/evidence/2026-10-24-gravit-replay/final/samples/test_new_signed_request_and_separate_process_replays/first'
$replayOutput = 'D:/arkhe/ops/local/gravit-replay-output-new'
New-Item -ItemType Directory -Path $replayOutput -ErrorAction Stop
podman --connection arkhe-runtime run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 10001:10001 --ulimit nofile=1024:1024 --tmpfs /work:rw,size=512m,mode=1777 --tmpfs /tmp:rw,size=256m,mode=1777 -v "${replayInput}:/input:ro" -v "${replayOutput}:/out:rw" 5d42e9d46af3d58b4dd370b004e9ef55de45f4ee9fd83dddc2edc9066fb4c897 --request /input/request.json --decision /input/provided-decision.json --output /out/result
```

Para reconstruir a imagem, usar uma nova pasta de contexto e a base local aprovada:

```powershell
python scripts/prepare_gravit_replay.py --verifier ops/local/gravit-review-20261024/verifier --source-manifest docs/evidence/2026-10-24-gravit-review/sources.json --output ops/local/gravit-replay-context-new
podman --connection arkhe-runtime build --network none --tag localhost/arkhe-gravit-replay:rebuilt ops/local/gravit-replay-context-new
```

O novo ID deve ser registrado e revisado. A base por ID é uma dependência local preservada, não um endereço público de distribuição. Reproduzir em outra máquina exige transferir/verificar essa imagem ou reconstruir a base com o ambiente da reprodução anterior; não basta presumir que uma tag mutável oferece os mesmos bytes.

## Limites de confiança e Caminho B

MATCH estabelece igualdade com uma execução nova **sob o contexto e runtime fixados**. Não estabelece verdade do conteúdo, integridade do artefato externo (o runner não recebe o artefato), independência dos operadores, relógio confiável, ausência de revogação posterior ou permissão de uma operação Arkhe. Um hash inventado ainda pode ser reproduzido pelo Gravit; a recomputação de conteúdo da admissão continua necessária.

`evaluation_time` continua vindo do contexto da requisição, sem atestação de relógio. A raiz usada é pública e de teste, não uma raiz operacional. Assinaturas inválidas podem ser excluídas pelo upstream: reproduzir a decisão resultante não afirma que todos os registros foram admitidos. O determinismo foi observado nos casos executados; não foi demonstrado para toda entrada, hardware ou versão de Python.

Não encontrei RuntimeBootstrap nem os textos de replay mencionados no anexo nos diretórios locais kernel, orchestration, evidence e governance examinados. Portanto, a ferramenta não depende dessa alegada infraestrutura. O WorkerExecutionRecord local possui compromisso por digest, mas não campos próprios de assinatura: emitir um WER não cria sozinho uma atestação assinada de execução fiel.

O [Agent Audit Trail -08](https://datatracker.ietf.org/doc/html/draft-sharif-agent-audit-trail-08) distingue rastreabilidade do registro de reprodução da decisão e exige condições adicionais para a segunda. É um Internet-Draft, não uma norma IETF aprovada; este trabalho não declara conformidade com suas condições de inferência de modelos nem com atestação de ambiente.

Caminho B fica **documentado e desabilitado**: uma eventual atestação de observação deve ser explicitamente distinta de uma decisão reexecutada, exigir chave e política próprias e nunca converter MISMATCH/ERROR em autorização. Nenhuma falha desta ferramenta aciona B automaticamente. Ainda faltam uma fronteira operacional que confie no reexecutor, vinculação desse contexto ao WER/journal, raízes e relógio operacionais e política final de admissão/ContainmentGate.
