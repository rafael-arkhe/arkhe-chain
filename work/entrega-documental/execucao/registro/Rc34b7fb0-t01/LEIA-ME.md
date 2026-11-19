# Registro da execução Rc34b7fb0-t01

Tarefa: Conferir o lote L002 com hierarquia de recuperação e permissão por estágio

| Arquivo | Conteúdo |
| --- | --- |
| `passos.md` | Cada passo: ferramenta, entrada, efeito, papel, estado, soma |
| `observacoes.md` | Trechos do que cada ferramenta devolveu, por linha |
| `afirmacoes.md` | Afirmações da resposta e onde cada uma se localiza |
| `efeitos.md` | Passos de escrita, chave de idempotência e se reaplicaram |
| `ocorrencias.md` | Instrução dentro de observação, registrada e não adotada |
| `pendencias.md` | O que ficou sem fonte e sob qual condição fecha |
| `relatorio.md` | Resultado, quem executou e alcance da revisão |
| `somas.sha256` | SHA-256 de cada observação crua e do plano |
| `recuperacao.md` | O que a busca achou, o que entrou no contexto e o que ficou fora |
| `permissoes.md` | Permissão em T1 a T4 e o estado de cada passo |

A captura crua não está aqui: ela guarda o byte original das observações e pode
conter segredo. Quem a tiver confere com `somas.sha256`. Caminhos relativos,
texto simples, sem rede e sem serviço.
