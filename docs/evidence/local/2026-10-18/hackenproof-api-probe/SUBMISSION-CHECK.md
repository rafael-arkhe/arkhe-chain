# Gate: verificação limitada e capacidade de submissão

Data: 2026-10-18. Classificação: TESTED somente para as chamadas descritas.

O usuário autorizou investigação no escopo e envio de achados reais pelo MCP. As regras do programa foram relidas via get_program_info: testes limitados às próprias contas, sem tráfego massivo, sem dados de terceiros e com PoC e impacto demonstráveis. Oito entradas foram anunciadas, incluindo https://api.gateio.ws/api/v4. Não houve expansão para subdomínios ou ambientes de teste não listados.

Foram feitas três requisições GET sem credenciais, sem parâmetros de outros usuários e sem mudanças de estado:

| Rota | HTTP | Observação |
| --- | --- | --- |
| /spot/time | 200 | Resposta pública de horário |
| /spot/accounts | 400 | MISSING_REQUIRED_HEADER |
| /wallet/total_balance | 400 | MISSING_REQUIRED_HEADER |

Os resultados e hashes estão em gate-limited-check-01.json. A rejeição das duas últimas chamadas não demonstra segurança geral; não foi confirmado bypass ou qualquer vulnerabilidade reportável. O rótulo requires_review no JSON significa apenas que o classificador simples não tratava HTTP 400; não é um achado de segurança.

O catálogo remoto foi consultado novamente e anunciou as mesmas 28 ferramentas de leitura e gestão/triagem. Nenhuma cria ou submete um relatório novo. triage_report e add_comment não substituem submissão de pesquisador. Nenhuma escrita de negócio foi executada e nenhum relatório fictício foi enviado.

O usuário informou que as contas já estão configuradas, mas sua localização permanece desconhecida. Não foram encontradas variáveis de ambiente com nomes GATE/HACKEN nem abas no inventário de navegadores acessíveis. Isso não prova ausência de configuração em outro lugar. Não foram extraídos cookies, senhas ou credenciais de perfis de navegador.

Pendente: identificar o caminho da configuração ou uma sessão de teste acessível para verificar fluxos autenticados entre contas próprias; identificar um canal suportado para submissão de pesquisador se surgir uma PoC válida. Não foram testadas lógica financeira, IDOR, escalada ou pagamentos.
