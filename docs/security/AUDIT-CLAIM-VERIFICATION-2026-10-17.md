# Verificação das afirmações e pacote de revisão

## Fontes completas, não apenas resultados de pesquisa

Conferidas em 2026-10-17, as páginas
[Smart contracts](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/smart-contracts)
e [Blockchain protocols](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/blockchain-protocols)
incluem, após as tabelas, a condição “If the issue is not under one of the mentioned
vulnerabilities” e a expressão “we use the Common Vulnerability Scoring System”.
Isso confirma diretamente o fallback. Não declara que toda política Arkhe de
combinação tabela/CVSS seja uma exigência HackenProof, nem fixa a versão CVSS.

A [documentação de apps auth.md](https://workos.com/auth-md/docs/apps) distingue
o ID-JAG do provider da identity_assertion assinada pelo serviço. A primeira
verificação usa a raiz do provider; a troca verifica a assertion do serviço com
a raiz do Authorization Server. A implementação local mantém essas duas raízes.

## Evidência de idempotência

Código: `kernel/arkhe-core/src/work.rs`, método `WorkIntent::operation_id`.
Projeção v2 contém intent_type, target e request_identity; parameters_digest e
claimed_created_at ficam fora. O journal compara parâmetros separadamente.

Testes em `integration/arkhe-bugbounty/tests/triage.rs`:

- `operation_id_excludes_parameters_and_timestamp_but_binds_request`.
- `same_request_different_parameters_conflicts_without_second_write`:
  mesma RequestIdentity, primeira execução aceita, segunda com outra severidade
  retorna Error::ParameterMismatch, contador de escrita permanece 1.

Saídas reais e identidades de código da execução:
`docs/evidence/local/2026-10-17/audit-claim-verification/RESULTS.md`.
Conclusão restrita a esses testes locais; não é teorema formal de execução remota.

## Pacote preparado

`docs/evidence/local/2026-10-17/triage-evaluation/run-01/review-package/README.md`
descreve o protocolo de cinco passos. O gerador verificou os hashes de dataset,
config e runner contra o manifesto histórico. IDs/títulos foram neutralizados;
corpos e severidades preservados. Rótulos, família, justificativas e mapa de IDs
ficam no arquivo separado labels-sealed.json. Os selos são procedimentais, sem
criptografia. O stdout preservado é da CLI normalizada, não uma captura HTTP
bruta do provedor. Não foi encontrada política de escalonamento versionada ativa;
o arquivo correspondente registra NOT_RECORDED_IN_RUN_01.

`admin` permanece placeholder não DID. O template assume independência false
conservadoramente e deixa horários, respostas e concordâncias em branco. Estado:
PENDING_OPERATOR_REVIEW. REVIEWED_BY_OPERATOR só se aplica quando a pessoa concluir
a revisão; INDEPENDENTLY_REVIEWED não foi atribuído. Quem já viu resultados ou o
anexo que discute o erro não pode declarar cegamento retrospectivo.

Nenhum review.json humano foi fabricado. Nenhum perfil, assinatura, rótulo,
resultado histórico ou inferência run-02 foi alterado ou aprovado.

Para conferir a integridade sem mostrar conteúdo selado:

```powershell
python scripts/prepare_triage_review.py --verify
```
