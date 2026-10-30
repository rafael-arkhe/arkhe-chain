# OpenZeppelin Stellar v0.8.0: verificação, texto revisado e implicações para o Arkhe

Verificado em 22 de outubro de 2026. Escopo: fontes oficiais, documentação fixada na tag v0.8.0 e inspeção estática do workspace D:\arkhe. Não foram executados contratos, provas, transações ou testes de segurança. As recomendações abaixo não alteram a política vigente do Arkhe.

## 1. Resultado da verificação

O texto original reproduz corretamente muitos detalhes do release, mas exagera as garantias de privacidade e a urgência universal de migração. A principal informação omitida está no próprio README do pacote confidencial: o backend da versão usa UltraHonk **non-zk**.

| Afirmação original | Resultado e correção |
|---|---|
| Privacidade de nível de protocolo | Imprecisa. É uma suíte de contratos Soroban que envolve um token SEP-41 existente; não é uma alteração do protocolo de consenso nem uma extensão do padrão SEP-41. [S2, S3] |
| Pedersen/Grumpkin, UltraHonk, ECDH, registries e circuitos Noir | Confirmados. A existência dos componentes não estabelece, isoladamente, confidencialidade do sistema completo. [S2, S3] |
| Saldos e transferências privadas | Precisa de ressalva decisiva: endereços continuam públicos; depósitos e retiradas expõem valores; a confidencialidade do witness nas provas non-zk não foi estabelecida. [S2, S3] |
| Compose, extensões combináveis, TotalSupply opt-in e Capped | Confirmados nas notas. A garantia de composição não impede que o integrador chame primitivas inadequadas diretamente. [S1] |
| Sete módulos T-REX, batch, muxed addresses e mint pause | Confirmados nas notas. Implementar regras de elegibilidade e transferência não constitui certificação regulatória. [S1] |
| Mudanças em Vault e Smart Accounts | Confirmadas. A documentação de contas detalha também configurações de delegação que o integrador deve evitar. [S1, S4] |
| Migração imediata de qualquer projeto em produção | Não sustentada. Breaking changes exigem adaptação dos consumidores afetados ao atualizar; não obrigam todo projeto a atualizar imediatamente. Riscos de uma versão já implantada exigem avaliação separada. [S1] |
| Auditoria Certora com 44 achados | Não confirmada nas fontes primárias consultadas. O relatório específico disponível na tag v0.8.0 é da OpenZeppelin e registra 12 achados. Não atribuir esse relatório à Certora. [S6] |
| Release sem estado de auditoria conhecido | Corrigir: há relatório específico, mas seu escopo é delimitado por snapshots; isso não equivale a qualificação irrestrita do release ou de uma aplicação integrada. [S6] |
| Bounty máximo de US$ 25 mil | Confirmado: teto individual; o programa informa teto agregado de US$ 250 mil, regras de elegibilidade e escopo nos packages do último release. [S7, S8] |
| Código e chaves públicos tornam a confiança verificável | Reformular: permitem inspeção e reprodução, mas dependem de circuitos, backend, parâmetros, governança das chaves, build e implantação corretos. [S2] |

### O ponto crítico: non-zk não equivale a zero knowledge

O README fixado na tag informa que o verificador não suporta a variante zk e que a geração omite `bb prove --zk`. Registra uma mitigação para um canal de vazamento em lookups, mas ressalva que isso não torna as provas privadas. Há também uma hipótese de segurança por logaritmo discreto em BN254, estimada ali em aproximadamente 100 bits. Portanto, a comunicação deve separar integridade da prova, ocultação dos compromissos e confidencialidade do witness. [S2]

A documentação introdutória ainda usa a expressão zero-knowledge proofs. Para avaliar a implementação concreta, a seção específica sobre o backend e suas limitações é a evidência mais relevante. [S2, S3]

### Auditoria: o que foi efetivamente encontrado

O PDF da tag, intitulado *Stellar Contracts RC v0.8.0 Audit*, datado de 20/10/2026, declara auditoria diferencial realizada pela OpenZeppelin. O resumo registra 12 achados: dois médios, seis baixos, uma nota e três reportados pelo cliente; informa nove resolvidos e um parcialmente resolvido. As páginas 4–7 delimitam os arquivos e intervalos de commits. [S6]

O achado CR-03 descreve vazamento de valores e recuperação de chave usando provas públicas anteriores à correção. Está marcado como resolvido pelo PR #945, commit `062e5ef`, mas a recomendação explicita que fechar esse canal não garante zero knowledge. A recuperação dessa chave, por si só, não contorna `require_auth`. Não apresentar o ataque histórico como vulnerabilidade demonstrada contra a versão corrigida. [S6, pp. 22–23]

O relatório também deixa condições e riscos residuais documentados; por exemplo, L-03 aparece como reconhecido para resolução posterior e L-04 como parcialmente resolvido. A conclusão menciona linhas 0.8.1/0.9.0, apesar do título v0.8.0. Essa inconsistência editorial reforça a necessidade de vincular qualquer declaração de cobertura aos snapshots e correções descritos, em vez de inferir cobertura integral apenas pelo nome do PDF. [S6]

As referências L/N nas notas de release confirmam trabalho de auditoria, mas identificadores não são únicos entre relatórios. Não os tratar como prova de uma única auditoria Certora ou de ausência de pendências.

## 2. Texto revisado para uso

**A OpenZeppelin Stellar Contracts v0.8.0 amplia a composição de tokens, contas inteligentes e controles para RWA, e introduz o pacote Confidential Token.**

A suíte confidencial envolve ativos SEP-41 em contratos Soroban, com compromissos Pedersen, circuitos Noir e verificação UltraHonk. Endereços permanecem públicos e depósitos e retiradas revelam valores. A implementação desta versão usa provas non-zk: embora um canal conhecido de vazamento tenha sido mitigado, não há garantia estabelecida de confidencialidade integral das provas. [S2, S3]

O release acrescenta sete módulos de compliance T-REX e refina composição, vaults e contas. A atualização de consumidores afetados requer revisar assinatura de contas, migração do supply, despacho de mint, hooks de RWA, códigos de erro e tratamento de NFTs. Isso exige um plano de migração, sem implicar obrigação universal de atualização imediata. [S1]

Existe auditoria diferencial da OpenZeppelin associada à versão, com escopo e pendências documentados. Não foi confirmada a atribuição de 44 achados à Certora. O repositório continua classificando o software como experimental. O bounty individual de até US$ 25 mil complementa a revisão de segurança, sem garantir segurança ou prontidão de produção. [S5–S8]

**A relevância é técnica:** a biblioteca oferece mecanismos para compor regras e operações sobre ativos, cuja segurança e adequação dependem da integração, da governança e das limitações criptográficas concretas.

## 3. Implicações para o Arkhe

### Situação observada

Nos manifests e lockfiles raiz examinados não encontrei dependências Stellar/Soroban/OpenZeppelin. A busca direcionada em fontes e configuração do núcleo também não identificou uma integração Stellar ativa. Isso não prova ausência em todo artefato histórico, serviço remoto ou repositório externo.

O workspace organiza proposta, evidência assinada, política, ContainmentGate e persistência. O verificador de orçamento é um checker aritmético independente; a documentação explicita que ele não é ZK nem executor de pagamentos. O PayBox constrói propostas Solana e não constitui integração Stellar. Fontes locais: [README](../README.md), [arquitetura](../docs/ARCHITECTURE.md), [budget](../docs/PROOF-CARRYING-BUDGET.md), [checker](../verification/crates/arkhe-verify-core/src/output_proof.rs), [PayBox](../plugins/paybox/README.md).

**Conclusão para este checkout: não há migração Stellar obrigatória identificada.** A oportunidade é uma extensão futura e delimitada, sem substituir as autoridades existentes.

### Oportunidades e limites

| Frente | Aplicação possível | Condição necessária |
|---|---|---|
| Contas inteligentes | Vincular operações financeiras a políticas e signatários explícitos | A autorização on-chain precisa proteger o efeito; um gate apenas off-chain pode ser contornado por outro caminho de assinatura |
| RWA | Registrar evidência de decisões de elegibilidade, restrições e mudanças administrativas | Definir emissores confiáveis, atualização/revogação de dados e regras aplicáveis; módulo de compliance não comprova verdade do cadastro |
| Confidencialidade | Pesquisa de divulgação seletiva ligada a ações e evidências | Não qualificar a v0.8.0 como base de sigilo forte enquanto as limitações non-zk permanecerem sem resolução verificada |
| Evidência | Relacionar proposta, autorização e resultado observado em Stellar | Diferenciar simulação, envio, inclusão e efeito confirmado; guardar rede, contrato, função, argumentos e política aprovados |
| Bug bounty | Usar o release e os relatórios como corpus para revisão Rust/Soroban | O módulo atual documenta fluxo de triagem HackenProof; suporte operacional a Immunefi não foi demonstrado pela leitura realizada |

Essas linhas são recomendações de arquitetura, não capacidades já implementadas.

### Ordem recomendada

1. **Agora:** incorporar as correções ao material técnico; preservar a distinção entre assinatura, inclusão, correção matemática, autorização e privacidade. O registro local de decisões já mantém provas privadas de política como pesquisa. [Registro de decisões](../docs/planning/2026-10-21-consolidated/CLAIMS-AND-DECISIONS.md)
2. **Primeiro piloto, se priorizado:** adapter somente de leitura para uma rede Stellar explicitamente identificada, com captura de evidência e contratos/versões fixados. Nenhuma autoridade de assinatura deve vir do modelo ou de metadados do provider.
3. **Depois:** PoC de autorização em ambiente local controlado, vinculando conta, rede, contrato, operação, parâmetros, expiração, replay e política. Verificar os caminhos de delegação e de mudança administrativa, além do caminho feliz.
4. **Critérios antes de efeitos financeiros:** revisão da integração e do código efetivamente implantado; impossibilidade de contornar a autorização; política de atualização das verification keys; operação de auditoria/recuperação; reconciliação de submissões incertas. Se houver promessa de sigilo, exigir backend ZK compatível e avaliação específica da propriedade de privacidade.

Para pesquisa de bounty, as regras consultadas proíbem testar código implantado em mainnet ou testnet pública e exigem testes em forks locais. Achados já documentados não são automaticamente novos reports elegíveis. [S7]

## 4. Fontes primárias

- **S1** — [Notas do release v0.8.0](https://github.com/OpenZeppelin/stellar-contracts/releases/tag/v0.8.0).
- **S2** — [README Confidential Token fixado em v0.8.0, especialmente Zero-knowledge setting](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.8.0/packages/confidential/README.md#zero-knowledge-setting).
- **S3** — [Especificação do protocolo, v0.8.0](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.8.0/packages/confidential/docs/protocol/README.md).
- **S4** — [Smart Accounts e migração, v0.8.0](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.8.0/packages/accounts/README.md).
- **S5** — [README raiz, aviso experimental e pinagem](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.8.0/README.md).
- **S6** — [Relatório de auditoria publicado na tag v0.8.0](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.8.0/audits/Stellar%20Contracts%20Library%20v0.8.0%20Audit.pdf). Cópia consultada: `D:\arkhe\tmp\oz-stellar-review\audit-v0.8.0.pdf`.
- **S7** — [Immunefi: informações e regras](https://immunefi.com/bug-bounty/openzeppelin-stellar/information/).
- **S8** — [Immunefi: escopo](https://immunefi.com/bug-bounty/openzeppelin-stellar/scope/).
- **S9** — [SDF: Developer Preview Confidential Tokens](https://stellar.org/blog/developers/developer-preview-confidential-tokens-on-stellar). Contexto histórico: a página descreve preview/testnet e auditorias em andamento; não substitui o estado específico da tag posterior.

Não foi localizado relatório primário Certora que comprove os 44 achados alegados; isso é ausência de confirmação nesta pesquisa, não demonstração de inexistência de qualquer trabalho da Certora.
