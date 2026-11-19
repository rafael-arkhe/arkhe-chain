# Teste do verificador por mutação

Cada linha aplica um defeito a uma cópia do exemplar. A verificação indicada
tem de falhar. Um mutante não detectado significa que aquela verificação não
serve como evidência.

| ID | Defeito introduzido | Verificação | Resultado | Evidência |
| --- | --- | --- | --- | --- |
| M01 | linha de afirmação apagada do mapa | I2 | detectado | A004: ausente de referencias.md |
| M02 | trecho citado não existe na fonte | I2 | detectado | A002: trecho de fonte nao encontrado em D003 linha 3 |
| M03 | quitação declarada compatível citando a linha que a nega | I2 | detectado | A004: declarada compativel mas a linha citada de D003 nega ou registra ausencia (não anexado) |
| M04 | pendência encerrada sem o documento | I2 | detectado | A004: pendencia P001 nao esta aberta |
| M05 | linha citada fora do arquivo | I2 | detectado | A001: fonte cita linha 99 fora de D003 (5 linhas) |
| M06 | original aceito ausente do pacote | I1 | detectado | D001: fonte aceita mas original ausente do pacote; soma lista arquivo inexistente: originais/D001/relatorio_v1.txt |
| M07 | original não declarado no índice | I1 | detectado | originais nao declarados no indice: intruso.txt |
| M08 | termo declarado ausente que está presente | I2b | detectado | Pagamento integral: declarado ausente em D001 mas contem documentação |
| M09 | alteração sem justificativa e sem pendência | I2b | detectado | Presenças: sem justificativa e sem pendencia |
| M10 | pacote passa a depender de endereço externo | I6 | detectado | LEIA-ME.md linha 39 depende de caminho ou endereco externo: https:// |
| M11 | arquivo citado no LEIA-ME não existe | I6 | detectado | citado mas inexistente: pendencias.md |
| M17 | endereço externo na prosa das ocorrências | I6 | detectado | ocorrencias.md linha 9 depende de caminho ou endereco externo: https:// |
| M12 | revisão concluída sem revisor nem data | I5 | detectado | revisor ou data ausentes mas o relatorio nao declara isso |
| M13 | autorrevisão apresentada como revisão | I5 | detectado | autorrevisao nao declarada como tal |
| M14 | ambiente de processamento não registrado | I7 | detectado | relatorio nao registra ambiente_processamento |
| M15 | exclusão declarada sem confirmação | I7 | detectado | afirmacao nao confirmada no pacote: excluído com sucesso |
| M16 | código passaria a poder executar conteúdo | I3a | detectado | montar.py contem subprocess |
| M18 | 21 afirmações sem registro de escopo excedido | E1 | detectado | escopo excedido sem registro no pacote: 21 afirmacoes acima do limite de 20 |
| M19 | contagem declarada diferente do mapa | E1 | detectado | declara 2 afirmacoes selecionadas mas o mapa tem 4 |

19 de 19 defeitos detectados. Sobreviventes: 0.

A mutação cobre os defeitos listados acima. Não cobre defeito que ninguém
pensou em escrever, e nenhuma destas verificações decide se uma fonte é
verdadeira: só se a afirmação está localizável no que foi recebido.
