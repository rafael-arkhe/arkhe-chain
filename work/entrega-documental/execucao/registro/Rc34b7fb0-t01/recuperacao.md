# Hierarquia da recuperação
O que a busca encontrou, o que entrou no contexto e por que o resto ficou
fora. Candidato descartado consta aqui com o motivo: é o que impede
descarte silencioso.

## P01 — 2 fornecidos, 1 descartados

| Candidato | Origem | Estado | Endereço no contexto | SHA-256 do arquivo | Motivo do descarte |
| --- | --- | --- | --- | --- | --- |
| C1 | `teste-recebimento/lote/extracoes/D003.txt` | fornecido | linhas 2–11 | 057cd9a073cf73e8… | — |
| C2 | `teste-recebimento/lote/recebidos/ata_v1.txt` | fornecido | linhas 13–17 | 0a39880dc6d5e77a… | — |
| C3 | `teste-recebimento/lote/extracoes/D001.txt` | descartado | — | 71ad85e76d0fc9e0… | Anexo recebido de terceiro; fora do contexto desta geração por decisão do operador |

Cada bloco fornecido foi conferido byte a byte contra o arquivo de origem.
Afirmação que cite este passo tem de cair dentro de um bloco fornecido.
