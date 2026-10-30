---
title: 'Arkhe: evidência e governança para agentes de IA'
subtitle: 'Amostra — Do resultado à autorização'
lang: pt-BR
date: '22 de outubro de 2026'
rights: 'Edição de trabalho 0.1. Autoria editorial e licença a definir antes da publicação.'
---

# Do resultado à autorização

Uma equipe quer permitir que um agente proponha despesas de até cem unidades.
O agente recebe três custos, soma os valores e responde: “O total é cem; pode
aprovar”. A resposta parece suficiente para uma pessoa que está acompanhando a
conversa. Para o serviço que vai agir, faltam perguntas essenciais. Quais valores
foram somados? Qual limite estava em vigor? A resposta pertence a este pedido ou
foi reaproveitada de outro? Quem tem autoridade para decidir?

Este é um cenário didático fictício. Vamos resolvê-lo com um exemplo existente no
repositório Arkhe. O objetivo é mais restrito do que provar que um agente está
correto: verificar uma propriedade aritmética e vinculá-la a um pedido, a um
registro de trabalho e a uma política. Depois disso, o gate ainda precisa decidir
se autoriza o pedido. O laboratório termina nessa decisão; não paga uma despesa.

Ao final, você conseguirá executar o exemplo, interpretar seu resultado e
explicar por que uma conta correta pode continuar sem autorização. Também terá
um critério para avaliar promessas de “saídas verificáveis”: identificar exatamente
qual afirmação o verificador aceita, quais entradas recebe de uma autoridade e
quais fatos continuam fora do seu alcance.

## A diferença entre uma explicação e um certificado

Um texto como “somei todos os custos” é uma declaração do produtor. Um log dessa
resposta preserva a declaração, mas não acrescenta um procedimento independente
para conferir a soma. Podemos melhorar esse contrato: o produtor entrega o
resultado e uma sequência de somas parciais. O consumidor recebe uma regra curta
para conferir cada passo.

Para os valores `20`, `30` e `50`, o certificado contém a sequência:

```text
custos:          20, 30, 50
somas parciais:   0, 20, 50, 100
limite:         100
```

O verificador exige que a sequência comece em zero, que cada passo some exatamente
o próximo custo e que o valor final coincida com a saída e não ultrapasse o limite.
Ele também verifica os vínculos criptográficos do certificado. Não pede ao mesmo
agente uma segunda opinião sobre a própria resposta.

Essa ideia é uma aplicação limitada do padrão Proof-Carrying Output, ou PCO:
transportar uma saída junto com material que permita verificar uma propriedade
declarada. Aqui a propriedade é finita e aritmética. Não estamos verificando
raciocínio em linguagem natural, execução de pesos de um modelo ou autenticidade
das notas fiscais que deram origem aos números.

## A regra pertence ao host

O exemplo usa a especificação:

```rust
let spec = BudgetSpec {
    version: 1,
    limit: 100,
    max_items: 16,
};
```

O host é a aplicação responsável por estabelecer a política e controlar o acesso
ao efeito externo. Ele fornece essa regra ao fluxo. O produtor não pode trocar o
limite para conseguir aprovar uma saída. Se uma proposta pudesse carregar sua
própria regra de aceitação, uma soma de cento e um poderia vir acompanhada de um
novo limite de duzentos e parecer válida.

As unidades também pertencem ao contrato do host. O inteiro `100` não informa
sozinho se representa centavos, créditos ou outra unidade. Nesta demonstração são
unidades abstratas. Em uma aplicação financeira seria necessário fixar moeda,
escala e proveniência dos valores antes de autorizar qualquer pagamento.

O domínio aceito contém de um até `max_items` custos inteiros sem sinal, com
máximo suportado de 256 itens. A soma precisa caber em `u64`. Não se usa ponto
flutuante para representar esses valores. Lista vazia é rejeitada; custos zero
podem ser válidos. Essas escolhas tornam a propriedade precisa e os limites de
processamento explícitos.

## Quatro objetos que não devem se confundir

O fluxo trabalha com uma intenção, um registro do worker, uma política e um
certificado. Cada objeto responde a uma pergunta.

O `WorkIntent` descreve a ação solicitada. No exemplo, seu tipo é
`ApproveExpense`, seu solicitante é `local-demo` e seus parâmetros comprometem o
digest da saída. A identidade do pedido ajuda a distinguir uma solicitação lógica
de outra. O digest integral da intenção será usado pelo certificado.

O `WorkerExecutionRecord`, abreviado WER, registra qual módulo declarou ter
produzido aquela saída para determinada entrada. O exemplo identifica o módulo
`budget-demo`, versão `1`, e a operação `Analyze`. Os digests de entrada e saída
vinculam os objetos transportados. A nota de incerteza explicita que o fluxo não
garante veracidade dos custos nem pagamento.

O `PolicyBinding` identifica política, versão e digest. No laboratório, o resolver
aceita apenas o perfil `offline-budget-demo` e os vínculos esperados. Esse nome
sozinho não oferece segurança: o código também compara os demais campos.

O `BudgetProof` reúne entrada, saída, derivação e compromissos com intenção,
worker, política, especificação e identificador do checker. Alterar uma parte
exige que todas as relações continuem consistentes, além de passar novamente pela
regra aritmética.

Um digest é um compromisso com bytes sob um esquema de codificação e hipóteses
criptográficas. Ele não identifica automaticamente uma pessoa confiável. O
comentário do contrato do WER resume a separação: hashes identificam conteúdo;
admissão estabelece proveniência. Uma aplicação real precisa de um procedimento
para autenticar e admitir o registro antes de lhe atribuir autoridade.

## A arquitetura deste laboratório

O caminho didático pode ser lido assim:

```text
Host: especificação + política
                 |
Entrada -> produtor -> saída + derivação
                 |
       WorkIntent + WER + BudgetProof
                 |
         transporte serializado
                 |
       checker independente -> evidência local
                 |
        ContainmentGate -> Allow ou Reject
```

Esse desenho descreve o exemplo offline. A evidência local fica em memória e não
tem assinatura ou persistência de produção. O objetivo é tornar o contrato
observável sem esconder requisitos operacionais atrás de uma demonstração.

O produtor está em `arkhe_agent::budget_pco`. A verificação está em
`arkhe_verify_core::output_proof::verify_budget_proof`. O checker não depende do
produtor nem o chama. Essa separação permite que o consumidor confira um
certificado transportado sem confiar no código que o gerou.

O fluxo passa por serialização e desserialização JSON antes da verificação
independente. Isso exercita uma fronteira de transporte. Não significa que todo
JSON arbitrário se torna canônico ou que o parser deixa de fazer parte da base de
confiança. Em uma interface pública também seriam necessários limites de tamanho
antes da decodificação.

## Execute o exemplo do repositório

Use um checkout do Arkhe que contenha o exemplo `budget_pco`, o `Cargo.lock` e a
toolchain indicada pelo `rust-toolchain.toml`. Na edição inspecionada, essa
toolchain é Rust `1.96.0`. O comando pode baixar dependências na primeira
compilação; não exige banco de dados, chaves reais ou conta de pagamento.

Na raiz do repositório:

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
```

O arquivo de implementação é
`kernel/arkhe-kernel/examples/budget_pco.rs`. Este trecho mostra a preparação da
entrada e o ponto de separação entre geração e prova:

```rust
let input = BudgetInput {
    costs: vec![20, 30, 50],
};
let (output, _) = budget_pco::infer(&input, &spec)?;
```

O programa monta o WER e a intenção, gera o certificado com `prove`, atravessa a
serialização e invoca o checker. Depois conserva o certificado e seus envelopes
em um `OfflineEvidence`, que implementa `EvidenceReader`, e pede autorização a
`ContainmentGate::authorize_admitted`.

Na reprodução desta edição, o programa retornou:

```json
{
  "authorization_ref": "cc77556f3cf18ad7a21d77522565f281d9e3ed27600201b099fd7968f747553b",
  "external_action_executed": false,
  "mode": "offline-budget-pco-demo",
  "proof": "e59a0e8dce0afd848ef6165e6818a2eaee0c4987cc07aa2b512edeac2adb2258",
  "total": 100
}
```

O total mostra o resultado aritmético. O campo `proof` identifica o certificado
verificado. `authorization_ref` é a referência da decisão sob os vínculos do
exemplo. O último campo é tão relevante quanto os hashes: nenhuma ação externa
foi executada. Interpretar essa saída como recibo de pagamento acrescentaria uma
afirmação que o programa não faz.

Os digests registrados correspondem aos arquivos desta edição. Se o contrato ou
as entradas mudarem, não use esses valores como regra universal; investigue a
mudança e reproduza os testes adequados ao novo snapshot.

## Por que verificar novamente no gate

Uma aplicação poderia verificar o certificado e, depois, encaminhar apenas um
booleano `valid: true`. Isso cria uma nova pergunta: quem produziu esse booleano e
a qual pedido ele se refere? No fluxo atual, o gate recupera o certificado via
`EvidenceReader::budget_proof`, executa o checker e exige o envelope admitido
correspondente.

O transporte de evidência não recebe autoridade para decidir que sua própria
resposta é válida. O envelope esperado compromete o certificado e a política,
usa o WER como sujeito e vincula os pais esperados. Não basta existir algum
envelope chamado `BudgetProof`.

A integração é opt-in. Um `PolicyResolver` exige o certificado por meio de
`required_budget_proof`. Se a política exige prova e o caminho disponível não a
transporta ou não a verifica, a operação é rejeitada. A entrada síncrona básica
também recusa políticas que exigem essa prova, inclusive para intenções que
normalmente não são protegidas. Isso evita que a escolha de outra entrada do gate
contorne o requisito.

Ainda assim, conta correta não prevalece sobre política negada, parada de
emergência ou revisão humana exigida. Uma propriedade satisfeita é uma condição
de autorização; as demais condições continuam em vigor.

## Teste a fronteira de rejeição

Um exemplo que só aceita a entrada correta demonstra pouco sobre o que consegue
impedir. Execute as suítes relacionadas:

```powershell
cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates
```

Na reprodução desta edição, passaram nove testes de PCO e cinco de rejeição.
Entre os comportamentos exercitados estão certificado ausente, proveniência
incompatível, alteração de especificação durante a consulta de evidência,
transferência entre pedidos e tentativa de contornar a prova por outra entrada
do gate.

Dois casos tornam a propriedade aritmética particularmente clara. No primeiro,
o certificado tenta somar `u64::MAX` e `1` e apresentar zero como resultado por
overflow. O checker usa aritmética intermediária em `u128` para recusar a
conclusão fora do domínio. No segundo, uma soma de `101` está aritmeticamente
correta, mas excede o teto confiável de `100`; por isso é rejeitada.

Esses casos são verificados no teste
`checker_rejects_false_arithmetic_and_over_budget_conclusion_without_producer`.
Ele constrói declarações maliciosas sem depender de o produtor cooperar. Essa é
uma propriedade útil de um teste de verificador: o gerador normal não precisa
conseguir criar a entrada adversarial para que a entrada seja testada.

Como exercício de leitura, encontre no arquivo de testes a troca de especificação
durante a consulta de evidência. Identifique qual digest seria antigo e por que
uma verificação feita apenas no início da requisição seria insuficiente. Depois,
localize os casos em que a revisão humana continua obrigatória mesmo com o
certificado correto. A resposta esperada é uma descrição dos vínculos e das
condições, não apenas a palavra “seguro”.

## Autorização e execução têm estados diferentes

O gate verifica uma proposta. Ele não é um journal de efeitos externos. Repetir
o mesmo pedido pode produzir a mesma referência de autorização. Isso não prova
que uma API de pagamento, publicação ou deployment só receberá uma chamada.

Um executor real precisa reservar a identidade da operação antes do efeito,
registrar os parâmetros associados, persistir transições e tratar resultados
incertos. Se a conexão cair depois de o destino aceitar uma ação, um retry cego
pode duplicar o efeito. A solução depende também das garantias do destino e do
procedimento de reconciliação.

No contrato principal, `WorkIntent::operation_id()` separa a identidade lógica
da operação dos parâmetros; o journal precisa vincular os parâmetros e rejeitar
conflitos. O certificado desta amostra, por sua vez, compromete o digest integral
da intenção. São verificações com propósitos diferentes. Não confunda o uso de
uma identidade estável para retries com permissão para reaproveitar um
certificado após mudar a proposta.

O timestamp declarado pelo solicitante também não se transforma em relógio
confiável porque foi incluído num objeto com hash. Se a aplicação precisa de
validade temporal, deve estabelecer fonte de tempo e política de expiração.
O certificado aritmético não infere uma data de vencimento.

## Onde entram WormGraph e verificação offline

O exemplo conserva envelopes em memória. Uma implantação poderia persistir
certificados e evidência admitida, e oferecer provas de inclusão contra um
checkpoint. Para que isso tenha valor para outro verificador, o checkpoint
precisa chegar por uma relação de confiança independente do pacote que está
sendo avaliado.

Se uma pessoa envia uma folha, uma árvore inventada e a raiz dessa mesma árvore,
uma prova de inclusão consistente só mostra que seus próprios dados combinam.
Ela não estabelece quem opera o log. Tampouco uma prova de inclusão isolada
demonstra que dois checkpoints pertencem à mesma história sem bifurcações ou que
um mandato existia antes da execução.

O perfil principal `arkhe-mmr@1` fixa domínios e ordem das operações. O workspace
AGI possui outro contrato. Misturar esses perfis porque ambos se chamam MMR pode
produzir incompatibilidades e conclusões erradas. Na API legada, pertencimento
também não deve ser anunciado como posição específica; a verificação com índice
tem contrato próprio.

Há uma lacuna operacional explícita nesta edição: o transporte opcional de
`BudgetProof` ainda não está implementado em `PgWormGraph`. Seu retorno padrão
não fornece a prova. Ativar uma política que a exija nesse reader resulta em
negação; o laboratório não autoriza afirmar que existe um fluxo HTTP completo
de PCO persistente em produção.

## O que o certificado permite afirmar

Sob a especificação aceita e os compromissos verificados, a soma dos inteiros é
exata, cabe no domínio e não supera o limite. A derivação pode ser conferida por
indução finita: o primeiro valor representa a soma vazia; cada passo adiciona
um custo; o último valor coincide com a saída. O verificador custa O(n), com
entrada limitada a 256 itens.

Esse argumento não é uma prova mecanizada da implementação Rust. Checker,
codificação, bibliotecas criptográficas e sua integração continuam na base de
confiança. Um defeito nessa base pode invalidar a conclusão operacional.

O certificado também não prova que os custos são verdadeiros ou completos,
que a despesa é legal, que houve execução de determinado modelo ou que o host
impede todos os caminhos alternativos para o efeito. Ele não autentica uma GPU,
não oferece sigilo dos dados e não substitui revisão de política.

O passo seguinte de implementação é escolher uma propriedade pequena que tenha
valor para seu sistema, escrever um checker independente e fixar como o host
obtém entradas e regras confiáveis. Só então conecte a autorização a um executor
com estado persistente e reconciliação. A precisão dessa fronteira é o que
permite que uma evidência seja útil para outra equipe, meses depois, fora da
conversa que produziu a proposta.

## Referências de implementação

Nomes de terceiros nas referências técnicas identificam ferramentas,
especificações e fontes utilizadas. Esta publicação é independente e não alega
patrocínio, endosso ou certificação por essas organizações.

Esta amostra usa exclusivamente o workspace principal:

- `kernel/arkhe-kernel/examples/budget_pco.rs`: programa completo.
- `cognition/arkhe-agent/src/budget_pco.rs`: produtor do certificado.
- `kernel/arkhe-core/src/output_proof.rs`: contratos da prova.
- `verification/crates/arkhe-verify-core/src/output_proof.rs`: checker independente.
- `kernel/arkhe-kernel/src/lib.rs`: integração ao gate.
- `kernel/arkhe-kernel/tests/budget_pco.rs`: nove testes de contrato e rejeição.
- `kernel/arkhe-kernel/tests/rejection_gates.rs`: cinco testes de rejeição.
- `kernel/arkhe-core/src/work.rs` e `worker.rs`: intenção, identidade e WER.
- `docs/PROOF-CARRYING-BUDGET.md` e `docs/MMR-PROFILE.md`: limites e perfis.

Os caminhos são relativos à raiz do checkout distribuído ao leitor. A edição
editorial preserva o manifest de hashes e o registro da reprodução junto à amostra.
