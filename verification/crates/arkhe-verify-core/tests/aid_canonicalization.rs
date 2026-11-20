//! The parse and tree rules the AID payload depends on. These are the rules
//! that decide whether two independent implementations compute the same `aid`
//! at all, so they are tested apart from any vector.

use arkhe_verify_core::aid::jcs::{Strict, MAX_SAFE_INT};
use arkhe_verify_core::aid::merkle::{empty_root, leaf_hash, node_hash, split_point, tree_hash};
use arkhe_verify_core::hash::sha256;

#[test]
fn duplicate_object_members_are_rejected_at_parse() {
    let error = Strict::parse(br#"{"agent_id":"a","agent_id":"b"}"#)
        .expect_err("a duplicate member must not be resolved by last-wins");
    assert!(error.contains("duplicate object member"), "{error}");
}

#[test]
fn floats_are_rejected_at_parse() {
    assert!(Strict::parse(br#"{"event_count":1.0}"#).is_err());
}

#[test]
fn the_safe_integer_range_is_the_parse_boundary() {
    assert!(Strict::parse(br#"{"event_count":9007199254740991}"#).is_ok());
    assert!(Strict::parse(br#"{"event_count":-9007199254740991}"#).is_ok());
    assert!(Strict::parse(br#"{"event_count":9007199254740992}"#).is_err());
    assert!(Strict::parse(br#"{"event_count":-9007199254740992}"#).is_err());
    assert_eq!(MAX_SAFE_INT, 9_007_199_254_740_991);
}

#[test]
fn members_are_ordered_by_utf16_code_units_not_utf8_bytes() {
    // U+FF61 encodes as EF BD A1 in UTF-8 and 0xFF61 in UTF-16; U+10000
    // encodes as F0 90 80 80 in UTF-8 and the surrogate pair D800 DC00 in
    // UTF-16. Byte order puts U+FF61 first, code-unit order puts U+10000 first.
    let canonical = Strict::parse("{\"\u{ff61}\":1,\"\u{10000}\":2}".as_bytes())
        .unwrap()
        .canonical_bytes();
    assert_eq!(
        String::from_utf8(canonical).unwrap(),
        "{\"\u{10000}\":2,\"\u{ff61}\":1}"
    );
}

#[test]
fn canonicalization_drops_whitespace_and_keeps_literal_utf8() {
    let input = "{ \"b\" : [ 1, 2 ] , \"a\" : \"é\" , \"c\" : { \"y\" : null , \"x\" : true } }";
    let canonical = Strict::parse(input.as_bytes()).unwrap().canonical_bytes();
    assert_eq!(
        String::from_utf8(canonical).unwrap(),
        "{\"a\":\"é\",\"b\":[1,2],\"c\":{\"x\":true,\"y\":null}}"
    );
}

#[test]
fn the_empty_root_is_sha256_of_the_empty_string() {
    assert_eq!(empty_root(), sha256(b""));
    assert_eq!(
        hex::encode(empty_root()),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn the_split_point_is_the_largest_power_of_two_strictly_below_n() {
    assert_eq!(split_point(2), 1);
    assert_eq!(split_point(3), 2);
    assert_eq!(split_point(4), 2);
    assert_eq!(split_point(5), 4);
    assert_eq!(split_point(9), 8);
}

#[test]
fn a_three_leaf_tree_promotes_the_odd_leaf_without_self_pairing() {
    let leaves = vec![b"a".to_vec(), b"b".to_vec(), b"c".to_vec()];
    let expected = node_hash(
        &node_hash(&leaf_hash(b"a"), &leaf_hash(b"b")),
        &leaf_hash(b"c"),
    );
    assert_eq!(tree_hash(&leaves), expected);
    // The rejected shape: the odd leaf hashed against itself.
    let self_paired = node_hash(
        &node_hash(&leaf_hash(b"a"), &leaf_hash(b"b")),
        &node_hash(&leaf_hash(b"c"), &leaf_hash(b"c")),
    );
    assert_ne!(tree_hash(&leaves), self_paired);
}

#[test]
fn the_three_and_five_leaf_roots_are_the_frozen_hex() {
    // V13a and V13b. These two hex values were computed by a second,
    // independent implementation of the same RFC 6962 rules; they are here so
    // that a change to this tree's construction cannot pass unnoticed.
    let leaves = |n: usize| -> Vec<Vec<u8>> {
        [b"a", b"b", b"c", b"d", b"e"][..n]
            .iter()
            .map(|leaf| leaf.to_vec())
            .collect()
    };
    assert_eq!(
        hex::encode(tree_hash(&leaves(3))),
        "36642e73c2540ab121e3a6bf9545b0a24982cd830eb13d3cd19de3ce6c021ec1"
    );
    assert_eq!(
        hex::encode(tree_hash(&leaves(5))),
        "fe14a5426fbd70c0fa73f52342afed0da0bd23c4838662ccf6b88a3070ead97b"
    );
}

#[test]
fn two_identical_leaves_produce_a_legitimate_root() {
    // rc4 rejected `left == right` generically. That rejection refused a valid
    // tree: two consecutive identical events hash to identical leaves.
    let leaf = leaf_hash(b"same bytes");
    assert_eq!(
        tree_hash(&[b"same bytes".to_vec(), b"same bytes".to_vec()]),
        node_hash(&leaf, &leaf)
    );
}
