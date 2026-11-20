//! Tree construction for AID histories: RFC 6962 hashing with the RFC 9162
//! split, as fixed by AID v1.0-rc5 §4.
//!
//! Two rules this module exists to pin down, because rc4 left them open:
//!
//! * The input is the canonical bytes of an event, and the leaf hash is applied
//!   once. Callers do not pre-hash their leaves.
//! * There is no rejection of `left == right`. The shape of the tree comes from
//!   the normative split, not from node values, so two consecutive identical
//!   events produce a legitimate tree. What is rejected is self-pairing an odd
//!   leaf: an odd leaf is promoted, never hashed against itself.

use crate::hash::sha256;

/// The root of an empty history: `SHA-256("")`.
pub fn empty_root() -> [u8; 32] {
    sha256(b"")
}

/// `SHA-256(0x00 || leaf_bytes)`, applied once to the event's canonical bytes.
pub fn leaf_hash(leaf_bytes: &[u8]) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(1 + leaf_bytes.len());
    preimage.push(0x00);
    preimage.extend_from_slice(leaf_bytes);
    sha256(&preimage)
}

/// `SHA-256(0x01 || left || right)`.
pub fn node_hash(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(65);
    preimage.push(0x01);
    preimage.extend_from_slice(left);
    preimage.extend_from_slice(right);
    sha256(&preimage)
}

/// The largest power of two strictly smaller than `n`. Defined for `n >= 2`;
/// smaller trees never split.
pub fn split_point(n: usize) -> usize {
    let mut k = 1;
    while k * 2 < n {
        k *= 2;
    }
    k
}

/// The root over the canonical bytes of `leaves`, in order.
pub fn tree_hash(leaves: &[Vec<u8>]) -> [u8; 32] {
    match leaves.len() {
        0 => empty_root(),
        1 => leaf_hash(&leaves[0]),
        n => {
            let k = split_point(n);
            node_hash(&tree_hash(&leaves[..k]), &tree_hash(&leaves[k..]))
        }
    }
}

/// The RFC 6962 §2.1.2 consistency proof that the tree over `leaves` extends
/// its own first `first` leaves. Empty for `first == 0` (every tree extends the
/// empty tree) and for `first == leaves.len()` (nothing was appended).
pub fn consistency_proof(leaves: &[Vec<u8>], first: usize) -> Result<Vec<[u8; 32]>, String> {
    let second = leaves.len();
    if first > second {
        return Err(format!("first {first} exceeds second {second}"));
    }
    if first == 0 || first == second {
        return Ok(Vec::new());
    }
    Ok(subproof(first, leaves, true))
}

/// `SUBPROOF(m, D[n], b)` of RFC 6962 §2.1.2. The sibling is appended after the
/// recursive part, which fixes the order the verifier consumes.
fn subproof(m: usize, d: &[Vec<u8>], b: bool) -> Vec<[u8; 32]> {
    let n = d.len();
    if m == n {
        return if b { Vec::new() } else { vec![tree_hash(d)] };
    }
    let k = split_point(n);
    if m <= k {
        let mut proof = subproof(m, &d[..k], b);
        proof.push(tree_hash(&d[k..]));
        proof
    } else {
        let mut proof = subproof(m - k, &d[k..], false);
        proof.push(tree_hash(&d[..k]));
        proof
    }
}

/// Verify that a tree of `second` leaves with root `second_root` extends a tree
/// of `first` leaves with root `first_root`.
///
/// The proof is folded along the same structural recursion as `subproof`, which
/// depends only on `(first, second)` — both public — and **both** roots are
/// rebuilt from it and compared. A proof with a step too many, a step too few,
/// or an altered step cannot rebuild them.
pub fn verify_consistency(
    first: usize,
    second: usize,
    first_root: &[u8; 32],
    second_root: &[u8; 32],
    proof: &[[u8; 32]],
) -> Result<(), String> {
    if first > second {
        return Err(format!("the history shrank from {first} to {second} leaves"));
    }
    if first == second {
        if first_root != second_root {
            return Err("two histories of the same size declare different roots".into());
        }
        return empty_proof(proof);
    }
    if first == 0 {
        // Every tree extends the empty tree, so the proof carries no steps.
        if first_root != &empty_root() {
            return Err("an empty history must declare the normative empty root".into());
        }
        return empty_proof(proof);
    }
    if proof.is_empty() {
        return Err("a consistency proof between different sizes cannot be empty".into());
    }

    let mut steps = proof.iter();
    let (rebuilt_first, rebuilt_second) = fold(first, second, true, first_root, &mut steps)?;
    if &rebuilt_first != first_root {
        return Err("the proof does not rebuild the declared first root".into());
    }
    if &rebuilt_second != second_root {
        return Err("the proof does not rebuild the declared second root".into());
    }
    if steps.next().is_some() {
        return Err("the proof carries steps beyond its declared length".into());
    }
    Ok(())
}

fn empty_proof(proof: &[[u8; 32]]) -> Result<(), String> {
    if proof.is_empty() {
        Ok(())
    } else {
        Err("this consistency case admits no proof steps".into())
    }
}

/// Rebuild, for the subtree of `n` leaves, the root of its first `m` leaves and
/// its own root. `on_first_path` marks the subtrees that are exactly the first
/// tree, whose root the caller declared instead of proving.
fn fold(
    m: usize,
    n: usize,
    on_first_path: bool,
    first_root: &[u8; 32],
    steps: &mut std::slice::Iter<'_, [u8; 32]>,
) -> Result<([u8; 32], [u8; 32]), String> {
    if m == n {
        let root = if on_first_path {
            *first_root
        } else {
            *steps
                .next()
                .ok_or_else(|| "the proof ends before a complete subtree".to_owned())?
        };
        return Ok((root, root));
    }
    let k = split_point(n);
    if m <= k {
        let (first, left) = fold(m, k, on_first_path, first_root, steps)?;
        let right = steps
            .next()
            .ok_or_else(|| "the proof ends before a right sibling".to_owned())?;
        Ok((first, node_hash(&left, right)))
    } else {
        let (first_right, right) = fold(m - k, n - k, false, first_root, steps)?;
        let left = steps
            .next()
            .ok_or_else(|| "the proof ends before a left sibling".to_owned())?;
        Ok((node_hash(left, &first_right), node_hash(left, &right)))
    }
}
