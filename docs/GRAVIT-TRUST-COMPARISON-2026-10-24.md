# Gravit × Arkhe: reprodução e contratos de confiança

Data: 24/10/2026. Resultado: reprodução aprovada; adaptador não implementado. O Gravit pode fornecer uma avaliação externa, mas seu `SUCCESS` não concede uma autorização Arkhe.

Continuação: [primeiro contrato executável de tradução](GRAVIT-TRANSLATION-CONTRACT-2026-10-24.md), isolado em testes, com digest recomputado e rejeição pelo caminho de admissão/gate. Não altera os resultados ou o escopo da reprodução abaixo.

## Escopo e versões

Foram executados o verificador de referência e o port Rust do [verifier](https://github.com/gravit-open-network-foundation/verifier) v0.6.0, commit `7887252fc84def69a794d2e32ce65721eb9a25d9`, o [eval-pack](https://github.com/gravit-open-network-foundation/gravit-eval-pack) em `0fb479e9617f1af873bfe3fe7922a48ef5858c5f` e o [Grover](https://github.com/gravit-open-network-foundation/gravit-grover) em `4ad9e5ca1c53548ccaefb91647905ad8945c0da1`.

O teste fixa as versões usadas pelo pacote de avaliação. Não certifica conformidade com versões posteriores dos Internet-Drafts. O próprio CONFORMANCE.md upstream não declara conformidade formal. Todas as chaves utilizadas são fixtures públicas de teste.

## Evidência reproduzida

| Verificação | Resultado observado |
|---|---|
| Vetores publicados | 47/47 em Python e no replay Rust |
| Suite Python | 50 testes aprovados |
| Suite Rust | 5 testes aprovados, incluindo o replay dos 47 vetores |
| Comparação adicional | 47 objetos iguais sob serialização JSON compacta ordenada |
| Controles negativos | Alteração de uma resposta esperada detectada por Python e Rust |
| Eval-pack | `ALL REPRODUCED`; BENCHMARK.md e JSONs publicados iguais byte a byte |
| Sondagens de contrato | 9 requisições sintéticas assinadas sob a raiz de teste |

A avaliação Grover reproduziu o cenário de 100 participantes honestos e 1.000 Sybils, com confiança final 0,9874 na afirmação verdadeira. A simulação de 3.000 afirmações reproduziu TPR 91,7%, FPR 7,3% e AUC 0,856. São resultados do modelo e da semente publicados, não medidas de resistência operacional de uma rede real.

Os golden vectors são gerados pela referência Python: concordância entre implementações não é um oráculo independente de verdade. O contador de ataques do relatório upstream também seleciona casos parcialmente pelo status observado; a expressão “32/32” não deve virar taxa geral de segurança. Há divergências Python/Rust documentadas fora do corpus, inclusive representação de floats e estados desconhecidos.

## Contratos comparados

| Dimensão | Gravit v0.6.0 inspecionado | Arkhe inspecionado | Consequência |
|---|---|---|---|
| Decisão | Classifica a justificação de um estado epistemológico. `SUCCESS` pode acompanhar uma alegação modesta e um estado inferior a Verified Fact. | ContainmentGate autoriza uma intenção segundo política, evidência admitida e provas aplicáveis. | Não mapear `SUCCESS` diretamente para `Allow`. |
| Raiz de confiança | Registro Ed25519 assinado por limiar majoritário; fixture usa 3 de 5 raízes. | PolicyResolver e mecanismos de admissão dependem de configuração confiável. | Ambas as integrações exigem distribuição, rotação e revogação de confiança. |
| Independência | Agrupa transitivamente operador ou proveniência compartilhados; metadados do registro não provam ausência de conluio. | O kernel não é um mecanismo universal de consenso entre instituições. | Não importar a contagem de fontes como prova de independência real. |
| Conteúdo | Assinatura vincula artifact_id e campos do registro; integrity_hash é tratado por presença nas restrições de alto impacto, sem recomputar o artefato. | Admissão e gate verificam vínculos de evidência, digest do WER, relatório e saída/parâmetros. | Recalcular o digest do conteúdo e ligá-lo ao sujeito e aos parâmetros Arkhe. |
| Confiança numérica | Theta é declaração assinada do produtor, não calibração medida automaticamente. | Confidence no WER não concede permissão por si. | Não converter theta em autoridade ou probabilidade garantida. |
| Tempo | Sem política explícita basta timestamp não vazio; quando há freshness, evaluation_time vem do chamador. | Perfis temporais também precisam de origem de tempo confiável. | Política e relógio devem pertencer ao domínio confiável do Arkhe. |
| Identidade | decision_id é SHA3-256 truncado a 16 hex do DecisionRecord sem o próprio ID. Não compromete toda a requisição. | AKG-CBOR-v1 e BLAKE3-256 com domínio; authorization_ref liga intenção, política, WER e provas aplicáveis. OperationId v2 exclui parâmetros, vinculados separadamente no journal. | Preservar IDs externos e criar compromisso completo próprio; não reinterpretar decision_id como Digest32. |
| Histórico | Avaliação sem estado, sem acompanhar automaticamente a degradação posterior. | Journal/WormGraph oferecem vínculos de histórico; validade continua dependente das regras aplicáveis. | Definir replay, expiração e reavaliação explicitamente. |
| Evidência negativa | Resultado false assinado bloqueia Verified Fact; chaves inválidas ou revogadas são excluídas e o restante pode bastar. | Admissão e autorização seguem o perfil de política. | Definir tratamento de exclusões e contradições sem permitir DoS por registros inválidos injetados. |
| E02 M3/M20 | Verified Fact é um rótulo específico do Gravit. | A verificação E02 demonstra inclusão/consistência; não autentica RPC ou verdade da origem. | Os rótulos não são equivalentes. |

Referências locais inspecionadas: `kernel/arkhe-kernel/src/lib.rs` (`authorize_admitted_inner`, `authorize_checked_with_proof`), `kernel/arkhe-core/src/{canonical,worker,work}.rs`; no clone fixado, `gravit_verifier/{kernel,registry}.py` e `CONFORMANCE.md`. Esta tarefa não reexecutou a suite do Arkhe nem alterou o kernel.

## Sondagens que delimitam a integração

1. A base assinada alcançou Verified Fact. Sem registro confiável, foi degradada.
2. Um integrity_hash não vazio e sem formato de digest ainda permitiu Verified Fact em alto impacto. Isso confirma a limitação declarada de checagem por presença.
3. Timestamp malformado passou sem freshness; a política temporal explícita o degradou.
4. Evidência antiga foi degradada com evaluation_time de 24/10, mas voltou a Verified Fact quando o chamador recuou o relógio para setembro.
5. Dois conjuntos com integrity_hash distintos e assinaturas refeitas produziram o mesmo DecisionRecord e decision_id `5d6748ea7b8b43d5`. Não é uma colisão criptográfica: a entrada efetivamente resumida pelo ID, o registro de decisão, permaneceu igual.

As requisições e respostas completas estão em `contract-probes.json`. São testes locais com chaves públicas, sem alegação de ataque a uma implantação operacional.

## Contrato mínimo antes de implementar o adaptador

- Tratar a avaliação como evidência externa e manter ContainmentGate como autoridade final.
- Fixar versão, perfil, digest do registro e raiz, com distribuição e revogação confiáveis.
- Exigir digest recomputado do artefato e vínculo com sujeito, intenção e parâmetros; comprometer requisição e resposta completas em domínio Arkhe próprio.
- Preservar bytes assinados e proveniência, sem reformatar floats no caminho de assinatura.
- Exigir freshness e relógio confiáveis; obter nível de impacto da política Arkhe.
- Especificar estados aceitos, contradições, exclusões, expiração e replay; testar cada tradução antes de habilitar operações protegidas.

## Artefatos e execução

[Resultados e logs](evidence/2026-10-24-gravit-review/README.md). O harness é `scripts/gravit_review_container.py`. A execução do verificador ocorreu em contêiner sem rede, raiz somente leitura, UID 10001, capabilities removidas e no-new-privileges. Somente o diretório dedicado de evidências foi montado; fontes públicas e dependências foram provisionadas na imagem antes do teste. Não foram usados segredos ou bancos do Arkhe.

A primeira execução concluiu os testes, mas falhou ao copiar metadados para o volume Windows. O harness foi corrigido para exportar bytes, e a segunda execução terminou com código 0 e status PASS. Tentativas e logs anteriores foram preservados; não foram ocultados como sucesso.
