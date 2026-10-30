# Ciclo de confiança: estado executado e preparação de TEE real

O usuário informou que Nitro/TDX/SEV-SNP não estão disponíveis e pediu preparação para testes com integrações reais futuras. Não foi instalado ou simulado hardware, provisionada chave de produção ou alegada atestação nível 3 executada.

## Harness opt-in

`integration/arkhe-bugbounty/tests/workload_live.rs` é habilitado pela feature `workload-integration`. Sem ARKHE_WORKLOAD_MANIFEST, o teste falha explicitamente; não há skip silencioso nem fallback mock. O manifesto usa somente caminhos absolutos. Template deliberadamente inválido com placeholders: `docs/evidence/local/2026-10-18/trust-lifecycle/workload-manifest.example.json`. Copie-o para `ops/local/` e preencha apenas quando existir infraestrutura real. O template não é política aprovada.

O teste compõe o SignedWorkerVerifier real e AttestedWorkerVerifier, confere um recibo Ed25519 da chave exata, mede BLAKE3 dos bytes do artefato e exige report data vinculado ao WER, tenant, chave e artefato. Usa relógio real e idade/expiração. O caso inicial é análise raiz sem pais; não cria evidência admitida fictícia. Qualificação de Execute com pais requer um EvidenceReader real adicional.

O operador fornece um executável de verificação nativa confiável. O harness verifica o BLAKE3 do executável e do bundle de raízes antes de cada chamada. Ele invoca diretamente, sem shell, com stdin fechado, timeout de 30 segundos e stdout máximo de 1 MiB. Não há argumentos arbitrários do relatório. O comando é:

```text
native-verifier --evidence <arquivo> --roots <bundle-aprovado> --expected-binding <64-hex>
```

Esse executável/adaptador precisa implementar a validação nativa de cadeia, assinaturas, revogação/TCB, modo debug, plataforma e report data para Nitro, TDX ou SEV-SNP. Não é fornecido nesta mudança. Fixar seu digest não prova que sua implementação é correta; executável, arquivos e política precisam estar sob controle do operador e não podem ser alterados concorrentemente. O harness é ferramenta de qualificação, não executor sandbox de binário não confiável.

Saída stdout: um único JSON sem campos extras, com `platform` (`nitro`, `tdx` ou `sev-snp`), `measurements` (mapa nome→hex), `report_data` (32 bytes hex), `issued_at_ms` e `expires_at_ms` (Unix ms). O adaptador só deve emitir essas claims autenticadas com exit zero; erro de confiança deve retornar código não zero. Stderr não é publicado pelo harness. A interface comum de validade é responsabilidade do adaptador: não inventar timestamps ou validade que a evidência nativa não autentique. Provedores que exigirem challenge/revocation services precisam de implementação e qualificação específicas.

O teste imprime `required_report_data` antes da validação. A ferramenta de atestação deve produzir evidência vinculada a esse valor. Não cria chave privada nem assina o WER; o recibo e a chave pública confiável devem vir do ambiente real. `artifact_blake3`, `verifier_blake3` e `roots_blake3` são BLAKE3 dos bytes, sem prefixo de domínio. PCR0/PCR1/PCR2 são SHA-384 hex autenticados de Nitro; outros provedores usam seus nomes/medidas explícitos da política aprovada.

Executar futuramente, uma vez por manifesto de cada provedor:

```powershell
$env:ARKHE_WORKLOAD_MANIFEST=(Resolve-Path ops/local/workload-manifest.json).Path
$env:ARKHE_EVIDENCE_DIR='docs/evidence/local/AAAA-MM-DD/workload-real-novo'
python scripts/record_gate.py real-workload -- cargo test -p arkhe-bugbounty --features workload-integration --test workload_live --locked -- --nocapture
```

O caso positivo deve passar com a evidência real e o negativo altera execution_id: a mesma evidência/recibo deve rejeitar o novo WER. Não há chamada HackenProof, inferência, pagamento ou publicação. O harness não promove política, chave ou estado de produção. Mantenha o manifesto local sem segredos; não inclua chaves privadas nele.

## Journal durável

PgOperations já implementa Journal e é injetado no TriageExecutor. Nesta rodada foram repetidos os testes postgres_live com banco real: persistência, replay após reconexão, conflito de parâmetros, concorrência entre instâncias, resultado incerto sem reenvio, fencing por owner token, reconciliação persistida/isolada e reserva abandonada. O verificador de execução nesses testes específicos é fixture pinned, e a escrita externa é simulada: PostgreSQL real não transforma isso em qualificação de TEE ou HackenProof.

## Correções sobre as garantias do anexo

- WER assinado demonstra integridade e identidade do emissor sob raízes aprovadas. Não prova sozinho que um PoC reproduziu vulnerabilidade, a segurança econômica ou a verdade semântica da alegação.
- Isolamento de processo não equivale a atestação de hardware. Nesta rodada não foi integrado harness Foundry/PoC, gVisor, SGX ou ZK ao gate de triagem.
- Um hash/grafo append-only permite verificar integridade sob pressupostos e checkpoints; não elimina raízes de confiança, não comprova completude e não prova que esta captura foi ancorada no Rekor. Não foi realizada ancoragem pública nesta rodada.
- Journal impede reenvio automático de operações incertas e permite replay de resultados conhecidos; não garante exactly-once remoto nem pagamentos. O fluxo testado é triagem, não liquidação de recompensa ou publicação de patch.
- A assinatura de checkpoint/recibo não substitui definição/verificação do predicado de PoC. Um resultado de enclave também depende do programa, inputs, cadeia e modelo de ameaça; não torna falsas provas universalmente impossíveis.

As alegações bibliográficas do anexo não foram verificadas neste trabalho. Elas não fundamentam novas garantias do repositório. Hardware real permanece NOT_AVAILABLE/NOT_EXECUTED; produção não autorizada.

## Evidências desta rodada

`docs/evidence/local/2026-10-18/trust-lifecycle/RESULTS.md` separa o PASS PostgreSQL real, compilação do harness, rejeição esperada de configuração ausente, testes de pacote, formatação e arquitetura. Um PASS de build ou de rejeição de configuração não é PASS de hardware.

Resultado local: nove testes com PostgreSQL real passaram; 76 testes do pacote passaram; harness opt-in compilou; ausência de configuração real foi rejeitada como esperado; formatação e arquitetura passaram. Os seis comandos registrados preservaram o hash de fonte antes/depois. Estado de hardware em readiness.json: NOT_AVAILABLE_NOT_EXECUTED.
