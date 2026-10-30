"""Archive public E01 receipts and selected sources; never reads wallet secrets."""
import datetime
import hashlib
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path

sender, reader, summary = map(Path, sys.argv[1:4])
root = Path(__file__).resolve().parents[1]
run = json.loads(sender.read_text(encoding='utf-8'))
version = run.get('protocol', {}).get('version', 1)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H%M%SZ')
out = root / 'docs/evidence' / f'{stamp}-e01-funded-matrix-v{version}'
out.mkdir()
sources = [
    'config/e01-devnet-protocol.json', 'scripts/e01_solana_transport.mjs',
    'scripts/e01_schedule.mjs', 'scripts/e01_schedule.test.mjs',
    'scripts/e01_solana_transport.test.mjs', 'scripts/e01_runner.test.mjs',
    'scripts/poc_e01_devnet.mjs', 'scripts/run_e01_wallet.ps1',
    'scripts/e01_independent_reader.mjs', 'scripts/summarize_e01.mjs',
    'scripts/archive_e01.py', 'docs/E01-SOLANA-TRANSPORT.md',
    'docs/E01-ONBOARDING-STUDY.md', 'docs/POC-90-DAYS.md',
    'config/capability-status.json',
    'config/e01-devnet-protocol-v2.json', 'scripts/e01_rebroadcast.mjs',
    'scripts/e01_rebroadcast.test.mjs', 'docs/E01-REBROADCAST-V2.md',
    'config/e01-devnet-protocol-v3.json', 'scripts/e01_atomic_report.mjs',
    'scripts/e01_atomic_report.test.mjs',
    'docs/E01-JOURNAL-V3.md',
    'scripts/poc_e01_controlled_loss.mjs', 'scripts/run_e01_controlled_loss.ps1',
]
for rel in sources:
    dst = out / 'sources' / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / rel, dst)
for src, name in [(sender, 'sender.json'), (reader, 'reader.json'), (summary, 'summary.json')]:
    shutil.copyfile(src, out / name)
smoke = f'v{version}-smoke-20261019' if version >= 2 else 'funded-smoke-20261019'
for src, name in [
    ('ops/local/e01/funded-preflight.json', 'funded-preflight.json'),
    (f'ops/local/e01/{smoke}/devnet-results.json', 'smoke-sender.json'),
    (f'ops/local/e01/{smoke}/independent-reader.json', 'smoke-reader.json'),
    (str(sender.parent / 'reconciliation.json'), 'reconciliation.json'),
    ('docs/evidence/2026-10-19T143514Z-e01-funded-matrix/REPORT.md', 'prior-v1-REPORT.md'),
    ('docs/evidence/2026-10-19T143514Z-e01-funded-matrix/summary.json', 'prior-v1-summary.json'),
    ('docs/evidence/2026-10-19T144548Z-e01-v2-journal-failure/REPORT.md', 'prior-v2-REPORT.md'),
    ('ops/local/e01/v2-matrix-20261019/independent-reader.json', 'prior-v2-reader.json'),
    ('ops/local/e01/prior-integrity-check.json', 'prior-integrity-check.json'),
    ('docs/evidence/2026-10-19T144900Z-e01-v2-observation-supplement/REPORT.md', 'prior-v2-supplement-REPORT.md'),
    ('ops/local/e01/v3-controlled-loss-20261019/devnet-results.json', 'controlled-loss-sender.json'),
    ('ops/local/e01/v3-controlled-loss-20261019/independent-reader.json', 'controlled-loss-reader.json'),
]:
    if (root / src).exists():
        shutil.copyfile(root / src, out / name)
checks = []
for i, command in enumerate([
    ['node', '--test', 'scripts/e01_schedule.test.mjs', 'scripts/e01_solana_transport.test.mjs', 'scripts/e01_runner.test.mjs', 'scripts/e01_rebroadcast.test.mjs', 'scripts/e01_atomic_report.test.mjs'],
    ['python', 'scripts/check_architecture.py'],
]):
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace')
    log = f'check-{i+1}.log'
    (out / log).write_text(result.stdout + result.stderr, encoding='utf-8')
    checks.append(dict(command=command, exit_code=result.returncode, log=log))
s = json.loads(summary.read_text(encoding='utf-8'))
controlled_path = root / 'ops/local/e01/v3-controlled-loss-20261019/devnet-results.json'
controlled_reader_path = controlled_path.parent / 'independent-reader.json'
controlled_text = 'Ensaio controlado sem evidência consolidada neste pacote.'
if controlled_path.exists() and controlled_reader_path.exists():
    controlled = json.loads(controlled_path.read_text(encoding='utf-8'))
    controlled_reader = json.loads(controlled_reader_path.read_text(encoding='utf-8'))
    assert hashlib.sha256(controlled_path.read_bytes()).hexdigest() == controlled_reader['source_report_sha256']
    control_attempt = controlled['attempts'][0]
    controlled_text = (
        f"Ensaio controlado separado: {controlled['status']}; "
        f"{len(control_attempt.get('delivery', {}).get('sends', []))} chamadas locais de envio, "
        f"{controlled.get('forwarded_broadcasts')} encaminhamento(s) ao RPC; "
        f"{controlled_reader.get('matched')} recibo(s) conferido(s) pelo segundo operador. "
        "O primeiro envio foi descartado intencionalmente antes da rede, com registro explícito. "
        "A segunda chamada preservou os bytes/assinatura. Esse caso não integra a matriz de 90 "
        "e não é evidência de falha natural do RPC."
    )
manifest = dict(schema=1, experiment='E01', environment=platform.platform(), checks=checks,
                result=s['status'], runtime_verified=False, secret_material_included=False,
                baseline_reference='docs/evidence/2026-10-19T141644Z-e01-offline-baseline/REPORT.md')
manifest['node_versions'] = json.loads(subprocess.run(['node', '-p', 'JSON.stringify(process.versions)'], capture_output=True, text=True, check=True).stdout)
manifest['python_version'] = sys.version
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
rows = '\n'.join(f"| {g['leaf_count']} | {g['planned']} | {g['finalized']} | {g['independent_matched']} | {g['actual_fee_lamports']} | {g['finalization_p95_ms']:.2f} |" for g in s['groups'])
report = f'''# E01 — matriz financiada em devnet, protocolo v{version}

Estado técnico: `{s['status']}`. São compromissos de datasets sintéticos,
com três raízes únicas repetidas em 30 tentativas por tamanho, não decisões
financeiras reais ou 90 datasets independentes. Emissão pelo RPC público Solana;
observação posterior por endpoint OnFinality, em processo distinto.

| Folhas/lote | Planejadas | Finalizadas | Segundo RPC | Taxas pagas (lamports) | p95 envio→observação finalizada (ms) |
| --- | --- | --- | --- | --- | --- |
{rows}

Taxas conhecidas da matriz: {s['actual_fee_lamports']} lamports
({s['actual_fee_devnet_sol']} SOL de devnet). Delta de saldo consistente com taxas:
{s['balance_delta_matches_fees']}. O smoke prévio de três transações está separado.
Saldo final observado: {s['ending_balance_lamports']} lamports, fonte {s['ending_balance_source']}.
Tentativas preparadas: {s['prepared_attempts']}; emitidas: {s['emitted_transactions']};
finalizadas: {s['finalized']}; não emitidas: {s['not_emitted']}.
Interrupção do emissor: `{s['sender_error']}`.
Os 90 slots planejados permanecem no denominador, sem substituição de tentativas
adversas. A v1 anterior teve 74 finalizações e 15 não emitidas após o deadline
da tentativa 75; seu relatório permanece preservado em prior-v1-REPORT.md.
Este ensaio é uma nova execução identificada, não continuação ou aprovação da v1.
A v2 teve 33 finalizações e parou por EPERM no journal antes de enviar a próxima
tentativa. A v3 acrescenta espera limitada para bloqueios transitórios de arquivo;
não altera a identidade das transações nem substitui resultados das corridas anteriores.
Repetição em outra janela temporal não estabelece, sozinha, causalidade.
As latências não incluem construção MMR nem representam throughput de produção.
As mesmas fixtures têm baseline local com 300 provas e 1.200 negativos rejeitados.

## Procedimento e rastreabilidade

Configuração e ordem de 90 tentativas foram registradas antes da emissão.
Fixtures vinculadas por SHA-256; limite de taxa, reserva e deadlines.
Broadcasts observados: {s['broadcasts']}; extras: {s['extra_broadcasts']};
finalizações após retransmissão: {s['finalized_after_rebroadcast']}.
Hashes dos bytes de retransmissão consistentes: {s['identical_rebroadcast_wire_hashes']}.
Sem retransmissão na matriz, ela não exercita essa via; o caso controlado é
relatado separadamente. Não houve re-assinatura ou substituição automática de blockhash.
Cada tentativa preserva assinatura e bytes antes do envio.
{controlled_text}
O recibo finalizado é comparado ao compromisso; o segundo leitor verifica
assinatura local e concordância de payload, slot e taxa entre provedores.
O hash do relatório do emissor vincula a leitura posterior ao snapshot exato.

O saldo foi observado na devnet: 5 SOL de teste no preflight; testnet sem saldo.
O nome local da carteira não define a rede do endereço. A chave DPAPI foi
decriptada somente para uso pelo processo, passada por stdin, sem inclusão
nestes artefatos. Nenhum endpoint mainnet foi usado.

Limitações/retries do leitor da matriz constam de reader.json, sem remover
observações adversas. Observação por dois operadores não é prova independente
de consenso ou de ausência de inclusão.

## Validação e próximos gates

24 testes locais de transporte, ordem, retransmissão, journal e rejeições; códigos de saída e logs
estão em manifest.json. Auditoria arquitetural incluída. SHA256SUMS confere
integridade dos artefatos, não constitui assinatura ou atestação externa.

A observação de dois operadores não substitui cliente de consenso independente.
Custos em USD/mainnet, privacidade, onboarding em máquina limpa, parceiros,
conformidade legal, TEE e escala do PostgreSQL não foram demonstrados aqui.
`runtime_verified=false` permanece: ancoragem não sela contenção nem autoriza
execução cognitiva. G30 é parcial até completar onboarding e avaliação de seus
alvos próprios. Próxima etapa: revisão/reprodução em ambiente limpo e sessões
exploratórias definidas em docs/E01-ONBOARDING-STUDY.md.

Referências do segundo operador: [rede e endpoint oficial](https://onfinality.io/en/networks).
Fundamento RPC: [documentação Solana](https://solana.com/docs/rpc).
'''
(out / 'REPORT.md').write_text(report, encoding='utf-8')
files = sorted(p for p in out.rglob('*') if p.is_file())
(out / 'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(out).as_posix() + '\n' for p in files), encoding='utf-8')
for line in (out / 'SHA256SUMS').read_text().splitlines():
    digest, rel = line.split('  ', 1)
    assert hashlib.sha256((out / rel).read_bytes()).hexdigest() == digest
print(json.dumps(dict(report=str(out / 'REPORT.md'), hashes_verified=len(files), checks=checks)))
