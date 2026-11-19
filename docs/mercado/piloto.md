# Piloto

O piloto é uma implantação local do Intra para uma equipe, com o fluxo de três assinaturas e a verificação do pacote exportado. Não é contrato de conformidade, não abre acesso ao kernel e não inclui escrita de modelo em sistema do comprador.

## Perfil

Hipótese única, à espera da primeira conversa:

| Campo | Hipótese | Confirmado |
|---|---|---|
| Quem sente | Pessoa que responde se uma saída de modelo pode virar efeito | Não |
| Onde trabalha | Equipe pequena, com documento ou decisão que já passa por mais de uma pessoa | Não |
| Gatilho | Uma saída recente foi usada sem um pacote que um terceiro confira | Não |
| Encaixe perfeito | Aceita rodar o Intra na máquina dela e exportar o pacote | Não |
| Fica de fora | Pede selo regulatório, custódia, AGI, ou que o Arkhe assine no lugar da equipe | Regra da oferta, não observação de campo |

Outbound, quando existir, fala só com encaixe perfeito. O restante pode chegar por indicação e se qualifica na mesma tabela.

## Oferta da implantação

Cabe em uma tarde, na máquina de quem assiste, ou na do founder se a outra pessoa operar.

Entra:

- Intra em loopback, contas locais, chaves Ed25519 geradas na preparação.
- Uma minuta real ou um texto que a equipe já usa, escolhido por ela.
- Assinatura de autoria, revisão e aprovação.
- Exportação do JSON e leitura do laudo.
- Lista do que a equipe ainda precisa confiar: chaves, política, máquina.

Fica de fora:

- Rekor, salvo se a equipe já tiver a configuração e quiser ver o bloqueio ceder.
- GovTech, PoC governamental sintética, Salesforce, cadeia, GPU, TEE.
- Preço de tabela. Não há preço adotado. O founder pergunta, no fim, se pagariam por repetir isso no próximo documento e quanto. A resposta, inclusive zero e inclusive recusa, vai para a linha do funil.

## Roteiro da conversa

Antes de abrir o produto, três perguntas sobre a vida deles:

1. Qual foi a última vez em que um texto de modelo entrou num documento ou numa decisão de verdade?
2. O que vocês fizeram antes de deixar isso seguir? Quem olhou?
3. O que aconteceu quando ninguém conseguia mostrar depois o que tinha sido aceito?

Pergunta de opinião (“você usaria o Arkhe?”) não qualifica. Pedido de previsão (“você compraria?”) só entra depois da demo, como preço, e se registra como dito, não como receita.

Durante a demo, a outra pessoa cria a minuta ou cola o texto, e assina o papel que der. O founder não completa o fluxo no lugar dela se o objetivo da reunião for tração.

Qualifica para um segundo encontro quando as três respostas descrevem um episódio passado e a pessoa termina a exportação. Desqualifica quando o pedido é certificado, agente autônomo ou dever do Arkhe sobre o conteúdo.

## Funil

Dez linhas. Nome só com consentimento de anotar a conversa. Até lá, cargo e organização bastam.

| # | Data | Cargo | Organização | Episódio que contaram | Terminou a exportação | Preço que disseram | Seguimento |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |

Critério para considerar o processo dominado pelo founder, antes de qualquer pessoa dedicada a prospecção: dez conversas neste quadro, com descarte explícito, e pelo menos uma em que a exportação foi feita pela outra pessoa. Equipe de SDR, cadência de e-mail e CRM esperam esse quadro. O método de receita previsível conta meses até haver dado. Aqui o dado ainda é zero.

## Retorno para a oferta

Depois de cada linha preenchida, uma de três saídas:

- A demo respondeu. A frase permanece.
- A demo não respondeu e a pessoa pedia algo da lista “fora da oferta”. A frase não entra no deck.
- A demo não respondeu e o pedido cabe nas cinco perguntas (bytes, chave, confiança da chave, política, observação da execução). Vira item de produto com teste, e a frase espera o teste.
