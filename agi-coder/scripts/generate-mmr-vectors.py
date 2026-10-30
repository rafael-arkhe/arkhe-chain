"""Independent Python reference. Run manually; CI must consume committed vectors.

Requires blake3==1.0.8 (or a compatible implementation of BLAKE3).
The hash primitive is shared by algorithm, but this tree/proof code is independent.
"""
import json
from pathlib import Path
import blake3

ROOT = Path(__file__).resolve().parents[1]
def domain(name, *parts):
    label = name.encode()
    data = len(label).to_bytes(8, 'big') + label
    data += b''.join(len(p).to_bytes(8, 'big') + p for p in parts)
    return blake3.blake3(data).digest()

def parent(a, b): return domain('AGI/MMR/NODE/v1', a, b)
def leaf(v): return domain('AGI/MMR/LEAF/v1', v)
def reference(values):
    forest = []
    for value in values:
        forest.append((1, leaf(value)))
        while len(forest) >= 2 and forest[-1][0] == forest[-2][0]:
            size, right = forest.pop()
            _, left = forest.pop()
            forest.append((size * 2, parent(left, right)))
    peaks = [h for _, h in forest]
    acc = None
    for peak in reversed(peaks):
        acc = domain('AGI/MMR/BAG/v1', b'\x00', peak) if acc is None else domain('AGI/MMR/BAG/v1', b'\x01', peak, acc)
    if acc is None: acc = domain('AGI/MMR/EMPTY/v1')
    root = domain('AGI/MMR/ROOT/v1', len(values).to_bytes(8, 'big'), acc)
    proofs = []
    for index in range(len(values)):
        start = 0
        for size, _ in forest:
            if start <= index < start + size: break
            start += size
        layer = [leaf(v) for v in values[start:start+size]]
        at, siblings = index - start, []
        while len(layer) > 1:
            siblings.append(layer[at ^ 1].hex())
            layer = [parent(layer[i], layer[i+1]) for i in range(0,len(layer),2)]
            at //= 2
        proofs.append(dict(leaf_index=index, leaf_count=len(values), siblings=siblings, peaks=[p.hex() for p in peaks]))
    return dict(count=len(values), values=[v.hex() for v in values], root=root.hex(), proofs=proofs)

if __name__ == '__main__':
    vectors = [reference([blake3.blake3(f'record-{i}'.encode()).digest() for i in range(n)]) for n in [0,1,2,3,4,5,7,8,11,16,31]]
    destination = ROOT / 'tests/golden/mmr_vectors.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(dict(profile='AGI/MMR/v1', producer='independent Python reference', vectors=vectors), indent=2)+'\n')
