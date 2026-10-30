"""Generate PUBLIC TEST KEY fixtures using the pinned upstream Python verifier.

No private operational keys or network access. Run from D:/arkhe with:
python scripts/gravit_signature_fixtures.py --verifier ops/local/gravit-review-20261024/verifier
"""
import argparse
import base64
import hashlib
import json
import subprocess
import sys
from dataclasses import asdict, replace
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--verifier', type=Path, required=True)
args = parser.parse_args()
source = args.verifier.resolve()
commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
assert commit == '7887252fc84def69a794d2e32ce65721eb9a25d9', commit
sys.path.insert(0, str(source))
from gravit_verifier.registry import TrustRoot, VerifierRegistry, signing_message, key_id_for
from gravit_verifier.kernel import VerifierKernel, VerificationRequest, EvidenceRecord, EpistemicState
from gravit_verifier.loader import load_bindings_from_dir
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

out = Path('kernel/arkhe-kernel/tests/fixtures/gravit/signatures')
out.mkdir(parents=True, exist_ok=True)
golden = source / 'tests/golden'
for name in ['trust_root.json', 'registry.json', 'registry.json.sig']:
    (out / name).write_bytes((golden / name).read_bytes())
root = TrustRoot.from_file(golden / 'trust_root.json')
registry = VerifierRegistry.from_file(golden / 'registry.json', root)
kernel = VerifierKernel(registry)
for binding in load_bindings_from_dir(source / 'bindings'):
    kernel.load_binding(binding)

artifact = b'Arkhe external assessment contract test artifact\n'
artifact_id = 'arkhe-review-contract-probe'
cases = []
for name, names in [('valid', ['v1', 'v2']), ('revoked', ['vR', 'v2']), ('unknown', ['not-in-registry', 'v2'])]:
    evidence = []
    preimages = []
    for i, key_name in enumerate(names):
        key = Ed25519PrivateKey.from_private_bytes(hashlib.sha256(b'gravit-test-key:' + key_name.encode()).digest())
        kid = key_id_for(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw))
        record = EvidenceRecord(record_id=f'r{i+1}', theta=[0.88, 0.85][i], result=True,
                                verifier_id=f'v{i+1}', timestamp='2026-09-06T12:00:00Z',
                                provenance=['A', 'B'][i], integrity_hash=hashlib.sha3_256(artifact).hexdigest(),
                                key_id=kid, signature='')
        message = signing_message(artifact_id, record)
        record.signature = base64.b64encode(key.sign(message)).decode('ascii')
        evidence.append(record)
        preimages.append(base64.b64encode(message).decode('ascii'))
    request = VerificationRequest(artifact_id, EpistemicState.VERIFIED_FACT, evidence, {'high_impact': True})
    decision_object = kernel.verify(request)
    decision = decision_object.to_dict()
    cases.append({'name': name, 'request': asdict(request), 'preimages_base64': preimages, 'decision': decision})
    if name == 'valid':
        assert decision['status'] == 'SUCCESS' and decision['final_epistemic_state'] == 'Verified Fact'
        (out / 'signed-request.json').write_bytes(json.dumps(asdict(request), sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())
        (out / 'reference-decision.json').write_bytes(json.dumps(decision, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())
        # Publicly recomputable decision_id is NOT authentication. Forge a reason
        # and recompute a structurally consistent ID via upstream's own code.
        tampered = replace(decision_object, reason='forged unsigned conclusion', decision_id='').to_dict()
        assert tampered['decision_id'] != decision['decision_id']
        (out / 'tampered-decision.json').write_bytes(json.dumps(tampered, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())
(out / 'cases.json').write_bytes(json.dumps(cases, sort_keys=True, indent=2, ensure_ascii=False).encode() + b'\n')
manifest = {'verifier_commit': commit, 'scope': 'Public test keys; Python reference outputs, not independently trusted decisions',
            'root_sha256': root.digest, 'registry_sha256': registry.digest,
            'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.name != 'manifest.json' and p.is_file()}}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': 'PASS', 'cases': len(cases), 'root_sha256': root.digest, 'registry_sha256': registry.digest}))
