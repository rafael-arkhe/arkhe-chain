# Pré-triagem estruturada: Assessment e ReviewDecision

Implementada `OllamaAnalyzer::recommend_for_review`, retornando `ReviewRecommendation`: digest do relatório, digest dos parâmetros/classificação, versão do modelo vinculada ao digest, Assessment validado, sinais usados e ReviewDecision calculado deterministicamente pelo ReviewRouter.

A API chama inferência e valida o schema, mas não chama o attestor, não admite WER, não reserva operação no journal, não enfileira caso e não executa ação HackenProof. O cliente escolhe explicitamente o fluxo revisado existente para enfileirar e obter autorização. A recomendação serializada permanece dado não confiável; não deve ser consumida como autorização ou evidência admitida.

## Autoridade e composição

O modelo só fornece supports_proposal, reason e confidence_bps. Campos adicionais, inclusive decision, são rejeitados pelo schema/tipo. O host controla a política, severidade proposta e sinais de ambiguidade, divergência, exceção e irreversibilidade. Confiança e suporte são substituídos pelo Assessment validado, evitando overrides pelo chamador. Sinais desconhecidos permanecem desconhecidos.

ReviewDecision é saída do router, não entrada livre produzida pelo LLM. A confiança do modelo é autorrelatada, não probabilidade calibrada. High/Critical exigem revisão mesmo com confiança 10000 e política de automação habilitada. O fluxo revisado exige também a revisão humana admitida e governança; AutoAccept isolado nunca autoriza escrita.

A API não fabrica PoCs ou resultados Slither/Aderyn nem trata três opiniões como validação independente. Verificadores determinísticos futuros precisam validar artefato, escopo, versão e resultado, com proveniência antes de influenciar o gate. Prova ZK atesta uma proposição de um programa/circuito e seus inputs sob pressupostos do verificador; não substitui automaticamente a política ou comprova correção geral da análise textual. RISC Zero/zkpoex não estão integrados.

## Estado das lacunas do anexo

ReviewRouter, ReviewDecision, fila, política conservadora e execução revisada já existiam. Esta mudança expõe o par Assessment + decisão numa API de recomendação, sem mover autoridade para o modelo. Os quatro negativos reais com Ollama/PostgreSQL foram executados na rodada anterior em `docs/evidence/local/2026-10-18/web3-local-requalification/`; a rodada atual registra nova qualificação contra a fonte alterada em diretório próprio.

Rate limits por protocolo/tenant, disclosure window e multisig para emergency stop continuam pendentes. A flag emergency_stop existe, mas não é descrita como multisig. Nenhuma janela arbitrária de 90 dias foi aplicada. Suas políticas exigem escopo, relógio e estado compartilhado definidos antes de uma integração durável. O journal não substitui rate limiting.

Não foram verificadas as alegações bibliográficas do anexo, nem reutilizados seus benchmarks como medida de qualidade do modelo local. Não há evidência de redução de falsos positivos pela mudança. Nenhum humano foi simulado como revisor. Produção continua não autorizada.

## Verificação

Testes adicionados em `integration/arkhe-bugbounty/tests/ollama.rs`: High/Critical com confiança máxima continuam em ReviewRequired e nunca acionam o attestor; sinais desconhecidos, divergência/exceção e irreversibilidade são preservados; suporte/confiança vêm do modelo validado; tentativa de injetar decision no JSON é rejeitada. O servidor Ollama desses testes é fixture HTTP, não prova de inferência real. A qualificação real é registrada separadamente.

Resultados e hashes de fonte: `docs/evidence/local/2026-10-18/review-recommendation/RESULTS.md`.

Resultado local: 87 testes do workspace passaram; formatação e arquitetura passaram. O teste integrado com uma inferência real de Ollama e PostgreSQL passou (incluindo INV-WER-06/07, idempotência e parameter mismatch); a verificação posterior das assinaturas e do grafo após reconexão também passou sem inferência adicional. Os cinco comandos registrados preservaram o hash de fonte antes/depois. A nova API recommend_for_review foi coberta por fixtures HTTP; a inferência real exercitou o fluxo integrado existente, não essa API nova. Chaves e governança da qualificação são de teste e upstream HackenProof foi simulado.
