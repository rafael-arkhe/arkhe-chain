# E1L provisório e correções à auditoria

Atualização posterior: EXAMPLE-TOKEN-TARGET-AUDIT-v1.md mede tokens do texto bruto com o próprio GGUF instalado. E1L tem419tokens a menos que E1; igualdade de bytes não equivaleu a igualdade de tokens. O NOT_MEASURED abaixo descreve o estado anterior. Nenhuma geração experimental executada.

Materializados oito prompts E0/E1/E1L/E2 para clique/movimento. Nenhuma geração feita. Artefatos originais preservados. Novos arquivos em D:/arkhe/output/arc3-example-e1l-design-20261027/.

## O que está verificado

E1L usa exatamente três ASTs genéricas atuais com os mesmos before/action das três demonstrações auxiliares. Cada target genérico é calculado pelo interpretador, não copiado do target auxiliar. Parser/tipagem/replay verificam os exemplos. Nos três inputs, os programas genéricos preservam a grade. A composição de alvos estacionários difere de E1: isso é parte do conteúdo e deve ser reportado, não tratado como neutralidade perfeita.

|Controle|E0 bytes|E1 bytes|E1L bytes|E2 bytes|
|---|---:|---:|---:|---:|
|Clique|5955|8242|8242|8973|
|Movimento|5791|8078|8078|8809|

E1L usa padding de espaços ASCII em campo JSON explicitamente nomeado. Isso iguala bytes e caracteres, não tokens, atenção, complexidade do programa ou neutralidade semântica. Sem tokenizer compatível nas bibliotecas locais verificadas (transformers/tokenizers/llama_cpp/sentencepiece ausentes), tokens do modelo e do template foram registrados como null/NOT_MEASURED; não estimados. O controle é PROVISIONAL_BYTE_MATCHED_TOKEN_MATCH_PENDING. Não é um controle de comprimento em tokens validado, e não autoriza alegação de especificidade isolada.

O cronograma prospectivo de oitenta chamadas foi materializado, vinte por condição e dez por controle, mas permanece não executado. Este cronograma não substitui os gates/desfechos do plano anterior: admissão desativada, falhas no denominador global, grade inteira e alvos estacionários obrigatórios. Não avançar com alegação de equivalência de tokens antes de medi-la com tokenizer/template compatíveis.

## Correções ao anexo

1. A resposta anterior não chamou E1L de opcional: não o mencionou. O relatório anterior já declarava contraste de pacote, não especificidade pura. Não existe a contradição textual atribuída; existe uma proposta nova de controle, agora materializada provisoriamente.
2. O relatório anterior dizia que E2 acrescentava identidade/acerto/células exigidas, além de comprimento. Portanto a auditoria está certa sobre conteúdo + comprimento, mas erra ao atribuir uma omissão total desse conteúdo.
3. E0 tem exemplos de AST, inclusive três exemplos adicionais e um exemplo interno. Não tem demonstrações completas de transição como E1. 'E0 não tem exemplos' seria falso; distinguir exemplos sintáticos de demonstrações input/output.
4. E1L não é a única estratégia possível nem basta para isolar uma noção vaga de especificidade. Igualar contagem/comprimento reduz algumas diferenças; framing, algoritmos, resultados e informação fornecida também precisam ser operacionalizados. Mesmo um controle perfeitamente token-matched não torna todo o resto causalmente idêntico.
5. 'Modelo incapaz' permanece não demonstrado, não refutado universalmente. A expressibilidade dos controles manuais é evidência positiva para esses controles, não prova de expressividade geral da DSL. Ausência de sustentação não equivale a refutação.

## Estado final

Materialização e verificação local concluídas; medição exata de tokens e certificação do controle de comprimento pendentes. Zero chamadas ao modelo. Hipótese permanece 'efeito dos pacotes de exemplos nesta configuração'. Nenhuma conclusão causal nova sobre especificidade, comprimento, modelo ou representação.
