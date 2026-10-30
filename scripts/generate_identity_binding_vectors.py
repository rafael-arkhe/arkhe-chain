"""Independent Python reference for AKG-IDBIND v1 digests and NIP-01 event ids.

Stdlib only. Signatures are out of scope here: Rust signs with fixed test keys
(`evidence/arkhe-wormgraph/examples/idbind-vectors.rs`) and the `nostr` crate in
`integration/arkhe-p2p` re-verifies the Nostr events independently.
"""
import hashlib
import json
import sys
from pathlib import Path
from blake3_reference import b3
from generate_work_vectors import cbor

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'tests/identity_binding_vectors.json'
DOMAIN = b'AKG:IDBIND:v1\0'
NOSTR_KIND = 30078


def binding_cbor(b):
    return cbor(dict(version=b['version'], arkhe_key=bytes(b['arkhe_key']),
                     external_kind=b['external_kind'], external_id=bytes(b['external_id']),
                     role=b['role'], scope=b['scope'], valid_from=b['valid_from'],
                     valid_until=b['valid_until']))


def event_id(pubkey_hex, created_at, tags, content):
    serial = json.dumps([0, pubkey_hex, created_at, NOSTR_KIND, tags, content],
                        separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(serial.encode('utf-8')).hexdigest()


def build(keys):
    rows = []
    for case in keys['cases']:
        b = case['binding']
        encoded = binding_cbor(b)
        digest = b3(DOMAIN + encoded)
        row = dict(id=case['id'], binding=b, canonical_cbor_hex=encoded.hex(),
                   binding_digest_hex=digest.hex())
        if b['external_kind'] == 'nostr-npub':
            tags = [['d', 'akg-idbind:' + digest.hex()]]
            content = case['nostr_content']
            row['nostr'] = dict(created_at=case['nostr_created_at'], tags=tags, content=content,
                                event_id_hex=event_id(bytes(b['external_id']).hex(),
                                                      case['nostr_created_at'], tags, content))
        rows.append(row)
    return dict(version='AKG-IDBIND-v1', generated_by='independent Python stdlib CBOR + BLAKE3 + SHA-256',
                note='Keys are deterministic TEST keys; not provisioned in any trust registry.',
                vectors=rows)


if __name__ == '__main__':
    # Public keys come from the Rust example's key listing so this script never
    # holds private material; the binding fields themselves are fixed here.
    keys = json.loads((ROOT / 'tests/identity_binding_inputs.json').read_text(encoding='utf-8'))
    data = (json.dumps(build(keys), ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if '--check' in sys.argv:
        if not PATH.exists() or PATH.read_bytes() != data:
            raise SystemExit('FAIL identity binding reference differs')
        print('PASS independent identity binding reference')
    else:
        PATH.write_bytes(data)
        print('Generated independent identity binding reference')
