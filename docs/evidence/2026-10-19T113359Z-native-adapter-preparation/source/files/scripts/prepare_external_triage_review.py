"""Fetch pinned public evaluation data for human review, without running model or upstream code."""
import hashlib
import argparse
import json
from pathlib import Path
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '230e649123477eff332742a59a1c7cc6dc286cab'
BASE = f'https://raw.githubusercontent.com/smartbugs/smartbugs-curated/{COMMIT}/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--per-category', type=int, choices=range(2, 21), default=2)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    output = args.output or ROOT / 'tests/evaluation/external-review/smartbugs-curated' / COMMIT
    output.mkdir(parents=True, exist_ok=False)
    hashes = {}
    def fetch(path):
        with urllib.request.urlopen(BASE + path, timeout=30) as response:
            content = response.read(2 * 1024 * 1024 + 1)
        if len(content) > 2 * 1024 * 1024:
            raise ValueError('source exceeds bounded download')
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        hashes[path] = hashlib.sha256(content).hexdigest()
        return content
    catalog = json.loads(fetch('vulnerabilities.json'))
    fetch('README.md')
    fetch('LICENSE')
    candidates = []
    # Deterministic convenience sample for review, not a representative benchmark.
    for category in ['access_control', 'arithmetic', 'reentrancy']:
        matching = sorted((c for c in catalog if c['path'].startswith(f'dataset/{category}/')),
                          key=lambda c: c['path'])[:args.per_category]
        for entry in matching:
            path = entry['path']
            if '..' in Path(path).parts or not path.startswith('dataset/'):
                raise ValueError('unexpected upstream path')
            fetch(path)
            origin = urllib.parse.urlsplit(entry.get('source') or '')
            parts = origin.path.strip('/').split('/')
            group = (origin.netloc.lower() + '/' + '/'.join(parts[:2] if origin.netloc.lower() == 'github.com' else parts[:1])) if origin.netloc else 'UNKNOWN-SOURCE'
            candidates.append({'path': path, 'source_url': BASE + path,
                               'provenance_group_candidate': group,
                               'upstream_annotation': entry,
                               'review_status': 'PENDING_SECOND_HUMAN_REVIEW',
                               'reviewer': None, 'label_supports_proposal': None,
                               'severity': None, 'report_facts': None,
                               'negative_control': None, 'split': 'UNASSIGNED',
                               'review_notes': None})
    groups = sorted({c['provenance_group_candidate'] for c in candidates},
                    key=lambda g: hashlib.sha256(('arkhe-run02-split-v1:' + g).encode()).hexdigest())
    holdout = set(groups[:max(1, (len(groups) + 3) // 4)])
    for candidate in candidates:
        candidate['split_candidate'] = 'holdout' if candidate['provenance_group_candidate'] in holdout else 'development'
    manifest = {'status': 'REVIEW_PACKAGE_ONLY_NO_INFERENCE',
                'repository': 'https://github.com/smartbugs/smartbugs-curated',
                'commit': COMMIT, 'files_sha256': hashes,
                'selection': f'first {args.per_category} paths alphabetically in each of three categories',
                'split_status': 'CANDIDATE_PROVENANCE_GROUPING_REQUIRES_HUMAN_ALIAS_AND_DUPLICATE_REVIEW',
                'split_algorithm': 'source URL repository/site group; SHA256 arkhe-run02-split-v1:<group>; first ceil(groups/4) held out',
                'holdout_is_not_claimed_blind_or_training_unseen': True,
                'upstream_labels_are_not_arkhe_severity_or_exploitability_proof': True,
                'source_comments_contain_labels_do_not_feed_unmodified_to_model': True,
                'repetitions_after_review': 5, 'cases': candidates}
    (output / 'REVIEW.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Prepared {len(candidates)} external sources at commit {COMMIT}; no inference; all labels pending human review.')


if __name__ == '__main__':
    main()
