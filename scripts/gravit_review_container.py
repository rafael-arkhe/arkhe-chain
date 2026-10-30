"""Offline container entrypoint for a pinned, external Gravit evaluation.

Sources live read-only in /opt/input. Only /work and the dedicated /out evidence
directory are writable. No Arkhe keys, stores or production source are mounted.
"""
from pathlib import Path
from dataclasses import asdict
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

INPUT = Path('/opt/input')
WORK = Path('/work')
OUT = Path('/out')
OUT.mkdir(exist_ok=True)
report = {'scope': 'Pinned Gravit v0.6.0 evaluation, offline rootless container, public test keys only; no adapter or production authorization', 'gates': [], 'status': 'RUNNING'}


def save():
    (OUT / 'container-results.json').write_text(json.dumps(report, indent=2) + '\n')


def run(name, args, cwd, expected=0, marker=None):
    start = time.monotonic()
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    text = result.stdout + result.stderr
    path = OUT / (name + '.log')
    path.write_text(f'cwd: {cwd}\nargv: {json.dumps(args)}\n\n' + text + f'\nexit_code: {result.returncode}\n')
    good = result.returncode == expected if expected is not None else result.returncode != 0
    if marker:
        good = good and marker in text
    report['gates'].append({'name': name, 'exit_code': result.returncode, 'expected_exit': expected if expected is not None else 'nonzero', 'status': 'PASS' if good else 'FAIL', 'seconds': round(time.monotonic()-start, 3), 'log': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    save()
    print(f'{name}: {"PASS" if good else "FAIL"} (exit {result.returncode})', flush=True)
    if not good:
        raise RuntimeError(f'{name} failed: {text[-3000:]}')
    return text


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


try:
    for name in ['verifier', 'grover', 'eval-pack']:
        shutil.copytree(INPUT / name, WORK / name)
    shutil.copytree('/opt/cargo-cache', WORK / 'cargo-cache')
    os.environ['CARGO_HOME'] = str(WORK / 'cargo-cache')
    deps = WORK / 'eval-pack/.deps'
    deps.mkdir(exist_ok=True)
    (deps / 'verifier').symlink_to(WORK / 'verifier', target_is_directory=True)
    (deps / 'grover').symlink_to(WORK / 'grover', target_is_directory=True)
    versions = run('versions', [sys.executable, '-m', 'pip', 'freeze', '--all'], WORK)
    report['python'] = sys.version
    run('python-golden', [sys.executable, 'tools/verify_golden.py'], WORK / 'verifier', marker='47/47 vectors reproduced')
    run('python-tests', [sys.executable, '-m', 'pytest', '-q'], WORK / 'verifier')
    run('rust-tests', ['cargo', 'test', '--locked', '--offline'], WORK / 'verifier/rust')
    run('evaluation-pack', [sys.executable, '-m', 'eval.run'], WORK / 'eval-pack', marker='ALL REPRODUCED')

    # Independently serialize both sides; upstream compares Python dictionaries.
    sys.path.insert(0, str(WORK / 'verifier'))
    from gravit_verifier.kernel import VerifierKernel, VerificationRequest, EvidenceRecord, EpistemicState
    from gravit_verifier.loader import load_bindings_from_dir
    from gravit_verifier.registry import TrustRoot, VerifierRegistry, key_id_for, signing_message
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    golden = WORK / 'verifier/tests/golden'
    root = TrustRoot.from_file(golden / 'trust_root.json')
    registry = VerifierRegistry.from_file(golden / 'registry.json', root)
    kernels = {True: VerifierKernel(registry), False: VerifierKernel()}
    for kernel in kernels.values():
        for binding in load_bindings_from_dir(WORK / 'verifier/bindings'):
            kernel.load_binding(binding)
    vectors = json.loads((golden / 'vectors.json').read_text())
    rows = []
    for vector in vectors:
        request = VerificationRequest(vector['name'], EpistemicState(vector['claimed_state']) if vector['claimed_state'] else None,
                                      [EvidenceRecord(**e) for e in vector['evidence']], vector['context'])
        got = kernels[vector['use_registry']].verify(request).to_dict()
        same = canonical(got) == canonical(vector['expected'])
        assert same, vector['name']
        rows.append({'name': vector['name'], 'canonical_json_equal': same,
                     'sha256': hashlib.sha256(canonical(got)).hexdigest(), 'decision': got})
    (OUT / 'canonical-vectors.json').write_text(json.dumps({'count': len(rows), 'comparison': 'Sorted-key compact UTF-8 JSON, not equality of original pretty-print file bytes', 'vectors': rows}, indent=2) + '\n')
    assert len(rows) == 47

    # The positive suite must detect a corrupted expected answer, not just run.
    path = golden / 'vectors.json'
    original = path.read_bytes()
    changed = json.loads(original)
    changed[0]['expected']['reason'] += ' ARKHE-NEGATIVE-CONTROL'
    try:
        path.write_text(json.dumps(changed))
        run('python-canary', [sys.executable, 'tools/verify_golden.py'], WORK / 'verifier', expected=1, marker='46/47 vectors reproduced')
        run('rust-canary', ['cargo', 'test', '--locked', '--offline', '--test', 'golden', 'reproduces_every_python_golden_vector', '--', '--nocapture'], WORK / 'verifier/rust', expected=None, marker='1 vector(s) differ')
    finally:
        path.write_bytes(original)

    # Scope probes under the published fixture trust root. No real keys involved.
    key_names = [*(f'v{i}' for i in range(1, 11)), 'v1b', 'vR']
    keys = {}
    for name in key_names:
        sk = Ed25519PrivateKey.from_private_bytes(hashlib.sha256(b'gravit-test-key:' + name.encode()).digest())
        keys[key_id_for(sk.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw))] = sk
    baseline = next(v for v in vectors if v['name'] == 'committed_two_strong')
    probes = []

    def probe(name, mutate=None, context=None, use_registry=True):
        evidence = [EvidenceRecord(**e) for e in baseline['evidence']]
        if mutate:
            for record in evidence:
                mutate(record)
        artifact = 'arkhe-review-contract-probe'
        for record in evidence:
            record.signature = base64.b64encode(keys[record.key_id].sign(signing_message(artifact, record))).decode()
        req = VerificationRequest(artifact, EpistemicState.VERIFIED_FACT, evidence, context or {})
        got = kernels[use_registry].verify(req).to_dict()
        row = {'probe': name, 'input_sha256': hashlib.sha256(canonical(asdict(req))).hexdigest(), 'request': asdict(req), 'decision': got}
        probes.append(row)
        return row

    valid = probe('baseline_test_registry')
    assert valid['decision']['final_epistemic_state'] == 'Verified Fact'
    no_registry = probe('same_evidence_without_registry', use_registry=False)
    assert no_registry['decision']['final_epistemic_state'] != 'Verified Fact'
    invalid_hash = probe('nonempty_nonhash_is_not_recomputed', lambda e: setattr(e, 'integrity_hash', 'not-a-cryptographic-digest'), {'high_impact': True})
    assert invalid_hash['decision']['final_epistemic_state'] == 'Verified Fact'
    no_policy = probe('malformed_time_without_freshness_policy', lambda e: setattr(e, 'timestamp', 'not-a-date'))
    assert no_policy['decision']['final_epistemic_state'] == 'Verified Fact'
    strict = probe('malformed_time_with_freshness_policy', lambda e: setattr(e, 'timestamp', 'not-a-date'), {'evaluation_time': '2026-10-24T12:00:00Z', 'freshness_max_age_seconds': 300})
    assert strict['decision']['final_epistemic_state'] != 'Verified Fact'
    stale = probe('old_time_with_trusted_review_time', context={'evaluation_time': '2026-10-24T12:00:00Z', 'freshness_max_age_seconds': 300})
    assert stale['decision']['final_epistemic_state'] != 'Verified Fact'
    rewind = probe('caller_rewinds_evaluation_time', context={'evaluation_time': '2026-09-06T12:00:00Z', 'freshness_max_age_seconds': 300})
    assert rewind['decision']['final_epistemic_state'] == 'Verified Fact'
    first = probe('decision_id_input_binding_A', lambda e: setattr(e, 'integrity_hash', 'a'*64), {'high_impact': True})
    second = probe('decision_id_input_binding_B', lambda e: setattr(e, 'integrity_hash', 'b'*64), {'high_impact': True})
    # Observational, not an assertion of a cryptographic hash collision.
    report['different_inputs_same_decision_id'] = first['input_sha256'] != second['input_sha256'] and first['decision']['decision_id'] == second['decision']['decision_id']
    (OUT / 'contract-probes.json').write_text(json.dumps({'scope': 'Synthetic, re-signed records under the upstream public fixture trust root; no production attack claim', 'probes': probes}, indent=2) + '\n')

    # Compare generated benchmark artifacts with their committed upstream bytes.
    comparisons = []
    originals = [INPUT / 'eval-pack/BENCHMARK.md', *sorted((INPUT / 'eval-pack/results').rglob('*.json'))]
    for original_file in originals:
        rel = original_file.relative_to(INPUT / 'eval-pack')
        generated = WORK / 'eval-pack' / rel
        same = generated.exists() and generated.read_bytes() == original_file.read_bytes()
        comparisons.append({'path': rel.as_posix(), 'byte_equal': same,
                            'expected_sha256': hashlib.sha256(original_file.read_bytes()).hexdigest(),
                            'observed_sha256': hashlib.sha256(generated.read_bytes()).hexdigest() if generated.exists() else None})
    report['published_artifacts'] = comparisons
    report['published_artifacts_all_equal'] = all(row['byte_equal'] for row in comparisons)
    # Windows-backed Podman mounts permit content writes but not all copystat calls.
    # Export bytes only; permissions and timestamps are not evaluation outputs.
    result_root = WORK / 'eval-pack/results'
    for source in result_root.rglob('*'):
        if source.is_file():
            destination = OUT / 'eval-results' / source.relative_to(result_root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(source.read_bytes())
    shutil.copyfile(WORK / 'eval-pack/BENCHMARK.md', OUT / 'BENCHMARK.md')
    shutil.copyfile(WORK / 'verifier/rust/Cargo.lock', OUT / 'gravit-rust-Cargo.lock')
    (OUT / 'environment.json').write_text(json.dumps({'python': sys.version, 'dependencies': versions,
                                                   'rustc': subprocess.check_output(['rustc','--version'],text=True).strip()}, indent=2) + '\n')
    report['canonical_vectors'] = 47
    report['contract_probes'] = len(probes)
    report['status'] = 'PASS' if report['published_artifacts_all_equal'] else 'REPRODUCED_WITH_ARTIFACT_DIFFERENCES'
    save()
    print(json.dumps({key: value for key, value in report.items() if key != 'gates'}), flush=True)
except Exception as error:
    report['status'] = 'FAIL'
    report['error'] = str(error)
    save()
    raise
