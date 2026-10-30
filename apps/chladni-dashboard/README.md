# Chladni Dashboard v27 — integração local

Pré-visualização: http://localhost:7475. Iniciar com `pnpm dev:chladni` na raiz. O processo observa o Telegraph existente em 7474 e consulta a saúde do kernel em 8788 com credencial privada exclusivamente no servidor. O navegador e a conta do serviço legado não recebem essa credencial.

O serviço instalado foi identificado em `C:\Program Files\ArkheCathedral`: HTTP 7473 e WebSocket 7474. A versão instalada continua v26.5, com listeners em todas as interfaces. As ACL do Windows impedem esta sessão de substituir esses ficheiros. O código revisto para restringir ambos a 127.0.0.1 está em `deployment/`; ainda não foi aplicado.

## Aplicar ao serviço existente

Numa PowerShell **como Administrador**, executar primeiro:

```powershell
& 'C:\Users\Lemes\Downloads\Arkhe_AGI_Environment_v0.1\apps\chladni-dashboard\install.ps1' -CheckOnly
```

Após PASS, executar o mesmo comando sem `-CheckOnly`. O instalador identifica a tarefa existente por suas ações, exige os hashes da versão revista e Node 18+, guarda backup, reinicia apenas o runtime identificado e verifica versão, hashes e os dois listeners. Se houver falha tenta restaurar os ficheiros anteriores e reiniciar a tarefa. Não altera ACL nem cria contas ou tarefas. Se não identificar exatamente uma tarefa/processo, aborta antes de alterar ficheiros. A aplicação elevada ainda não foi ensaiada neste computador.

Manter o observador 7475 em execução para a saúde agregada do kernel no serviço instalado. Sem o observador, a saúde aparece indisponível; nenhuma autorização é inferida.

## Fronteiras e estado real

- UI e Telegraph não têm autoridade para autorizar trabalho no kernel. ContainmentGate, identidade AKG-CBOR-v1 e persistência continuam no núcleo Rust/PostgreSQL.
- Os selos SHA3 e o TemporalChain legados não são provas MMR nem ObjectDigest nativos. A métrica phi é uma referência de inicialização; DSA vem da simulação legada.
- O barramento atual não publica evidência nativa, WER ou MMR. Esses campos ficam desconhecidos. A verificação criptográfica no navegador não está integrada.
- Controlos enviam comandos legados sem repetir escritas e sem afirmar execução confirmada. Não foram acionados durante a validação para evitar mutações no runtime real.
- A correção preparada limita origem, interfaces, tamanho/frequência de mensagens, clientes, tópicos e histórico. HTTP aceita apenas leituras dos recursos permitidos, com CSP e validação de Host/Origin. Loopback não substitui autenticação de utilizadores locais.

`config/ports.json` na raiz regista as portas dos serviços e `pnpm inspect:ports` faz sondagens locais sem imprimir credenciais. Os serviços do kernel e observabilidade foram alcançados; 3000/3001 são aplicações de desenvolvimento opcionais e estavam paradas.

## Validação

`pnpm --filter @arkhe/chladni-dashboard test` cobre protocolo, limites numéricos, reconexão, HTTP, isolamento do token e WebSocket real com rejeição de Origin e frames excessivos. A versão corrigida do servidor Telegraph é testada em processo isolado, não instalada sobre o serviço protegido.

A interface foi verificada em navegador com telemetria real e saúde Rust. Os resultados locais estão em `docs/evidence/2026-10-17-execution`. O CI bem-sucedido no commit 241c96e9e915572367ab83143e2aecdd905b6816 antecede este componente e não valida estas alterações. Não houve alteração de migrações SQL nem congelamento de protocolo.
