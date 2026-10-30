# Staging Arkhe em Coolify/Dokploy

Estado: PROPOSED; implantação e compatibilidade operacional NOT_TESTED.
Escopo: preparação de staging Linux separado de C01. ONB02/ONB03 inalterados.

## Base conferida

O `docker-compose.yml` da raiz define PostgreSQL, runtime Rust, Redis, MCP de
saúde, Prometheus e Grafana. Usa nomes fixos, rede externa `arkhe-live` e volume
externo `arkhe-live-pgdata`, além de portas publicadas em loopback. Não importar
essa configuração diretamente em outro projeto: pode colidir ou reutilizar dados.
O Dockerfile MCP existente não demonstra sozinho um servidor verificador WASM.
O Intra/cockpit não aparece como serviço nesse Compose; portanto ele não é uma
definição de implantação do aplicativo completo.

## Contrato da futura configuração

- Criar configuração separada com contexto de build na raiz do repositório.
  Não substituir o Compose local nem montar volumes de `arkhe-live`.
- Usar nomes de rede/volumes gerenciados pelo projeto Compose; sem
  `container_name` fixo. Criar banco e dados sintéticos exclusivos de staging.
- Não publicar PostgreSQL, Redis ou métricas na Internet. Publicar apenas o
  serviço web explicitamente selecionado, com TLS e autenticação verificados.
- Separar rede do proxy e rede de dados; verificar efetivamente rotas e egress.
  Rede Docker não implica isolamento físico nem contenção de código adversário.
- Injetar segredos exclusivos pelo mecanismo da plataforma, sem valores padrão
  ou inclusão em logs. O runtime exige `DATABASE_URL` e `ARKHE_API_TOKEN`.
- Criar papel de banco restrito e executar bootstrap/migrações em etapa própria,
  após revisar o mecanismo atual. Credencial de migração não fica no runtime.
- Fixar imagens por digest na versão destinada ao ensaio. Documentar processo
  de atualização, backup e restauração; verificar restauração antes de promovê-la.
- Configurar limites de recursos, usuários sem root, permissões mínimas e
  healthchecks compatíveis com as escritas realmente necessárias de cada serviço.
  Não montar socket Docker em serviços da aplicação nem chaves de produção.
- Documentar build Linux do Intra, entrypoint, variáveis, autenticação e conexões
  reais antes de acrescentá-lo ao conjunto. O pacote Windows não é uma imagem Linux.
- Definir um adaptador de proxy por plataforma: domínio, porta interna, rede e
  labels devem ser validados na versão instalada de Coolify ou Dokploy.

## Aceite antes de declarar staging funcional

Validar renderização Compose sem divulgar segredos; compilar imagens; iniciar
em projeto descartável; executar migrações; testar autenticação e fluxo web/API/
banco; conferir ausência de portas de dados públicas; testar persistência,
restauração e rollback; registrar versões, digests, logs sanitizados e limpeza.
Configuração estática válida não substitui esses ensaios. Nenhuma implantação foi
realizada na elaboração desta especificação.

## Limites de interpretação

ONB03 exige selecionar ambiente Windows x64 limpo para o kit E01. Um stack Linux
em PaaS não satisfaz esse requisito. Staging não herda aprovação de sandbox,
enclave, custódia ou liquidação financeira. Localização europeia do servidor e
uso de plataforma não demonstram conformidade GDPR ou EU AI Act.

Auto-hospedagem permite administrar o plano de controle, mas não elimina confiança
em operadores, host, imagens e cadeia de fornecimento. RLS e append-only precisam
ser impostos e testados no banco, incluindo privilégios administrativos.

## Referências consultadas

- https://coolify.io/docs/ — hospedagem de aplicações e bancos em Docker.
- https://docs.dokploy.com/docs/core — Docker/Traefik e recursos Docker Compose.
- https://devpu.sh/ — apresenta-se como open source e auto-hospedável; não
  classificá-lo exclusivamente como serviço gerenciado.

Afirmações específicas sobre Firecracker na Koyeb, localização de dados na
Sliplane e requisitos regulatórios precisam de documentação e contrato aplicáveis
ao serviço contratado; não constituem garantias desta especificação.
