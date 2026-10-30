# Publicação de documentos sob um stencil

Demonstração local executável, independente do runtime Arkhe. Requer Node 24;
não instala dependências nem publica documentos em serviços externos.

```powershell
node --test examples/sde-publication/publication.test.mjs examples/sde-publication/ai-aggregate.test.mjs examples/sde-publication/calibrate.test.mjs
node examples/sde-publication/demo.mjs
```

O segundo comando substitui `evidence.jsonl` nesta pasta com quatro operações:
válida, sem permissão, avaliador indisponível e decisão desatualizada.

Para executar testes e demo em contêiner, a partir desta pasta:

```powershell
docker compose up --abort-on-container-exit --exit-code-from publication
```

O serviço termina após os testes e a exportação das quatro evidências no volume
local. Não inicia API nem publica portas. A imagem Node 24 é uma tag atualizável;
esta configuração não promete reprodução bit a bit. Em ambiente Podman com
provider Compose configurado, usar `podman compose` com os mesmos argumentos.

Na versão 1.4.0, `rules` declara os identificadores emitidos pelo motor, incluindo
`action.allowed`. É um catálogo descritivo dos predicados implementados; não uma
linguagem executável. O teste de cobertura exercita cada identificador e compara
o conjunto emitido com o catálogo. O teste de replay usa duas chamadas distintas
a `evaluate()` com pedidos reordenados; não depende de copiar o ticket.

## Os seis itens

O [pipeline de calibração](CALIBRATION.md) mede precisão, cobertura, incerteza e
concordância em splits separados. O conjunto incluído é sintético; não calibra o
domínio real e mantém `calibration.status: PENDING` no spec.

### Extensão #1 — saída estruturada (v1.5.0)

O documento candidato é o artefato de saída, independentemente de ter sido escrito
por pessoa ou gerado por IA. `output_contract.schema` define campos obrigatórios,
tipos, revisão inteira positiva e rejeição de campos extras. O avaliador verifica
o contrato na avaliação e na revalidação; violação resulta em `DENY output.schema`
sem publicar. As regras anteriores de conteúdo aprovado e permissão continuam ativas.

`output-schema.mjs` implementa somente um perfil restrito: objeto plano, `required`,
`properties`, `additionalProperties: false`, tipos `string`/`integer` e `minimum`
inteiro. Na v1.6.0 também aceita `number` finito com `minimum` finito; rejeita NaN,
infinidades e coerção de strings. Inteiros devem ser seguros em JavaScript. Schema ausente ou keywords não
suportadas falham fechado. Não é um validador JSON Schema completo e não verifica
verdade, grounding, injeção ou qualidade semântica. Esta extensão não integra LLM,
painel de juízes, tracing ou assinatura. A demo mantém os quatro cenários; os testes
adicionais exercitam saída inválida, alteração antes de aplicar e schema incompatível.

O objeto validado aqui é o documento candidato (entrada da transição de publicação).
Não há prompt nem resposta de LLM distinta. Em uma integração de IA, o mesmo tipo
de controle deverá validar a resposta gerada, separada do prompt e antes de qualquer efeito.

`aggregation.spec.json` registra o contrato do painel, implementado isoladamente em
`ai-aggregate.mjs`, sem integração com publicação:
fórmula ponderada com complemento `1 - hallucination`, zonas sem sobreposição,
juiz indisponível/inválido escalado sem efeito e calibração `PENDING`. Uma falha
conhecida no juiz de regras tem precedência sobre indisponibilidade de outro juiz.
Os limiares individuais são diagnósticos; somente o juiz de regras é veto rígido.
Essa escolha explícita evita confundir média ponderada com AND de limiares.
Não há golden set medido, evidência de eficácia nem garantia de independência entre
juízes. A assinatura de evidência não comprova a verdade de seu conteúdo.

`aggregate(results, configuration?)` aceita apenas o spec exato suportado; outra
configuração retorna `DENY invalid_configuration` antes de avaliar juízes. O resultado
referencia o spec suportado por id/versão/hash. Pesos e fórmula não são uma DSL
configurável: mudanças exigem revisão da implementação e seus testes. O painel tem
`rule_judge: {passed: boolean}` e `grounding`, `hallucination`, `model_judge` com
`{score: number}`. Apenas `passed: false` é falha conhecida; dados ausentes ou
malformados escalam. O resultado é avaliação consultiva, não autorização de efeitos.
Não implementa tracing, assinatura, juízes reais nem o envelope completo de evidência
de uma execução de IA. `implementation_status` mudou; a versão semântica permanece
0.1.0 e o hash do artefato mudou com esse metadado.

1. `stencil.json`: especificação versionada de campos, papel, transição e evidência.
2. `Publication.evaluate`: avaliador; devolve uma decisão vinculada à proposta e ao estado.
3. `Publication.apply`: única via de publicação; aceita somente decisões emitidas pela instância.
4. `publication.test.mjs`: casos válidos, negativos, indisponibilidade, TOCTOU e replay.
5. `evidence.jsonl`: registros reais da execução local, com regra, decisão e efeito.
6. Procedimento de alteração abaixo.

## Critérios de aceitação

Todos os testes devem passar. A operação válida termina em `published`; as outras
três preservam o documento observado no início da aplicação. Cada registro contém
os campos obrigatórios declarados no stencil, sua versão e hash. Um revisor pode
identificar a regra em `rule`, a decisão em `decision` e o efeito em
`observedEffect`, comparando `before` e `after`. `evaluationDecision` distingue
a avaliação original da decisão final após revalidação.

`evaluatedSnapshot` contém o documento no momento da avaliação; `before` contém
o documento no início da aplicação. No cenário `stale`, as revisões são 1 e 2,
respectivamente, mesmo com conteúdo e `approvedHash` iguais. A decisão de publicar
é invalidada pela mudança de revisão; isso não revoga a aprovação do conteúdo.
`evaluatedAt` e `appliedAt` registram os dois momentos em UTC. Podem coincidir na
resolução de milissegundos; sua diferença não prova nem é necessária para detectar
TOCTOU. O relógio de parede pode sofrer ajustes. A comparação dos estados evidencia
a mudança de revisão, dentro dos limites de confiança deste registro local.

Na versão 1.2.0, `revalidationOutcome` é `SNAPSHOT_MATCH` ou
`SNAPSHOT_MISMATCH`, comparando exclusivamente o documento avaliado com `before`.
`mismatchFields` lista campos alterados em ordem alfabética (ou `$document` quando
o documento passou de ausente para presente ou vice-versa). No demo `stale`, vale
`["revision"]`. Esses diagnósticos são calculados também para decisões originalmente
bloqueadas. Um documento coincidente não autoriza publicação: permissões,
disponibilidade e stencil continuam sendo verificados separadamente.

O replay mantém o registro original integral, inclusive seus timestamps e campos
de revalidação. A identidade da intenção é o pedido, não o snapshot de estado
encontrado numa reavaliação. Colisões lançam `OperationConflictError` com código
`OPERATION_CONFLICT`. Decisões fabricadas ou de outra instância não são aceitas.

Na versão 1.3.0, o pedido normalizado tem `operationId`, `documentId`, `actorId`
e `action` (padrão `publish`). A ordem de suas propriedades não muda a identidade;
campos extras são ignorados. Ações diferentes de `publish` são rejeitadas.
Tickets de outra instância, cópias ou objetos fabricados lançam
`ForeignDecisionError` (`FOREIGN_DECISION`), com proveniência controlada por
referências privadas, sem confiar em um identificador público copiável.
Serializar ou clonar um ticket perde essa proveniência. Para separar processos,
é preciso outro protocolo de confiança (por exemplo, decisões autenticadas com
vínculo ao pedido e ao estado, expiração e proteção contra replay); este exemplo
não implementa esse protocolo. Um token assinado sozinho não resolve TOCTOU.

Se a reavaliação permitir a operação mas o stencil tiver mudado, a regra final
é `stencil.changed`; se a reavaliação já negar ou for indeterminada, sua regra
tem precedência. `stencilId`, `stencilVersion` e `stencilHash` identificam a versão
avaliada; `appliedStencilHash` identifica a encontrada na aplicação. Publicar
altera o estado para `published` e conserva a revisão.

Um registro `BLOCKED` sozinho não demonstra ausência de efeito. Nesta demonstração,
os testes consultam também o estado sob a única autoridade de escrita. Isso sustenta
a afirmação apenas para este armazenamento local e os casos executados.

## TOCTOU e repetição

Na aplicação, o serviço verifica novamente disponibilidade, permissões e condições,
e compara o snapshot completo com o avaliado. Documento, permissões ou stencil
alterados invalidam a autorização original. Revalidação e mutação são síncronas,
no mesmo processo, sem ponto de suspensão. Replay exato devolve o registro original;
o mesmo OperationId para outra intenção gera erro. Uma operação bloqueada fica
finalizada; uma nova tentativa usa outro identificador.

## Como alterar o stencil

1. Alterar o JSON e incrementar a versão; revisar significado e compatibilidade.
2. Para regras novas, implementar o predicado e adicionar casos de aceitação e rejeição.
   O JSON parametriza predicados implementados; não executa linguagem arbitrária.
3. Executar os testes e a demonstração, revisar regra/decisão/efeito nos registros.
4. Ativar a versão em nova instância ou com `setStencil`; decisões anteriores
   pendentes serão revalidadas. Conservar a versão anterior junto à sua evidência.
5. Não há bypass de exceção nesta demonstração. Exceções exigem mudança explícita,
   revisão e nova versão; uma proposta não pode conceder permissão a si mesma.

## Limites

Estado e diário ficam em memória; o JSONL é uma exportação posterior, sem assinatura
ou resistência a adulteração. Não há autenticação real: o harness fornece identidades,
permissões e aprovações confiáveis. `seed`, `setRoles` e `setStencil` representam
administração confiável, não endpoints públicos. Não há recuperação após crash,
transação durável ou coordenação entre processos. Para produção, esses aspectos
exigem uma autoridade autenticada e armazenamento transacional com evidência durável.

Este exemplo demonstra composição de práticas existentes. Não demonstra novidade
metodológica do SDE, prova formal ou segurança universal. O stencil é o artefato
concreto (M1 em uma modelagem MOF apropriada); o avaliador é um mecanismo.
