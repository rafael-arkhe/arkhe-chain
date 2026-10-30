"""Prepare containment probe requests and collect untrusted observations; does not execute containers."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import secrets
import shutil
from uuid import uuid4

from runtime_containment import ROOT, CATALOG, validate_catalog, digest

PROTOCOL = 'arkhe-containment-probe/v1'
SOURCE = ROOT / 'packaging/sandbox/containment-probe/main.rs'
SUPPORT_FILES = {"network-wire.rs": SOURCE.with_name("network-wire.rs")}
MAX_OUTPUT = 65536


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def no_duplicates(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate JSON key')
        value[key] = item
    return value


def reject_constant(value):
    raise ValueError('non-finite JSON value: ' + value)


def decode_observation(payload, request):
    if len(payload) > MAX_OUTPUT:
        raise ValueError('probe output limit exceeded')
    data = json.loads(payload.decode('utf-8'), object_pairs_hook=no_duplicates,
                      parse_constant=reject_constant)
    required = {'protocol', 'vector_id', 'nonce', 'state', 'observations', 'errno'}
    if not isinstance(data, dict) or set(data) != required:
        raise ValueError('invalid probe envelope; decisions cannot come from a probe')
    if data['protocol'] != PROTOCOL or data['protocol'] != request['protocol']:
        raise ValueError('protocol mismatch')
    if data['vector_id'] != request['vector_id'] or data['nonce'] != request['nonce']:
        raise ValueError('vector/nonce mismatch or replay')
    if data['state'] not in ('OBSERVED', 'ERROR', 'UNSUPPORTED'):
        raise ValueError('a probe cannot declare PASS or runtime verification')
    if data['errno'] is not None and (type(data['errno']) is not int or not 1 <= data['errno'] <= 4095):
        raise ValueError('invalid errno')
    if not isinstance(data['observations'], str) or len(data['observations'].encode('utf-8')) > 32768:
        raise ValueError('invalid observation body')
    return data


def manifest(folder):
    files = sorted(p for p in folder.rglob('*') if p.is_file() and p.name != 'SHA256SUMS')
    (folder / 'SHA256SUMS').write_text(''.join(
        digest(path) + '  ' + path.relative_to(folder).as_posix() + '\n' for path in files), encoding='utf-8')


def prepare(output):
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    vectors = validate_catalog(catalog)
    output = output.resolve()
    if not output.is_relative_to(ROOT / 'docs/evidence'):
        raise ValueError('harness sessions must stay under docs/evidence')
    output.mkdir(parents=True, exist_ok=False)
    requests, fixtures = output / 'requests', output / 'fixtures'
    requests.mkdir()
    fixtures.mkdir()
    run_id = str(uuid4())
    receipts = {}
    for vector in vectors:
        nonce = secrets.token_hex(32)
        fixture = fixtures / vector['id']
        fixture.mkdir()
        (fixture / 'arkhe-containment-fixture').write_text(nonce + '\n', encoding='utf-8')
        (fixture / 'arkhe-containment-sentinel').write_text('sentinel:' + nonce + '\n', encoding='utf-8')
        request = {'protocol': PROTOCOL, 'run_id': run_id, 'vector_id': vector['id'],
                   'nonce': nonce, 'profile': vector['profile'], 'budget': vector['budget'],
                   'fixture_directory': 'fixtures/' + vector['id']}
        path = requests / (vector['id'] + '.json')
        write_json(path, request)
        receipts[vector['id']] = {'request_sha256': digest(path),
            'sentinel_sha256': digest(fixture / 'arkhe-containment-sentinel'),
            'marker_sha256': digest(fixture / 'arkhe-containment-fixture')}
    shutil.copyfile(SOURCE, output / 'probe.rs')
    support = {}
    for name, path in SUPPORT_FILES.items():
        shutil.copyfile(path, output / name)
        support[name] = digest(path)
    session = {'schema': 1, 'protocol': PROTOCOL, 'run_id': run_id, 'status': 'PREPARED',
               'runtime_verified': False, 'catalog_sha256': digest(CATALOG),
               'probe_source_sha256': digest(SOURCE), 'probe_support_sha256': support,
               'runtime_source_sha256': digest(ROOT / catalog['runtime_source']),
               'specification_sha256': digest(ROOT / 'docs/RUNTIME-CONTAINMENT.md'),
               'requests': receipts,
               'created_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'executor_implemented': False, 'host_oracles_implemented': False}
    write_json(output / 'session.json', session)
    manifest(output)
    print('PREPARED (no execution): ' + str(output / 'session.json'))
    return session


def read_regular(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_OUTPUT:
        raise ValueError('missing, linked or oversized protocol file: ' + path.name)
    return path.read_bytes()


def collect(session_path, observations, output):
    # The collection command accepts raw observations, never a PASS from the probe.
    # It deliberately cannot complete verification before trusted oracles exist.
    session_path, observations, output = session_path.resolve(), observations.resolve(), output.resolve()
    if not output.is_relative_to(ROOT / 'docs/evidence'):
        raise ValueError('reports must stay under docs/evidence')
    if any(output == path or output.is_relative_to(path) or path.is_relative_to(output)
           for path in (session_path, observations)):
        raise ValueError('output must not overlap session or observations')
    session = json.loads(read_regular(session_path / 'session.json'))
    if session.get('schema') != 1 or session.get('protocol') != PROTOCOL or session.get('runtime_verified') is not False:
        raise ValueError('invalid prepared session')
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    vectors = validate_catalog(catalog)
    if (session['runtime_source_sha256'] != digest(ROOT / catalog['runtime_source']) or
            session['specification_sha256'] != digest(ROOT / 'docs/RUNTIME-CONTAINMENT.md')):
        raise ValueError('runtime or specification changed; prepare a new session')
    if session['catalog_sha256'] != digest(CATALOG) or session['probe_source_sha256'] != digest(SOURCE):
        raise ValueError('catalog or probe source changed; prepare a new session')
    if set(session['requests']) != {v['id'] for v in vectors}:
        raise ValueError('session is missing or adding vectors')
    if session.get('probe_support_sha256') != {name:digest(path) for name,path in SUPPORT_FILES.items()}:
        raise ValueError('probe support sources changed')
    for name in SUPPORT_FILES:
        safe_support = session_path/name
        if safe_support.is_symlink() or digest(safe_support) != session['probe_support_sha256'][name]:
            raise ValueError('staged support source changed')
    if digest(session_path / 'probe.rs') != session['probe_source_sha256']:
        raise ValueError('staged probe source changed')
    output.mkdir(parents=True, exist_ok=False)
    target = output / 'receipts'
    target.mkdir()
    results = []
    for vector in vectors:
        identity = vector['id']
        entry = {'vector_id': identity, 'status': 'PLANNED', 'runtime_verified': False}
        try:
            request_path = session_path / 'requests' / (identity + '.json')
            if hashlib.sha256(read_regular(request_path)).hexdigest() != session['requests'][identity]['request_sha256']:
                raise ValueError('request hash mismatch')
            request = json.loads(read_regular(request_path))
            if request['run_id'] != session['run_id'] or request['vector_id'] != identity:
                raise ValueError('request identity mismatch')
            if not re.fullmatch('[0-9a-f]{64}', request['nonce']):
                raise ValueError('invalid nonce')
            fixture = session_path / 'fixtures' / identity
            for filename, key in [('arkhe-containment-sentinel', 'sentinel_sha256'),
                                  ('arkhe-containment-fixture', 'marker_sha256')]:
                if hashlib.sha256(read_regular(fixture / filename)).hexdigest() != session['requests'][identity][key]:
                    raise ValueError('fixture changed')
            observation_path = observations / (identity + '.json')
            if observation_path.exists():
                raw = read_regular(observation_path)
                observation = decode_observation(raw, request)
                copy = target / (identity + '.json')
                copy.write_bytes(raw)
                entry.update(status='UNASSESSED' if observation['state'] == 'OBSERVED' else observation['state'],
                             receipt_sha256=digest(copy), request_sha256=digest(request_path))
                entry['reason'] = 'independent host oracle and container lifecycle evidence not implemented'
            else:
                entry['reason'] = 'no observation supplied'
        except (OSError, ValueError, KeyError, TypeError) as error:
            entry.update(status='ERROR', reason=str(error))
        results.append(entry)
    report = {'schema': 1, 'run_id': session['run_id'], 'status': 'INCOMPLETE',
              'runtime_verified': False, 'vectors': results,
              'scope': 'Raw observations only; no runtime containment verification or attestation.',
              'missing': ['container executor', 'independent host oracles', 'cleanup receipts',
                          'pinned effective syscall policy', 'network canary', 'bounded resource supervisor']}
    write_json(output / 'results.json', report)
    manifest(output)
    print('INCOMPLETE; runtime_verified=false: ' + str(output / 'results.json'))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('prepare')
    create.add_argument('--output', type=Path, required=True)
    receive = commands.add_parser('collect')
    receive.add_argument('--session', type=Path, required=True)
    receive.add_argument('--observations', type=Path, required=True)
    receive.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        prepare(args.output)
        return 0
    collect(args.session, args.observations, args.output)
    # An incomplete collection must not satisfy a runtime CI gate.
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
