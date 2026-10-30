# Arkhe-RBB: a engenharia da evidência verificável no setor público

**Como registros estruturados, provas criptográficas, assinaturas híbridas e ancoragem em blockchain podem apoiar a auditoria de atos públicos.**

Por Arkhe Computer · Estado técnico considerado: 28 de outubro de 2026.

Uma votação é registrada, um documento recebe uma nova versão e um sistema publica o resultado de um procedimento. Meses depois, uma auditoria precisa reconstruir o que aconteceu: identificar o conteúdo considerado, relacionar versões, conferir a origem dos registros e entender quais regras orientaram a decisão.

Esse trabalho depende da qualidade da evidência preservada. Um registro publicado pode estar disponível para consulta e ainda exigir verificações adicionais de autoria, integridade, contexto e sequência.

Na Arkhe Computer, estamos desenvolvendo o **Arkhe-RBB** para estruturar esse conjunto de verificações. A proposta reúne registros de evidência, acumulação criptográfica, assinaturas híbridas e checkpoints ancoráveis em uma infraestrutura de blockchain de interesse público.

O projeto já possui um núcleo experimental executável, com testes de protocolo, criptografia e contratos em EVM local. A integração operacional com a Rede Blockchain Brasil e com sistemas institucionais ainda faz parte do caminho de desenvolvimento e homologação. Essa distinção orienta a apresentação da tecnologia neste artigo.

## A RBB como contexto institucional e infraestrutura

A documentação de origem da Rede Blockchain Brasil apresenta uma rede público-permissionada criada por BNDES e TCU para aplicações de interesse público. Seu modelo combina possibilidades de consulta pública com regras de participação, operação e envio de transações.

O Arkhe-RBB é desenvolvido em um [fork do repositório RBBNet/rbb](https://github.com/rafael-arkhe/rbb-arkhe). A base herdada contém documentação de governança e infraestrutura Besu, incluindo um genesis de referência com configuração QBFT.

Nesse contexto, o Arkhe ocupa a camada de aplicação: define como representar, assinar, acumular e verificar evidências que poderão usar a RBB como destino de ancoragem.

O desenho preserva as responsabilidades da rede. Um publicador da aplicação se relacionaria com um Writer autorizado para enviar transações; Observers poderiam apoiar a leitura e a auditoria. Validadores continuam responsáveis pelo consenso conforme as regras da rede. Instalar uma aplicação Arkhe não concede automaticamente qualquer desses papéis.

A adesão institucional, a autorização de um caso de uso e a configuração técnica de uma implantação precisam seguir os processos aplicáveis. O fork e os testes publicados não representam aprovação ou parceria formal da governança da RBB.

## O primeiro desafio: definir exatamente o que será verificado

A criptografia opera sobre bytes. Antes de escolher uma assinatura ou uma blockchain, é necessário definir como um acontecimento do sistema de origem será representado.

A proposta utiliza um registro de evidência, denominado WER, para associar uma ocorrência identificada a sua revisão, aos compromissos de conteúdo e às referências de política pertinentes. Cada domínio precisa completar esse esquema com os dados necessários ao seu caso de uso.

Em um fluxo legislativo projetado, isso pode envolver a intenção associada a uma deliberação, a identificação da matéria e de sua revisão, os compromissos dos estados relevantes antes e depois do ato e o resultado registrado. Em uma integração executiva, a evidência pode referenciar um evento confirmado no sistema de origem. Em um contexto judicial, pode representar uma versão documental ou um evento de custódia, respeitadas as condições de acesso.

Esses são cenários candidatos de integração. O módulo atual não captura sessões SAPL reais, não opera uma conexão institucional Fabric e não processa dados de sistemas judiciais.

A representação precisa ser determinística. Dois produtores que codificam o mesmo conteúdo segundo o mesmo esquema devem obter os mesmos bytes. Para WERs, manifestos e atestações, a especificação adota um subconjunto determinístico de CBOR, com regras explícitas para tipos, campos e ordenação. A referência desse formato é a [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html).

O esquema também precisa reconhecer informações ausentes ou não verificadas. Substituir uma falha de captura por um hash zero e continuar o fluxo como se a evidência estivesse completa produz uma aparência de certeza que o sistema não pode sustentar.

## Como o MMR organiza a evidência

Depois de identificar os registros, surge outro problema: demonstrar que um deles pertence a um conjunto ordenado e acompanhar o crescimento desse conjunto.

O núcleo implementado utiliza uma **Merkle Mountain Range, ou MMR**. Ela acumula hashes em árvores que são combinadas conforme novos registros entram na sequência. O resultado permite produzir provas de inclusão sem exigir que o verificador receba todo o acervo.

No Arkhe-RBB, o perfil MMR utiliza BLAKE3 e separação de domínio. Folhas, nós internos, combinação de picos e raiz final possuem identificadores de finalidade distintos. A raiz também está vinculada ao contador de folhas.

Essa composição tem uma consequência importante: o tamanho e a posição declarados na prova precisam corresponder à estrutura da árvore. O verificador implementado confere a geometria das montanhas, o número de irmãos e os picos esperados. Apenas recalcular uma sequência de hashes seria insuficiente para validar todas essas alegações.

Outra distinção é a continuidade. Uma prova de inclusão demonstra que um registro pertence a determinada raiz. Demonstrar que um histórico cresceu preservando seu prefixo exige uma verificação de extensão a partir de um estado anterior autenticado.

O projeto implementa essa recomposição a partir de uma frontier, a representação dos picos e do contador anteriores. O leitor ainda precisa saber por que aquela referência anterior é confiável.

A arquitetura prevê um acumulador por órgão e stream. O stream delimita o contexto da sequência de evidências, enquanto o manifesto do lote identifica os registros comprometidos pelo checkpoint. Essa separação ajuda a organizar auditoria, isolamento e evolução dos perfis.

## Um checkpoint com o mesmo significado em Rust e na EVM

Um risco recorrente em sistemas de evidência é produzir um envelope assinado fora da blockchain e enviar ao contrato uma segunda representação de seus metadados. Se as duas representações divergirem, torna-se ambíguo o que a rede realmente registrou.

O candidato de protocolo atual, `arkhe-evidence/3`, revisão 2, utiliza um **cabeçalho ABI estático como representação autoritativa do checkpoint**.

Seus campos vinculam identidade de rede e genesis, contratos de destino, órgão, stream, sequência, predecessor, intervalo de folhas, raiz MMR, manifestos, política, conjunto de chaves e perfil do acumulador.

O contrato e as bibliotecas recalculam o identificador do checkpoint usando Keccak-256 e separação de domínio. Isso permite comparar os mesmos compromissos entre implementações, sem depender da interpretação de um portal.

O cabeçalho possui 27 palavras ABI, equivalentes a 864 bytes. Com as assinaturas do perfil implementado, o envelope canônico ocupa 3.488 bytes. São tamanhos do formato experimental, não medidas de custo ou desempenho da rede RBB.

O decoder Rust rejeita comprimentos inválidos, padding e offsets não canônicos, flags inconsistentes, intervalos incorretos e bytes extras. Os testes diferenciais conferem os bytes e os hashes produzidos em Rust, Python e Solidity.

Essa abordagem torna a interoperabilidade uma propriedade testável. A concordância sobre nomes de campos precisa ser acompanhada de concordância sobre os bytes efetivamente assinados e registrados.

## Assinaturas híbridas e o escopo da proteção pós-quântica

O perfil inicial exige **Ed25519 e ML-DSA-44 sobre o mesmo digest de checkpoint**. A condição de aceitação criptográfica é conjunta: ambas as assinaturas precisam ser válidas.

Ed25519 fornece a família clássica usada nesse perfil. ML-DSA é o algoritmo de assinatura baseado em reticulados padronizado pelo NIST no [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final), desenvolvido para oferecer segurança inclusive diante do cenário de computadores quânticos de grande escala.

A implementação utiliza contextos diferentes para assinaturas de checkpoint e de atestação. Assim, uma autorização produzida para determinada finalidade não deve ser reinterpretada como se pertencesse a outra operação.

No protótipo, a verificação híbrida é executada na biblioteca Rust. O contrato de ancoragem não executa uma precompile ML-DSA nem pressupõe que esse recurso esteja disponível na RBB.

Também é necessário delimitar o alcance da proteção. Assinar uma evidência com ML-DSA não altera automaticamente a segurança das contas EVM, do consenso, do transporte ou da administração do registro de chaves. Esses componentes possuem dependências próprias.

A padronização de um algoritmo tampouco certifica uma biblioteca, um serviço de assinatura ou um módulo HSM. A evolução operacional exige tratar custódia, autorização, rotação, revogação e recuperação de chaves com a mesma atenção dedicada à verificação matemática.

## De onde vem a confiança institucional

Uma assinatura válida demonstra uma relação entre mensagem e chave. A atribuição daquela chave a um órgão depende de outra camada de evidência.

Por isso, o contexto de confiança do verificador precisa vir de um canal independente do pacote avaliado. Um produtor não pode tornar suas próprias chaves confiáveis simplesmente incluindo no pacote um snapshot de registro e assinaturas que ele mesmo gerou.

O modo implementado na biblioteca é denominado `TRUSTED_ATTESTATION`. Ele verifica uma avaliação assinada por pelo menos três entre quatro testemunhas configuradas previamente pelo host, exigindo IDs e chaves distintos e assinaturas híbridas.

A avaliação vincula o checkpoint ao contexto considerado: rede, contratos, bloco de referência, compromisso do envelope, extrato do conjunto de chaves, política e condições temporais. Os votos precisam cobrir o mesmo conteúdo; não se pode formar um quórum misturando avaliações incompatíveis.

Esse mecanismo assume confiança nas testemunhas autorizadas. Sua independência precisa ser organizacional e operacional: quatro processos sob a mesma credencial administrativa não demonstram, por si, a separação pretendida.

O repositório implementa a verificação offline desse modelo, mas não opera uma infraestrutura real de testemunhas nem uma cerimônia institucional de distribuição e atualização da raiz. Também não implementa um light client QBFT. Essas diferenças devem permanecer visíveis no resultado apresentado ao leitor.

A dimensão temporal merece atenção semelhante. Uma data declarada pelo emissor não prova quando uma assinatura foi produzida. Preservar validade histórica após comprometimento de chave requer evidência autenticada de existência anterior ao marco relevante. Um pacote antigo também não pode afirmar, sozinho, que não houve revogação posterior.

## O que o contrato registra

O anchor experimental confere regras de admissão, como autorização do operador, identidade da rede, referências de contratos e keyset, configuração do stream, sequência, predecessor e intervalo de folhas. Ele também recalcula o identificador e o compromisso do envelope.

O retry exato é idempotente: reapresentar o mesmo conteúdo na mesma sequência não cria outro registro. Um conteúdo divergente para aquela sequência é tratado como conflito. A suspensão bloqueia novas escritas sem apagar os registros históricos.

Essas propriedades são úteis para publicação e recuperação, mas a conclusão produzida pelo contrato permanece delimitada. A aplicação precisa distinguir registro, confirmação da transação e aceitação criptográfica da evidência.

Uma transação aceita na EVM pode conter assinaturas inválidas do tamanho esperado. No perfil atual, o verificador externo precisa detectar esse problema. A arquitetura prevê tratamento de incidente e suspensão do stream, preservando o registro do ocorrido.

O cadastro institucional utilizado nos testes é uma fixture com setters públicos, e o anchor experimental possui administração única. Ambos os limites precisam ser tratados na evolução para uma implantação governada.

## A integração depende de engenharia de captura e recuperação

A prova criptográfica depende dos registros que efetivamente chegam ao sistema. Um pipeline que perde eventos antes da captura pode produzir um histórico internamente consistente e ainda incompleto.

Na integração SAPL projetada, o padrão Transactional Outbox vincula a alteração de negócio e a gravação do evento na mesma transação. A indisponibilidade do publicador ou da blockchain pode ser absorvida por processamento posterior, desde que o evento tenha sido persistido de forma durável.

A entrega entre componentes pode ocorrer mais de uma vez. O efeito no acumulador precisa ser idempotente, identificado pela ocorrência e sua revisão. Isso exige coordenar atribuição de índice, atualização do MMR e progresso do evento, inclusive quando dois workers concorrem ou um processo cai entre gravações.

No Fabric, a ponte proposta precisa autenticar peer, canal e origem do evento, conferir o status de commit e persistir um cursor de retomada adequado. Há ainda um detalhe de interface relevante: `DeliverFiltered` não inclui o payload dos eventos de chaincode. Obter os dados necessários exige um serviço apropriado ou uma busca complementar autorizada, conforme a [documentação de eventos do Fabric](https://hyperledger-fabric.readthedocs.io/en/latest/peer_event_services.html).

Persistência PostgreSQL/outbox, recuperação após falhas e adaptadores reais ainda são etapas pendentes no fork. Os testes atuais do acumulador em memória não demonstram essas garantias operacionais.

## Políticas, privacidade e disponibilidade fazem parte do desenho

A proposta de ConstitutionGraph e ContainmentGate procura associar uma avaliação a uma política identificada, versionada e aplicável ao contexto do ato. Isso pode envolver pré-condições, prazos, turnos ou outros requisitos definidos pela instituição competente.

Para que essa avaliação tenha significado, a regra precisa indicar autoridade, jurisdição, vigência, parâmetros e fatos necessários. O próprio solicitante não deve poder escolher arbitrariamente a exigência que será usada para aprová-lo. Informações ausentes precisam resultar em indeterminação, sem aparência de conformidade verificada.

Esse motor regimental ainda não está operacional no módulo publicado. Sua implementação e validação normativa fazem parte da evolução proposta.

A privacidade também precisa ser tratada no desenho dos dados. Um hash de conteúdo previsível pode permitir comparação, correlação ou busca por dicionário. Publicar apenas hashes não constitui garantia geral de anonimização. A definição de compromissos, metadados, permissões e retenção precisa considerar a exposição produzida pelo caso de uso.

A disponibilidade dos bytes completa esse quadro. Um compromisso criptográfico ancorado não reconstrói um documento ou pacote perdido. Retenção, backups, restauração e acesso aos materiais necessários à verificação são responsabilidades operacionais que a arquitetura precisa sustentar.

## O que já foi demonstrado e qual é o próximo passo

O [repositório público do Arkhe-RBB](https://github.com/rafael-arkhe/rbb-arkhe) reúne código, especificação, revisão de segurança, vetores e comandos de reprodução.

Na validação de CI registrada para a correção de instalação, as execuções de [push](https://github.com/rafael-arkhe/rbb-arkhe/actions/runs/40790869436) e [pull request](https://github.com/rafael-arkhe/rbb-arkhe/actions/runs/40790896780) passaram com:

- 15 testes Rust de protocolo, MMR, assinatura híbrida e confiança;
- 9 testes EVM, incluindo um checkpoint assinado em Rust e registrado pelo contrato com os mesmos compromissos;
- 1 teste de regressão do lockfile;
- conferência de ABI/Keccak e oito raízes MMR por um oráculo Python independente;
- Clippy com avisos tratados como erros.

Esses resultados demonstram a execução do protótipo no ambiente definido. Não são benchmarks da RBB, certificação criptográfica nem validação de uma integração institucional em produção.

A próxima etapa exige completar os esquemas setoriais, implementar a captura durável, substituir o registro de teste por governança verificável, estruturar a operação de chaves e testemunhas e ensaiar integrações autorizadas em ambiente de homologação.

Para o setor público, o valor potencial está em tornar o processo de auditoria mais reproduzível: identificar quais evidências sustentam uma conclusão, quais verificações foram executadas e quais dependências de confiança permanecem.

Na Arkhe Computer, esse é o compromisso que orienta o Arkhe-RBB: construir mecanismos que permitam examinar a evidência e seus limites. A evolução do projeto depende de código verificável, testes reproduzíveis e decisões institucionais documentadas.

Convidamos equipes de engenharia, segurança, pesquisa e administração pública a examinar a [arquitetura e a implementação](https://github.com/rafael-arkhe/rbb-arkhe/tree/master/arkhe), reproduzir os testes e contribuir para os próximos marcos de desenvolvimento.

#ArkheComputer #RBB #GovTech #Blockchain #Criptografia #PQC
