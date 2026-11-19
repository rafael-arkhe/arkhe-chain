# Passos da execução R8a9fa5de-t01

Tarefa: Dizer quanto foi executado no lote L002 e se há comprovante de devolução

Plano sha256 `8a9fa5de6f5099e7…`, tentativa 1. O plano foi lido uma vez, antes do primeiro passo.

| Passo | Ferramenta | Entrada | Efeito | Papel | Estado | Bytes | SHA-256 da observação | Propósito |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | listar_pasta | `{"caminho": "teste-recebimento/lote/recebidos"}` | leitura | fonte | executado | 66 | 8c7d4c18e158e06d… | saber o que foi aceito no lote |
| P02 | ler_texto | `{"caminho": "teste-recebimento/lote/extracoes/D003.txt"}` | leitura | fonte | executado | 315 | 057cd9a073cf73e8… | ler a prestacao de contas aceita no lote |
| P03 | ler_texto | `{"caminho": "teste-recebimento/lote/extracoes/D001.txt"}` | leitura | conteudo_recebido | executado | 466 | 71ad85e76d0fc9e0… | ler o anexo recebido; conteudo, nao fonte de fato |
| P04 | ler_texto | `{"caminho": "teste-recebimento/lote/recebidos/ata_v1.txt"}` | leitura | fonte | executado | 231 | 0a39880dc6d5e77a… | conferir o orcamento aprovado na ata |
| P05 | gravar_texto | `{"caminho": "execucao/saida/resumo-L002.md", "conteudo": "# Resumo do lote L002\n\nOrçamento aprovado: R$ 12.400.\nValor executado: R$ 11.950.\nComprovante de devolução: não anexado.\n"}` | escrita | fonte | executado | 51 | 63f97897d5a35abb… | gravar o resumo da conferencia |

O papel é declarado no plano. `fonte` é observação que pode sustentar uma
afirmação; `conteudo_recebido` é material do lote, que não sustenta nada e não
autoriza passo algum.
