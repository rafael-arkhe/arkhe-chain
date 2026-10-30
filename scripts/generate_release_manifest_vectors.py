"""Independent Python reference for ReleaseManifest v1 (AKG:RELEASE:v1). Stdlib only.

Artifact digests of the E02 vector were computed from the frozen Git commit
18ec972d... (`git show <commit>:<path>`), not from the Hashtree transport.
"""
import copy
import json
import sys
from pathlib import Path
from blake3_reference import b3
from generate_work_vectors import cbor, head

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'tests/release_manifest_vectors.json'
DOMAIN = b'AKG:RELEASE:v1\0'
DIGEST_FIELDS = {'prev_release_digest', 'canonical_refs_digest', 'root_hash', 'decrypt_key',
                 'blake3', 'sha256', 'gate_decision_digest', 'constitution_digest',
                 'flake_lock_digest', 'policy_digest'}


def h(text):
    return list(bytes.fromhex(text))


def projection(value, key=None):
    if value is None:
        return None
    if key in DIGEST_FIELDS:
        return bytes(value)
    if isinstance(value, dict):
        return {k: projection(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [projection(v) for v in value]
    return value


E02 = dict(
    version=1,
    release_id='arkhe-e02@1-transport.1',
    prev_release_digest=None,
    git=dict(commit_oid='18ec972dd62f7cc76dfcae6588823f7cd4ecb815', tag='arkhe-e02@1-transport.1'),
    radicle=None,
    hashtree=dict(root_hash=h('ce3b3bb912c5127aadd0a12ff4ef6b8a7701394192ca60628bf71bba33132aac'),
                  decrypt_key=h('b87d23e6e29c50e3dc3c6c930fc80e7822428ba2992e6ee8c4481c4e760cc4f1')),
    artifacts=[
        dict(path='README.md', size=2301,
             blake3=h('e846283b3c0e2f8b8c74941968932ffd4886bc71496b58af756bd1e005d910ce'),
             sha256=h('8d518a1b9b4734f20e080e0b4f32d3aa77cf3422724e99df032be4e558fd826c')),
        dict(path='specs/e02/manifest.json', size=18523,
             blake3=h('8ab96ad1099d4fcdf10fb5cae5b42fddafe100d17507f56e0a06d34db6107165'),
             sha256=h('fc51ec1c3fd7f1f985ae71cc0387e0c579dcd3aeb1d817c299dd6b48f066d09e')),
        dict(path='verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm_bg.wasm', size=345983,
             blake3=h('ffa19c89028957affd34fe7af80f68611a4ddda8de0421d95e8be01a76dd78ee'),
             sha256=h('f8bc9c11844f359ea8fba288d83e911bbf61d6197bb231db70c2e1bed893d343')),
    ],
    sdd=None,
    build=None,
    # Synthetic: E02 predates release policy. BLAKE3 of the ASCII label below.
    policy_digest=list(b3(b'arkhe-release-policy:e02-retroactive:v1')),
)

FULL = dict(
    version=1,
    release_id='arkhe-synthetic@2.0.0',
    prev_release_digest=[1] * 32,
    git=dict(commit_oid='ab' * 32, tag=None),
    radicle=dict(rid='rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5', canonical_refs_digest=[2] * 32),
    hashtree=dict(root_hash=[3] * 32, decrypt_key=None),
    artifacts=[dict(path='a', size=0, blake3=list(range(32)), sha256=[4] * 32),
               dict(path='b/c.bin', size=2**64 - 1, blake3=[5] * 32, sha256=list(range(255, 223, -1)))],
    sdd=dict(gate_decision_digest=[6] * 32, constitution_digest=[7] * 32),
    build=dict(system='x86_64-linux', flake_lock_digest=[8] * 32),
    policy_digest=[9] * 32,
)


def encode(value):
    return cbor(projection(value))


def build():
    rows = []

    def accept(identity, value):
        encoded = encode(value)
        rows.append(dict(id=identity, component='ReleaseManifest', input=value,
                         domain_hex=DOMAIN.hex(), expected='ACCEPT',
                         expected_output=dict(canonical_cbor_hex=encoded.hex(),
                                              object_digest_hex=b3(DOMAIN + encoded).hex())))

    def reject_input(identity, value, reason):
        rows.append(dict(id=identity, component='ReleaseManifest', input=value,
                         domain_hex=DOMAIN.hex(), expected='REJECT', rejection_reason=reason))

    def reject_bytes(identity, data, reason, expected_digest=None):
        row = dict(id=identity, component='ReleaseManifestBytes', input_cbor_hex=data.hex(),
                   domain_hex=DOMAIN.hex(), expected='REJECT', rejection_reason=reason)
        if expected_digest is not None:
            row['expected_digest_hex'] = expected_digest.hex()
        rows.append(row)

    accept('Release-e02-retroactive', E02)
    accept('Release-all-fields', FULL)

    def mutate(base, path, value):
        out = copy.deepcopy(base)
        target = out
        for key in path[:-1]:
            target = target[key]
        if value is KeyError:
            del target[path[-1]]
        else:
            target[path[-1]] = value
        return out

    reject_input('Release-unknown-field', dict(E02, extra=True), 'unknown field')
    reject_input('Release-missing-nullable', mutate(E02, ['radicle'], KeyError), 'null is not absence')
    reject_input('Release-nested-unknown', mutate(E02, ['git', 'branch'], 'main'), 'unknown field')
    reject_input('Release-version-2', dict(E02, version=2), 'unsupported version')
    reject_input('Release-oid-uppercase', mutate(E02, ['git', 'commit_oid'], 'AB' * 20), 'oid case')
    reject_input('Release-oid-length', mutate(E02, ['git', 'commit_oid'], 'ab' * 21), 'oid length')
    reject_input('Release-empty-artifacts', dict(E02, artifacts=[]), 'artifact count')
    reject_input('Release-unsorted-artifacts', dict(E02, artifacts=E02['artifacts'][::-1]), 'order')
    reject_input('Release-duplicate-artifact', dict(E02, artifacts=[E02['artifacts'][0]] * 2), 'duplicate')
    reject_input('Release-path-dotdot', mutate(E02, ['artifacts', 0, 'path'], '../README.md'), 'path')
    reject_input('Release-path-absolute', mutate(E02, ['artifacts', 0, 'path'], '/README.md'), 'path')
    reject_input('Release-rid', dict(FULL, radicle=dict(FULL['radicle'], rid='rad:z0OIl')), 'rid alphabet')
    reject_input('Release-short-digest', dict(E02, policy_digest=[0] * 31), 'digest length')
    reject_input('Release-float', dict(E02, version=1.0), 'float forbidden')

    good = encode(E02)
    digest = b3(DOMAIN + good)
    # Non-canonical byte forms of an otherwise valid manifest.
    top = sorted((cbor(k), cbor(projection(v, k))) for k, v in E02.items())
    swapped = top[:]
    swapped[0], swapped[1] = swapped[1], swapped[0]
    reject_bytes('Bytes-unsorted-keys', head(5, len(swapped)) + b''.join(k + v for k, v in swapped), 'key order')
    long_version = [(k, b'\x18\x01' if k == cbor('version') else v) for k, v in top]
    reject_bytes('Bytes-non-shortest-uint', head(5, len(top)) + b''.join(k + v for k, v in long_version), 'shortest form')
    reject_bytes('Bytes-indefinite-map', b'\xbf' + b''.join(k + v for k, v in top) + b'\xff', 'indefinite length')
    reject_bytes('Bytes-trailing', good + b'\x00', 'trailing bytes')
    reject_bytes('Bytes-truncated', good[:-1], 'truncated')
    duplicate = head(5, len(top) + 1) + b''.join(k + v for k, v in top[:1] + top)
    reject_bytes('Bytes-duplicate-key', duplicate, 'duplicate key')
    flipped = bytearray(good)
    flipped[good.index(bytes.fromhex('8ab96ad1'))] ^= 0x01
    reject_bytes('Bytes-one-byte-flip', bytes(flipped), 'digest mismatch', digest)
    return dict(version='AKG-CBOR-v1', generated_by='independent Python stdlib CBOR + BLAKE3',
                object='ReleaseManifest v1', vectors=rows)


if __name__ == '__main__':
    data = (json.dumps(build(), ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if '--check' in sys.argv:
        if not PATH.exists() or PATH.read_bytes() != data:
            raise SystemExit('FAIL ReleaseManifest reference differs')
        print('PASS independent ReleaseManifest reference')
    else:
        PATH.write_bytes(data)
        print('Generated independent ReleaseManifest reference')
