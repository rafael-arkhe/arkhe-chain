# Flock e Arkhe — nota de pesquisa e texto para pitch

Data de revisão: 19/10/2026. Estado: RESEARCH_CANDIDATE / NOT_REPRODUCED.
O texto fornecido pelo usuário foi tratado como referência para revisão.
Nenhuma alteração em chaves, derivação de identidade, DID, perfis MMR, carteira,
dependências Cargo ou protocolos de liquidação foi realizada.

## Correções para o material

| Afirmação proposta | Formulação sustentada |
| --- | --- |
| “Isso valida matematicamente nossa tese de L2” | A pesquisa motiva investigar agregação; não prova disponibilidade de dados, sequenciamento, resistência a censura ou liquidação do Arkhe |
| “WormGraph já agrega provas SNARK tradicionais” | O E01 agregou compromissos em MMR e ancorou raízes; não demonstrou agregação de SNARKs |
| “Verificação em L1 em 64 ms” | O artigo reporta tempo de verificação do seu benchmark; execução e custo de um verificador na Solana não foram demonstrados para o Arkhe |
| “Seed de 256 bits torna Ed25519 recuperável após quebra” | Derivação determinística não altera a segurança do algoritmo de assinatura nem cria autoridade de recuperação reconhecida pela rede |
| “SHA-256 substitui o hash do E01” | O perfil MMR v1 do Arkhe usa BLAKE3-256; uma substituição exige outro perfil, vetores e migração, sem reutilizar a aprovação anterior |
| “Identidade E01 tem chave em hardware/TEE” | O ensaio usou carteira Ed25519 protegida em repouso por DPAPI; TEE/custódia atestada não foram demonstrados |

A recuperação descrita no artigo é específica para notas com derivação
compatível, verificador de recuperação e congelamento anterior à quebra do
verificador antigo. Não é mecanismo genérico de recuperação de contas Solana.
O artigo também distingue o pool novo sobre SHA-256 da recuperação legada,
que mantém hipóteses adicionais, incluindo a árvore MiMC.
[Proposta original](https://ethresear.ch/t/faster-aggregatable-and-quantum-safe-privacy-pools/26163).

**Inferência arquitetural:** provar conhecimento de uma seed só transfere
autoridade se um contrato/protocolo de recuperação previamente definido
reconhecer essa prova, com vínculo ao estado/identidade, prevenção de replay,
revogação e regras de conflito. Um atacante capaz de obter a chave clássica
não precisa obter a seed para usar essa chave. Nitro não corrige essa distinção.
A migração requer algoritmos, protocolos e políticas apropriados, além da
proteção da seed. [Referência de migração NIST](https://pages.nist.gov/nccoe-migration-post-quantum-cryptography/).

## Distinção entre resultados

O post relata 28,6 ms para prova de profundidade 32 e, para 128 retiradas,
87,6 s de agregação, prova de 343,9 KiB e verificação de 64 ms. São números dos
autores, não resultados locais, garantias de custo on-chain ou prova de que o
mesmo desenho é ótimo para o Arkhe. “28×” compara duas construções daquele
experimento, não o Flock com o WormGraph.
[Benchmarks publicados](https://ethresear.ch/t/faster-aggregatable-and-quantum-safe-privacy-pools/26163).

O upstream contém implementação Rust para computações booleanas em lote e
recursão; README e código precisam ser fixados por commit antes de reprodução.
Compatibilidade com WASM, recursos de um programa Solana e propriedade de
zero-knowledge da configuração selecionada precisam de avaliação específica.
Não inferir confidencialidade apenas do rótulo SNARK.
[Upstream Flock](https://github.com/succinctlabs/flock).

Evidência local separada: `docs/evidence/2026-10-19T162055Z-e01-funded-matrix-v3/REPORT.md`.
O E01 tem 90/90 ancoragens sintéticas observadas por dois operadores RPC e um
ensaio separado de recuperação de descarte local. Isso não demonstra L2,
segurança pós-quântica de ponta a ponta, TEE ou execução financeira autorizada.

## Parágrafo em inglês para one-pager

> Arkhe has demonstrated devnet anchoring of synthetic MMR commitments, with
> 90 of 90 transactions finalized and matched across two RPC operators, plus
> a separate controlled-loss recovery test. Our research roadmap evaluates
> whether binary-field proof systems such as Flock can support verifiable
> aggregation of explicitly defined evidence statements. This capability is
> not yet implemented or benchmarked in Arkhe. Post-quantum identity recovery,
> enclave-backed custody and on-chain proof verification remain separate
> research and engineering milestones, requiring dedicated protocols and
> validation before production claims.

O parágrafo é redação proposta para revisão, não material publicado ou enviado
a investidores. Não usar “Quantum-Recoverable Sovereign AI Identity” como
capacidade atual do produto.

## Próximo experimento, caso priorizado

1. Fixar commit, licença, parâmetros de segurança, hardware e toolchain fora
   do workspace principal, preservando o perfil MMR e a coorte C01.
2. Definir a propriedade exata: por exemplo, inclusão e vinculação de entradas
   a uma raiz/perfil, sem confundir isso com decisão autorizada ou atestação TEE.
3. Reproduzir baseline e alternativa stepwise sob os mesmos recursos; registrar
   todos os resultados, memória, tamanho da prova, geração e verificação.
4. Incluir adulteração de raiz, entrada, ordem, quantidade, domínio, vínculo
   entre passos, política e transcript, conforme a propriedade selecionada.
5. Avaliar separadamente verificação nativa, portabilidade WASM e custo/limites
   on-chain. Publicar resultados próprios antes de alterar o material comercial.

Este roteiro permanece NOT_RUN. A nota não altera a prioridade do ensaio de
onboarding, não instala dependências e não torna o Arkhe pós-quântico.
