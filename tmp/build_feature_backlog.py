import hashlib,json,re,shutil
from pathlib import Path
root=Path(r'D:\arkhe'); base=root/'docs/backlog';base.mkdir(parents=True,exist_ok=True)
shutil.copyfile(Path(r'C:\Users\Lemes\.codex\attachments\d109c733-308b-45ab-a084-3bdb69cdaab2\Texto colado.txt'),base/'source.md')
source=(base/'source.md').read_text(encoding='utf-8')
groups={
1:['kernel/arkhe-core/src','kernel/arkhe-core/tests/golden_vectors.rs','agi-coder/crates/agi-coder-core/src','agi-coder/crates/agi-coder-tests/tests/security.rs'],
2:['verification/crates/arkhe-verify-core/src/gguf','verification/crates/arkhe-verify-core/tests/gguf_supply_chain.rs','integrations/cosign/README.md'],
3:['verification/crates/arkhe-verify-wasm/src/lib.rs','verification/crates/arkhe-verify-core/tests/golden_contract.rs','integrations/verify-mcp'],
4:['kernel/arkhe-kernel/src/lib.rs','kernel/arkhe-kernel/tests','agi-coder/crates/agi-coder-kernel/src','integration/arkhe-bugbounty/src/provenance.rs'],
5:['specs/mmr/spec/mmr-profile-v1.md','verification/crates/arkhe-verify-core/src/mmr','verification/crates/arkhe-verify-core/tests/mmr.rs','agi-coder/crates/agi-coder-wormgraph/src/mmr.rs'],
6:['integration/arkhe-depin/src','integration/arkhe-bugbounty/src/journal.rs','docs/planning/2026-10-21-consolidated/CLAIMS-AND-DECISIONS.md'],
7:['integration/arkhe-bugbounty/src/journal.rs','integration/arkhe-bugbounty/src/postgres.rs','agi-coder/crates/agi-coder-journal/src/lib.rs','agi-coder/crates/agi-coder-tests/tests/journal_pipeline.rs'],
8:['agi-coder/crates/agi-coder-jules/src','agi-coder/crates/agi-coder-tests/tests/e2e_mock_jules.rs','agi-coder/crates/agi-coder-core/src/wer.rs'],
9:['cognition','agi-coder/crates/agi-coder-cognition/src','agi-coder/crates/agi-coder-tests/tests/cognition_verification.rs'],
10:['integration/arkhe-depin/src/types.rs','integration/arkhe-depin/tests/portable_proof_composite.rs','docs/security/WORKLOAD-ATTESTATION-2026-10-18.md'],
11:['docs/ACTION-BROKER.md','verification/crates/arkhe-verify-core/src/action_proof.rs','kernel/arkhe-kernel/tests/action_broker.rs','docs/planning/2026-10-21-consolidated/CLAIMS-AND-DECISIONS.md'],
12:['docs/PROOF-CARRYING-BUDGET.md','verification/crates/arkhe-verify-core/src/output_proof.rs','kernel/arkhe-kernel/tests/budget_pco.rs'],
13:['docs/ACTION-BROKER.md','kernel/arkhe-kernel/src/broker.rs','kernel/arkhe-kernel/tests/action_broker.rs','scripts/runtime_containment.py'],
14:['docs/MMR-PROFILE.md','docs/adr/ADR-018-journal-persistence.md','agi-coder/crates/agi-coder-memory/src/working.rs'],
15:['agi-coder/crates/agi-coder-cost/src/lib.rs','docs/planning/2026-10-21-consolidated/CLAIMS-AND-DECISIONS.md'],
16:['integrations/verify-mcp/src/index.ts','verification/crates/arkhe-verify-cli/src/main.rs','agi-coder/crates/agi-coder-cli/src/main.rs','agi-coder/packages'],
17:['docs/MATURITY-CRITERIA.md','.github/workflows/ci.yml','agi-coder/.github/workflows/ci.yml','specs'],
}
rows='''
1.1|ALTERNATIVA|Digest32/AKG no principal e ContentHash/AGI no workspace independente; ambos com domínios e vetores. Não renomear nem misturar identidades.
1.2|ALTERNATIVA|Perfis existentes rejeitam floats e usam ordenações definidas nos próprios contratos. Não substituir por floats determinísticos nem alegar decoder CBOR geral com rejeição de duplicatas.
1.3|ALTERNATIVA|Tipos RequestIdentity e Timestamp/Did no AGI; principal usa String/i64 tipados por contrato. Vetores cobrem a identidade, não validação universal de DID.
1.4|PARCIAL|EvidenceEnvelope principal e Evidence AGI existem; envelope genérico ArtifactEnvelope com wire contract próprio não foi adotado. Aceite: especificar perfil/versionamento antes de criar outro envelope.
1.5|ALTERNATIVA|Core possui Error/ArkheError por módulo; ausência do nome proposto não é lacuna funcional.
1.6|IMPLEMENTADO|operation_id exclui parâmetros nos dois perfis; journals comparam parâmetros ou digest integral. Manter testes de conflito e separar principal/AGI.
1.7|ALTERNATIVA|WER principal tem digest/admissão; WER AGI tem sign/verify com self_check derivado. finalized não é API vigente; não adicionar método sem contrato.
2.1|PARCIAL|Parser executado aceita apenas GGUF v3 little-endian, F32 e metadados restritos com limites. Pendente: perfil v2, arrays, tipos/quantizações gerais e testes independentes de cada extensão.
2.2|PARCIAL|Canonicalização restrita e digest do arquivo completo existem. Raiz Merkle de tensores, arrays tipados e floats por bits não implementados; exigem novo perfil sem alterar vetores atuais.
2.3|PARCIAL|Statement local assinado e adapter Sigstore messageSignature verificam o arquivo completo. DSSE/in-toto v1 não suportado; aceite: schema e subjects vinculados sob política independente.
2.4|ALTERNATIVA|Verificação retorna sucesso apenas após quatro gates, falhas são erro. Não há combinador público PASS/PENDING geral; não equiparar o perfil sintético à verificação universal.
2.5|IMPLEMENTADO|Fixture de 24 bytes agora testada como rejeição explícita do perfil lab: zero tensores não é modelo aceito. Aceitar o header exigiria outro contrato de parser.
2.6|IMPLEMENTADO|Suíte negativa executa truncamentos, versões, duplicatas, tipos, overflow, alinhamento, sobreposição, digests, chaves, assinatura e prova. Quantidade de funções não substitui cobertura por caso.
2.7|IMPLEMENTADO|Statement local vincula SHA-256 e BLAKE3 do GGUF completo; teste altera payload mantendo metadados. Adapter Sigstore recebe os mesmos bytes da inspeção.
3.1|IMPLEMENTADO|MMR offline no WASM e PortableInclusionProof no DePIN; raiz deve ser fornecida por canal confiável. Não autentica provider/hardware.
3.2|PARCIAL|Claim próprio com assinatura Ed25519 e roots fixadas; não é validação C2PA/COSE padrão de manifesto completo. Aceite: engine C2PA padrão com fixtures e política.
3.3|IMPLEMENTADO|Golden vectors são consumidos pelo núcleo e adapters WASM; executar build e testes do adapter com os mesmos vetores, sem regenerar expected values.
3.4|IMPLEMENTADO|wasm-bindgen e build Node/browser existentes via build_verifier.py; publicação npm não é inferida.
4.1|ALTERNATIVA|Gate principal e AGI compilam/testam; principal exige admissão em ações protegidas e AGI verifica assinatura/bindings. Journal é orquestração separada, não passos 1–8 idênticos ao pseudocódigo.
4.2|PARCIAL|Certificado aritmético budget com checker independente já integrado quando exigido. Prova formal genérica/Rocq/solvência não disponível; remover dependência errada no journal 14.2.
4.3|ALTERNATIVA|Principal Allow/Reject com reason String; AGI GateError tipa classe e mensagem. Enum exaustivo de todas as razões requer migração de API, não bloqueia rejeição atual.
4.4|IMPLEMENTADO|EvidenceStore e InMemoryEvidenceStore públicos no AGI; principal tem EvidenceReader/Committer e stores por integração. Não cruzar os perfis.
4.5|ALTERNATIVA|Principal usa PolicyResolver e EvidenceKindRequirement; AGI Policy concreto. Non_exhaustive não adotado; adicionar agora quebraria construção externa vigente.
4.6|ALTERNATIVA|Bindings obrigatórios aplicados diretamente pelo gate principal e gate AGI. Enum universal com quatro variantes não adotado; nova variante exige predicado e teste por operação.
4.7|PARCIAL|Triage e budget têm bindings fixos no código e exigências da governança. Restantes intent types protegidos ficam sem permissão de desenvolvimento; criar perfil por capacidade antes de ativar.
4.8|IMPLEMENTADO|ReviewRouter principal deriva de evidências admitidas/política; AGI router mínimo separado. Perfil padrão não habilita autoexecução.
4.9|PENDENTE|Não inferir trivialidade por contagem livre do caller. Aceite: diff autenticado, parser e tamanho/escopo derivados em worker confiável, com casos adversariais.
4.10|ALTERNATIVA|Digests canônicos vinculam todos os campos sem assinatura; WER AGI verifica hash/assinatura e derivação. Helper com nome sugerido não é necessário no contrato atual.
4.11|PENDENTE|Sem JournalConfirmation universal assinado. Aceite: identidade/chave do journal, binding do estado/owner e testes de replay; recibo não pode ser construído pelo caller.
4.12|IMPLEMENTADO|SignedWorkerVerifier Ed25519 na admissão principal; WER AGI usa verify_strict. Roots/version/revogação pertencem ao host, não ao bundle.
5.1|ALTERNATIVA|Arkhe congelado usa 00/01/02; AGI usa domínios textuais próprios. Esquema 00/01/02/03 do anexo conflita com vetores e não será aplicado.
5.2|IMPLEMENTADO|Provas portáteis existentes; verificador principal agora valida shape, limite de count e oferece índice explícito. Builder de referência continua O(n), não O(log n).
5.3|IMPLEMENTADO|Perfil normativo já fixa domínios, ordem, bag, inicialização, empty e inclusão; índice docs/MMR-PROFILE.md documenta que consistência não está congelada.
5.4|IMPLEMENTADO|Bagging right-to-left em ambos os perfis com vetores independentes. Não aplicar correção textual antiga sobre implementação já correta.
5.5|ALTERNATIVA|AGI já usa marcadores 0/1; Arkhe-v1 inicia no último peak sem Option. Inserir marcador no principal alteraria o protocolo congelado.
5.6|IMPLEMENTADO|Testes agora adulteram cada folha e cada elemento do caminho para 1/3/4/5/7; shape/index/count incorretos são rejeitados sem alterar roots congelados.
5.7|ALTERNATIVA|Referências Python independentes e vetores estáticos existentes; merkleberg/MMRIVER não são autoridade obrigatória nem garantem mesmo perfil.
5.8|PARCIAL|Checkpoint assinado em perfis sintéticos gov e novo mandato; principal possui persistência de checkpoints. Serviço genérico de assinatura/retention/revogação continua necessário por implantação.
5.9|ADIADO|Sem prova de consistência congelada. Exigir se for necessário provar extensão entre checkpoints; inclusão não substitui consistência.
5.10|PENDENTE|Não há índice BTreeSet universal de folhas. Medir consultas e definir duplicata/namespace antes de adicionar; não bloqueia inclusão.
6.1|PENDENTE|Journal detecta conflito de parâmetros, mas não é detector público de equivocação assinada. Definir slot, principal, epoch e namespace antes de agrupar mensagens.
6.2|PENDENTE|Aceite: duas declarações incompatíveis autenticadas da mesma autoridade no mesmo slot, roots e política fixadas; conflito do caller não basta para punição.
6.3|PENDENTE|Retry/conflict são cobertos nos journals; detect_equivocation sancionável depende do contrato de evidência, sem presumir má-fé.
6.4|NÃO ADOTADO|Slashing econômico exige adjudicação e política de penalidade; não submeter transação como consequência automática de conflito local.
7.1|IMPLEMENTADO|OperationJournal em memória nos dois perfis com replay/conflito; principal e AGI têm testes diferentes, sem THEOREM herdado.
7.2|PARCIAL|PostgreSQL durável existe no principal. AGI standalone permanece em memória; rusqlite WAL não adotado como substituição do principal. Aceite: adapter e reopen/crash/concurrency tests AGI.
7.3|IMPLEMENTADO|ADR-018 registra PostgreSQL existente e critérios SQLite/redb para standalone; journal integra a confiança operacional de não duplicação e não é genericamente não-TCB.
7.4|ALTERNATIVA|AGI tem enum Pending/Completed/Failed/ManualReconciliationRequired e transições; principal PREPARED/DISPATCHED/COMPLETED mais escalonamento. Não unificar renomeando estados publicados.
7.5|ALTERNATIVA|finish valida transições no AGI; claim/mark_dispatched/complete e require_manual_reconciliation no principal. APIs com nomes diferentes satisfazem o perfil existente.
7.6|PARCIAL|Principal lista/escalona pendências e mantém reconciliação explícita. Aceite restante AGI: processo durável de expiração/investigação que nunca reenvia efeito incerto automaticamente.
7.7|IMPLEMENTADO|Reserva anterior ao efeito nos pipelines existentes e contrato do broker novo; testes verificam contadores e replay. In-memory não prova sobrevivência a crash.
7.8|PENDENTE|Cliente Jules não persiste session_name imediatamente após create. Necessário adapter durável com callback de registro/reconciliação antes de polling; bloquear operação unattended até existir.
8.1|PARCIAL|Cliente REST com sessions/activities, paginação e polling e mock HTTP. Live alpha API não foi exercitada; não atribuir autoridade ao resultado remoto.
8.2|PARCIAL|Extrai apenas gitPatch das activities; fallback validado de outputs e diagnóstico da fonte ainda ausentes. URL de PR ou JSON arbitrário não é diff.
8.3|PARCIAL|OperationId calculado antes da admissão no pipeline e WER AGI vincula intent. from_session real não existe; mock assinado não é conversão qualificada de sessão.
8.4|IMPLEMENTADO|WER AGI sign deriva self_check de TestResults; testes ausentes/skipped/falhos não passam. A autenticidade do runner independente continua requisito da implantação.
8.5|ALTERNATIVA|Cliente usa Session tipado e artifacts Value com extração explícita; não há enum untagged com catch-all a reordenar. Objetos desconhecidos não geram patch válido.
8.6|PENDENTE|Sem conversor de conclusão autenticada de sessão para WER; não preencher hora de conclusão com relógio local como se viesse da API. Qualificar campo/evento oficial e sua origem antes de liberar worker live.
8.7|PARCIAL|Routers existem, mas fluxo Jules live com revisão independente não está integrado. Aceite: decisão admitida e vinculada ao diff/testes antes de merge/deploy.
9.1|PARCIAL|Pipeline e demo de cinco estágios no AGI; autonomia design/edição/deploy real não demonstrada. Sem autoridade de produção por default.
9.2|PARCIAL|Planner DAG determinístico, dependências, resume e retry limitado testados. HTN e replan semântico de modelo não implementados.
9.3|PARCIAL|Working BTreeMap, episodic/semantic e persistência JSON no AGI, memória de referência principal. pvec e banco transacional não implementados.
9.4|PARCIAL|SpecificationVerifier com baseline, autor independente e campanha de mutação em subprocesso testada. Não comprova verdade de todo oráculo/spec externa.
9.5|PARCIAL|Research com hipóteses, fontes e resolução exigindo evidência no AGI. Knowledge graph geral e pesquisa autônoma continuam fora do escopo demonstrado.
9.6|IMPLEMENTADO|Triagem admitida, gate e ReviewRouter no principal com testes. Validação live/upstream e chaves de produção não inferidas do teste local.
9.7|PARCIAL|Agente principal e loop limitado AGI existem; AuthorizationProof/ToolContractDigest universais não encontrados. Perfil de ferramenta precisa ser fixado por capacidade.
10.1|PENDENTE|Campos NRAS/PPCIE são material não autenticado no receipt atual. Nenhuma attestation contínua qualificada; definir plataforma suportada, janela e workload/key binding.
10.2|PENDENTE|Verificação real de assinatura/claims/nonce/validade e qualificação hardware ausente. Não aceitar mera presença de JWT como evidência.
10.3|PENDENTE|Cliente NRAS qualificado não implementado. Exige endpoint/schema/roots/version e testes sem segredos, depois hardware real.
10.4|NÃO ADOTADO|PPCIE universal não é requisito válido para toda GPU. Selecionar perfil suportado e evidência apropriada; validação de plataforma continua pendente.
10.5|PARCIAL|Outros perfis têm anti-replay/challenge; DePIN não tem nonce fresco autenticado com NRAS. Aceite: geração host, consumo e binding ao workload.
10.6|ADIADO|Consistent hashing ainda sem demanda medida. Se adotado, pertence ao DePIN; pinagem de biblioteca só após contrato de roteamento.
10.7|PENDENTE|Sem roteador DePIN operacional. Aceite: seleção, falhas, identidades, disponibilidade e autorização por nó, após perfil de attestation.
11.1|PARCIAL|Novo ActionProof local verifica assinatura, operação, principal, parâmetros, política e inclusão em checkpoint confiável anterior ao dispatch. Não prova execução observada nem ordem absoluta via MMR isolado; canal financeiro não ativado.
11.2|PENDENTE|TemporalSealer/RWA não implementado. Aceite: fonte autenticada, freshness, estado/ativo e checkpoint ligados à ação, distinguindo âncora de verdade econômica.
11.3|PARCIAL|PolicyBinding e predicados fail-closed existem; novo mandato fixa policy_digest. Compliance financeiro geral depende de fontes e regras específicas autenticadas.
11.4|PENDENTE|Certificado de orçamento não é prova ZK de solvência. Aceite: statement, política e inputs fixados, prover/verifier revisados e contraexemplos de replay/policy swap.
11.5|PENDENTE|AP2 não integrado. Manter bloqueador P0 do canal AP2, não do verifier offline. Mandato local Ed25519 não substitui Checkout/Payment JWT e credenciais oficiais.
11.6|PENDENTE|x402/Circle não integrados. Aceite: política do canal, request/response binding, credenciais no broker e reconciliação de resultado incerto.
11.7|PENDENTE|Chronicle Proof of Asset não integrado. Aceite: contrato/schema, publisher e tempo fixados; prova de inclusão não é prova de existência/solvência do ativo.
11.8|PENDENTE|ZKSL/ZKredit não integrados nem usados como requisito executável; validar especificação e statement antes de selecionar SDK.
11.9|PENDENTE|SpecCompiler e SpecGovernance gerais ausentes. Não compilar linguagem natural diretamente em autoridade; exigir schema e aprovação de perfil.
12.1|PENDENTE|Parser GGUF existe, predicado de licença não. Metadados de licença não provam titularidade nem permissão jurídica; limitar futuro predicado a fatos formais verificáveis.
12.2|PENDENTE|prove_license ausente. Implementação exige statement e regra de licença explícitos com fontes autenticadas; não renomear budget como licença.
12.3|PENDENTE|validate_license ausente. Aceite: checker independente, bindings de artefato/política e exemplos negativos; prova gerada pelo mesmo produtor não basta.
12.4|PENDENTE|Rocq/coqchk WASM não implementado. Port exige versão, subset, artefatos e validação independente, não simples wrapper de status.
12.5|PARCIAL|Budget PCO tem testes negativos de adulteração, predicado, policy, replay e ausência de certificado. Suíte de licença continua bloqueada pelo predicado ainda indefinido; manter P0 da capacidade licença.
13.1|PARCIAL|Novo broker de biblioteca exige mandato, admissão, journal e executor host; nenhum default de produção. Isolamento real de credenciais, journal durável e adapter por capability continuam bloqueadores de ativação.
13.2|PENDENTE|Gateway Executor/MCP de efeitos não implementado. Verificador MCP atual não executa ações protegidas; gate precisa ser incontornável no executor real.
13.3|NÃO ADOTADO|Integração MXC não demonstrada. Tratar provider de execução como canal com qualificação própria; não inferir isolamento pelo nome.
13.4|PENDENTE|Serviço Windows/named pipe não implementado. Aceite: ACL, identidade cliente, separação de processo/chaves, protocolo com bindings e testes de bypass.
13.5|PARCIAL|Há harnesses de containment/VM no checkout; WSL2+gVisor não é default comprovado por documentação. P0 da ativação de execução não confiável: medir configuração real e tentativas de escape.
13.6|PENDENTE|AppContainer não qualificado pelo pipeline atual. Documentação não é THEOREM; exigir broker fora do container, ACL e testes Windows reais.
13.7|ADIADO|VBS Enclave opcional sem implantação qualificada; escolher plataforma e suporte antes de designar garantia ao gate.
14.1|ALTERNATIVA|Reusar perfil MMR principal ou AGI explicitamente; criar arkhe-dsa duplicando algoritmo/autoridade não é requisito adotado.
14.2|ALTERNATIVA|Referência ao journal de 7.2; não é dependência de PCO formal. Persistência não produz certificado matemático.
14.3|ADIADO|Working memory atual usa BTreeMap. Persistent vector/pvec exige benchmark e semântica de snapshots; não bloqueia memória de referência.
14.4|ADIADO|Cache de autorização não adotado. Exigir binding de política/revogação/freshness e invalidação; cache não pode prolongar permissão revogada.
14.5|PENDENTE|Referência a 6.1–6.3; não criar outro detector divergente nem converter conflito operacional em slashing.
14.6|ADIADO|Bloom filter continua adiado; provar necessidade e nunca usá-lo como autoridade de inclusão ou deduplicação financeira.
14.7|ADIADO|Referência a 10.6; nenhum scheduler DSA paralelo será criado.
15.1|PARCIAL|CostTracker registra inteiros e overflow; measured é fornecido por entrada, não medição real de Rekor/NRAS/storage. Aceite: meter/provider autenticado e unidades/correlação.
15.2|PENDENTE|Preço mínimo baseado em custo medido não implementado. Aceite: custo qualificado, moeda/unidade e política de margem aprovada.
15.3|NÃO ADOTADO|Split 8%+2% e Treasury/DeveloperGuild não aprovados como política comercial. Não introduzir taxas/licença por herança do anexo.
15.4|NÃO ADOTADO|Slashing on-chain depende de adjudicação e política econômica explícitas. Sem submissão automática nem movimentação de fundos nesta reconciliação.
16.1|PARCIAL|MCP principal oferece verificação; AGI tem ferramentas próprias e respostas unsupported para hardware. As oito ferramentas propostas não estão integralmente implementadas.
16.2|PARCIAL|CLIs verify/preview principal e AGI plan/run/verify/anchor/mmr/cost/infer/verify-spec existem. Doze comandos universais e canais de efeitos permanecem incompletos.
16.3|PARCIAL|SDK TypeScript AGI com testes e provas existe; SDK universal do principal não foi demonstrado. Não expor autoridade de execução como efeito de verify.
16.4|PARCIAL|Intra e dashboards locais existentes; observabilidade completa de todos os canais não implementada. Qualificar cada fluxo, sem concluir cobertura pela tela.
17.1|IMPLEMENTADO|MATURITY-CRITERIA.md criado com escopo, fonte/teste/CI e limites. THEOREM não é prova matemática nem status agregado do projeto.
17.2|IMPLEMENTADO|CI existente build/check/test/nextest/fmt; acrescentado clippy estrito e validação de backlog. Execução remota deste patch não é alegada; resultados locais ficam separados.
17.3|PARCIAL|Security workflows, scans e adapter Sigstore existem; cargo-audit/deny/SBOM e SLSA L3 completos não demonstrados. SLSA é qualificação do builder, não instalação de ferramenta.
17.4|PARCIAL|Vetores Python independentes MMR/CBOR/WER/GGUF restrito existentes. Slashing não possui contrato; não gerar fixtures que finjam validar política ainda inexistente.
17.5|PENDENTE|Sem conjunto ativo qualificado dos três fuzz targets propostos; aceite: harness limitado, corpus/regressões e campanha reproduzível sem panic/OOM.
17.6|IMPLEMENTADO|Workflow surfaces-and-wasm constrói o WASM e executa adapters com vetores; rodar localmente após mudança de verificador. Resultado remoto exige run identificado.
17.7|PARCIAL|Há ADRs reais de core/cognição/AGI e novo ADR-018; não existem dezessete decisões aprovadas só porque o anexo numera 001–017. Registrar decisões necessárias, não placeholders.
17.8|PARCIAL|specs AKG/MMR, AGI e docs de adapters existem; AKG continua candidato e economia não adotada. Freeze requer gates próprios, não presença de diretório.
17.9|PARCIAL|Distribuição Windows, Docker e workflows de release existem. cargo-dist/Homebrew/npm por plataforma/Helm completos não qualificados nesta auditoria.
'''
meta={}
for line in rows.strip().splitlines():
    ident,status,note=line.split('|',2);meta[ident]=(status,note)
sections={};items=[];section=None
for line in source.splitlines():
    m=re.match(r'## (\d+)\. (.*)',line)
    if m: section=int(m[1]);sections[str(section)]=m[2]
    m=re.match(r'^\| (\d+\.\d+) \|',line)
    if not m:continue
    fields=[x.strip() for x in line.split('|')[1:-1]]
    ident=fields[0];status,note=meta.pop(ident)
    priority=re.search(r'P[0-3]',fields[2])
    items.append(dict(id=ident,feature=fields[1],original_priority=priority[0] if priority else fields[2],original_status=fields[3],original_dependencies=fields[4] if len(fields)>4 else '',status=status,assessment=note,evidence=groups[int(ident.split('.')[0])],depends_on=[]))
assert not meta,meta
deps={'2.1':['1.1'],'2.2':['1.2','2.1'],'2.3':['2.1','2.2'],'2.4':['2.1','2.3'],'2.5':['2.1'],'2.6':['2.1','2.3'],'2.7':['2.3'],'3.1':['5.2'],'3.3':['3.1'],'4.1':['1.6','1.7'],'4.2':['4.1'],'4.7':['4.6'],'4.8':['4.1'],'5.2':['5.1','5.3'],'5.4':['5.3'],'5.5':['5.3'],'5.6':['5.2'],'5.7':['5.3'],'6.2':['6.1','4.12'],'6.3':['6.2'],'6.4':['6.3'],'7.2':['7.3','7.4'],'7.5':['7.4'],'7.6':['7.2','7.5'],'7.7':['1.6','7.1'],'7.8':['7.2','8.1'],'8.3':['1.6','8.1'],'8.4':['8.3'],'8.6':['8.1'],'8.7':['4.8','8.3'],'10.2':['10.1','10.3'],'10.7':['10.6','10.2'],'11.1':['4.1','5.2','7.7'],'11.2':['5.8'],'11.4':['4.2'],'11.5':['11.1','13.1'],'11.6':['11.1','13.1'],'11.7':['11.2'],'11.8':['11.4'],'12.1':['2.1'],'12.2':['12.1'],'12.3':['12.2'],'12.5':['12.2','12.3'],'13.1':['4.1','7.7','11.1'],'13.2':['13.1'],'13.4':['13.1'],'14.1':['5.1'],'14.2':['7.2'],'14.5':['6.3'],'14.7':['10.6'],'15.2':['15.1'],'15.4':['6.4'],'17.6':['3.3']}
for x in items:x['depends_on']=deps.get(x['id'],[])
data=dict(date='2026-10-22',source_sha256=hashlib.sha256((base/'source.md').read_bytes()).hexdigest(),sections=sections,items=items,execution_order=[
'Preservar identidades e perfis: 1.x, 5.3, 17.1, 7.3; executar arquitetura, vetores e testes existentes.',
'Fechar lacunas verificáveis do núcleo: MMR shape/index/count, negativos GGUF, admissão, replay e CI estrito. Sem alteração dos golden vectors.',
'Qualificar durabilidade AGI e journal do broker, registro imediato de sessão Jules e conversor de evidência independente. Permanecem bloqueadores P0 do canal unattended, não do verifier offline.',
'Definir e qualificar a fronteira de efeito: executor fixo, credenciais fora do agente, broker com journal persistente, revisão e isolamento real antes de execução não confiável.',
'Para pagamentos, selecionar versão e perfil AP2 e implementar credenciais/mandatos/receipts oficiais antes da ativação. ActionProof local é mecanismo independente, não compatibilidade AP2.',
'Para licença formal, fechar o predicado verificável e a proveniência jurídica antes do prover/checker e negativos específicos. Budget PCO não encerra esse requisito.',
'Hardware DePIN, equivocação sancionável e integrações financeiras adicionais exigem contratos, ambiente e evidências próprios; não dependem de placeholders de structs.',
'Otimizações pvec/LRU/Bloom/ketama e canais de distribuição adicionais vêm após necessidade medida e gates de qualificação; não há estimativa de semanas validada.'
],activation_blockers=[
'P0 original 8.3/8.6: worker Jules live sem conversão e fonte de conclusão qualificada; 7.8 sem registro durável de sessão. Não habilitado como executor unattended.',
'P0 original 11.5: AP2 completo ausente; a biblioteca local não implementa seu protocolo nem autoriza pagamentos reais.',
'P0 original 12.5: testes de licença dependem de predicado/autoridade ainda indefinidos; testes budget cobrem apenas seu próprio statement.',
'P0 original 13.1/13.5: broker existe como biblioteca opt-in, mas serviço com journal durável/credenciais e sandbox real exige qualificação; nenhum canal externo é ativado.',
'Não executar mudanças de licença/taxas 8%+2%, substituir PostgreSQL, mudar domínios congelados ou habilitar slashing por interpretação do backlog.',
'Nenhum teste local substitui CI remoto, teste de banco real, API live, hardware ou validação de isolamento do host.'
])
(base/'features.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('mapped',len(items),'items')
