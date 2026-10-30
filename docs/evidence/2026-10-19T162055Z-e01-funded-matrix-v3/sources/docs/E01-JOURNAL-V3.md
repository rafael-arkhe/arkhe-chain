# E01 — persistência local v3

O ensaio v2 foi interrompido após 33 transações finalizadas e a preparação da
34ª. A renomeação do relatório retornou EPERM no Windows; a 34ª não foi enviada.
Não foi determinada a origem específica do bloqueio. O resultado é preservado
em `docs/evidence/2026-10-19T144548Z-e01-v2-journal-failure/REPORT.md`.

A v3 mantém a política de rede da v2: até quatro broadcasts dos mesmos bytes,
sem re-assinatura, 60 segundos de janela e reconciliação antes de enviar.
Acrescenta persistência com tentativas limitadas de substituição do arquivo:

1. Gravar o candidato temporário no mesmo diretório e sincronizar o arquivo.
2. Tentar renomeação para o relatório ativo.
3. Somente em EPERM, EACCES ou EBUSY, esperar 25, 50, 100, 200 e 400 ms.
4. Após seis tentativas totais, propagar a falha e interromper o runner.
5. Outros códigos, como EIO, falham imediatamente, sem ocultar erro de armazenamento.

Durante o bloqueio, o relatório anterior permanece disponível e o candidato
temporário é retido para diagnóstico caso a substituição não conclua. A chamada
de envio só ocorre após sucesso da persistência do estado PENDING. Esperas de
arquivo não são retransmissões de rede e não geram novas assinaturas.

Os testes cobrem bloqueio transitório, bloqueio persistente preservando a versão
anterior e erro não recuperável. A suíte conjunta tem 24 testes. O smoke v3 de
três tamanhos foi finalizado e observado pelo segundo provedor antes da matriz.
Resultados empíricos da matriz têm relatório próprio; não são inferidos desses
testes. Cada corrida mantém identificador, protocolo, denominador e artefatos
próprios, inclusive quando interrompida.

Resultado posterior: matriz v3 com 90/90 finalizações observadas por dois
operadores RPC. O segundo leitor registrou duas respostas HTTP 429 e recuperação
limitada, preservadas no log. Um ensaio separado de perda local inicial também
foi recuperado com os mesmos bytes e assinatura. Não foram observadas novas
falhas de journal na matriz v3; isso não prova ausência geral de falhas.

```powershell
node --test scripts/e01_atomic_report.test.mjs scripts/e01_rebroadcast.test.mjs scripts/e01_runner.test.mjs scripts/e01_schedule.test.mjs scripts/e01_solana_transport.test.mjs
./scripts/run_e01_wallet.ps1 -ProtocolVersion 3 -Matrix -OutputDirectory ops/local/e01/nova-matriz-v3
```

Isso não demonstra resiliência a todas as falhas de hardware, durabilidade de
banco de dados ou contenção do runtime. O arquivo temporário não contém chave
privada; inclui apenas relatório, transações assinadas e evidências públicas.
