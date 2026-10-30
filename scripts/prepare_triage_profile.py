"""Materialize unsigned governance candidates; never generates keys, approvals, pins or anchors."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    binary = ROOT / ('target/debug/triage_policy.exe' if os.name == 'nt' else 'target/debug/triage_policy')
    profile_dir = ROOT / 'governance/profiles/triage-report-v1'
    registry_dir = ROOT / 'governance/trust-registry'
    for directory in [profile_dir, registry_dir]:
        directory.mkdir(parents=True, exist_ok=True)
    target = profile_dir / 'profile.json'
    if target.exists():
        print('Existing profile preserved; no signature or approval generated.')
    else:
        result = subprocess.run([str(binary), 'prepare', 'config/triage-classification.example.json',
                                 'REQUIRES-OPERATOR-IDENTITY', 'ollama-triage-v1', '86400'],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        candidate = json.loads(result.stdout)
        target.write_text(json.dumps(candidate['approval']['profile'], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (profile_dir / 'PROFILE-DIGEST.txt').write_text(candidate['profile_digest'] + '\n', encoding='utf-8')
        (profile_dir / 'profile.sig.example.json').write_text(json.dumps({
            'registry_digest': [0] * 32, 'approvals': []
        }, indent=2) + '\n', encoding='utf-8')
    registry_file = registry_dir / 'public-keys.json'
    if not registry_file.exists():
        registry_file.write_text(json.dumps({
            'version': 1, 'registry_id': 'UNPROVISIONED-INDEPENDENT-GOVERNANCE-REGISTRY',
            'threshold': 2, 'keys': []
        }, indent=2) + '\n', encoding='utf-8')
        result = subprocess.run([str(binary), 'registry-digest', str(registry_file)],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        identity = json.loads(result.stdout)['registry_digest']
        (registry_dir / 'REGISTRY-DIGEST.txt').write_text(identity + '\n', encoding='utf-8')
    print('Candidate artifacts only: governance/profiles/triage-report-v1 and governance/trust-registry.')
    print('No keys, signatures, trusted pins, transparency anchors or active policy were created.')


if __name__ == '__main__':
    main()
