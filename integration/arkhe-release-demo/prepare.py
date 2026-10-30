"""Prepare a signed source-release package. Private keys/trust stay outside it."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import zipfile
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

PROFILE = 'arkhe-release-lab@1'
ATTESTATION_DOMAIN = b'ARKHE:RELEASE:ATTESTATION:v1\0'
APPROVAL_DOMAIN = b'ARKHE:RELEASE:LOCAL-APPROVAL:v1\0'


def write_json(path, value):
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n', encoding='utf-8')


def signed(value, key, domain):
    payload = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return {'payload': payload, 'signature': key.sign(domain + payload.encode()).hex()}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--verifier', type=Path, required=True)
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    private = args.out / 'private'
    private.mkdir()
    keys = {}
    for name in ['attestor', 'approver']:
        key = Ed25519PrivateKey.generate()
        keys[name] = key
        # Generated laboratory keys only. Never put this directory in the package.
        (private / (name + '.pem')).write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    metadata = json.loads((args.source / 'source-observation.json').read_text())
    state = metadata['raw_state']
    revisions = [(k, v) for k, v in state['revisions'].items() if v['oid'] == metadata['commit']]
    assert len(revisions) == 1, 'expected one exact reviewed revision'
    revision, data = revisions[0]
    reviewer = metadata['reviewer'].removeprefix('did:key:')
    review = data['reviews'][reviewer]
    assert review['verdict'] == 'accept'
    assert review['author']['id'] == metadata['reviewer']
    assert data['author']['id'] != metadata['reviewer'], 'review identity must differ from author'
    source = {k: metadata[k] for k in ['repository', 'patch', 'commit', 'reviewer', 'review_evidence_sha256']}
    source['revision'] = revision
    artifact = (args.source / 'artifact.tar').read_bytes()
    sha = hashlib.sha256(artifact).hexdigest()
    b3 = subprocess.check_output([str(args.verifier), 'blake3', artifact.hex()], text=True).strip()
    trust = {'profile': PROFILE, 'tenant': 'arkhe-release-local-vm', 'product': 'arkhe-release-specimen',
             'source': source, 'builder': 'arkhe-git-archive-lab-v1',
             'attestor_key': keys['attestor'].public_key().public_bytes_raw().hex(),
             'approver_key': keys['approver'].public_key().public_bytes_raw().hex(),
             'minimum_sequence': 1, 'maximum_artifact_bytes': 1048576, 'maximum_approval_seconds': 3600}
    write_json(args.out / 'trust.json', trust)
    pd = subprocess.check_output([str(args.verifier), 'release-policy-digest', str(args.out / 'trust.json')], text=True).strip()
    now = int(time.time())
    for sequence in [1, 2]:
        statement = {'profile': PROFILE, 'product': trust['product'], 'sequence': sequence,
                     'artifact_sha256': sha, 'artifact_blake3': b3, 'artifact_size': len(artifact),
                     'source': source, 'review_verdict': 'accept', 'builder': trust['builder']}
        attestation = signed(statement, keys['attestor'], ATTESTATION_DOMAIN)
        approval = {'profile': PROFILE, 'tenant': trust['tenant'], 'policy_sha256': pd,
                    'statement_sha256': hashlib.sha256(attestation['payload'].encode()).hexdigest(),
                    'issued_at': now, 'expires_at': now + 3600, 'decision': 'admit'}
        write_json(args.out / f'attestation-v{sequence}.json', attestation)
        write_json(args.out / f'approval-v{sequence}.json', signed(approval, keys['approver'], APPROVAL_DOMAIN))
        write_json(args.out / f'expired-v{sequence}.json', signed(dict(approval, issued_at=now-200, expires_at=now-1), keys['approver'], APPROVAL_DOMAIN))
        with zipfile.ZipFile(args.out / f'package-v{sequence}.zip', 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('attestation.json', json.dumps(attestation, sort_keys=True))
            for name in ['artifact.tar', 'source.bundle', 'radicle-review.json']:
                z.write(args.source / name, name)
            z.writestr('README.txt', 'Arkhe synthetic source release. Signed lab Radicle review, not human approval. Local trust and local approval must arrive separately. Admission never executes this source.\n')
    write_json(args.out / 'preparation.json', {'source': source, 'artifact_sha256': sha, 'artifact_blake3': b3,
               'policy_sha256': pd, 'sequences': [1, 2], 'key_scope': 'generated laboratory only',
               'approval_scope': 'automated lab authorization, not human review', 'created_at': now})
    print(json.dumps({'out': str(args.out), 'source': source, 'artifact_sha256': sha}, indent=2))


if __name__ == '__main__':
    main()
