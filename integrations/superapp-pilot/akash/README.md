# Preparação de implantação Akash

Estado: consulta autenticada concluída; solicitação preparada e catálogo testado
localmente. Nenhum novo deployment foi criado e nenhum lease foi contratado.
O deployment existente `tidy-pebble` foi apenas consultado.

## Conteúdo pronto para revisão

- `resource-query.json`: consulta de recursos, estimativa da API, financiamento,
  saldos em unidades brutas e deployment existente; sem credenciais.
- `PREPARED.txt`: diretório da solicitação preparada mais recente.
- `prepared-*/proposal.json`: provedor, escopo, limites e ressalvas de custo.
- `prepared-*/deploy.yaml`: SDL com imagem Python pública fixada por digest,
  servidor e artefato público de demonstração.
- `prepared-*/create-request.json`: corpo da futura criação, com
  `runtimeLimitHours: 1`.

O catálogo publica `/catalog.json`, `/artifact.json`, `/health` e
`/backend/status`. O backend somente declara seu status: não executa inferência
nem assina artefatos. Não publica trust root, chave da API ou chaves privadas.
O SDL inclui código e artefato em base64; isso não é confidencialidade.
Somente fixtures públicas entram nessa definição.

## Limites e financiamento

Perfil: uma réplica, 0,25 CPU, 256 MiB RAM e 512 MiB de armazenamento efêmero.
Filtro: atributo `organization: Akash Palmito` assinado pelo auditor selecionado.
Antes de aceitar um lance, também conferir o endereço exato do provedor:
`akash15ksejj7g4su7ljufsg0a8eglvkje94z8qsh68a`.

Teto: 20 uACT por bloco. Com blocos de 6 segundos e ACT a US$ 1, isso equivale
a aproximadamente US$ 0,012/h. Não é cotação nem limite rígido em dólares:
tempo de bloco, conversão, taxas e encerramento efetivo precisam ser conferidos.
A estimativa pública da API é US$ 1,50/mês para os recursos, não um lance.

A configuração consultada informa depósito padrão de US$ 0,50, runway alvo
de 48 horas e headroom de US$ 5. A plataforma gerencia o financiamento a partir
dos créditos existentes; o efeito de reserva e elegibilidade só poderá ser
confirmado no retorno da criação. Não foi comprado crédito, alterado auto-top-up
ou autorizado débito em cartão. O limite de uma hora é uma instrução de fechamento
automático da Console, não um mecanismo local de pré-pagamento.

## Retomar após aprovação do custo

1. Regenerar os arquivos com `python akash/prepare.py` imediatamente antes da
   submissão. O checkpoint vale 300 segundos; não estender a política silenciosamente.
2. Conferir SDL, imagem, destinatário, preço máximo e `runtimeLimitHours`.
3. POST `data.sdl` e `data.runtimeLimitHours` para `/v1/deployments`.
4. Consultar `/v1/bids?dseq=...`; aceitar somente lance do provedor autorizado,
   denom `uact` e preço até o teto, após aprovação do usuário.
5. POST `/v1/leases`; obter o endpoint pelo status do deployment.
6. Conferir TLS público e bytes servidos. O cliente recusa HTTP externo;
   não desativar verificação TLS nem relaxar essa regra para concluir o ensaio.
7. Conferir o artefato contra o trust file local independente do servidor.
   Se o checkpoint já tiver vencido, observar EVIDENCE_DEGRADED; não alegar
   execução fresca. O servidor não contém chave para renovar checkpoints.
8. Registrar disponibilidade, início/fim, custo, hash do conteúdo e fechamento.
   Não alterar o deployment preexistente.

A chave é enviada somente como `x-api-key` para
`https://console-api.akash.network`. Não colocá-la em SDL, artefatos, código,
histórico de shell ou logs. Nesta sessão, foi carregada em memória a partir da
mensagem desta própria conversa, sem reproduzir seu valor.

## Fontes consultadas

- https://akash.network/docs/api-documentation/console-api/getting-started/
- https://akash.network/docs/api-documentation/console-api/api-reference/
- https://akash.network/docs/api-documentation/rest-api/providers-api/
- https://console-api.akash.network/v1/doc (OpenAPI: saldo e preço USD/mês)
- https://akash.network/docs/developers/deployment/akash-sdl/syntax-reference/
