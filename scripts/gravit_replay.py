"""Pinned Gravit reexecution worker. Run inside the sealed replay image.

MATCH means byte equality with a fresh computation, never Arkhe authorization,
content truth, freshness validation, or hardware execution attestation.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

TRUSTED_CONTEXT = Path('/opt/replay/trusted-context.json')
VERIFIER = Path('/opt/input/verifier')
LIMIT = 1024 * 1024
PROFILE = 'gravit-python-sorted-compact-utf8-v1'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode('utf-8')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    if len(data) > LIMIT:
        raise ValueError('input exceeds 1 MiB')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate JSON key')
            result[key] = value
        return result
    def nonfinite(_):
        raise ValueError('non-finite JSON number')
    return json.loads(data.decode('utf-8'), object_pairs_hook=pairs, parse_constant=nonfinite)


def runtime_files(root):
    return sorted([p for p in (root / 'gravit_verifier').rglob('*.py')] +
                  list((root / 'bindings').glob('*.yaml')) +
                  list((root / 'bindings').glob('*.yml')) +
                  [root / 'tests/golden' / n for n in ('trust_root.json', 'registry.json', 'registry.json.sig')])


def verify_context(root, manifest):
    actual = {p.relative_to(root).as_posix(): sha256(p.read_bytes()) for p in runtime_files(root)}
    if actual != manifest['files']:
        raise ValueError('trusted context changed')
    if manifest['verifier_commit'] != '7887252fc84def69a794d2e32ce65721eb9a25d9':
        raise ValueError('unsupported verifier commit')
    return actual


def reexecute(request_bytes):
    manifest_bytes = TRUSTED_CONTEXT.read_bytes()
    manifest = strict_json(manifest_bytes)
    files = verify_context(VERIFIER, manifest)
    # Isolated interpreter (-I), immutable image, then explicitly load approved code.
    if str(VERIFIER) not in sys.path:
        sys.path.insert(0, str(VERIFIER))
    from gravit_verifier.registry import TrustRoot, VerifierRegistry
    from gravit_verifier.kernel import VerifierKernel, VerificationRequest, EvidenceRecord, EpistemicState
    from gravit_verifier.loader import load_bindings_from_dir
    root = TrustRoot.from_file(VERIFIER / 'tests/golden/trust_root.json')
    registry = VerifierRegistry.from_file(VERIFIER / 'tests/golden/registry.json', root)
    kernel = VerifierKernel(registry)
    for binding in load_bindings_from_dir(VERIFIER / 'bindings'):
        kernel.load_binding(binding)
    request = strict_json(request_bytes)
    if not isinstance(request, dict) or set(request) != {'artifact_id', 'claimed_state', 'evidence', 'context'}:
        raise ValueError('request fields do not match replay profile')
    if not isinstance(request['artifact_id'], str) or not isinstance(request['context'], dict):
        raise ValueError('invalid artifact or context')
    if not isinstance(request['evidence'], list) or len(request['evidence']) > 256:
        raise ValueError('evidence must be a list with at most 256 records')
    claimed = EpistemicState(request['claimed_state']) if request['claimed_state'] is not None else None
    records = [EvidenceRecord(**record) for record in request['evidence']]
    typed = VerificationRequest(request['artifact_id'], claimed, records, request['context'])
    # Always compute; no expected decision or fixture lookup enters this call.
    decision = kernel.verify(typed).to_dict()
    result = canonical(decision)
    bindings = {name: digest for name, digest in files.items() if name.startswith('bindings/')}
    context = {'verifier_commit': manifest['verifier_commit'],
               'context_manifest_sha256': sha256(manifest_bytes),
               'bindings_manifest_sha256': sha256(canonical(bindings)),
               'registry_sha256': registry.digest, 'trust_root_sha256': root.digest,
               'base_image_id': manifest['base_image_id'], 'comparison_profile': PROFILE}
    return result, context


def read_limited(path):
    with path.open('rb') as stream:
        data = stream.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError('input exceeds 1 MiB')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--decision', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='new, nonexistent output directory')
    args = parser.parse_args()
    # Refuse reuse: a failed run must never leave a previous MATCH as its result.
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'status': 'ERROR', 'authorization': 'not_evaluated', 'execution_attestation': 'none',
              'comparison_profile': PROFILE, 'fallback_used': False}
    code = 2
    try:
        request = read_limited(args.request)
        supplied = read_limited(args.decision)
        strict_json(supplied)
        report.update(request_sha256=sha256(request), provided_decision_sha256=sha256(supplied))
        recomputed, context = reexecute(request)
        same = supplied == recomputed
        report.update(context)
        report.update(status='MATCH' if same else 'MISMATCH', byte_equal=same,
                      recomputed_decision_sha256=sha256(recomputed),
                      recomputed_status=strict_json(recomputed)['status'],
                      recomputed_state=strict_json(recomputed)['final_epistemic_state'])
        (args.output / 'recomputed-decision.json').write_bytes(recomputed)
        code = 0 if same else 1
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    (args.output / 'report.json').write_bytes(canonical(report) + b'\n')
    print(canonical(report).decode('utf-8'))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
