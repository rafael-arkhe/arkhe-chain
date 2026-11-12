use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InclusionProof {
    pub leaf_index: u64,
    pub leaf_count: u64,
    pub siblings: Vec<ContentHash>,
    pub peaks: Vec<ContentHash>,
}
#[derive(Default, Debug)]
pub struct WormGraph {
    leaves: Vec<ContentHash>,
}
fn leaf(h: ContentHash) -> ContentHash {
    ContentHash::domain("AGI/MMR/LEAF/v1", &[h.as_bytes()])
}
fn node(a: ContentHash, b: ContentHash) -> ContentHash {
    ContentHash::domain("AGI/MMR/NODE/v1", &[a.as_bytes(), b.as_bytes()])
}
fn ranges(count: u64) -> Vec<(u64, u64)> {
    let mut result = Vec::new();
    let mut start = 0;
    for bit in (0..64).rev() {
        let n = 1u64 << bit;
        if count & n != 0 {
            result.push((start, n));
            start += n;
        }
    }
    result
}
fn root(count: u64, peaks: &[ContentHash]) -> ContentHash {
    let mut bag = None;
    for p in peaks.iter().rev() {
        bag = Some(match bag {
            None => ContentHash::domain("AGI/MMR/BAG/v1", &[&[0], p.as_bytes()]),
            Some(acc) => ContentHash::domain(
                "AGI/MMR/BAG/v1",
                &[&[1], p.as_bytes(), ContentHash::as_bytes(&acc)],
            ),
        });
    }
    let bag = bag.unwrap_or_else(|| ContentHash::domain("AGI/MMR/EMPTY/v1", &[]));
    ContentHash::domain("AGI/MMR/ROOT/v1", &[&count.to_be_bytes(), bag.as_bytes()])
}
fn tree(hashes: &[ContentHash]) -> ContentHash {
    if hashes.len() == 1 {
        return leaf(hashes[0]);
    }
    let mid = hashes.len() / 2;
    node(tree(&hashes[..mid]), tree(&hashes[mid..]))
}
impl WormGraph {
    pub fn append(&mut self, h: ContentHash) -> u64 {
        let i = self.leaves.len() as u64;
        self.leaves.push(h);
        i
    }
    pub fn len(&self) -> usize {
        self.leaves.len()
    }
    pub fn is_empty(&self) -> bool {
        self.leaves.is_empty()
    }
    fn peaks(&self) -> Vec<ContentHash> {
        ranges(self.leaves.len() as u64)
            .iter()
            .map(|&(s, n)| tree(&self.leaves[s as usize..(s + n) as usize]))
            .collect()
    }
    pub fn root(&self) -> ContentHash {
        root(self.leaves.len() as u64, &self.peaks())
    }
    pub fn prove(&self, index: u64) -> Option<InclusionProof> {
        let count = self.leaves.len() as u64;
        if index >= count {
            return None;
        }
        let (start, size) = ranges(count)
            .into_iter()
            .find(|&(s, n)| index >= s && index - s < n)?;
        let mut layer: Vec<_> = self.leaves[start as usize..(start + size) as usize]
            .iter()
            .copied()
            .map(leaf)
            .collect();
        let mut at = (index - start) as usize;
        let mut siblings = Vec::new();
        while layer.len() > 1 {
            siblings.push(layer[at ^ 1]);
            layer = layer.chunks_exact(2).map(|p| node(p[0], p[1])).collect();
            at /= 2;
        }
        Some(InclusionProof {
            leaf_index: index,
            leaf_count: count,
            siblings,
            peaks: self.peaks(),
        })
    }
}
pub fn verify_inclusion(
    value: ContentHash,
    proof: &InclusionProof,
    expected_root: ContentHash,
) -> bool {
    if proof.leaf_count == 0 || proof.leaf_index >= proof.leaf_count {
        return false;
    }
    let ranges = ranges(proof.leaf_count);
    if proof.peaks.len() != ranges.len() {
        return false;
    }
    let Some((peak, &(start, size))) = ranges
        .iter()
        .enumerate()
        .find(|(_, (s, n))| proof.leaf_index >= *s && proof.leaf_index - s < *n)
    else {
        return false;
    };
    if proof.siblings.len() != size.trailing_zeros() as usize {
        return false;
    }
    let mut at = proof.leaf_index - start;
    let mut h = leaf(value);
    for sibling in &proof.siblings {
        h = if at & 1 == 0 {
            node(h, *sibling)
        } else {
            node(*sibling, h)
        };
        at >>= 1;
    }
    h == proof.peaks[peak] && root(proof.leaf_count, &proof.peaks) == expected_root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_appends_bind_position_and_the_previous_leaf() {
        let first = ContentHash::hash(b"first-leaf");
        let second = ContentHash::hash(b"second-leaf");
        let mut chain = WormGraph::default();
        assert_eq!(chain.append(first), 0);
        let after_first = chain.root();
        assert_eq!(chain.append(second), 1);
        let chained = chain.root();

        assert_ne!(chained, after_first);
        assert_ne!(chained, second);
        assert_ne!(chained, ContentHash::hash(second.as_bytes()));

        let mut only_last = WormGraph::default();
        assert_eq!(only_last.append(second), 0);
        assert_ne!(chained, only_last.root());

        let mut reversed = WormGraph::default();
        reversed.append(second);
        reversed.append(first);
        assert_eq!(reversed.len(), chain.len());
        assert_ne!(chained, reversed.root());

        let mut other_previous = WormGraph::default();
        other_previous.append(ContentHash::hash(b"other-previous-leaf"));
        other_previous.append(second);
        assert_eq!(other_previous.len(), 2);
        assert_ne!(chained, other_previous.root());
    }
}
