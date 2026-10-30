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
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H%M%SZ')
out = root / 'docs/evidence' / f'{stamp}-e01-funded-matrix'
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
]
for rel in sources:
    dst = out / 'sources' / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / rel, dst)
for src, name in [(sender, 'sender.json'), (reader, 'reader.json'), (summary, 'summary.json')]:
    shutil.copyfile(src, out / name)
for src, name in [
    ('ops/local/e01/funded-preflight.json', 'funded-preflight.json'),
    ('ops/local/e01/funded-smoke-20261019/devnet-results.json', 'smoke-sender.json'),
    ('ops/local/e01/funded-smoke-20261019/independent-reader.json', 'smoke-reader-first-429.json'),
    ('ops/local/e01/funded-smoke-20261019/independent-reader-retry.json', 'smoke-reader-retry.json'),
    ('ops/local/e01/matrix-20261019/reconciliation.json', 'reconciliation.json'),
]:
    shutil.copyfile(root / src, out / name)
checks = []
for i, command in enumerate([
    ['node', '--test', 'scripts/e01_schedule.test.mjs', 'scripts/e01_solana_transport.test.mjs', 'scripts/e01_runner.test.mjs'],
    ['python', 'scripts/check_architecture.py'],
]):
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, encoding='utf-8', errors='replace')
    log = f'check-{i+1}.log'
    (out / log).write_text(result.stdout + result.stderr, encoding='utf-8')
    checks.append(dict(command=command, exit_code=result.returncode, log=log))
s = json.loads(summary.read_text(encoding='utf-8'))
manifest = dict(schema=1, experiment='E01', environment=platform.platform(), checks=checks,
                result=s['status'], runtime_verified=False, secret_material_included=False,
                baseline_reference='docs/evidence/2026-10-19T141644Z-e01-offline-baseline/REPORT.md')
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
rows = '\n'.join(f"| {g['leaf_count']} | {g['planned']} | {g['finalized']} | {g['independent_matched']} | {g['actual_fee_lamports']} | {g['finalization_p95_ms']:.2f} |" for g in s['groups'])
report = f'''# E01 — matriz financiada em devnet

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
Saldo final observado: {s['ending_balance_lamports']} lamports, na reconciliação.
Tentativas emitidas: {s['attempted']}; finalizadas: {s['finalized']}; não emitidas:
{s['not_attempted']}. Interrupção do emissor: `{s['sender_error']}`.
Os 90 slots planejados permanecem no denominador, sem substituição da tentativa
adversa. A assinatura da tentativa 75 não foi encontrada nos dois RPCs durante
a reconciliação; a altura finalizada no emissor excedeu a validade do blockhash.
Não houve reenvio; isso não é prova de não inclusão independente dos provedores.
As latências não incluem construção MMR nem representam throughput de produção.
As mesmas fixtures têm baseline local com 300 provas e 1.200 negativos rejeitados.

## Procedimento e rastreabilidade

Configuração e ordem de 90 tentativas foram registradas antes da emissão.
Fixtures vinculadas por SHA-256; limite de taxa, reserva, deadlines e zero
reenvios automáticos. Cada tentativa preserva assinatura e bytes antes do envio.
O recibo finalizado é comparado ao compromisso; o segundo leitor verifica
assinatura local e concordância de payload, slot e taxa entre provedores.
O hash do relatório do emissor vincula a leitura posterior ao snapshot exato.

O saldo foi observado na devnet: 5 SOL de teste no preflight; testnet sem saldo.
O nome local da carteira não define a rede do endereço. A chave DPAPI foi
decriptada somente para uso pelo processo, passada por stdin, sem inclusão
nestes artefatos. Nenhum endpoint mainnet foi usado.

O primeiro ensaio de leitura do smoke teve HTTP 429; o arquivo original foi
preservado junto à repetição bem-sucedida. Limitações/retries do leitor da matriz
constam de reader.json, sem remover observações adversas.

## Validação e próximos gates

11 testes locais de transporte, ordem e rejeições; códigos de saída e logs
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
