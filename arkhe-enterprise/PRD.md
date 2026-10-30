# Arkhe Enterprise — requisitos do produto

Versão: 1.0. Data: 2026-10-23. Escopo: uma organização por instalação, SQLite e Fase 0 de representação. Estado operacional: piloto externo pendente. [MATURITY.md](MATURITY.md) é a referência de maturidade; [VALIDATION.md](VALIDATION.md) registra as evidências e seus limites.

## Produto e problema

O portal autenticado organiza documentos, assinaturas e evidências verificáveis, adapta sua apresentação ao departamento e permite configurar um perfil setorial por instalação. Reutiliza o fluxo documental, RBAC, verificador WASM e exportações existentes do Arkhe.

A proposta comercial é permitir que terceiros verifiquem integridade e assinaturas a partir dos artefatos e das raízes de confiança adequadas. Um hash ou checkpoint local não demonstra, sozinho, anterioridade perante terceiros, identidade civil, poderes legais ou legalidade do conteúdo. O recibo local da representação não contém timestamp externo. A verificação offline depende de artefatos exportados e material de confiança; não significa que o portal inteiro funcione offline.

## Público e hipóteses comerciais

Segmentos a validar: agronegócio exportador, saúde, jurídico, financeiro, construção e setor público. Compliance/DPO e gerência de exportação são possíveis patrocinadores; CFO/COO, compradores econômicos; engenharia, avaliadora técnica; jurídico e procurement, responsáveis pela diligência. Nenhuma entrevista, contrato ou prioridade validada de cliente é inferida dessa lista. Prazos legais, sanções e retenções exigem validação específica antes de publicação comercial; presets não são parecer jurídico.

## Requisitos e aceite atual

| Requisito | Estado e aceite |
| --- | --- |
| Autenticação e documentos | Reutilizar sessão local e papéis author/reviewer/owner; leituras filtradas no servidor |
| Apresentação | Oito personas, doze setores e generic; mudar persona não amplia acesso |
| Onboarding | Owner gera preview normalizado de 15 minutos; CNPJ numérico/alfanumérico; CNAE sugere, seleção manual prevalece |
| Perfil | Commit único e imutável; consulta Serpro de produção coincidente e representação permitida; concorrência A+B resulta em 201/409 |
| Representação interna | SelfDeclared apenas em generic com fase internal explícita, anexos por hash e assinatura da conta verificada pelo Rust |
| Resiliência | Retry limitado de aquisição SQLite, índices direcionados, backoff/circuito Serpro, readiness, drain e preview idempotente |
| Empacotamento | Standalone Linux validado no Podman rootless, usuário node e raiz somente leitura; volume preserva dados |

Evidências locais existentes: 72 testes da aplicação, 235 Python, dois testes Rust do binário, TypeScript e build Linux; browser do piloto com 13 capturas/8 verificações e revisão standalone de resiliência com três capturas/8 verificações. São execuções distintas, descritas em [VALIDATION.md](VALIDATION.md); não benchmark nem certificação.

## Fora do escopo atual

Multi-tenancy, sharding, Redis, novas filas e substituição do ERP não são entregas desta fase. Nenhum token é raiz de confiança. RBB, HSM, TSA/ICP-Brasil, poderes externos verificados e enforcement de retenção/quotas não são capacidades operacionais demonstradas. A integração Rekor existente exige configuração e recibo verificável; não é fallback para liberar commit cadastral.

## Pendências de liberação

Contrato/habilitação Serpro **não confirmados**; consulta real e orçamento pendentes. Sem Serpro válido o commit permanece bloqueado: BrasilAPI não satisfaz esse gate. Procuração/e-CNPJ/QSA não possuem verificadores operacionais neste fluxo. O piloto externo exige os critérios de [PROCUREMENT.md](PROCUREMENT.md) e [REPRESENTATION-POLICY.md](REPRESENTATION-POLICY.md), incluindo poderes e escopo do ato. TLS/proxy, CI remoto e deploy público permanecem pendentes.

## Metas propostas, ainda não medidas

| Meta | Hipótese para validação |
| --- | --- |
| Tempo de prova | Menos de 10 s; definir operação e condições antes do benchmark |
| Verificação válida | Mais de 99%; definir corpus, denominador e falhas esperadas |
| Onboarding | Menos de 15 min, excluindo contratação e diligência externa |
| Piloto pago | Pelo menos um no primeiro trimestre de 2027; objetivo, não contrato |
| Custo por documento | Menos de R$ 0,50; sem apuração atual nem tarifa Serpro confirmada |

Hipóteses de preço do anexo: Starter R$ 500–2.000/mês, Growth R$ 0,30/documento e Enterprise R$ 50 mil–500 mil/ano. Não são ofertas, planos ativados, benchmarks de custo ou receita. Growth multi-tenant está fora do escopo. Internal designa a demonstração local; não implica serviços externos gratuitos.

Speedrun: preparar versão para submissão **depois dos requisitos do piloto**, conforme decisão já tomada. Nenhuma submissão ou contato ACIEG foi realizado.


## Operação do piloto — complemento

Métricas internas protegidas, logs HTTP JSON, verificação de integridade inicial e snapshot/restore possuem implementação e validação local. TLS localhost com Caddy foi exercitado separadamente; o template público não equivale a certificado público emitido. Backup diário/off-host, retenção, limites de recursos e responsáveis de operação exigem configuração e aceite. [Runbook](RUNBOOK.md) e [revisão de infraestrutura](INFRASTRUCTURE-REVIEW.md) definem os limites; não substituem os bloqueadores de cadastro/representação.
