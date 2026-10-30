# Arkhe Enterprise — design implementado

Versão: 1.0. Data: 2026-10-23. Direção: interface sóbria para evidências e governança. Protótipos em [stitch_arkhe_enterprise_verification_platform](stitch_arkhe_enterprise_verification_platform/) são referência visual, não evidência de recursos operacionais. Esta especificação descreve o CSS e componentes existentes; não introduz redesign.

## Paleta e tipografia reais

Fonte: [enterprise.css](../apps/arkhe-intra/app/enterprise.css), escopo `.enterprise`. O shell global tem paleta própria em [globals.css](../apps/arkhe-intra/app/globals.css).

| Token | Valor | Uso |
| --- | --- | --- |
| --ent-bg | #0f131c | Fundo |
| --ent-card | #181d26 | Cards |
| --ent-line | #2c3542 | Bordas |
| --ent-text | #dfe6f0 | Texto |
| --ent-muted | #9aa9ba | Texto secundário |
| --ent-cyan | #4cd7f6 | Ações, links, foco |

Títulos declaram Inter com fallback de sistema; isso não garante Inter instalada ou distribuída. H1 tem 30 px, H2 17 px e H3 15 px na regra base; regras responsivas podem alterar esses valores. Hashes e metadados usam `ui-monospace, monospace`; JetBrains Mono não é dependência confirmada. Preservar legibilidade dos hashes e explicitar truncamento quando utilizado.

A cor não pode ser a única informação de estado. Erros devem explicar falha e recuperação; pendências e ausência de verificação não devem se apresentar como reprovação ou aprovação jurídica. A paleta alternativa do anexo é proposta, não os tokens em execução. Não há mascote no portal.

## Inventário real

| Componente/fonte | Responsabilidade |
| --- | --- |
| [EnterpriseProvider, useEnterprise, useVocabulary](../apps/arkhe-intra/components/enterprise-context.tsx) | Contexto, navegação, seletor e preferências; React Query |
| [enterprise-dashboard.tsx](../apps/arkhe-intra/components/enterprise-dashboard.tsx) | Dados autorizados, inspeção e estados documentais |
| [enterprise-persona-focus.tsx](../apps/arkhe-intra/components/enterprise-persona-focus.tsx) | Focos por departamento |
| [enterprise-onboarding.tsx](../apps/arkhe-intra/components/enterprise-onboarding.tsx) | Seis passos, preview, confirmação e mensagens de bloqueio |
| [enterprise-representation.tsx](../apps/arkhe-intra/components/enterprise-representation.tsx) | Anexos por hash, assinatura local e limites da declaração |
| [enterprise-catalog.mjs](../apps/arkhe-intra/lib/enterprise-catalog.mjs) | Vocabulário, setores e sugestões CNAE |

Não há pacote `packages/portal-core` nesta integração nem componentes públicos chamados Widget, Vocab ou CommitGate. As funções visuais correspondentes estão compostas nos arquivos acima. Um indicador visual de saúde seria uma nova proposta; os endpoints operacionais já existem.

## Vocabulário por persona

O catálogo é a fonte executável. Exemplos atuais:

| Persona | mmr.root | mmr.proof |
| --- | --- | --- |
| Jurídico | Selo de integridade | Cadeia de custódia |
| Financeiro | Raiz de reconciliação | Prova de reconciliação |
| Compliance | Compromisso de integridade | Prova de inclusão |
| Engenharia | MMR root | MMR inclusion proof |
| Operações | Checkpoint de integridade | Prova do registro |
| Executivo | Compromisso de integridade | Evidência de inclusão |
| Auditoria | Raiz de integridade | Prova de inclusão |
| RH / PI | Selo de integridade | Cadeia de contribuição |

Vocabulário não cria capacidade: “Registro na RBB” no catálogo não demonstra RBB configurada, “preferência de exportação” não implementa esse formato e “cadeia de custódia” não certifica poderes ou data externa. A UI deve mostrar limites e resultados reais. A API decide acesso pelo papel, independentemente da persona.

## Estados e acessibilidade

O provider implementa carregamento, erro com retry e falha de mutação; o dashboard tem estado vazio e inspeção; o onboarding mostra preview expirável, validação, busy e bloqueio de commit. Banners offline/stale globais e funcionamento offline do portal completo não foram demonstrados e não são descritos como entregues.

Meta: WCAG 2.2 AA. Evidência atual: inspeções pontuais de rótulos, foco, diálogo e Escape, além de ausência de pageerrors e overflow nos cenários testados. Não houve auditoria completa de contraste, navegação por teclado ou certificação WCAG; não afirmar que todos os pares atingem 4,5:1.

Desktop 1440×1000 e mobile 390×844 constam no [relatório do piloto](validation/2026-10-23/pilot/browser-report.json). A navegação interna possui rolagem horizontal intencional no mobile. Capturas são evidência de estados e dimensões concretos, não de todos os dispositivos. A revisão [standalone de resiliência](validation/2026-10-23/resilience-standalone/container-report.json) valida separadamente as três rotas em Linux.
