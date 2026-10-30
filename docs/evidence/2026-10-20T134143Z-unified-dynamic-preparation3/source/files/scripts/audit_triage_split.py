"""Check retained source identity and candidate split; does not certify human provenance review."""
import hashlib
import json
from collections import defaultdict, Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    package = ROOT / 'tests/evaluation/external-review/expanded-24'
    manifest = json.loads((package/'REVIEW.json').read_text(encoding='utf-8'))
    for name, expected in manifest['files_sha256'].items():
        if hashlib.sha256((package/name).read_bytes()).hexdigest() != expected:
            raise ValueError(f'source hash mismatch: {name}')
    groups, exact, normalized = defaultdict(list), defaultdict(list), defaultdict(list)
    for case in manifest['cases']:
        item = {'path': case['path'], 'split': case['split_candidate']}
        raw = (package/case['path']).read_bytes()
        groups[case['provenance_group_candidate']].append(item)
        exact[hashlib.sha256(raw).hexdigest()].append(item)
        normalized[hashlib.sha256(raw.replace(b'\r\n', b'\n')).hexdigest()].append(item)
    def crossing(mapping):
        return [items for items in mapping.values() if len({i['split'] for i in items}) > 1]
    result = {'status': 'AUTOMATED_CHECK_ONLY_PENDING_HUMAN_REVIEW',
              'source_files': len(manifest['cases']),
              'hashes_verified': len(manifest['files_sha256']),
              'candidate_split_counts': dict(Counter(c['split_candidate'] for c in manifest['cases'])),
              'provenance_groups': len(groups), 'cross_split_provenance_groups': crossing(groups),
              'cross_split_exact_duplicates': crossing(exact),
              'cross_split_newline_normalized_duplicates': crossing(normalized),
              'exact_duplicate_clusters': [v for v in exact.values() if len(v)>1],
              'human_alias_fork_semantic_variant_review': 'PENDING',
              'labels_negatives_and_transformations_review': 'PENDING',
              'holdout_validated': False, 'new_inferences': 0}
    target = ROOT / 'docs/evidence/local/2026-10-17/triage-evaluation/run-02-split-audit.json'
    target.write_text(json.dumps(result,indent=2), encoding='utf-8')
    print(json.dumps(result,indent=2))
    if crossing(groups) or crossing(exact) or crossing(normalized):
        raise SystemExit('BLOCKED: cross-split overlap found')


if __name__ == '__main__':
    main()
