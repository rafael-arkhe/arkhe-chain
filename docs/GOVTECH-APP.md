# Arkhe GovTech — aplicação local

Aplicação integrada ao Next.js do Intra em `/govtech`, com identidade visual própria e banco isolado quando iniciada pelo launcher GovTech. Sem dependências adicionais ou novo workspace.

## Executar

Requer Node 24 e dependências já instaladas do workspace.

```powershell
pnpm dev:govtech
# Para produção local, após pnpm build:intra:
pnpm start:govtech
```

Endereço padrão: http://127.0.0.1:3012/govtech. Contas existentes são preservadas; na primeira execução são geradas contas author, reviewer e owner, com senhas aleatórias e chaves privadas Ed25519. Consulte `ops/local/govtech/credentials.json`; não publique esse diretório. Também é possível usar `/govtech` na instância Intra existente, com suas próprias contas e dados.

`ARKHE_GOVTECH_PORT` define a porta e `ARKHE_GOVTECH_DATA_DIR` o diretório privado. O launcher define a origem HTTP exata para proteção de alterações contra requisições de outra origem.

## Fluxo completo

1. Entre como author, abra Arkhe GovTech e crie um processo de despesa, licitação ou atendimento. Informe referência, justificativa, órgão, itens e SHA-256 da fonte. O arquivo-fonte é processado localmente; retenha seu original.
2. Envie o rascunho para revisão. O servidor valida itens inteiros em centavos, soma e alçada do órgão, além do compromisso da proposta.
3. Entre como reviewer ou outro owner, abra o processo e revise. Use a chave `.private.pem` da própria conta para assinar no navegador. O servidor confere identidade, assinatura, conteúdo e política. Não é permitido aprovar a própria proposta.
4. Entre como owner e execute no simulador. Recibo, journal e evento são gravados na mesma transação SQLite. Repetir a execução concluída não cria outro efeito. Mudança de política ou parada invalida a autorização antiga para despacho; o autor pode pedir nova revisão.
5. Exporte o pacote na tela do processo com reviewer/owner. O pacote contém o prefixo inteiro da cadeia compartilhada, inclusive eventos de outros processos; compartilhe somente com auditor autorizado. Retenha o checkpoint por canal independente.
6. Abra Verificar pacote ou `/govtech/offline.html`, selecione o JSON e informe o checkpoint independente. O verificador usa Web Crypto e não envia o pacote à API. A página independente pode ser salva como um único HTML e usada offline em navegador com Web Crypto/Ed25519.

## Módulos

- Visão geral: contagens derivadas dos dados reais e ciclo de confiança.
- Processos: cadastro, busca, filtros, detalhe, envio, assinatura, rejeição, execução e exportação.
- Políticas: alçada por órgão, limiar informativo e parada persistente. Revisão humana é obrigatória em todos os casos; o limiar não elimina essa exigência.
- Evidências: cadeia append-only de eventos e journal local, visíveis a revisão/governança.
- Conectividade: estado explícito de simuladores e integrações pendentes.
- Verificação: snapshot completo, cadeia, digest, aritmética e assinatura vinculados a checkpoint externo fornecido pelo auditor.

## Limites de autoridade

Este é um aplicativo funcional de validação local, para uma organização por instalação. Órgãos são escopos de trabalho e políticas, não tenants isolados. Authors veem suas próprias propostas; reviewer e owner veem todas. Owner também pode propor, mas não aprovar sua proposta.

O perfil `arkhe-govtech/local-evidence/v1` usa JSON versionado e SHA-256. É distinto dos WERs canônicos, PCO Rust e MMR do kernel. Não alegar herança automática das garantias desses componentes. O verificador confirma o snapshot contra o checkpoint informado; a confiança na identidade/papel do signatário exige cadastro e checkpoint previamente confiáveis.

Nenhuma credencial ou chave privada é enviada ao servidor pelo fluxo de revisão. Chaves geradas pelo setup ficam no diretório privado da instalação, como no Intra. A assinatura local não é e-CPF, cadeia ICP-Brasil ou mandato legal. O app não integra gov.br, SIAFE, SEI, e-GP, IND/Conecta, TEE, HSM ou criptografia pós-quântica. O simulador não executa pagamentos ou atos públicos. Triagem e atendimento são propostas estruturadas; não há análise automática de certidões ou assistente de IA conectado nessa versão.

SQLite WAL, transações IMMEDIATE, revisão otimista e restrições de unicidade protegem concorrência local. Não há promessa de exactly-once remoto, proteção contra administrador do host, alta disponibilidade ou certificação regulatória. Retenção, backups e custódia externa precisam de operação definida antes de piloto real.

## Verificação

```powershell
pnpm test:govtech
pnpm --filter @arkhe/intra typecheck
pnpm build:intra
```

Testes usam banco e contas temporários: autenticação, CSRF, papéis, autoaprovação, assinatura, alçada, atualização de política, parada, replay, persistência em conexão independente e adulteração de exportações. Não acessam serviços estatais.


## Ampliação para demonstração — 24/10/2026

- Fila de aprovações em colunas por etapa, com valores, referências e acesso ao processo.
- Cockpit de execução com volume sintético, contagem de operações e inspeção dos recibos.
- Dossiê em modal com compromissos, política, aritmética e linha do tempo do processo.
- Plano de piloto persistente e versionado, com responsável, data-alvo, cinco controles e exportação Markdown. Apenas governança pode editar; revisão pode consultar. Estado documentado exige referência de evidência. As marcações não certificam qualificação.
- Modais de confirmação de execução, publicação de política e parada/retomada; erros de operação aparecem no modal. A confirmação da política mostra alçada anterior e proposta.

API adicional: `POST /api/govtech/pilot`, com sessão, mesma origem, validação de campos, revisão otimista e evento atômico. O SQLite recebe a tabela aditiva `gov_pilot`, sem recriar dados existentes.

Build de produção e 88 testes passaram. Na demonstração do navegador, uma proposta sintética adicional percorreu revisão por outra conta, assinatura, confirmação, execução, journal, exportação e verificação. O plano foi salvo na versão 2. A parada de emergência, que estava ativa antes da demonstração, foi restaurada ao estado ativo ao final.

Vídeo: `output/govtech/video/arkhe-govtech-demonstracao-completa.mp4`. Montagem narrada com capturas reais, dados sintéticos, voz sintetizada pt-BR, legendas opcionais e 19 capítulos. Duração aproximada: 7min15s. Não é uma captura contínua da sessão; as transições e pausas foram editadas para apresentação. Integrações externas continuam pendentes.
