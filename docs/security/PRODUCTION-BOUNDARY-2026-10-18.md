# Gate de qualificação local — fronteira de produção

Status: **qualificação local, sem autorização de produção**.

Resultado executado: PASS no gate Ollama/Ed25519/PostgreSQL e na rechecagem
dos artefatos retidos; 68 testes padrão do workspace passaram, sem falhas ou
ignorados. Os seis testes MCP da fixture também passaram. Formatação, arquitetura
e fronteiras de assinatura passaram. Os registros de execução não indicam mudança
de fontes durante os comandos. `production-readiness.json` mantém
`production_authorized=false` e enumera os bloqueios externos/humanos.

## O que foi implementado

O teste opt-in `ollama_postgres` integra TriageExecutor e OllamaAnalyzer reais
com PgOperations, PgKernel, PgWormGraph e SignedWorkerVerifier. Usa duas chaves
Ed25519 efêmeras de teste, geradas pelo RNG do sistema: uma para análise e outra
para execução simulada. As raízes são restritas a módulo, versão e operação;
o worker de execução exige pai de análise admitido. As chaves privadas ficam
somente na memória do teste e não são exportadas ou aprovadas como raízes reais.

A primeira chamada executa inferência Ollama dentro do executor, assina e admite
a análise, autoriza sob política sintética, despacha para backend simulado e
persiste o recibo e WER de execução. Após descartar o executor, novos pools e
leitores recuperam os objetos canônicos e o resultado do journal. Retry não
gera nova inferência/escrita; parâmetros diferentes retornam ParameterMismatch.

Um registro com assinatura criptograficamente válida, mas módulo não autorizado,
é rejeitado pelo registro independente de confiança e não entra no WormGraph.
Versão de modelo diferente também é rejeitada. Outro tenant não pode usar a
análise ausente para passar pelo gate. Falha externa simulada deixa DISPATCHED,
log operacional e reconciliação; retry após reconectar não despacha novamente.

O segundo teste verifica as capturas públicas e o banco retido sem inferir ou
assinar novamente. Ele confere as assinaturas, bytes canônicos e a assinatura do
módulo rejeitado antes de confirmar a rejeição por autoridade. Conta todos os
WERs do tenant de falha, exigindo exatamente uma análise e nenhuma execução,
além do log execute persistido. Usa papel runtime com RLS, sem bypass de admin.

## Evidências

- Resultados reais: `docs/evidence/local/2026-10-18/ollama-postgres-qualification/RESULTS.md`.
- Captura: `capture-01/analysis-candidate.json`, `execution-record.json`, recibos
  assinados, registro público de chaves TEST, candidato/recibo de módulo rejeitado,
  relatório sintético e `qualification.json` no mesmo diretório de evidências.
- Nenhuma chave privada é incluída. Retenção de assinaturas públicas permite
  rechecagem; não estabelece aprovação da raiz por governança de produção.
- O teste PostgreSQL demonstra **reconexão**, não novo restart do servidor de banco
  ou processo neste cenário. Evidência de restart de outros testes não é herdada.
- A instância Podman e o PostgreSQL de teste existentes foram iniciados; somente
  tenants únicos desta qualificação foram adicionados. Sem apagar dados existentes.

Os testes MCP locais existentes também são executados: autenticação de fixture,
pins de descrição/schema/anotações e rejeição de catálogo alterado, sem repetir
escritas incertas. São testes de transporte local, não autenticação HackenProof real.

## O que ainda impede produção

| Condição | Estado nesta rodada |
|---|---|
| Ollama + journal e evidência em PostgreSQL | Gate local executável, com fixtures declaradas |
| Assinatura Ed25519 e rejeição de módulo/versão | Criptografia real com chaves TEST; não chave de produção |
| Chave de produção, custódia e raiz aprovada | PENDING — não provisionadas ao teste |
| Política de governança de produção | PENDING — nenhuma ratificação sintetizada |
| Autenticação no MCP HackenProof real | PENDING — HACKENPROOF_API_KEY indisponível no ambiente |
| Catálogo real e codec autenticado | PENDING — pins/schema não inferidos dos testes locais |
| Revisão humana e ratificação run-02 | PENDING — somente templates e inventário de hashes |
| Acurácia semântica e estabilidade | Não medidas por este gate |
| Comprometimento simultâneo das chaves de análise e execução | PENDING — cadeia falsa consistente pode passar nos controles estruturais; sem detector semântico ou custódia independente demonstrados |
| Integridade do daemon Ollama | PENDING — sem atestação criptográfica do processo, plataforma ou hardware |

## Limites adicionais de confiança e critério de freeze

Separar chaves e restringir módulo/versão/operação é defesa em profundidade.
O teste não demonstra isolamento de custódia, hosts ou domínios administrativos:
ambas as chaves efêmeras ficam no mesmo processo de teste. Uma chave não concede
a autorização da outra no registro, mas isso não prova que comprometê-las seja
independente. Se ambas as chaves autorizadas forem comprometidas, registros de
análise e execução forjados podem formar uma cadeia estruturalmente coerente e
passar as verificações de assinatura/parentesco/política permitida. O gate não
detecta essa falsidade semântica apenas porque a cadeia foi assinada.

Esse risco permanece aberto para produção. Exige desenho e validação de custódia
isolada, controles de uso das chaves, revogação, monitoramento e fontes de evidência
independentes conforme o modelo de ameaça. A revisão humana é um controle
complementar e continua requerida no plano de avaliação, mas não garante detectar
chaves comprometidas. Revisar run-02 não fecha, por si só, esse risco operacional.
Nenhuma defesa contra comprometimento simultâneo foi implementada nesta rodada.

Também não há atestação de hardware, plataforma ou workload neste gate. Existem
assinaturas de registros com raízes TEST, que não substituem essas capacidades.
O model_digest vem do catálogo informado pelo daemon: coincide com o pin do
cliente e é vinculado ao WER, mas não constitui medição independente do arquivo
ou prova de quais pesos o processo executou. O daemon pode mentir sobre catálogo,
modelo ou resposta. A versão observada não fixa nem autentica seu binário.
Comparar logs ou fazer revisão humana não cria atestação criptográfica do daemon.
O PASS local demonstra o fluxo contra o serviço observado, não sua integridade.

Para FROZEN, preservar e testar a separação nominal entre
`ollama::Assessment` e `classification::TriageAnalysis`, já existente como duas
structs Rust diferentes. Os doctests de Assessment incluem um exemplo positivo e
dois casos compile_fail: não se pode fornecer Assessment onde TriageAnalysis é
exigida, nem usar Assessment como WorkerExecutionRecord no gate. Eles são
executados por `cargo test --workspace --locked` na CI existente. Uma renomeação
que preserve os tipos não elimina a separação; transformar ambos em aliases ou
introduzir conversão implícita que permita esses usos deve fazer a regressão falhar.

O gate deve continuar recebendo WER e verificando admissão/política, em vez de
aceitar diretamente qualquer um dos dois tipos do modelo. Essa barreira de tipos
evita substituição acidental; não prova veracidade dos campos ou correção de uma
classificação construída deliberadamente. O critério mecânico tem teste, enquanto
os bloqueios de chaves, daemon, revisão e governança mantêm produção não autorizada.

Reconexão e restart permanecem propriedades diferentes de durabilidade. Um restart
não prova automaticamente INV-WER-06, resistência a kill -9 ou sobrevivência a
perda de energia: é preciso executar e especificar cada condição. Os testes desta
captura não herdam garantias de interrupção de outras rodadas.

Adendo de prontidão desta revisão:
`docs/evidence/local/2026-10-18/ollama-postgres-qualification/production-readiness.audit-followup-01.json`.
Preserva o snapshot original e referencia seu SHA-256. Produção e FROZEN continuam
false. A validação dos três doctests e da formatação está em
`docs/evidence/local/2026-10-18/qualification-audit-followup/RESULTS.md`.
Não houve nova inferência, restart, assinatura de produção ou revisão humana.

O OllamaAnalyzer retorna Assessment de suporte à proposta e um WER candidato.
Não se chamou essa resposta de TriageAnalysis de classificação emitida livremente
pelo modelo. A versão do servidor é observação registrada, não uma atestação
criptográfica do runtime nem um campo novo assinado no WER. O digest do modelo
e a versão do adapter são vinculados no WER; isso não autentica um daemon comprometido.
PASS local é evidência de execução e controles testados, não teorema formal,
reprodução bit a bit ou poder autorizador de produção.

## Como executar

Requer PostgreSQL migrado e papel runtime sem bypass RLS, Ollama local e modelo
fixado. Injete ARKHE_TEST_DATABASE_URL com segurança, sem expor URL/senha em logs.
Use um diretório de captura novo; o teste recusa sobrescrever capturas anteriores.

```powershell
$env:ARKHE_OLLAMA_CONFIG=(Resolve-Path config/ollama.json).Path
$env:ARKHE_QUALIFICATION_OUTPUT=Join-Path (Get-Location).Path 'docs/evidence/local/2026-10-18/ollama-postgres-qualification/capture-NOVO'
cargo test -p arkhe-bugbounty --features ollama-integration,postgres-integration --test triage actual_ollama_signed_postgres_gate_survives_reconnect_and_rejects_unauthorized_module --locked -- --nocapture

$env:ARKHE_QUALIFICATION_CAPTURE=$env:ARKHE_QUALIFICATION_OUTPUT
cargo test -p arkhe-bugbounty --features ollama-integration,postgres-integration --test triage retained_capture_verifies_signatures_and_exact_failure_graph_after_reconnect --locked -- --nocapture
```

Para o endpoint MCP real, provisionar HACKENPROOF_API_KEY por mecanismo seguro
e executar `cargo run -p arkhe-bugbounty --bin mcp_catalog -- <novo-catalogo.json>`.
Isso faz initialize/tools-list e gera candidato não confiável, sem triage_report.
Revisar os digests e o codec antes de habilitar chamadas. O teste de mutação deve
alterar uma cópia local do catálogo, não a descrição do servidor real em produção.
Não há autorização implícita para uma escrita real pela existência de uma chave.

Os templates humanos estão em
`docs/evidence/local/2026-10-18/production-boundary-review/README.md`.
Não foram preenchidos horários, opiniões, rótulos ou assinaturas pela pessoa.
Quatro arquivos presentes não bastam: validar identidade, hashes, assinaturas,
conteúdo da revisão, split, composição e ratificação conforme os critérios.
O run-02 permanece PRELIMINARY / NOT RATIFIED / NOT EXECUTED.
