# Política faseada de representação

Decisão do usuário em 2026-10-23: piloto interno com declaração e base documental; piloto externo condicionado a representação verificada; Speedrun somente após requisitos do piloto. Cadastro da empresa e poderes do signatário são eixos separados.

## Fase 0 implementada — escopo interno e genérico

Exige `ARKHE_ENTERPRISE_PHASE=internal` no servidor, perfil `generic`, papel real owner, preview válido e cadastro Serpro ativo/coincidente. O default é external e recusa autodeclaração. A confirmação do perfil continua bloqueada se o Serpro não estiver habilitado.

O usuário seleciona a condição e fornece os anexos abaixo. O navegador calcula SHA-256; **não transmite os documentos originais nem a chave privada**.

| Condição declarada | Hashes obrigatórios |
| --- | --- |
| Sócio-administrador | Contrato social/estatuto e identidade do signatário |
| Diretor eleito | Contrato/estatuto, identidade e ata de eleição |
| Procurador | Contrato/estatuto, identidade e procuração |

O servidor gera declaração vinculada à conta, CNPJ, hash do preview, condição, hashes, nonce e prazo de assinatura. A chave Ed25519 cadastrada da conta assina exatamente esses bytes no navegador. Isso autentica a chave da conta; o hash de uma identidade não equivale à conferência da identidade civil.

O binário `arkhe-representation-anchor` verifica novamente a assinatura, usa o `WormGraph` Rust existente para registrar envelopes de documentos e declaração e reconstrói o checkpoint pelo perfil MMR existente. O recibo, envelopes, declaração e assinatura são persistidos atomicamente no SQLite da aplicação, com evento na trilha. O teste de integração recomputa as mesmas roots e verifica as provas no WASM independente.

O perfil recebe `representation_basis.kind=SelfDeclared`, `assurance=self-declared-local-wormgraph`, `powers_verified=false` e `external_timestamp=false`. É **WormGraph local de evidências da aplicação**, com envelopes exportáveis pela resposta de estado; não é admissão WER do ContainmentGate, persistência PostgreSQL do runtime, RBB, Rekor ou carimbo de tempo externo. O horário assinado é informado pelo servidor; não se promete datação independente.

Guarde os originais para conferir seus hashes. O sistema não analisa conteúdo, cláusulas de assinatura conjunta, mandato, validade documental ou poderes. O prazo do desafio é janela de confirmação, não prazo jurídico de mandato.

## Gate por risco

- Financeiro, saúde e governo: recusam SelfDeclared; exigem futura procuração com escopo verificado ou e-CNPJ com cadeia, situação e poderes verificados.
- Piloto externo, inclusive generic: não aceita SelfDeclared.
- Outras seleções de setor: permanecem como previews; a confirmação por autodeclaração está restrita a generic interno.
- `representation_basis`, `chain_verified` ou nomes de métodos enviados pelo cliente não elevam garantia. Somente o servidor pode construir uma base aceita.

## Fases 1 e 2 — contratos e integrações ainda pendentes

`PowerOfAttorney`, `ECnpj` e `Qsa` são variantes previstas, exibidas como pending na política retornada pela API. **Não há verificador e-CAC/e-CNPJ operacional nesta entrega**. O gate recusa os commits correspondentes; não converte um upload ou booleano em poderes verificados.

Para PowerOfAttorney, será necessário conferir emissor, outorgante, outorgado, CNPJ, escopo específico do ato, prazo e revogação, preservando comprovante e vínculo ao preview. Uma autorização do e-CAC é relativa aos serviços digitais escolhidos da Receita; não se presume que autorize um commit em software privado. Essa limitação consta no [guia oficial da Receita](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/passo-a-passo/autorizacoes-de-acesso-guia-do-usuario.pdf).

Para ECnpj, será necessário validar assinatura e vínculo aos bytes do commit, cadeia confiável ICP-Brasil, CNPJ e responsável, revogação/validade e base documental dos poderes. CN e serialNumber serão registrados **após** a validação; não serão aceitos como prova por si mesmos. QSA, cláusulas de assinatura conjunta e limites do ato precisam de análise própria. Não se declara que certificado ou registro cadastral, isoladamente, prova poderes.

## Implementação e evidências

- `lib/enterprise-representation.mjs`: desafios, documentação obrigatória, assinatura, processo Rust e persistência.
- `components/enterprise-representation.tsx`: hashes e assinatura no navegador.
- `evidence/arkhe-wormgraph/src/bin/arkhe-representation-anchor.rs`: registro e checkpoint local.
- `tests/enterprise.test.mjs`: anexos, assinatura, risco, flags falsas, provas WASM e concorrência.
- [Relatório do browser](validation/2026-10-23/pilot/browser-report.json): fluxo real da declaração com documentos sintéticos.
