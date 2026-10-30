"""Mechanical annotation/packet validation; never claims content review or IAA."""
import argparse
import hashlib
import json
from pathlib import Path

import jsonschema

from provenance_broker_decision import digest

ROOT = Path(__file__).resolve().parents[1]
PACKET = ROOT/'tests/provenance-broker/annotation-pilot-v1.1'


def load(path):
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise ValueError('duplicate JSON key: '+key)
            out[key] = value
        return out
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=pairs)


def unique(items, key):
    out = {item[key]: item for item in items}
    if len(out) != len(items):
        raise ValueError('duplicate '+key)
    return out


def validate_annotation(a, task, sources, validator):
    validator.validate(a)
    spans = unique(a['spans'], 'span_id')
    events = unique(a['events'], 'event_id')
    relations = unique(a['relations'], 'relation_id')
    def refs(values, available):
        if any(value not in available for value in values):
            raise ValueError('unresolved annotation reference')
    for s in spans.values():
        if s['source_id'] not in task['source_ids']:
            raise ValueError('source outside task')
        raw = sources[s['source_id']]
        start, end = s['byte_offset'], s['byte_offset']+s['byte_length']
        if s['byte_length'] == 0 or end > len(raw) or end > 2**64-1:
            raise ValueError('span outside source')
        raw[:start].decode('utf-8')
        text = raw[start:end].decode('utf-8')
        if text != s['text']:
            raise ValueError('span text does not match source bytes')
        refs(s['scope_event_refs'], events)
        if s['kind'] == 'Entity' and s['label'] not in ('service', 'database', 'organization', 'person', 'other'):
            raise ValueError('unknown entity label')
    for event in events.values():
        refs(event['trigger_span_refs']+event['argument_span_refs']+event['speaker']['span_refs'], spans)
        if any(spans[r]['kind'] != 'EventTrigger' for r in event['trigger_span_refs']):
            raise ValueError('event trigger has wrong span kind')
        if any(spans[r]['kind'] != 'Entity' for r in event['argument_span_refs']):
            raise ValueError('event argument has wrong span kind')
        if event['speaker']['kind'] == 'Explicit' and not event['speaker']['span_refs']:
            raise ValueError('explicit speaker needs a span')
        labels = event['modality_labels']
        if len(labels) > 1 and ('Unmarked' in labels or 'Underspecified' in labels):
            raise ValueError('exclusive modality label mixed with others')
    for relation in relations.values():
        refs(relation['subject_span_refs']+relation['object_span_refs']+relation['qualifier_span_refs'], spans)
        refs(relation['event_refs'], events)
        if any(spans[r]['kind'] != 'Entity' for r in relation['subject_span_refs']+relation['object_span_refs']):
            raise ValueError('relation endpoint is not an entity span')
    support = a['support']
    if support['claim_digest'] != task['claim_digest']:
        raise ValueError('support targets another Claim')
    refs(support['evidence_span_refs'], spans)
    refs(support['event_refs'], events)
    refs(support['relation_refs'], relations)
    if support['outcome'] in ('Supported', 'Partial', 'Contradicted') and not support['evidence_span_refs']:
        raise ValueError('support judgment requires evidence spans')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packet', type=Path, default=PACKET)
    parser.add_argument('--annotation', type=Path, action='append', default=[])
    args = parser.parse_args()
    manifest = load(args.packet/'manifest.json')
    revision = manifest.get('packet_revision', '1')
    if revision not in ('1', '1.1'):
        raise ValueError('unsupported annotation packet revision')
    schema_path = 'schemas/provenance-broker/annotation-v'+revision+'.schema.json'
    protocol_path = 'docs/architecture/provenance-annotation-protocol-v'+revision+'.md'
    if manifest.get('annotation_schema_path', schema_path) != schema_path or manifest.get('protocol_path', protocol_path) != protocol_path:
        raise ValueError('unexpected schema/protocol path')
    schema = load(ROOT/schema_path)
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    packet = load(args.packet/'tasks.json')
    for rel, sha in manifest['files'].items():
        path = args.packet/rel
        if not path.resolve().is_relative_to(args.packet.resolve()):
            raise ValueError('packet path outside root')
        if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            raise ValueError('packet hash mismatch: '+rel)
    if hashlib.sha256((ROOT/protocol_path).read_bytes()).hexdigest() != manifest['protocol_sha256']:
        raise ValueError('protocol revision changed')
    if hashlib.sha256((ROOT/schema_path).read_bytes()).hexdigest() != manifest['annotation_schema_sha256']:
        raise ValueError('annotation schema revision changed')
    if 'protocol_base_sha256' in manifest and hashlib.sha256((ROOT/'docs/architecture/provenance-annotation-protocol-v1.md').read_bytes()).hexdigest() != manifest['protocol_base_sha256']:
        raise ValueError('base protocol revision changed')
    tasks = unique(packet['tasks'], 'task_id')
    sources = {}
    for source in packet['sources']:
        path = args.packet/source['path']
        if not path.resolve().is_relative_to(args.packet.resolve()):
            raise ValueError('source path outside packet')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != source['source_id'] or len(raw) != source['bytes']:
            raise ValueError('source bytes mismatch')
        raw.decode('utf-8')
        sources[source['source_id']] = raw
    if len(sources) != manifest['source_count'] or len(tasks) != manifest['task_count']:
        raise ValueError('packet count mismatch')
    for task in tasks.values():
        if task['split'] != 'public_pilot' or task['assignments'] or task['review_status'] != 'not_started':
            raise ValueError('packet incorrectly claims annotation/review state')
        if task['claim_digest'] != digest('CLAIM', task['claim']) or any(s not in sources for s in task['source_ids']):
            raise ValueError('task binding invalid')
    baseline = manifest['baseline']
    experiment = ROOT/'tests/provenance-broker/extraction-harness'
    for path, key in [(experiment/'config.json', 'config_sha256'), (experiment/'runs/gliner2.5-multi-rule-pt-v1/report.json', 'report_sha256')]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != baseline[key]:
            raise ValueError('baseline changed')
    if packet['predictions_included'] or packet['frozen_support_labels_included'] or packet['reserved_corpus']:
        raise ValueError('incorrect packet claims')
    loaded = {}
    for path in args.annotation:
        a = load(path)
        if a['task_id'] not in tasks:
            raise ValueError('unknown annotation task')
        validate_annotation(a, tasks[a['task_id']], sources, validator)
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        loaded[sha] = a
    for a in loaded.values():
        if a['phase'] == 'Adjudication':
            parents = [loaded.get(ref) for ref in a['parent_annotation_refs']]
            if any(p is None or p['task_id'] != a['task_id'] or p['phase'] != 'Independent' for p in parents):
                raise ValueError('adjudication parents missing or not independent records of this task')
            if len({p['annotator_id'] for p in parents}) < 2:
                raise ValueError('adjudication needs records from distinct annotators')
    print(f'PASS: annotation schema, {len(tasks)} public tasks, {len(sources)} sources and {len(loaded)} annotation files mechanically checked.')
    print('NOT PERFORMED: annotation content review, human agreement, adjudication, reserved corpus or fixture review promotion.')


if __name__ == '__main__':
    main()
