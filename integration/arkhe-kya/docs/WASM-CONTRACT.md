# Contrato WASM e estado externo

O export `verify_passport_json(receiptJson, contextJson, statusJson, policyJson)`
recebe quatro textos JSON. `statusJson = ""` significa ausência. Os formatos
estão em `schemas/wasm-request.schema.json`, `wasm-context.schema.json`,
`verifier-policy.schema.json` e `status-envelope.schema.json`.
O schema é contrato estrutural; não verifica assinaturas nem autentica inputs.
O parser Rust continua a rejeitar campos desconhecidos e duplicados: preservar
os textos JSON originais quando recebidos, em vez de normalizar JSON ambíguo.

`minimum_status_sequence` é campo obrigatório da **policy do consumidor**,
inteiro u32. Não vem do recibo/status. O WASM não faz I/O, não persiste estado,
não consulta o relógio ambiente, não descobre trust roots e não consome challenges.
`context.now`, pins e desafio são fornecidos independentemente pela contraparte.

O host deve conservar o maior piso conhecido por issuer/lista/propósito em
storage confiável e serializar verificações/atualizações concorrentes. Usar
`max(piso persistido, piso configurado)` como input. Um resultado de revogação
autenticado também deve elevar o piso; uma falha de assinatura não o eleva.
A CLI `verify-presentation` já faz essa composição. Não copiar `sequence` do
upload para a policy antes de a assinatura ser verificada.

Piso zero é apenas bootstrap sem histórico, não prova de frescor. O consumidor
tem também de aplicar idade máxima e validade, guardar/recuperar o estado e
consumir desafios de uso único. Browser sem storage apropriado não herda o
estado persistido pela CLI. As responsabilidades do host não são testes de TEE.

Há um caso explícito de paridade nativa/WASM com lista de sequência 7 e policy
com piso 8: resultado REJECT por rollback. Não se promove isso a validação de
estado live ou a execução browser E2E.
