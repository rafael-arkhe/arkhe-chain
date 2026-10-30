import json
from pathlib import Path
p=Path(r'D:\arkhe\docs\backlog\features.json');data=json.loads(p.read_text(encoding='utf-8'))
updates={
'4.2':('PARCIAL','Gate suporta License e PaymentMandate além de budget, com reexecução independente e envelope admitido. Rocq e solvência ZK continuam pendentes.'),
'7.2':('PARCIAL','PostgreSQL preservado; broker standalone agora tem SQLite WAL/FULL opcional, owner, reopen e concorrência testados. Pipeline AGI ainda em memória.'),
'7.8':('PARCIAL','create_recorded chama recorder antes do polling; record_session valida admissão e nome. Falha conserva nome para reconciliação, sem retry; callback durável do host live ainda necessário.'),
'8.3':('IMPLEMENTADO','from_session exige OperationId pré-dispatch e vínculo ao intent, conclusão e patch documentados; gera WER sem assinatura com testes independentes fornecidos pelo host.'),
'8.6':('IMPLEMENTADO','completed_at vem de createTime da atividade sessionCompleted da mesma sessão, validado RFC3339. Ausência/duplicata/sessão alheia/hora inválida rejeitadas sem fallback local.'),
'11.1':('IMPLEMENTADO','ActionProof e ponte AP2-role vinculam operação/parâmetros/política. Direct ancora closed; Autonomous ancora open antes do closed, sob tempo/log/role confiáveis. Não prova execução observada.'),
'11.3':('PARCIAL','Predicados SPDX/AP2 fail-closed integrados ao gate por governança; semântica jurídica, tabela de obrigações e role reais exigem qualificação.'),
'11.5':('PARCIAL','AP2 v0.2 Payment Mandate leg escolhido: ponte autenticada Direct/Autonomous, SD-JWT/checkout/execução vinculados, MMR e consumo atômico de closed implementados. Role externo e pagamento real não qualificados.'),
'12.1':('IMPLEMENTADO','Predicado transparente sobre subconjunto SPDX-2.3 JSON, root SHA256 ligado ao artefato, hash SBOM no WER e avaliação AND/OR/WITH por obrigações da governança. Não é validador SPDX completo ou garantia jurídica.'),
'12.2':('IMPLEMENTADO','license_pco::prove_license empacota proposta e bindings; checker do gate reexecuta o predicado. require_zk é recusado sem backend.'),
'12.3':('IMPLEMENTADO','license::verify reconfirma checker/spec/política/intent/worker/SBOM/artefato/output e reexecuta o predicado; envelope não admitido é recusado pelo gate.'),
'12.5':('IMPLEMENTADO','formal_predicates cobre licença válida, artefato adulterado, predicado falso, policy swap, replay, prova ausente/não admitida, kind incorreto e ZK indisponível.'),
'13.1':('PARCIAL','Broker e SQLite durável opcionais implementados com gate antes do efeito, owner, replay e consumo closed global. Serviço isolado, credenciais e executor real/sandbox continuam bloqueadores de ativação.')
}
extra={4:['kernel/arkhe-core/src/formal_proof.rs','kernel/arkhe-kernel/tests/formal_predicates.rs'],7:['kernel/arkhe-kernel/src/broker_sqlite.rs','kernel/arkhe-kernel/tests/broker_durable.rs'],8:['agi-coder/crates/agi-coder-tests/tests/jules_completion.rs','docs/JULES-COMPLETION.md'],11:['verification/crates/arkhe-verify-core/src/payment.rs','kernel/arkhe-kernel/tests/formal_predicates.rs','docs/FORMAL-PREDICATES.md'],12:['verification/crates/arkhe-verify-core/src/license.rs','cognition/arkhe-agent/src/license_pco.rs','kernel/arkhe-kernel/tests/formal_predicates.rs','docs/FORMAL-PREDICATES.md'],13:['kernel/arkhe-kernel/src/broker_sqlite.rs','kernel/arkhe-kernel/tests/broker_durable.rs']}
for x in data['items']:
    if x['id'] in updates:x['status'],x['assessment']=updates[x['id']]
    for path in extra.get(int(x['id'].split('.')[0]),[]):
        if path not in x['evidence']:x['evidence'].append(path)
    if x['id']=='12.1':x['depends_on']=[]
data['execution_order'][2]='Qualificar host live AGI: persistência de sessão/pipeline e origem independente dos testes. Conversor de conclusão e callback imediato implementados; execução Jules real permanece separada.'
data['execution_order'][4]='SPDX e AP2 v0.2 Payment Mandate leg adotados pelo usuário. Checker de obrigações e ponte de roles implementados; qualificar tabela real, role externo e executor antes de pagamentos reais.'
data['execution_order'][5]='Negativos de licença transparente implementados; expansão de schema, cumprimento real de obrigações e ZK exigem gates próprios. Hash isolado não substitui prova.'
data['activation_blockers']=[
'Operação unattended: qualificar persistência de sessão AGI, resultados/testes independentes e credenciais. Nenhuma sessão Jules remota foi criada.',
'AP2: ponte, modos e consumo único SQLite implementados; role real, emissão/revogação da atestação e executor Payment Mandate leg não qualificados. Tokens/roles dos testes são sintéticos.',
'Licença: aprovar tabela de obrigações real e origem autenticada/completude do SBOM. Checker prova compatibilidade com o documento fornecido; require_zk falha fechado.',
'Isolamento: broker é biblioteca opt-in; serviço com credenciais fora do agente e configuração real de sandbox/OS ainda exigem qualificação.',
'PostgreSQL e perfis congelados preservados. Taxas 8%+2% e slashing não introduzidos.',
'Testes locais não substituem CI remoto, PostgreSQL real, APIs live, hardware, interoperabilidade AP2 externa ou qualificação de isolamento.'
]
data['decisions']=['SPDX-2.3 JSON como primeiro subconjunto de licenciamento; semântica de obrigações na governança; ZK indisponível rejeitado.','AP2 v0.2 Payment Mandate leg, Direct/Autonomous; assinaturas/constraints verificadas pelo role autenticado externo.','Consumo único por closed mandate; open recorrente pode gerar outros closed sob controle do role.']
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
