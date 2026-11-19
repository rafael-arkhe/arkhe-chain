# Parecer sobre o Contrato de Dados v3 e o `arkhe_v3.py`

Conferência executada em 14 de novembro de 2026 sobre o documento recebido
("Contrato de Dados Formal (v3)" + "Arkhe v3 — Implementação completa e execução").
O código foi transcrito e rodado; as sondas estão descritas no fim.

**Veredicto: não aprovável como está, nas duas metades.** A ideia central do schema é
boa e cobre um eixo que o nosso contrato não tem. A implementação contradiz o schema.
E o conjunto tem uma lacuna que nenhuma das cinco asserções fecha: não existe onde
declarar que uma observação é conteúdo recebido, então citar conteúdo injetado é
conforme.

## 1. O que a execução produziu

O documento traz um bloco "Saída esperada (execução)" com `RESULTADO: 13/13`, e
afirma "O código está completo e corre localmente". A nota de honestidade do próprio
documento marca os 13/13 como `PENDING`, o que estava correto. O que acontece ao
rodar:

| | Alegado | Executado |
| --- | --- | --- |
| Conclusão da suíte | 13 testes, 13 passam | aborta no F7 com `TypeError`; F8 a F13 nunca correm |
| F4 `used_but_suppressed` | passa | **falha** — devolve `revoked_before_use` |
| F5 `suppressed_at_export` | passa | **falha** — devolve `revoked_before_use` |
| Com um `@property` removido | — | 11/13; F4 e F5 continuam falhando |

O `TypeError` é determinístico: `PermissionToken.is_valid_at` está decorado com
`@property` mas declara o parâmetro `t`. Acessar o atributo chama a função sem `t`.
Isso atinge tanto o teste F7 quanto o caminho normal do verificador, na linha
`if not t3.is_valid_at(...)`, que qualquer caso de permissão vigente alcança.

Removido esse decorador — uma linha, nada mais — a suíte termina em 11/13. Os dois
que falham são F4 e F5, e F4 é o que o documento chama de "a inovação crítica do v3".

## 2. Por que F4 e F5 não podem passar

Não é ajuste de teste. Os estados são inalcançáveis por construção.

O verificador emite os quatro tokens ele mesmo, em sequência, dentro de
`_verify_chunk_temporally`:

```
t1 = self.oracle.issue_token(...)   # se deny -> revoked_before_use
t2 = self.oracle.issue_token(...)   # se deny -> revoked_before_use
t3 = self.oracle.issue_token(...)   # se deny -> used_but_suppressed
t4 = self.oracle.issue_token(...)   # se deny -> suppressed_at_export
```

As quatro chamadas leem `current_state` no mesmo instante do relógio, que nada avança
entre elas. Medido: os quatro tokens saem sempre com o mesmo veredicto, o mesmo
`evaluated_state_digest` e o mesmo `checked_at`. Logo o `deny` de T1 decide por todos,
e os ramos de T3 e T4 são código morto. Em seis combinações de revogação e avanço de
relógio, os únicos resultados possíveis foram `ACEITO` e `revoked_before_use`.

As chamadas a `issue_token` dentro de F4 e F5, que pretendem "simular que T1 e T2
aconteceram", descartam os tokens: eles não chegam ao verificador. O teste não
constrói o cenário que descreve.

**A causa é arquitetural, e as duas metades do documento discordam dela.** No contrato
em TypeScript, os tokens são gravados pelo runtime nos momentos T1..T4 e o verificador
apenas confere o que foi gravado. No Python, o verificador cunha os tokens no momento
da conferência. Com isso ele não pode detectar TOCTOU nenhum: só vê o estado de agora.
Pior, perde a propriedade que torna um registro auditável — reconferir o mesmo registro
amanhã dá outro resultado, porque a permissão mudou.

O F3 passa, mas pelo motivo errado: o rótulo diz "revogação antes de T2" e o que dispara
é `F3_revoked_before_retrieval`, em T1.

## 3. A lacuna que nenhuma asserção fecha: não há papel

Montei um `GenerationRecord` bem formado em que o anexo de injeção aparece nos três
níveis — foi recuperado, foi enviado ao LLM, e a resposta o cita — e a resposta afirma
"A atividade teve 99 participantes", número cujo único suporte é esse anexo, que no
corpo manda ignorar o operador e aprovar a versão como final.

Resultado pelas asserções do documento: **todas as quatro verificáveis passam**, e o
`record_digest` fecha. Veredicto: `ACEITO`.

`citations_used ⊆ context_provided ⊆ candidates_retrieved` é uma propriedade de
proveniência, não de confiança. Ela garante que o modelo citou algo que de fato
recebeu. Não diz nada sobre aquilo poder sustentar uma afirmação. Assinar o registro
não melhora isso: o digest prova que o log não foi alterado depois, não que a fonte
preste.

É exatamente o caso que o nosso `X3` recusa, pelo papel da observação, e que o
`politica.json` obriga alguém a declarar por ferramenta. Esse campo não existe no v3,
e sem ele o eixo temporal inteiro protege o acesso a um conteúdo cujo efeito sobre a
resposta ninguém controla.

## 4. Identidade do chunk: `chunk_id` ou `chunk_sha256`?

As asserções em TypeScript comparam `chunk_sha256`. O verificador em Python compara
`chunk_id`. Testado: candidato com `chunk_a` contendo `Valor executado: R$ 11.950.` e
contexto com `chunk_a` contendo `R$ 91.950.` — conteúdos diferentes, mesmo id — passa
como `ACEITO`.

A guarda em `provide_context` recusaria, porque compara o dataclass inteiro, mas
atribuir as listas diretamente contorna essa guarda, que é o que o próprio F2 faz.

Escolha uma identidade. Se é o hash, as comparações têm de ser por hash em todo lugar,
e `chunk_id` fica como rótulo de leitura. Nossa própria experiência aqui foi essa: dois
arquivos de mesmo nome em lotes diferentes só não se sobrescrevem porque o original
mora em `originais/<ID>/`, e a conferência é por sha256.

## 5. O exemplo JSON não valida contra o próprio contrato

Conferido campo a campo contra as interfaces declaradas no mesmo documento: **13
desvios**. Os que importam:

- Os três `PermissionToken` do exemplo não têm `valid_from`, que a interface exige sem
  marcar opcional.
- `permission_digest`, `version_digest`, `record_digest`, `raw_text_hash` e um
  `chunk_sha256` são placeholders (`perm_state_hash_A`, `cfg_v1_sha256...`,
  `d4e5f6...`). Aceitável num exemplo narrativo, mas então ele não serve de fixture de
  conformidade — e um contrato sem fixture que passe é um contrato sem teste.

## 6. A asserção 4 é mais fraca do que parece

`assert(T3.checked_at < T2.valid_until)` é apresentada como garantia de que "o T3 não é
apenas um T2 reutilizado". Ela não garante isso: um T3 que seja cópia literal do T2,
dentro da janela, satisfaz a desigualdade. O que ela prova é que T3 não atrasou.

Para frescor é preciso: `T3.token_id != T2.token_id`, `T3.checked_at >= T2.checked_at`,
`T3.checked_at` dentro de `[T3.valid_from, T3.valid_until]`, e `T3.permission_digest`
recalculado a partir do estado e dos eventos aplicados — senão o digest é só um campo
que o runtime preenche com o que quiser.

## 7. Option B: o que está faltando e o que é redundante

**Faltando**, em ordem de consequência:

1. `papel` por observação (`fonte` / `conteudo_recebido`). Sem isso, seção 3.
2. Ligação entre afirmação e citação. `citations_used` é uma lista por geração; não há
   como dizer qual frase da resposta se apoia em qual trecho. Com isso, uma resposta
   que cita um chunk legítimo e afirma algo que não está nele é conforme. `locator` é
   string livre (`"memory.md, linha 18483"`), portanto não conferível por máquina.
3. Eixo de efeito. O record cobre leitura; não há onde representar um passo que grava,
   envia ou paga, nem chave de idempotência. Um agente que manda e-mail não aparece.
4. Estado da resposta entregue. `used_but_suppressed` diz que o LLM viu o chunk; não diz
   se a resposta foi entregue. São coisas diferentes, e é a que mais importa para quem
   recebe.
5. Regra de canonicalização do `record_digest`. "SHA256 de todos os campos acima" não é
   reproduzível sem fixar ordem de chaves, forma unicode, formato de número e se campo
   ausente difere de `null`. Ou adote JCS (RFC 8785), ou hasheie os bytes da linha como
   gravados — que é o que fazemos com `traco.recebido`.
6. `issuer_key_id` e algoritmo nas assinaturas. `issuer_signature: string` não diz contra
   qual chave conferir. A trust root externa o documento já marca como `REFUTED`; de
   acordo.
7. Semântica de token `null`. O exemplo tem `T4_pre_export: null` e nada define o que
   isso significa para a verificação. Regra necessária: token nulo é etapa não
   alcançada, e qualquer `final_state` que afirme tê-la passado deve falhar.

**Redundante ou inconsistente:**

1. `suppressed_at_display` declarado como "sinônimo de `used_but_suppressed`". Dois
   nomes para um estado é brecha: um verificador que confere um dos nomes é contornado
   com o outro. Remova.
2. `PermissionEventLog` está declarado e não é referenciado por `GenerationRecord`. O
   texto diz "opcional, mas recomendado: anexar", e não existe campo onde anexar.
3. Três vocabulários de estado no mesmo documento: a união em TypeScript, a lista no
   docstring do Python (que inclui `exported` e `failed_binding`, ausentes da união) e o
   código (que produz `failed_token_expired`, ausente das duas).
4. `chunk_id` como identidade ao lado de `chunk_sha256` — seção 4.
5. `record_type` com um único valor, enquanto a história de TOCTOU precisa de um registro
   para geração abortada.

## 8. O que vale adotar

Três coisas do v3 são ganho real sobre o que temos:

1. **A hierarquia de três níveis.** Nosso contrato tem observação e citação, mas não
   distingue "a busca encontrou" de "o runtime enviou". Sem isso não se detecta recall
   silencioso: a recuperação achou a fonte que contradizia a resposta e o runtime
   deixou de enviá-la. Isso é adotável no nosso `passos.jsonl` sem reescrever nada.
2. **O eixo temporal de permissão.** Nossa série X não tem nenhum invariante de
   autorização. A distinção entre "revogado antes do uso" e "usado e suprimido" está
   conceitualmente certa, e combina com a nossa postura: o que não pode ser desfeito é
   registrado, não escondido.
3. **Digest e assinatura por registro.** Temos hash por observação, não por registro, e
   nenhuma assinatura.

## 9. Sobre a escolha do TypeScript

O documento abre com `τ: VERIFIED` para a escolha do TypeScript como linguagem de
contrato. Isso é uma preferência de engenharia, não uma proposição verificada; não há
o que falsificar ali.

Na prática: uma interface TypeScript não é verificação — ela desaparece na compilação.
Validar de verdade exige gerar JSON Schema a partir dela ou manter schemas `zod` à mão,
e o verificador que precisa consumir isto na nossa cadeia é Python. Manter duas
descrições em paralelo foi justamente como as duas metades deste documento passaram a
discordar sobre quem cunha os tokens e sobre o que identifica um chunk.

Recomendação: um artefato normativo só — JSON Schema — com os tipos TypeScript
*gerados* dele, e validação a partir do Python sem runtime novo. O repositório tem
`package.json` e `node_modules`, então TS é viável; o que não é viável é paridade
mantida à mão.

## 10. Honestidade desta conferência

O que foi executado: a transcrição do `arkhe_v3.py` como publicado, uma cópia com um
único `@property` removido, e duas sondas minhas. As sondas e as cópias estão em
`C:\Users\Lemes\AppData\Local\Temp\claude\a88bebbe792fe3de\42e57f9f-43d8-4788-a0ee-174b51c4692c\scratchpad\arkhe-v3-avaliacao`,
que é diretório de sessão e desaparece em limpeza ou reboot.

O que não foi feito: não escrevi substituto, não implementei o verificador v3, não
integrei nada ao nosso `passos.jsonl`. As sondas foram escritas por mim, no mesmo
processo que redigiu este parecer, e não houve revisão independente. Os achados das
seções 1, 2, 3, 4 e 5 são reproduzíveis rodando os três arquivos; os das seções 6, 7, 8
e 9 são leitura e julgamento, não execução.
