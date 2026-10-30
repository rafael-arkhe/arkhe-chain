"""Run cognition CI gates and collect hash-verified evidence without claiming a signature."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SPEC = Path('docs/COGNITION-SDK.md')
GATES = {
    'conformance': [('cognition', ['scripts/cognition_conformance.py'])],
    'dependencies': [
        ('boundaries', ['scripts/check_boundaries.py']),
        ('dependency-regressions', ['-m', 'unittest', 'discover', '-s', 'scripts/tests',
                                    '-p', 'test_cognition_dependencies.py', '-v']),
        ('evidence-regressions', ['-m', 'unittest', 'discover', '-s', 'scripts/tests',
                                  '-p', 'test_cognition_ci.py', '-v'])],
    'architecture': [('architecture', ['scripts/check_architecture.py'])],
}
CONTEXT = ('GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def run_gate(gate, output):
    output = output.resolve()
    if not output.is_relative_to(ROOT / 'docs/evidence'):
        raise ValueError('gate evidence must stay inside docs/evidence')
    output.mkdir(parents=True, exist_ok=False)
    before = digest(ROOT / SPEC)
    shutil.copyfile(ROOT / SPEC, output / 'COGNITION-SDK.md')
    code = 0
    for name, command in GATES[gate]:
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/record_gate.py'),
                                 name, '--', sys.executable, *command], cwd=ROOT,
                                env={**os.environ, 'ARKHE_EVIDENCE_DIR': str(output)})
        if result.returncode:
            code = result.returncode
            break
    after = digest(ROOT / SPEC)
    write_json(output / 'receipt.json', {
        'schema': 1, 'gate': gate, 'exit_code': code,
        'specification_before_sha256': before, 'specification_after_sha256': after,
        'context': {key: os.environ[key] for key in CONTEXT if key in os.environ},
        'execution': 'github-actions' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'local',
    })
    return code or (1 if before != after else 0)


def safe_file(folder, relative):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts or len(path.parts) != 1:
        raise ValueError('invalid evidence filename')
    candidate = folder / path
    if candidate.is_symlink() or not candidate.is_file():
        raise ValueError('missing or linked evidence file: ' + relative)
    return candidate


def validate_gate(folder, gate, expected_context, expected_spec):
    receipt = json.loads(safe_file(folder, 'receipt.json').read_text(encoding='utf-8'))
    data = json.loads(safe_file(folder, 'results.json').read_text(encoding='utf-8'))
    if receipt['gate'] != gate or receipt['exit_code'] != 0:
        raise ValueError('gate failed or identity mismatched')
    if receipt['context'] != expected_context:
        raise ValueError('receipt run context mismatched')
    if expected_context and receipt['execution'] != 'github-actions':
        raise ValueError('local receipt cannot stand in for GitHub execution')
    if any(receipt[key] != expected_spec for key in
           ('specification_before_sha256', 'specification_after_sha256')):
        raise ValueError('specification changed or mismatched')
    if digest(safe_file(folder, 'COGNITION-SDK.md')) != expected_spec:
        raise ValueError('specification copy mismatched')
    attempts = data['attempts']
    if [a['gate'] for a in attempts] != [name for name, _ in GATES[gate]]:
        raise ValueError('missing, repeated or unexpected gate attempts')
    for key, value in expected_context.items():
        if data['context'].get(key) != value:
            raise ValueError('results run context mismatched')
    sources = set()
    files = {'receipt.json', 'results.json', 'COGNITION-SDK.md', 'RESULTS.md'}
    for attempt, (_, expected_command) in zip(attempts, GATES[gate]):
        if attempt["command"][1:] != expected_command:
            raise ValueError("unexpected gate command")
        if attempt['exit_code'] != 0 or attempt['status'] != 'PASS':
            raise ValueError('unsuccessful attempt')
        if (attempt['source_changed_during_execution'] or
                attempt['source_before_sha256'] != attempt['source_after_sha256']):
            raise ValueError('source changed during execution')
        if digest(safe_file(folder, attempt['log'])) != attempt['log_sha256']:
            raise ValueError('log hash mismatched')
        inputs_path = safe_file(folder, attempt['inputs'])
        inputs = json.loads(inputs_path.read_text(encoding='utf-8'))
        encoded = json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode()
        identity = hashlib.sha256(encoded).hexdigest()
        if identity != attempt['source_before_sha256']:
            raise ValueError('source inventory hash mismatched')
        sources.add(identity)
        files.update((attempt['log'], attempt['inputs']))
    if len(sources) != 1:
        raise ValueError('source identity differs between attempts')
    for name in files:
        safe_file(folder, name)
    return sources.pop(), sorted(files)


def bundle(inputs, output, expected_context=None, job_results=None):
    inputs, output = inputs.resolve(), output.resolve()
    if output == inputs or output.is_relative_to(inputs) or inputs.is_relative_to(output):
        raise ValueError('bundle and inputs must not overlap')
    output.mkdir(parents=True, exist_ok=False)
    expected_context = expected_context or {}
    report = {'schema': 1, 'status': 'PASS', 'context': expected_context,
              'created_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'execution': 'github-actions' if expected_context else 'local',
              'signature': 'not-generated-by-this-script', 'gates': {}, 'errors': [],
              'scope': 'Interface, dependency and architecture checks only; no runtime sandbox certification'}
    expected_spec = digest(ROOT / SPEC)
    shutil.copyfile(ROOT / SPEC, output / 'COGNITION-SDK.md')
    report['specification_sha256'] = expected_spec
    identities = set()
    for gate in GATES:
        try:
            folders = [p.parent for p in inputs.glob('*/receipt.json')
                       if json.loads(p.read_text(encoding='utf-8')).get('gate') == gate]
            if len(folders) != 1:
                raise ValueError('expected exactly one receipt')
            folder = folders[0]
            if folder.is_symlink():
                raise ValueError('linked evidence directory')
            identity, files = validate_gate(folder, gate, expected_context, expected_spec)
            target = output / 'gates' / gate
            target.mkdir(parents=True)
            for name in files:
                shutil.copyfile(safe_file(folder, name), target / name)
            identities.add(identity)
            report['gates'][gate] = {'status': 'PASS', 'source_sha256': identity}
        except (OSError, ValueError, KeyError, TypeError) as error:
            report['gates'][gate] = {'status': 'FAIL'}
            report['errors'].append(gate + ': ' + str(error))
    if len(identities) != 1:
        report['errors'].append('gates do not share one source identity')
    if job_results is not None:
        report['upstream_jobs'] = job_results
        if not job_results or any(v.get('result') != 'success' for v in job_results.values()):
            report['errors'].append('an upstream GitHub job failed, was skipped or cancelled')
    if report['errors']:
        report['status'] = 'FAIL'
    write_json(output / 'results.json', report)
    lines = ['# Cognition CI evidence', '', 'Result: ' + report['status'], '', report['scope'], '',
             'Hashes detect tampering; they are not signatures.',
             'OIDC attestation, when eligible, is produced separately by GitHub Actions.', '']
    lines.extend('- ' + gate + ': ' + result['status'] for gate, result in report['gates'].items())
    lines.extend(['', *report['errors']])
    (output / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    paths = sorted(p for p in output.rglob('*') if p.is_file())
    checksums = ''.join(digest(p) + '  ' + p.relative_to(output).as_posix() + '\n' for p in paths)
    (output / 'SHA256SUMS').write_text(checksums, encoding='utf-8')
    print(report['status'] + ': ' + str(output / 'REPORT.md'))
    return 0 if report['status'] == 'PASS' else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    gate = commands.add_parser('gate')
    gate.add_argument('gate', choices=GATES)
    gate.add_argument('--output', type=Path, required=True)
    collect = commands.add_parser('bundle')
    collect.add_argument('--inputs', type=Path, required=True)
    collect.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'gate':
        return run_gate(args.gate, args.output)
    context = {key: os.environ[key] for key in CONTEXT if key in os.environ}
    if os.environ.get('GITHUB_ACTIONS') == 'true' and len(context) != len(CONTEXT):
        raise ValueError('incomplete GitHub run identity')
    jobs = json.loads(os.environ['ARKHE_JOB_RESULTS']) if 'ARKHE_JOB_RESULTS' in os.environ else None
    return bundle(args.inputs, args.output, context, jobs)


if __name__ == '__main__':
    raise SystemExit(main())
