# PoC vinculado à política resolvida: integração candidata

Atualização: a API atual exige origem externa do bloco/prioridade e oferece roteamento por operador; veja [correções de ancoragem](ANCHOR-PRIORITY-OPERATOR-ROUTING-2026-10-18.md). Os formatos v2 e a ausência de prioridade descritos abaixo são históricos.


Implementado `bounty_evidence::policy` em `integration/arkhe-bugbounty/src/bounty_evidence/policy.rs`. No código atual o contrato institucional é PolicyBinding/PolicyResolver; não existia um tipo Rust universal ResolvedPolicyArtifact implementando as alegações do anexo. O novo ResolvedPocPolicyArtifact é uma extensão específica e candidata, não uma resolução institucional aprovada.

## Resolução e condição de sucesso

O artefato inclui versão, identidade/versão/digest da política pai, PocPolicy completa e módulos de execução permitidos. Seu digest BLAKE3 tem domínio `AKG:POC:RESOLVED-POLICY:v1` e projeção canônica; ganhos u128 são texto decimal para evitar truncamento na representação numérica. Modificar cadeia, fork, janela, alvo, ativo, ganho mínimo ou módulos altera o digest.

`ResolvedPocPolicy::resolve` exige digest não nulo aprovado independentemente e correspondência exata com o artefato e PolicyBinding pai. Não existe root padrão, autopinning, aprovação por pesquisador ou geração de assinatura de governança. Calcular o próprio digest e fornecê-lo como aprovado só é uma fixture de teste, não um processo de ratificação.

O artefato rejeita política sem alvos, identificadores inválidos, ganho mínimo zero, versão inválida e módulos ausentes. A fonte da aprovação do digest deve ser o mecanismo de governança e distribuição confiável do deployment. Não foi criado um perfil genérico de assinatura fingindo uma nova autoridade institucional.

## Avaliação com evidência admitida

`evaluate_admitted` exige que PolicyResolver ainda permita a política pai para o WorkIntent TriageReport. Confere contexto único Named(PocPolicy) e Named(PocExecution), módulo permitido, operação Execute, input do WER igual ao alvo do intent e execution_id igual ao operation_id.

O output do WER deve vincular digest do artefato, solicitante, operação, relatório/alvo, parâmetros e todos os campos da medição sob `AKG:POC:BOUND-MEASUREMENT:v1`. A consulta EvidenceReader deve recuperar o WER com hash/payload/subject corretos. Alteração de medição, destinatário lógico, parâmetros, request identity, fonte ou contexto causa rejeição antes de avaliar ganho.

Após essas checagens, evaluate_poc retorna o veredicto determinado pela política aprovada. Pass continua sendo um resultado de avaliação, não AuthorizationDecision::Allow. Não chama escrita externa, pagamento, journal ou emissão de recibo e não altera o gate ativo. O chamador deve injetar leitor de evidência/admissão confiável; um store fake que aceite hashes arbitrários não cria proveniência.

## Registry real e TEE

Conforme informado pelo usuário, não existe infraestrutura TEE disponível; ela deve permanecer preparada para integração futura. O harness `tests/workload_live.rs`, feature workload-integration, e o guia `TRUST-LIFECYCLE-2026-10-18.md` exigem executável nativo, raízes/políticas fixadas, evidência e recibo reais, sem fallback mock. Nenhum registry real foi inventado ou promovido a Hardware.

VerifierRegistry de bounty_evidence continua conferindo metadados declarados. A integração real exigirá autenticar a distribuição do registry, a cadeia de atestação, posse e vínculo da chave, revogação/TCB e identidade de operador. O novo artefato de PoC não resolve esses requisitos nem converte AttestationLevel em prova. O SignedWorkerVerifier/PgKernel existente é a fronteira de admissão; implantações futuras podem compor o AttestedWorkerVerifier com adaptador nativo confiável.

## Ajustes nas conclusões do anexo

- evaluate_poc não mede campos: recebe medições. O novo wrapper confere o vínculo da saída a um WER admitido; a veracidade das medições depende do harness/verificador.
- Testes de abertura/partição exercitam o formato e negativos; não provam resistência a colisões ou segurança universal do compromisso.
- Comparar key_id não verifica assinatura; contar operator_id não comprova custódia independente.
- PayoutJournal é em memória, não transfere fundos e não garante exactly-once remoto. Regras legais, moeda/chain/tenant e canonicalização de bug permanecem fora do candidato.
- Não foram verificadas ou promovidas a LEMMA as alegações bibliográficas recebidas.

## Testes

`tests/poc_policy.rs` cobre pin nulo/errado, alteração de ganho/módulo, mudança da política pai, ganhos u128, governança negada, evidência ausente/corrompida, medição alterada, parâmetros/solicitante/alvo/request identity diferentes, contexto duplicado e resultado negativo de ganho mesmo com evidência admitida. São fixtures locais explícitas: nenhum PoC, TEE ou revisão humana real foi executado.

Comandos e hashes em `docs/evidence/local/2026-10-18/poc-resolved-policy/RESULTS.md`. Produção permanece não autorizada.

Resultado executado: 118 testes do workspace passaram; formatação e arquitetura passaram. Os três comandos registrados mantiveram o hash de fonte antes/depois; hashes dos logs conferidos. Nenhuma política real foi ratificada e nenhum registry real foi integrado.
