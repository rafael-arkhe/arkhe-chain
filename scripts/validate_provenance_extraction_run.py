"""Read-only audit of retained four-stage experimental artifacts.

--write-manifest records hashes after validation; does not change fixture labels,
review status, broker policy or model predictions.
"""
import argparse
import hashlib
import json
from pathlib import Path

from provenance_extraction_harness import artifact_ref, check_spans, extraction_comparison, support_stage, integration_stage, read

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = ROOT/'tests/provenance-broker/extraction-harness'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, default=EXPERIMENT/'runs/gliner2.5-multi-rule-pt-v1')
    parser.add_argument('--write-manifest', action='store_true')
    args = parser.parse_args()
    manifest_file = args.run/'manifest.json'
    if manifest_file.is_file() and not args.write_manifest:
        for rel, sha in read(manifest_file)['files'].items():
            path = ROOT/rel
            assert path.resolve().is_relative_to(ROOT.resolve())
            assert hashlib.sha256(path.read_bytes()).hexdigest() == sha, rel
    report = read(args.run/'report.json')
    config = read(EXPERIMENT/'config.json')
    assert report['config'] == config
    assert report['model']['revision'] == config['model_revision']
    assert report['model']['config_ref'] == artifact_ref('CONFIG', config)
    assert report['source_code_sha256'] == hashlib.sha256((ROOT/'scripts/provenance_extraction_harness.py').read_bytes()).hexdigest()
    assert report['independent_review'] == 'pending' and not report['reserved_corpus']
    assert not report['integration']['policy_promoted']
    assert not report['integration']['authenticated_experimental_ingestion']
    fixtures = {}
    text_by_hash = {}
    for rel, sha in report['fixture_hashes'].items():
        path = ROOT/rel
        assert path.resolve().is_relative_to(ROOT.resolve())
        assert hashlib.sha256(path.read_bytes()).hexdigest() == sha
        f = read(path)
        fixtures[f['fixture_id']] = f
        assert f['independent_review']['status'] == 'pending'
        for chunk in f['chunks']:
            text = bytes.fromhex(chunk['bytes_hex']).decode()
            text_by_hash[hashlib.sha256(text.encode()).hexdigest()] = text
    assert len(fixtures) == report['fixture_count']
    extracted = {}
    for path in (args.run/'extraction').glob('*.json'):
        a = read(path)
        sha = a['source_utf8_sha256']
        assert path.stem == sha and a['extractor'] == report['model']
        assert a['span_checks'] == check_spans(a['raw'], text_by_hash[sha])
        assert a['truncated'] is False and a['word_tokens'] <= config['max_len']
        assert all(s['valid'] for s in a['span_checks'])
        extracted[sha] = a
    assert len(extracted) == report['unique_sources'] == len(text_by_hash)
    metrics = json.loads(json.dumps(extraction_comparison(list(extracted.values()), text_by_hash)))
    stored_metrics = dict(report['extraction_comparison'])
    # Tuple span keys serialize as arrays; file-system order is not metric order.
    observed_disagreements = sorted(metrics.pop('disagreements'), key=lambda d: d['source_sha256'])
    stored_disagreements = sorted(stored_metrics.pop('disagreements'), key=lambda d: d['source_sha256'])
    assert metrics == stored_metrics and observed_disagreements == stored_disagreements
    agreements = 0
    decisions = payloads = 0
    confusion = {}
    disagreements = []
    for fid, f in fixtures.items():
        artifacts = [extracted[hashlib.sha256(bytes.fromhex(c['bytes_hex'])).hexdigest()] for c in f['chunks']]
        evaluation = read(args.run/'support'/(fid+'.json'))
        assert evaluation == support_stage(f['candidate']['claim'], f['chunks'], artifacts, config['support_evaluator'])
        expected, observed = f['observations']['semantic']['body']['outcome'], evaluation['semantic_outcome']
        agreements += observed == expected
        key = expected+'->'+observed
        confusion[key] = confusion.get(key, 0)+1
        if expected != observed:
            disagreements.append({'fixture_id': fid, 'expected_provisional': expected,
                                  'observed': observed, 'reason': evaluation['reason']})
        integration = read(args.run/'integration'/(fid+'.json'))
        profile_version = 'v2' if f['profile_id'].endswith('v2') else 'v1'
        profile = read(ROOT/f'schemas/provenance-broker/profile-{profile_version}.json')
        assert integration == integration_stage(f, evaluation, artifacts, profile)
        assert integration['evaluation_ref'] == artifact_ref('SUPPORT', evaluation)
        assert integration['extraction_refs'] == [artifact_ref('EXTRACTION', a) for a in artifacts]
        assert integration['experimental_ingestion']['status'] == 'Blocked'
        assert integration['experimental_ingestion']['agent_payload']['chunks'] == []
        assert integration['retained_control_payload_match']
        assert integration['pure_policy_simulation_only'] and integration['policy_unchanged']
        decisions += integration['simulation_decision_matches_authored_oracle']
        payloads += integration['simulation_payload_matches_authored_oracle']
    assert agreements == report['support_comparison']['agreements']
    assert confusion == report['support_comparison']['confusion']
    assert sorted(disagreements, key=lambda d: d['fixture_id']) == sorted(report['support_comparison']['disagreements'], key=lambda d: d['fixture_id'])
    assert decisions == report['integration']['simulation_decision_matches']
    assert payloads == report['integration']['simulation_payload_matches']
    for directory in ('support', 'integration'):
        assert len(list((args.run/directory).glob('*.json'))) == len(fixtures)
    # Independently retain integrity of all prior material inventories.
    for rel in ('tests/provenance-broker/v3.1/manifest.json', 'tests/provenance-broker/v3.1/extensions-v2/manifest.json'):
        for file, sha in read(ROOT/rel)['files'].items():
            assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest() == sha
    if args.write_manifest:
        paths = sorted(p for p in args.run.rglob('*.json') if p.name != 'manifest.json')
        files = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
        for rel in ('scripts/provenance_extraction_harness.py', 'scripts/validate_provenance_extraction_run.py',
                    'tests/provenance-broker/extraction-harness/config.json',
                    'tests/provenance-broker/extraction-harness/requirements.txt',
                    'tests/provenance-broker/extraction-harness/test_harness.py'):
            files[rel] = hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()
        (args.run/'manifest.json').write_text(json.dumps({'independent_review':'pending', 'files':files}, indent=2)+'\n', encoding='utf-8')
    print(f'PASS: {len(extracted)} real extraction artifacts, {len(fixtures)} rule evaluations and blocked experimental integrations.')
    print('PASS: character/UTF-8 bindings, artifact references, provisional metrics, prior fixture hashes and pending review preserved.')


if __name__ == '__main__':
    main()
