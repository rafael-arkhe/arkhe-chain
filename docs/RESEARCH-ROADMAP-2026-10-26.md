# Roadmap revisado a partir da pesquisa de 2026

Revisão de 26/10/2026. [Auditoria de fontes](audits/2026-10-26-research-and-envelope-audit.md).
F0–F6 abaixo preserva os nomes do texto recebido como proposta de trabalho;
a atribuição a um paper Zenodo não foi confirmada. O roadmap cognitivo vigente
continua [C0–C8](ROADMAP.md), e o backlog continua [rastreado por item](backlog/BACKLOG.md).

## Próximos passos e critérios de aceite

| Prioridade | Trabalho | Estado local / dependências | Aceite restante |
|---|---|---|---|
| P0-A | Revisão externa LEX-ASCII-1 | Pacote com 75 casos e grader já existentes. Pode ocorrer em paralelo às demais frentes. | Terceiro revisor sem acesso prévio declarado, fonte/manifest/JSONL e crítica conceitual; checagem humana da independência; divergência preservada e perfil revisado/versionado. Não basta 75/75 para confiar semanticamente. |
| P0-B | Token cap de entrada+saída | Novo backend opt-in GGUF local: tokenizer exato, reserva anterior à inferência, limite positivo de saída, medição e rejeição no fim. Ollama permanece POSTCHECK_ONLY e é recusado no modo estrito. | Instalar/selecionar runtime e pesos locais aprovados, fixar versão/digest e executar ensaio real com prompt acima do orçamento, limite exato, overrun e timeout. Não declarar ativação com base em mocks. |
| P0-C | Autenticidade do WER | Novo signer e verifier Ed25519 sobre domínio + canonical CBOR, vinculando WorkIntent. Chaves de worker e log fornecidas pelo operador e fixadas por política externa. | Custódia/rotação/revogação operacional e revisão do runtime; autenticar entradas/provedor separadamente. Assinatura do host não é atestação de pesos nem prova formal da resposta. |
| P0-D | Inclusão persistente | Journal local com fsync, checkpoints assinados e prova de posição no perfil MMR existente; verificador offline exige trust externo e limites. | Para produção: store transacional/WORM, checkpoint testemunhado externamente, piso de continuidade retido fora do host, recuperação auditada e testes de falha do ambiente. Tempo do signer não é hora certificada. |

O pacote externo disponível é `output/citation-external-review-20261026/external-review.zip`;
distribuir somente esse ZIP ao revisor cego, não `private/` nem o checkout.
Nenhum contato externo foi feito como parte desta revisão.

## Fases reconciliadas

| Fase proposta | Diagnóstico | Entrega verificável e dependências |
|---|---|---|
| F0–F2 — núcleo/infraestrutura | PARCIAL POR PERFIL, não conclusão global. Há gates, vetores e MMR; o ritual tem seu próprio escopo experimental. | Fixar inventário de versões, invariantes e fronteiras; executar testes por perfil com evidências, sem somar testes de workspaces distintos como uma certificação única. |
| F3 — dados governados | Não há aceite global demonstrado de “aia v2 + 21 fixes + 14 invariantes” nesta auditoria. Sistemas AEGIS locais devem ser reconciliados por arquivo/versão, não por nome. | Especificar quatro gates e 14 invariantes nominalmente; enforcement no caminho real de escrita, rejeição de bypass, política AEGIS autenticada, journal e testes de concorrência/replay. Depende do envelope mínimo operacional, não de F5 inteira. |
| F4 — cognição/memória/aprendizagem | Existem implementações de referência; generalidade, replay exato e topologia de 51 agentes não demonstrados. | Harness congelado com baselines, held-out e contaminação documentada; replay determinístico em domínio delimitado; proposta/shadow/rollback; medição independente de qualidade, custo e regressão. Nenhum treino ou expansão de autoridade automático. |
| F5 — evidência/proveniência | Infraestrutura já existe em partes; nova fatia local cobre retrieval WER. É transversal desde F0. | Hash/sign/anchor por artefato e versão, política de quórum, certificados verificáveis offline e critérios explícitos de confiança/tempo. Model Provenance Certificate e BRICS só avançam após contrato de dados e proveniência; orquestração não atesta treino que não ocorreu. |
| F6 — verificação formal | Não se torna completa por adicionar Lean/TLA+/Kani ao roadmap. Há checker aritmético limitado; demais trilhos exigem artefatos e execução próprios. | Mapear propriedade→modelo→harness→resultado; delimitar hipóteses; provar orçamento/admissão e concorrência cedo. Lean para propriedades matemáticas, TLA+ para protocolos e Kani/Verus para Rust conforme viabilidade do toolchain. Gates nomeados e executados por plataforma, sem PASS por arquivo existente. |

## Ordem de dependências corrigida

1. Definir contratos, trust roots, orçamento e ameaça do perfil escolhido.
2. Implementar e testar o envelope mínimo (P0-B/C/D); revisão externa P0-A em paralelo.
3. Usar esse envelope em cada entrega de dados/cognição, com validação por domínio.
4. Ampliar proveniência/quórum e provas formais à medida que cada contrato estabiliza.
5. Reproduzir os experimentos fora do time e qualificar operação antes de produção.

F3 depender de F5 completa, enquanto F5 depende de todos os artefatos F3/F4, cria
um ciclo. A correção é separar infraestrutura mínima de evidência e cobertura
progressiva de artefatos. Verificação formal também deve influenciar contratos
iniciais, em vez de aparecer apenas depois de toda a implementação.

## Condição de encerramento

Cada item deve registrar separadamente IMPLEMENTADO, TESTADO_LOCALMENTE,
EXECUTADO_COM_MODELO_REAL, REVISADO_EXTERNAMENTE e QUALIFICADO_PARA_PRODUÇÃO.
Não substituir esses estados por “AGI provada”. Nesta entrega a independência
organizacional e a operação real do novo backend estrito continuam pendentes.
