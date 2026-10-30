# Passe de Batalha — catálogo proposto v1

Este é um desenho de produto para futura implementação no servidor, sem
preço real, compra ou concessão local. Não depende de alegações de eficácia
de mercado. O modelo C# existente é somente uma leitura de entitlements.

## Temporada e ritmo

Janela fixa de 30 dias UTC, `[starts_at, ends_at)`, conforme o briefing
original. 30 marcos de 800 XP (24000 XP no total), trilhas grátis e premium.
O jogador vê data final, XP necessário e conteúdo de cada trilha antes de
comprar. Passe premium comprado durante a janela permite reclamar marcos
premium já alcançados, sem reiniciar progresso.

Proposta de fontes de XP, todas verificadas no servidor:

| Fonte | XP | Limite por temporada |
|---|---:|---:|
| Tutorial/onboarding concluído | 500 | Uma vez |
| 3 missões diárias | 150 cada | 30 conjuntos |
| 3 missões em cada um dos 4 conjuntos semanais | 1000 cada | 4 conjuntos |
| Total disponível | | 26000 |

Há 2000 XP além do necessário, permitindo perder algumas missões sem comprar
níveis. Missões variam entre sobreviver, absorver tiros e recolher scrap;
não exigem vitórias, compras ou anúncios. Não conceder XP por eventos apenas
declarados pelo cliente: vincular ao recibo da partida reproduzida.

Os conjuntos semanais abrem nos dias 0, 7, 14 e 21 e permanecem acessíveis
até o fim. A missão diária usa o dia UTC e uma chave única; reiniciar o app
ou alterar o relógio não renova missão. Toda missão tem um limite anunciado
e não recebe progresso duplicado do mesmo evento.

## Recompensas

Grátis: lotes moderados de pontos para progressão casual, scrap e cosméticos
básicos. Premium: skins de nave, trilhas de propulsão, avatares e ad-skips
limitados. Marco 30 inclui skin de destaque. Sem bônus de dano/HP exclusivos
do premium em partidas ranqueadas. Itens cosméticos já ganhos persistem após
o fim da temporada.

Claims são explícitos e idempotentes. XP e premium precisam estar validados
antes da concessão. Política proposta: no encerramento, servidor concede uma
única vez todos os marcos elegíveis ainda pendentes, pelas mesmas chaves de
claim; processador de encerramento pode repetir sem duplicar itens. Nova
temporada reinicia XP e marcos; mantém inventário e histórico.

Saltos de nível ficam desabilitados no catálogo inicial. Se forem adicionados,
usar recibo de loja verificado, preço local exibido, limite de marcos restante
e evento separado de XP de missão. Não alterar metas/recompensas retroativamente.

## Contrato lógico do servidor

- `season_catalog`: versão, datas, missões, limites e recompensas por marco.
- `mission_progress`: jogador, missão, janela UTC e eventos já contabilizados.
- `season_progress`: jogador, temporada, XP e entitlement premium validado.
- `pass_claim`: chave única `(tenant, player, season, track, tier)`.
- Transação de claim: conferir sessão/jogador/tenant, catálogo e elegibilidade;
  inserir claim, conceder inventário/saldo e registrar evidência/outbox.
- Evento de compra é único por identificador real da loja. Estorno usa evento
  compensatório com política de entitlement definida no catálogo.

RLS por tenant e autorização por jogador continuam obrigatórias. A assinatura
Booster, o Passe Premium e VIP são direitos distintos: comprar passe não ativa
automaticamente Booster. Multiplicador de partida não multiplica XP de missão.
