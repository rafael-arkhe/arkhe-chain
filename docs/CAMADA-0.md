# Camada 0 — a constituição e os mandatos, em ficheiros

A Camada 0 do whitepaper é a autoridade de raiz: o fundador aprova políticas,
delegações sensíveis e mudanças de autoridade, e não entra na microexecução.
Este documento é essa camada escrita em ficheiros que o código confere.

O mecanismo não é novo. O `arkhe-governance::policy_bundle` já tinha tudo:
assinatura Ed25519 sobre os bytes canónicos da projeção não assinada
(`AKG:POLICY:BUNDLE:v1\0`), piso de versão que recusa reinstalar uma política
retirada, janela de validade com `expires_at` exclusivo, e trust store
configurada pelo *deployment* — nunca pelo pacote. O que faltava era alguém
usá-lo: até agora não havia **um único** produtor ou consumidor de
`SignedPolicyBundle` no repositório. A constituição é o primeiro.

| Ficheiro | O que é |
|:---|:---|
| `governance/camada0/CONSTITUTION-v1.json` | A constituição assinada: efeitos permitidos, decisões reservadas, tectos, jurisdições, duração máxima de um mandato |
| `governance/camada0/MANDATE-engineering-v1.json` | Mandato da célula de engenharia, 30 dias, sem gasto |
| `governance/camada0/MANDATE-evidence-v1.json` | Mandato da célula de evidências — o do piloto —, 30 dias, sem gasto |
| `governance/camada0/DEV-TRUST-STORE.json` | A âncora de confiança do *deployment* de desenvolvimento |
| `governance/arkhe-governance/src/mandate.rs` | A interpretação: o que uma constituição diz e o que um mandato pode herdar |
| `governance/arkhe-governance/tests/camada0.rs` | 15 testes sobre os ficheiros comitados |
| `governance/arkhe-governance/examples/camada0_fixture.rs` | O gerador |

```powershell
cargo test -p arkhe-governance --test camada0
```

## 1. O que a constituição diz

Três listas e um relógio. Nada mais.

**Efeitos permitidos** — `query_knowledge_base`, `simulate`, `draft_document`,
`run_tests`, `prepare_release`, `prepare_evidence_bundle`. A ausência é
negação, a mesma postura *default-deny* que o `config/policy-dev.json` já usa.

**Decisões reservadas** — `sign_constitution`, `rotate_master_key`,
`grant_mandate`, `promote_to_production`, `approve_payment`, `sign_contract`,
`publish_public_statement`. Nenhum mandato as pode carregar, e uma constituição
que permita e reserve o mesmo efeito é recusada: não é política, é contradição.

**Tectos** — em unidades menores e inteiras, de uma moeda (`BRL`), porque dois
leitores têm de concordar no número. Os valores comitados são de
desenvolvimento; os reais são do fundador, e mudá-los é um incremento de versão
mais uma assinatura. É esse o ponto.

**Duração máxima de um mandato** — 90 dias. Os dois mandatos comitados duram 30.

Um mandato é ele próprio um `SignedPolicyBundle`, portanto herda de graça a
janela, o piso de versão e a verificação da assinatura. O que o `mandate.rs`
acrescenta é **contenção**: um mandato só pode estreitar aquilo de que descende.
Não pode permitir um efeito que a constituição não permite, subir um tecto,
mudar de moeda, carregar uma decisão reservada nem viver mais do que o máximo.
Uma subdelegação é a mesma verificação com um mandato como pai — e herda do
pai, não da constituição: um filho não pode reclamar um efeito que a
constituição permite mas que o pai não tem.

## 2. O que os testes provam

A constituição comitada verifica sob a postura de produção
(`SignaturePolicy::Required`) e devolve o `PolicyBinding` que uma decisão do
gate deve citar. Uma trust store vazia é erro de configuração, não um passe.
Reapresentar a versão 1 depois de o *deployment* ter aceitado a 2 é
`RollbackDetected`. Fora da janela é `NotYetValid` ou `Expired` — e como
`expires_at` é exclusivo, a revisão anual não é opcional. Sem assinatura é
`UnsignedBundle`. E subir um tecto depois de assinar dá `InvalidSignature`: a
assinatura cobre as declarações, portanto os tectos não são editáveis.

Os dois mandatos verificam e estão dentro da constituição; nenhum gasta nada.
Os casos negativos estão todos congelados: decisão reservada delegada, efeito
que a constituição omite, tecto subido, moeda trocada, janela de 91 dias,
constituição errada citada, subdelegação mais larga que o pai, e um filho que
não nomeia o pai.

## 3. A constituição de produção

A deste repositório está assinada com uma **chave pública de teste**
(`dev-founder-key-NOT-FOR-PRODUCTION`), para provar o caminho de ponta a ponta.
A de produção não se faz aqui. O procedimento:

1. O *payload* é produzido por este gerador — JSON determinístico e revisível,
   com os valores reais de efeitos, reservas e tectos.
2. O que se assina são os bytes canónicos da projeção não assinada do pacote
   (`payload`, `version`, `min_version`, `issuer`, `key_id`, `issued_at`,
   `expires_at`), em AKG-CBOR-v1, sob o domínio `AKG:POLICY:BUNDLE:v1\0`. Essa
   definição é suficiente para um assinador offline ou de hardware produzir a
   assinatura sem que a chave toque nesta cadeia de ferramentas.
3. A chave pública entra na trust store do *deployment*, fora de banda.

**O que falta para isto ser praticável:** não existe ferramenta de assinatura.
O `sign_policy_bundle` serve tooling e testes, recebendo uma `SigningKey` em
memória — o que é precisamente o que não se quer para a chave mestre. Uma CLI
que produza o pré-imagem, o entregue a um assinador externo e remonte o pacote
é a peça seguinte desta camada.

**E uma incompatibilidade a decidir:** o
`governance/trust-registry/public-keys.json` está `UNPROVISIONED`, com
`threshold: 2` e nenhuma chave. Um fundador solo não satisfaz um limiar de 2
num registo que se diz independente. Há duas saídas e elas não são equivalentes:
duas chaves em custódias diferentes da mesma pessoa (uma operacional, uma fria
noutro lugar físico) dá 2-de-2 em **custódia** e 1-de-1 em **independência**; um
segundo signatário real — conselheiro, advogado, cônjuge com instruções — dá
independência verdadeira e introduz uma pessoa no caminho crítico. O registo
tem de declarar qual das duas é, porque um auditor vai perguntar.

## 4. O que a Camada 0 ainda não é

**Nada no repositório consulta estes ficheiros num ponto de efeito.** A
constituição e os mandatos verificam, a contenção é decidível, e o gate não os
lê. Autoridade expressa e verificável não é autoridade imposta. O que está
feito é o lado da prova; o lado da aplicação é o kernel e o gateway, e ligar os
dois é trabalho que ainda não foi feito.

Isto é a mesma distinção que o AID tem entre verificar uma transição e
reconhecer a ponta, e vale repeti-la aqui porque é fácil de perder: um mandato
assinado e verificável diz o que *estava autorizado*. Não impede nada por si.

## 5. O piloto medido

A rotina do §6 do whitepaper, com o mandato `MANDATE-evidence-v1` a cobri-la:
preparação de evidências documentais para revisão interna. O mesmo lote, o
mesmo checklist e a mesma definição de aceite, corridos duas vezes — à mão e
pelo Arkhe.

| A medir | Fluxo manual | Fluxo Arkhe |
|:---|:---|:---|
| Tempo do fundador (minutos) | | |
| Tempo total até ao aceite | | |
| Devoluções (retrabalho) | | |
| Exceções levantadas | | |
| Exceções que exigiram o fundador | | |

Artefactos a arquivar por digest em cada execução: o registo da sessão, o
`run_id`, o snapshot AID emitido, o pacote exportado, o veredito do verificador
por dimensão e o código de saída.

Três casos negativos, obrigatórios, porque um piloto que só mostra o caminho
felizes não mostra nada:

1. Uma ação fora do mandato — efeito ausente dos `effects` do mandato. Esperado:
   recusa no ponto de aplicação, e a recusa registada.
2. Uma evidência obrigatória ausente — o pacote sem os eventos do histórico.
   Esperado: `INCONCLUSIVE` com `model` ainda em `PASS`, como o V02 sem eventos
   congela.
3. Um predecessor adulterado — a raiz trocada, `aid` e assinatura preservados.
   Esperado: `FAIL` em `predecessor_aid_recomputation`, como o V06 congela.

Com o `N < M` implementado, o piloto pode registar **um evento por execução** e
exercitar o crescimento real do histórico com a prova de consistência (a forma
do V02b), em vez de ficar limitado a dois históricos vazios.

Critério para ampliar a delegação, os três ao mesmo tempo: o fundador gastou
menos tempo, o revisor reproduziu as conclusões a partir dos pacotes, e as
exceções foram tratadas como a política previa. Qualquer um em falta, o escopo
não aumenta.

## 6. Classificação τ

| Afirmação | τ | Nota |
|:---|:---|:---|
| A constituição e os mandatos são pacotes assinados que verificam sob a postura de produção | `LEMMA` local | 15 testes sobre os ficheiros comitados |
| Uma política retirada não pode ser reinstalada | `LEMMA` local | Piso de versão, já no `policy_bundle`, agora com uma instância |
| Editar um tecto depois de assinar quebra a assinatura | `LEMMA` local | Teste dedicado |
| Um mandato só pode estreitar aquilo de que descende | `LEMMA` local | Contenção de efeitos, tectos, moeda, janela e decisões reservadas |
| Uma subdelegação herda do pai, não da constituição | `LEMMA` local | Teste dedicado |
| Estes ficheiros impedem alguma ação | `REFUTADO` | Nenhum ponto de efeito os consulta |
| A constituição de produção está assinada | `PENDING` | Falta a ferramenta de assinatura e a decisão sobre o limiar do registo |
| O piloto reduz o tempo de supervisão | `PROPOSAL` | A tabela da §5 está vazia |
