"""Check the current unsigned deliverable without treating it as an approved deployment."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    binary = ROOT / ('target/debug/triage_policy.exe' if os.name == 'nt' else 'target/debug/triage_policy')
    profile = ROOT / 'governance/profiles/triage-report-v1'
    registry = ROOT / 'governance/trust-registry'
    for command, directory, filename, field, identity_file in [
        ('profile-digest', profile, 'profile.json', 'profile_digest', 'PROFILE-DIGEST.txt'),
        ('registry-digest', registry, 'public-keys.json', 'registry_digest', 'REGISTRY-DIGEST.txt'),
    ]:
        result = subprocess.run([str(binary), command, str(directory / filename)], check=True,
                                capture_output=True, text=True, cwd=ROOT)
        assert json.loads(result.stdout)[field] == (directory / identity_file).read_text().strip()
    assert not (profile / 'profile.sig').exists(), 'Candidate unexpectedly contains a real approval file'
    assert not (registry / 'public-keys.sig').exists(), 'Administrative signature must be reviewed separately'
    candidate = json.loads((registry / 'public-keys.json').read_text())
    assert candidate['keys'] == [] and candidate['threshold'] >= 2
    result = subprocess.run([str(binary), 'verify-files', str(profile / 'profile.json'),
                             str(profile / 'profile.sig.example.json'), str(registry / 'public-keys.json'),
                             (registry / 'REGISTRY-DIGEST.txt').read_text().strip()],
                            cwd=ROOT, capture_output=True, text=True)
    assert result.returncode != 0, 'Unsigned/unprovisioned candidate was accepted'
    print('PASS candidate identities match; empty registry and unsigned approvals are rejected; no active profile.')


if __name__ == '__main__':
    main()
