# Tokens e targets medidos com o modelo instalado

27/10/2026. Executado measure_example_tokens.py com llama-server.exe distribuído pelo Ollama e o GGUF instalado de north-mini-code-1.0:latest, digest de manifesto 2e6b0d32b7ff9d61f77d6808307db4791f487a72b22da0b28f5d4293b5729282. Servidor apenas em127.0.0.1, CPU, sem warmup. Foram16 requests /tokenize, oito prompts com/sem add_special. Zero requests de geração, nenhuma ação ARC, nenhuma admissão. Servidor encerrado ao final. Não foi necessário instalar bibliotecas, baixar modelo nem alterar os prompts.

## Tokens do texto do prompt

|Controle|E0|E1|E1L|E2|
|---|---:|---:|---:|---:|
|Clique|1479|2091|1672|2275|
|Movimento|1460|2072|1653|2256|

Contagens com add_special=false, parse_special=true. Com add_special=true cada valor cresce em1. Isso não é aplicação do template de chat: tokens efetivos do template/Ollama prompt_eval_count não foram medidos. O vocabulário/tokenizer é o próprio GGUF instalado, não um estimador baseado em bytes. O log local alerta sobre configuração de special_eos_id; não extrapolamos a semântica de EOS para equivalência com o template Ollama.

E1L tem419tokens a menos que E1 nos dois controles, apesar de igualdade de bytes. E2 acrescenta184tokens em relação a E1. A igualdade em bytes não validou o controle de comprimento. O preenchimento de espaços é informação de formato com efeito não estabelecido e não deve ser chamado de neutro. Não ajustamos padding pós-medição nem alteramos os prompts arquivados.

## Targets por demonstração

|Demonstração|Células alteradas E1|Células alteradas E1L|Células divergentes entre targets|
|---|---:|---:|---:|
|Movimento livre à esquerda|2|0|2|
|Bloqueio pela borda|0|0|0|
|Clique pinta cor9|1|0|1|

Todos os before/action coincidem entre E1/E1L. E1 tem dois exemplos não estacionários e um estacionário; E1L tem três estacionários. São três células divergentes no total, não três transições de translação: um exemplo é clique, outro é bloqueio. A descrição do anexo 'E1 usa targets de translação' é incompleta.

Denominação: **controle de pacote com inputs equalizados e bytes igualados**, não controle de especificidade nem de comprimento em tokens. Hipótese: efeito do pacote auxiliar nesta configuração. Mesmo tokens iguais não isolariam a composição dos targets, framing ou estrutura algorítmica.

## Histórico e limites

O anexo atual cita 'Opcional: materializar E1L' sem identificar a mensagem-fonte. A resposta que materializou E0/E1/E2 no histórico disponível não contém essa frase. A auditoria anterior, por sua vez, atribuiu 'difere apenas em comprimento'; o relatório original descrevia os acréscimos de conteúdo. Para evitar misturar textos de origem diferente, essas disputas de atribuição não são fundamento de nenhuma conclusão experimental aqui. Não afirmamos verificar textos externos não fornecidos nem adotamos como transcrição citações sem origem identificada.

O estado anterior NOT_MEASURED é histórico e verdadeiro para aquela execução; foi superado agora somente para tokens do texto bruto pelo tokenizer instalado. Tokens efetivos do template permanecem não medidos. Os80requests experimentais continuam não executados. Não há novo resultado sobre desempenho, causa interna ou incapacidade do modelo.

Fonte da interface /tokenize: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md . Evidência local: D:/arkhe/output/arc3-example-token-audit-20261027/report.json, arrays de tokens por prompt, hashes do executável/prompt, digest do modelo e log. Classificação: LEMMA para contagens nesta execução; nenhuma generalização universal.
