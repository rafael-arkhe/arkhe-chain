"""Freeze 1536 MiB pre-seal inputs and list blockers. Never launches or authorizes."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = 'arkhe-preview-1536m/v1'


def audit(contract, catalog, bindings, root=ROOT):
    issues = []
    def block(code, detail):
        issues.append({'code': code, 'detail': detail})
    if any(contract.get(k) is not False for k in ('sealed', 'runtime_verified', 'execution_enabled')):
        block('PREMATURE_APPROVAL', 'pre-seal inputs must not grant execution or verification')
    target = contract.get('target_profile', {})
    expected = {'id': PROFILE, 'memory_bytes': 1610612736,
                'memory_swap_total_bytes': 1610612736, 'memory_swap_max_bytes': 0,
                'cpu_quota': 2, 'pids_max': 128, 'same_for_all_22_targets': True}
    if any(target.get(k) != value for k, value in expected.items()):
        block('WRONG_TARGET_PROFILE', 'require the exact 1536 MiB / 2 CPUs / 128 PIDs tuple')
    vectors = contract.get('vectors', [])
    if len(vectors) != 22 or len(set(vectors)) != 22 or set(vectors) != {v['id'] for v in catalog['vectors']}:
        block('VECTOR_SET_MISMATCH', 'require exactly the current 22 catalog vectors')
    if bindings.get('profile_id') != PROFILE:
        block('BINDINGS_PROFILE_MISMATCH', '128 MiB or unspecified bindings cannot qualify this profile')
    entries = bindings.get('artifacts', {})
    for role in contract.get('required_bindings', []):
        entry = entries.get(role, {})
        digest = entry.get('sha256', '')
        if role == 'image':
            if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest) or entry.get('image_id') != 'sha256:' + digest:
                block('UNBOUND_ARTIFACT', role)
            continue
        path = entry.get('path')
        if not isinstance(path, str):
            block('UNBOUND_ARTIFACT', role)
            continue
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root.resolve()) or not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest() != digest:
            block('ARTIFACT_MISMATCH', role)
    authority = contract.get('authority', {})
    if authority.get('signing_authority_in_native_core') is not False or authority.get('root_authority_in_native_core') is not False:
        block('AUTHORITY_INSIDE_NATIVE_CORE', 'root and signing authority must remain external')
    # A source label/public key alone never proves HSM/TEE/OIDC provenance.
    if not authority.get('configured_source') or not authority.get('admitted_public_key') or not authority.get('provider_chain_verifier_implemented'):
        block('EXTERNAL_AUTHORITY_NOT_ADMITTED', 'require a concrete external identity and authenticated key-attestation chain')
    if contract.get('remaining_work'):
        block('PENDING_IMPLEMENTATION', contract['remaining_work'])
    return {'schema': 1, 'profile_id': PROFILE, 'state': 'SEAL_BLOCKED' if issues else 'SEMANTIC_REVIEW_REQUIRED',
            'sealed': False, 'runtime_verified': False, 'execution_started': False,
            'issues': issues, 'historical_receipts_imported': False}


def prepare(output, bindings=None):
    output = output.resolve()
    if not output.is_relative_to(ROOT / 'docs/evidence') or output.exists():
        raise ValueError('a new directory inside docs/evidence is required')
    paths = {'contract': ROOT / 'config/runtime-preview1536-contract.json',
             'catalog': ROOT / 'config/runtime-containment-vectors.json',
             'executor_source': ROOT / 'orchestration/arkhe-runtime/src/preview/executor.rs'}
    contract = json.loads(paths['contract'].read_text(encoding='utf-8'))
    catalog = json.loads(paths['catalog'].read_text(encoding='utf-8'))
    data = json.loads(bindings.read_text(encoding='utf-8')) if bindings else {}
    result = audit(contract, catalog, data)
    output.mkdir(parents=True)
    hashes = {}
    for role, path in paths.items():
        content = path.read_bytes()
        name = role + path.suffix
        (output / name).write_bytes(content)
        hashes[name] = hashlib.sha256(content).hexdigest()
    result['snapshot_sha256'] = hashes
    (output / 'results.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    (output / 'REPORT.md').write_text(
        '# Pré-selamento do perfil 1536 MiB\n\n'
        f"Estado: {result['state']}. sealed=false; runtime_verified=false.\n\n"
        'Nenhum probe, container ou efeito foi iniciado. Snapshot não é atestação.\n'
        'O adapter nativo existente continua restrito a 128 MiB.\n\n'
        + '\n'.join('- ' + v['code'] + ': ' + str(v['detail']) for v in result['issues']) + '\n', encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--bindings', type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.output, args.bindings), indent=2))
    return 2  # Preparation is never an execution/admission gate PASS.


if __name__ == '__main__':
    raise SystemExit(main())
