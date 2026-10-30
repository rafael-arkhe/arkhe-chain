# Primeiro vínculo Intra → kernel — 28/10/2026

O perfil opcional registra uma versão de rascunho como `DraftDocument` no runtime
nativo. O adaptador Rust usa `arkhe-core` para gerar WorkIntent, WER, digests e
CBOR; o digest BLAKE3 do conteúdo continua sendo a identidade da aplicação.
O ator nativo é a identidade de serviço configurada pelo operador. A autoria do
documento fica vinculada pelo digest do envelope; não é autenticação do usuário
do Intra perante o kernel.

## Preparação

Execute `cargo build --locked -p arkhe-core --example intra_draft` (também incluído
em `pnpm intra:prepare`). Com o runtime local já provisionado e autenticado,
crie `native-drafts.json` no diretório privado de dados do Intra:

```json
{
  "binary": "D:/arkhe/target/debug/examples/intra_draft.exe",
  "endpoint": "http://127.0.0.1:8788/",
  "actor": "local-operator",
  "token": "SUBSTITUIR_PELO_TOKEN_PRIVADO_DO_RUNTIME"
}
```

O ator precisa corresponder a `ARKHE_ACTOR` do runtime. O endpoint aceita apenas
HTTP em IP de loopback, sem credenciais na URL, caminhos, query ou redirects.
Não copie esse arquivo para documentação ou exportações. O recurso fica
desabilitado sem configuração e não provisiona nem altera o runtime existente.
O binário deve ser compilado e distribuído com o perfil escolhido; esta entrega
não atualiza MSI/ZIP anteriores.

## Uso e recuperação

No visor de um rascunho, autoria ou governança seleciona **Registrar rascunho no
kernel**. O servidor preserva o pedido em SQLite antes do POST `/work`. Depois
confere os digests do recibo, os bytes de ambos os objetos canônicos e os vínculos
do envelope lido no runtime. A confirmação local e o evento de auditoria são
gravados na mesma transação.

Se a resposta se perder ou a conferência falhar, o pedido permanece pendente.
**Reconciliar registro** reenvia exatamente o pedido preservado, incluindo nonce,
WER e timestamp, ao endpoint idempotente do runtime. Não há repetição automática
em segundo plano. Um recibo já confirmado não provoca novo POST. Alteração do
endpoint/ator bloqueia a reconciliação pelo novo perfil. Edição do documento gera
uma revisão independente; o recibo anterior permanece associado à revisão antiga.

As rotas autenticadas `GET/POST /api/documents/:id/native-draft` respeitam a
visibilidade do documento e as mutações passam pela proteção de origem do Intra.
O export HTTP do documento inclui `nativeDrafts`, sem token, endpoint ou caminhos
privados. O verificador offline atual não confere esse novo campo; os digests e
recibos adicionais precisam de conferência nativa independente.

## Escopo de validação

Os testes usam o adaptador Rust compilado, SQLite temporário e um servidor HTTP
local de teste com o contrato do runtime. Exercitam perda de resposta, repetição
do pedido exato, divergência de bytes, isolamento de revisões, acesso negado,
autenticação HTTP e exportação sem credenciais.

A [campanha de qualidade de 28/10](PRODUCT-QUALITY-2026-10-28.md) também executou
a jornada no navegador contra runtime Rust e PostgreSQL 16 descartável. O recibo
e os objetos canônicos sobreviveram ao reinício do processo nativo, e oito
reenvios concorrentes retornaram o mesmo recibo. As cinco análises axe finais
passaram sem violações. O ensaio usa identidades sintéticas e política de
desenvolvimento; não qualifica uma implantação de produção.

Este registro não autoriza aprovação, assinatura de contrato, publicação Rekor
ou outro efeito protegido. Não altera a política de desenvolvimento do kernel.
Ainda faltam a política de transição protegida, a integração do verificador
offline e a qualificação da distribuição Windows.
