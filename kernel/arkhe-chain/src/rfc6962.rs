//! Minimal RFC 6962 Merkle inclusion checks (Rekor-compatible).
use sha2::{Digest, Sha256};

const LEAF_PREFIX: u8 = 0x00;
const NODE_PREFIX: u8 = 0x01;

pub fn hash_leaf(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([LEAF_PREFIX]);
    hasher.update(data);
    hasher.finalize().into()
}

fn hash_children(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([NODE_PREFIX]);
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}

fn expected_inclusion_proof_length(leaf_index: u64, tree_size: u64) -> usize {
    if tree_size <= 1 {
        return 0;
    }
    let mut count = 0;
    let mut index = leaf_index;
    let mut size = tree_size;
    while size > 1 {
        if !(size % 2 == 1 && index == size - 1) {
            count += 1;
        }
        index /= 2;
        size = size.div_ceil(2);
    }
    count
}

pub fn verify_inclusion_proof(
    leaf_hash: &[u8; 32],
    leaf_index: u64,
    tree_size: u64,
    proof_hashes: &[[u8; 32]],
    expected_root: &[u8; 32],
) -> bool {
    if tree_size == 0 || leaf_index >= tree_size {
        return false;
    }
    if proof_hashes.len() != expected_inclusion_proof_length(leaf_index, tree_size) {
        return false;
    }
    let mut hash = *leaf_hash;
    let mut index = leaf_index;
    let mut last_node = tree_size - 1;
    for proof_hash in proof_hashes {
        if index % 2 == 1 || index == last_node {
            hash = hash_children(proof_hash, &hash);
        } else {
            hash = hash_children(&hash, proof_hash);
        }
        index /= 2;
        last_node /= 2;
    }
    hash == *expected_root
}
