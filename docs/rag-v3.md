# Arkhe RAG v3 — núcleo local de divulgação temporal

Este módulo executável implementa binding por geração e autorização atual de
divulgação. É uma entrega delimitada dentro do arkhe-chain: não é o app documental
completo, nem uma integração com o kernel Rust, WormGraph, MMR ou um provedor LLM.
Os exemplos são sintéticos; não incluem memory.md nem documentos do usuário.

## Invariantes, ameaças, enforcement e verificação

| ID | Condição | Ameaça | Controle | Teste principal |
| --- | --- | --- | --- | --- |
| V3-01 | citações ⊆ contexto da geração | Candidato não enviado ou outra geração citado | prepare/complete/release | candidate_not_provided; other_generation_context |
| V3-02 | contexto ⊆ candidatos; contexto não vazio | Manifesto inconsistente | prepare | context_outside_candidates; empty_context |
| V3-03 | Cada dependência, inclusive não citada, exige permissão atual | Vazamento derivado de fonte revogada | release → _authorize | uncited_dependency_revocation |
| V3-04 | Tenant, principal, destino, propósito e ação correspondem | Reutilização em outro escopo | _generation + grants | scope_cannot_be_replayed; all_release_routes |
| V3-05 | Liberação e mudança de permissão seguem ordem serializada | Revogação entre check e uso local | BEGIN IMMEDIATE no mesmo SQLite | two_connections_revocation; preliminary_allow |
| V3-06 | valid_from ≤ decision_time < valid_until | Expiração ignorada | _tick + _authorize | exact_expiration; future_permission; clock_regression |
| V3-07 | Falha não retorna conteúdo | Falha de banco ou recibo vira allow | Transação, rollback e exceção fixa | storage_failure; receipt_failure; locked_database |
| V3-08 | Fontes, contexto e resposta correspondem aos digests registrados | Alteração acidental de bytes ou manifesto | _source, _generation, release | source/manifest/answer/citation_corruption |
| V3-09 | Registros de auditoria não incluem texto documental | Vazamento pelo relatório | Exportação de metadados | no_partial_release_or_sensitive_receipts |

Os nomes completos dos testes estão em tests/test_arkhe_rag_v3.py. Há testes
positivos, negativos e corrupção intencional; não há prova formal de completude.

## Contrato e fronteira de confiança

Gateway recebe Scope(tenant, principal, destination, purpose) de um chamador
confiável que já autenticou e autorizou sua operação. Isso não é autenticação
HTTP. set_permission e add_source são operações administrativas confiáveis.
O acesso ao arquivo SQLite e ao processo deve ser restrito. Um administrador
que altere conteúdo e digests juntos pode falsificar estes registros.

prepare fixa candidates e context por generation_id, exige permissão generate,
persiste o manifesto e um recibo antes de retornar bytes ao adaptador local.
Esse retorno é a fronteira de uso do contexto. complete recebe o rascunho e suas
citações; release é a única API de conteúdo da resposta destinada ao consumidor.

O adaptador é confiável: precisa fornecer os bytes exatos retornados por prepare
à geração correspondente. O núcleo não atesta o contexto de um runtime arbitrário.
O demo usa um adaptador local determinístico, sem inferência LLM ou rede.

Todas as fontes do contexto são dependências da resposta, mesmo sem citação.
A verificação estrutural não mede verdade, sustentação semântica ou qualidade.
Um chamador confiável com acesso ao rascunho precisa respeitar a fronteira; este
módulo não isola código hostil dentro do mesmo processo ou com acesso ao banco.

## Semântica temporal precisa

Todas as mudanças de permissão e liberações usam BEGIN IMMEDIATE na mesma base.
Uma revogação comprometida antes de a transação de liberação adquirir sua posição
na ordem impede a liberação. Se a liberação vier primeiro, ela pode retornar ao
chamador depois de uma revogação posterior; não há promessa de tempo físico de
entrega. Nenhuma confirmação antiga ou token TTL autoriza outra operação.

A validade temporal usa decision_time, amostrado pelo relógio confiável dentro
da transação, com intervalo semiaberto. Não há promessa de que o token permaneceria
válido até transmissão pela rede ou leitura humana. Regressão observada do relógio
é recusada. O relógio, a biblioteca SQLite e o filesystem local são confiáveis.

Cada modo display, export ou cache exige sua própria permissão e gera nova decisão.
Não há endpoint de download nem cache público fora desse caminho. O significado
desses modos é o retorno local autorizado; enviar e-mails, baixar por HTTP ou
mandar contexto a um LLM externo exige um adaptador separado e avaliação própria.

Após revogação, a resposta completa é retida. O estado used_but_suppressed preserva
o fato de que contexto já foi liberado ao adaptador local. Não significa prova
de que um provedor remoto recebeu ou processou conteúdo. Uma restauração de
permissão permite uma nova avaliação, mantendo as decisões anteriores.

Não há API para reescrever recorded_at ou importar eventos retroativos. valid_from
pode estar no passado: isso não altera o instante registrado da mudança. Política
bitemporal e importação de correções históricas ficam fora desta implementação.

## Executar

Python 3.12 é a versão do workflow. Não há dependências pip adicionais.
Na raiz do repositório:

```bash
python -B -m unittest discover -s tests -p test_arkhe_rag_v3.py -v
python -B scripts/falsify_rag_v3.py --output /caminho/novo/mutantes
python -B scripts/arkhe_rag_v3.py --output /caminho/novo/demo
```

As pastas de saída devem ser novas. A base com conteúdo sintético é temporária e
não é incluída nos artefatos; os recibos e o resumo são exportados. Nunca use o
comando de demo para processar dados reais: ele não é um importador de documentos.

O workflow .github/workflows/rag-v3.yml executa em Ubuntu e Windows, faz checkout
do SHA exato, roda testes, mutantes e demo e preserva evidências por 14 dias. Os
gates Rust já existentes permanecem separados. Uma execução verde deste workflow
não certifica o restante do repositório.

## Falsificadores e limites de cobertura

falsify_rag_v3.py cria cópias temporárias isoladas e injeta sete defeitos escritos
à mão: aceitar candidato não fornecido, omitir autorização atual, conferir somente
fontes citadas, ignorar revogação, aceitar a borda de expiração, ignorar integridade
da resposta e enfraquecer a transação de escrita. Cada defeito tem um teste alvo.

Antes de executar mutantes, o workflow exige que a implementação original passe.
Erro de importação ou setup não conta como detecção. O runner usa -B para evitar
bytecode desatualizado entre substituições e timeout para cada subprocesso.
Detectar os sete defeitos só demonstra esses cenários. Não existe gerador de
mutantes nem alegação de segurança geral ou equivalência a uma implantação real.

## How to audit this code

1. Confira os contratos de Scope, prepare e complete para V3-01/02/04.
2. Confira release: todas as dependências, ações separadas e nenhum corpo em deny.
3. Confira _transaction e set_permission para V3-05; execute o teste com duas
   conexões e eventos, sem depender de sleeps.
4. Confira _tick e o intervalo de validade para V3-06.
5. Provoque falha de recibo e banco; confirme que release não retorna conteúdo.
6. Confira _source e _generation; não confunda digest com autenticidade externa.
7. Inspecione audit e artefatos: texto documental não deve estar presente.
8. Abra commit.txt, runtime.txt, tests.log, mutants/summary.json e demo/summary.json
   no artefato da execução GitHub. Verifique o SHA com o PR.

Referências de implementação: https://www.sqlite.org/lang_transaction.html
e https://docs.python.org/3.12/library/sqlite3.html. São fundamentos da API,
não comprovação independente desta implementação.
