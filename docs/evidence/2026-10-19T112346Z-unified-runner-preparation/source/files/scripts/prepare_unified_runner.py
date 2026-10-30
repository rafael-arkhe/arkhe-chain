"""Prepare a frozen source closure and a 22-vector orchestration plan; no runtime launch."""
import argparse
import json
from pathlib import Path

from containment_probe import ROOT, write_json, manifest, no_duplicates, reject_constant
from runtime_source_snapshot import freeze, verify, sha
from unified_containment_runner import make_plan, collect


def load(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=no_duplicates, parse_constant=reject_constant)


def prepare(output):
    output = output.resolve()
    if not output.is_relative_to(ROOT / 'docs/evidence') or output.exists():
        raise ValueError('a new workspace docs/evidence directory is required')
    contract_path = ROOT / 'config/runtime-unified-contract.json'
    bindings = load(ROOT / 'config/seccomp/unified-static-bindings.json')
    binary_binding = bindings['probe_binary']
    binary = (ROOT / binary_binding['path']).resolve()
    if not binary.is_relative_to(ROOT) or sha(binary.read_bytes()) != binary_binding['sha256']:
        raise ValueError('probe binary binding mismatch')
    output.mkdir(parents=True)
    freeze(ROOT, output / 'source')
    snapshot = output / 'source/snapshot.json'
    plan = make_plan(load(contract_path), sha(snapshot.read_bytes()), bindings['image']['image_id'], binary_binding['sha256'])
    # Contract binding is the hash of exact file bytes, including its encoding.
    plan['contract_sha256'] = sha(contract_path.read_bytes())
    write_json(output / 'plan.json', plan)
    (output / 'runtime-unified-contract.json').write_bytes(contract_path.read_bytes())
    verify(ROOT, snapshot)
    result = collect(plan, [], None, True)
    result.update({'execution_started': False, 'state': 'PREPARED_ADAPTER_PENDING',
                   'source_file_count': len(load(snapshot)['entries']),
                   'blockers': ['native unified adapter not registered',
                                '22 candidate-specific assessors and external oracles must be integrated',
                                'dynamic seccomp rule coverage and inherited-filter review remain pending']})
    write_json(output / 'results.json', result)
    (output / 'REPORT.md').write_text(
        '# Runner unificado — preparação\n\n'
        'Estado: PREPARED_ADAPTER_PENDING; INCOMPLETE; sealed=false; runtime_verified=false.\n\n'
        f"Snapshot: {result['source_file_count']} arquivos, SHA-256 `{plan['source_snapshot_sha256']}`.\n\n"
        'Plano com 22 solicitações ordenadas, nonces exclusivos e subchecks obrigatórios. '
        'Nenhum contêiner iniciado. Nenhum resultado histórico importado.\n\n'
        'O núcleo de orquestração aplica sequência, identidade da tupla, deadlines e limpeza em finally. '
        'O adaptador nativo unificado ainda precisa integrar os executores e avaliadores do candidato. '
        'Testes com adaptadores simulados validam o controle de fluxo, sem comprovar contenção real.\n', encoding='utf-8')
    manifest(output)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.output)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
