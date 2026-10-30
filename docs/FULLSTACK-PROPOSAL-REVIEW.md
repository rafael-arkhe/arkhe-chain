# Conferência do anexo fullstack — 2026-10-19

Escopo: leitura do anexo 16537caa-3175-4cc3-8384-d4ff0efc0e51 e comparação
estática com caminhos, manifests e trechos de código locais. Não é ensaio
end-to-end, auditoria completa nem certificação de implantação.

## Resultado

O anexo é uma proposta descritiva e não uma árvore exaustiva comprovada.
A frase final que declara configuração e alinhamento aos testes de integração
não é sustentada apenas por essa listagem. Nenhum teste foi executado nesta
conferência; nenhum código, migração ou material congelado de C01 foi alterado.

| Afirmação do anexo | Estado observado |
| --- | --- |
| Verificadores em `kernel/arkhe-verify-*` | Membros reais em `verification/crates/arkhe-verify-*`. |
| SQL em `evidence/arkhe-sql` e migrador em `governance/` | Membros reais em `storage/sql/crates/`; migrações em `storage/sql/migrations/`. |
| Todos os workflows apresentados estão configurados | `.github/workflows` contém `ci.yml` e `besu-b0.yml`; os demais arquivos listados não foram encontrados nesse diretório. Isso não determina sozinho o conteúdo ou cobertura dos jobs existentes. |
| `arkhe-containers`, `arkhe-workers`, `orchestration/arkhe-intra` e `work/arkhe-work-cockpit` integram o workspace | Esses caminhos não constam como membros no Cargo.toml conferido; `orchestration/arkhe-runtime` consta. Não apresentar os adaptadores descritos como operacionais por esse diagrama. |
| Diretórios raiz `deploy/`, `migrations/`, `vectors/` | Não encontrados na conferência; vetores existem em `verification/vectors/` e especificações em `specs/akg` e `specs/mmr`. |
| Kernel emite WorkerExecutionRecord após autorização | `ContainmentGate::authorize` recebe registro opcional; APIs de admissão recebem registro e evidências. O retorno é `AuthorizationDecision`, com Allow/Reject. |
| `arkhe-learning` implementa Dream-RSI | O arquivo conferido compõe uma proposta com referências de baseline, candidato, avaliação e rollback; isso não demonstra um loop autônomo Dream-RSI. |
| Todas as tabelas são estritamente INSERT-only | Evidência imutável e estado operacional têm contratos diferentes: operation_journal, payout_jobs e checkpoint_witness possuem transições controladas. Não generalizar append-only a todo o banco. |

## Correções de interpretação

- Separar proposta cognitiva, registro da execução cognitiva, admissão, journal,
  execução do efeito e receipt observado. Um Allow não comprova efeito executado
  ou liquidado. O diagrama precisa representar essas etapas e suas falhas.
- Encontrar BLAKE3 e SHA-256 como funções auxiliares em
  `verification/crates/arkhe-verify-core/src/hash.rs` não demonstra identidade
  dual-digest. Não alterar nem descrever o perfil MMR v1 como dual sem contrato
  normativo e ensaios correspondentes.
- `ON CONFLICT DO NOTHING` no helper SQL genérico não substitui a comparação de
  identidade e parâmetros exigida no journal de operações.
- RLS, revogações e triggers estão presentes nas migrações consultadas. Sua
  eficácia depende dos papéis, privilégios, políticas e configuração realmente
  aplicados. Triggers UPDATE/DELETE por linha não cobrem TRUNCATE; há revogações
  explícitas desse privilégio. Isso não limita poderes de administrador do banco.
- O snapshot atual inclui `cognition/arkhe-metacognition/src/self_model.rs`.
  Não repetir a antiga afirmação de ausência desse arquivo, nem inferir uma
  metacognição completa apenas da existência dele.
- Ancoragem MMR não concede autoridade de execução. Verificador WASM não
  substitui o enforcement nativo nem comprova sandbox, TEE ou liquidação.
- ONB02 e ONB03 permanecem pendentes; essa proposta não seleciona VM Windows,
  aprova revisão humana ou altera os materiais C01.

## Continuidade

Priorizar um mapa de capacidades com vínculo por caminho, contrato e teste antes
de gerar manifestos Kubernetes. Manter gVisor/runwasi, filas, TEE, quórum,
atestação de release e integrações externas classificados segundo evidências
específicas; nomes de diretório e comentários de árvore não são comprovação.
