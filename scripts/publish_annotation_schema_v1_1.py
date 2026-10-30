"""Publish stricter mechanical constraints as a new schema; preserve v1 bytes."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    schema = json.loads((ROOT/'schemas/provenance-broker/annotation-v1.schema.json').read_text(encoding='utf-8'))
    schema['$id'] = 'urn:arkhe:annotation:v1.1'
    schema['title'] = 'Candidate annotation schema v1.1; no broker admission authority'
    schema['$defs']['note']['pattern'] = r'\S'
    schema['$defs']['support']['allOf'].append({
        'if': {'properties': {'outcome': {'enum': ['Supported', 'Partial', 'Contradicted']}}},
        'then': {'properties': {'evidence_span_refs': {'minItems': 1}}}})
    labels = schema['$defs']['event']['properties']['modality_labels']
    labels['allOf'] = [
        {'if': {'contains': {'const': label}}, 'then': {'maxItems': 1}}
        for label in ('Unmarked', 'Underspecified')]
    path = ROOT/'schemas/provenance-broker/annotation-v1.1.schema.json'
    path.write_text(json.dumps(schema, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Published annotation-v1.1.schema.json; annotation-v1.schema.json unchanged.')


if __name__ == '__main__':
    main()
