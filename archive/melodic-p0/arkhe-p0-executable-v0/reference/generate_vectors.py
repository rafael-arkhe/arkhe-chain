#!/usr/bin/env python3
import json, hashlib
from pathlib import Path
from canonical_ref import canonical_digest_sha256, envelope_sha256_only

out = Path(__file__).resolve().parents[1] / 'vectors' / 'p0-v0.json'

v1 = canonical_digest_sha256(b'abc')
v2 = envelope_sha256_only(
    'artifact:vector:1',
    b'payload',
    [(3, b'parent-b'), (1, b'parent-a')],
    'policy:p0:v0'
)
v2_reordered = envelope_sha256_only(
    'artifact:vector:1',
    b'payload',
    [(1, b'parent-a'), (3, b'parent-b')],
    'policy:p0:v0'
)
assert v2 == v2_reordered

vectors = {
    'profile': 'arkhe-cbor-v0',
    'domain_hex': b'ARKHE-P0-CBOR-V0\0'.hex(),
    'vectors': [
        {
            'id': 'digest-sha256-abc',
            'semantic': {'type': 'Digest', 'algorithm': 'sha-256', 'input_utf8': 'abc'},
            'canonical_hex': v1.hex(),
            'canonical_sha256': hashlib.sha256(v1).hexdigest(),
        },
        {
            'id': 'envelope-sha256-parent-set',
            'semantic': {
                'type': 'ArtifactEnvelope',
                'artifact_id': 'artifact:vector:1',
                'payload_utf8': 'payload',
                'parents': [
                    {'relation': 'Used', 'payload_utf8': 'parent-b'},
                    {'relation': 'DerivedFrom', 'payload_utf8': 'parent-a'},
                ],
                'authentication': None,
                'anchor': None,
                'policy_ref': 'policy:p0:v0',
            },
            'canonical_hex': v2.hex(),
            'canonical_sha256': hashlib.sha256(v2).hexdigest(),
            'property': 'reversing parent input order yields identical canonical bytes',
        },
    ],
}
out.write_text(json.dumps(vectors, indent=2) + '\n', encoding='utf-8')
print(out)
