# Permissão por estágio

T1 antes de recuperar, T2 antes de usar como apoio, T3 antes de exibir,
T4 antes de exportar. O relógio avança entre estágios, então revogação no
meio do caminho aparece aqui em vez de desaparecer.

| Passo | Recurso | T1 | T2 | T3 | T4 | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | lote-L002 | permite em 1005 | permite em 1010 | permite em 1015 | — | exibido |
| P02 | anexo-D001 | permite em 1020 | permite em 1025 | nega em 1030 | — | usado_mas_suprimido |
| P03 | lote-L002 | permite em 1035 | permite em 1040 | permite em 1045 | — | exibido |
| P04 | lote-L002 | permite em 1050 | permite em 1055 | permite em 1060 | nega em 1065 | suprimido_na_exportacao |

O que o estado significa:

| Estado | Leitura |
| --- | --- |
| `exibido` | T1, T2 e T3 permitiram |
| `exportado` | T1 a T4 permitiram |
| `revogado_antes_do_uso` | T1 negou; nada foi lido |
| `nao_utilizavel` | T2 negou; lido, mas não sustenta afirmação |
| `usado_mas_suprimido` | T2 permitiu e T3 negou; já havia sido usado |
| `suprimido_na_exportacao` | T4 negou; fica sem sair |

`usado_mas_suprimido` registra o que não pode ser desfeito. Afirmação que
se apoie num passo nesse estado é recusada, e o token de cada estágio foi
emitido pelo oráculo no momento do estágio, não na hora de conferir.

As assinaturas dos tokens e a chave do emissor ficam na captura crua, fora
deste registro. Chave local prova que os tokens saíram do mesmo oráculo; não
é raiz de confiança e não identifica ninguém.
