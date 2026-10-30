# Rechecagem local da auditoria v5

A execução já havia ocorrido na rodada anterior. A pedido do novo anexo, foi repetida: 60 testes passaram; os três controles em single e LOO (seis relatórios) reproduziram exatamente os JSONs anteriores. Os hashes do código corrigido, original e relatório sintético conferem com o recibo anterior. Evidência: D:/arkhe/output/arc3-mask-diagnostic-v5-recheck-20261027/control-recheck.json.

## Correções à auditoria recebida

- Os itens classificados PENDING no anexo eram pendentes para seu autor, não para esta execução local. Agora foram novamente verificados. Igualdade de relatórios confirma reprodutibilidade desta execução offline, não replay no ambiente ARC.
- IDs textuais: o defeito é a coerção int(e)/int(lv), que rejeita identificadores como seed-A. Strings não são intrinsecamente instáveis.
- Política no agrupamento significa separar trajetórias random/frontier e seus namespaces. Não significa estratificar dificuldade de níveis; isso é outra escolha de desenho.
- Status de split inválido pode sair com código zero. KeyError ou erro não capturado no loader normalmente produz traceback e saída não zero; não é uma falha silenciosa em todos os casos.
- A v4 ter passado o selftest foi observado, mas isso não prova que as asserções sejam independentes do HUD em qualquer dataset. HUD constante melhora o isolamento do controle.
- Contraste pareado e custo explícito ajudam a formular a decisão, mas não corrigem por si só a dependência dos treinos OOF nem demonstram validade inferencial.
- Um lookup é um modelo empírico limitado ao suporte observado. A conclusão demonstrada é ausência de previsão de pares não vistos no lookup atual, não uma proibição terminológica universal de chamá-lo modelo de mundo.

Mantêm-se os limites da v5: núcleo de 60 linhas, loader direto sem namespaces/políticas robustos, nível como instância episódio/nível, e bootstrap condicional. Não foi alterado código do solver, promovida máscara nem realizada nova ação ARC ou submissão.
