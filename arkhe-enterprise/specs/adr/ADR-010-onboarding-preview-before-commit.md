# ADR-010 — Preview por usuário e commit único por instalação

Data: 2026-10-23. Estado: implementado e testado localmente.

## Decisão

Os previews são **por usuário**, não por organização. Um owner tem no máximo um preview corrente. Gerar outro substitui somente o próprio preview. Previews de outros owners permanecem válidos até expirar ou ocorrer o primeiro commit.

O SHA-256 é compromisso de integridade dos dados normalizados, **não assinatura digital**. A expiração é de quinze minutos. O servidor vincula o preview à identidade da sessão. Nenhum hash fornecido pelo cliente substitui os dados armazenados no servidor.

## Concorrência entre owners

1. A cria P1, B cria P2: ambos existem, vinculados a seus respectivos usuários.
2. B não pode confirmar o hash de P1 usando sua sessão.
3. A e B podem iniciar consulta cadastral simultaneamente, fora da transação SQLite.
4. Após a consulta, cada chamada abre `BEGIN IMMEDIATE` e revalida perfil ausente, usuário, hash, conteúdo e prazo do preview. Mudança ou expiração durante o I/O resulta em 409.
5. O primeiro commit válido grava perfil, evidência cadastral e evento; remove **todos** os previews; efetiva a transação.
6. O segundo recebe **409 — organização já possui perfil imutável**. Não modifica perfil ou auditoria. Uma consulta cadastral eventualmente feita pelo perdedor não cria perfil.

O teste A+B inicia os dois commits com `Promise.all`, exige exatamente um 201 e um 409, verifica ausência de previews, um único evento e integridade da trilha. Outro teste altera o preview enquanto a consulta cadastral está em andamento e exige rollback lógico sem criação do perfil.

## Gate cadastral

Antes do commit, o servidor consulta o endpoint de produção Serpro com OAuth2. Exige mesmo CNPJ, situação ativa (código 2), razão social normalizada coincidente e CNAE principal coincidente. A evidência persistida inclui origem, horário da consulta, campos verificados, hash da resposta e hash do preview. Não persiste token ou a resposta completa.

Sem credenciais, com resposta divergente, erro, timeout ou dados inválidos: **nenhum commit**. Não existe fallback para dígitos verificadores, trial, mock ou declaração não verificada em produção.

Esta opção atende o gate cadastral mínimo do review. **Não prova representação legal, posse de e-CNPJ, assinatura ICP-Brasil ou admissão WormGraph.** O perfil mantém `representation: not-verified`. As chaves dos documentos continuam sendo as contas Ed25519 existentes; CNPJ declarado/consultado não vira identidade de assinatura.

## Evidência

Fonte: `apps/arkhe-intra/lib/enterprise.mjs` e `enterprise-cnpj.mjs`.
Teste: `apps/arkhe-intra/tests/enterprise.test.mjs`.
