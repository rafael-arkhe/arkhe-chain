"""Prepare a public annotation packet without predictions or frozen support labels.

No annotator is assigned and no review/holdout is claimed. Does not rewrite any
broker fixture, oracle, model artifact or policy.
"""
import argparse
import hashlib
import json
from pathlib import Path

from provenance_broker_decision import digest

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT = ROOT/'tests/provenance-broker/extraction-harness'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', choices=['1', '1.1'], default='1.1')
    args = parser.parse_args()
    out = ROOT/('tests/provenance-broker/annotation-pilot-v'+args.revision)
    if args.revision == '1' and (out/'manifest.json').exists():
        raise ValueError('v1 packet already published; preserve it and use a new revision')
    protocol_path = 'docs/architecture/provenance-annotation-protocol-v'+args.revision+'.md'
    schema_path = 'schemas/provenance-broker/annotation-v'+args.revision+'.schema.json'
    report_path = EXPERIMENT/'runs/gliner2.5-multi-rule-pt-v1/report.json'
    report = read(report_path)
    sources = {}
    tasks = []
    curation = []
    for rel, sha in sorted(report['fixture_hashes'].items()):
        path = ROOT/rel
        assert hashlib.sha256(path.read_bytes()).hexdigest() == sha
        f = read(path)
        source_ids = []
        bindings = []
        for c in f['chunks']:
            raw = bytes.fromhex(c['bytes_hex'])
            sid = hashlib.sha256(raw).hexdigest()
            raw.decode('utf-8')
            dest = out/'sources'/(sid+'.txt')
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(raw)
            source_ids.append(sid)
            sources[sid] = {'source_id': sid, 'path': 'sources/'+sid+'.txt', 'bytes': len(raw), 'encoding': 'UTF-8'}
            bindings.append({'source_id': sid, 'chunk_id': c['chunk_id'], 'evidence_ref': c['record_hash'],
                'representation_digest': c['record']['text_position']['repr_digest'],
                'source_digest': c['record']['source_digest']})
        task_id = 'task-'+hashlib.sha256(f['fixture_id'].encode()).hexdigest()[:20]
        curation.append({'task_id': task_id, 'fixture_id': f['fixture_id'], 'fixture_path': rel, 'fixture_sha256': sha})
        tasks.append({'task_id': task_id, 'claim': f['candidate']['claim'],
            'claim_digest': digest('CLAIM', f['candidate']['claim']), 'source_ids': source_ids,
            'source_bindings': bindings,
            'split': 'public_pilot', 'review_status': 'not_started', 'assignments': []})
    task_file = out/'tasks.json'
    write(task_file, {'protocol_id': 'arkhe-annotation-v1', 'sources': sorted(sources.values(), key=lambda x:x['source_id']),
        'tasks': sorted(tasks, key=lambda x:x['task_id']), 'predictions_included': False,
        'frozen_support_labels_included': False, 'blinding_enforced': False,
        'reserved_corpus': False, 'independent_review': 'pending'})
    paths = [task_file]+sorted((out/'sources').glob('*.txt'))
    manifest = {'protocol_id': 'arkhe-annotation-v1', 'status': 'prepared_not_annotated',
        'packet_revision': args.revision, 'protocol_path': protocol_path, 'annotation_schema_path': schema_path,
        'source_count': len(sources), 'task_count': len(tasks), 'independent_review': 'pending',
        'baseline': {'model_id': report['model']['id'], 'model_revision': report['model']['revision'],
            'config_sha256': hashlib.sha256((EXPERIMENT/'config.json').read_bytes()).hexdigest(),
            'report_sha256': hashlib.sha256(report_path.read_bytes()).hexdigest()},
        'protocol_sha256': hashlib.sha256((ROOT/protocol_path).read_bytes()).hexdigest(),
        'protocol_base_sha256': hashlib.sha256((ROOT/'docs/architecture/provenance-annotation-protocol-v1.md').read_bytes()).hexdigest(),
        'annotation_schema_sha256': hashlib.sha256((ROOT/schema_path).read_bytes()).hexdigest(),
        'files': {p.relative_to(out).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
    write(out/'manifest.json', manifest)
    write(ROOT/('tests/provenance-broker/annotation-curation-v'+args.revision+'.json'), {'status': 'public_pilot_not_reserved',
        'distribute_with_annotation_packet': False, 'mapping': curation})
    print(f'Prepared {len(tasks)} public tasks / {len(sources)} unique sources; no annotations, assignments, predictions or review claims.')


if __name__ == '__main__':
    main()
