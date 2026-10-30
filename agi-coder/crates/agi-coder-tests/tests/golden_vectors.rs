use agi_coder_core::ContentHash;
use agi_coder_wormgraph::*;
#[test]
fn static_independent_vectors_and_tamper_rejections() {
    let data: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/golden/mmr_vectors.json")).unwrap();
    for vector in data["vectors"].as_array().unwrap() {
        let values: Vec<ContentHash> = serde_json::from_value(vector["values"].clone()).unwrap();
        let root: ContentHash = serde_json::from_value(vector["root"].clone()).unwrap();
        let proofs: Vec<InclusionProof> = serde_json::from_value(vector["proofs"].clone()).unwrap();
        let mut graph = WormGraph::default();
        for h in &values {
            graph.append(*h);
        }
        assert_eq!(graph.root(), root);
        for (i, proof) in proofs.iter().enumerate() {
            assert!(verify_inclusion(values[i], proof, root));
            assert!(verify_inclusion(
                values[i],
                &graph.prove(i as u64).unwrap(),
                root
            ));
            assert!(!verify_inclusion(ContentHash::ZERO, proof, root));
            let mut bad = proof.clone();
            bad.leaf_count += 1;
            assert!(!verify_inclusion(values[i], &bad, root));
            let mut bad = proof.clone();
            bad.peaks[0] = ContentHash::ZERO;
            assert!(!verify_inclusion(values[i], &bad, root));
            let mut bad = proof.clone();
            bad.siblings.push(ContentHash::ZERO);
            assert!(!verify_inclusion(values[i], &bad, root));
            assert!(!verify_inclusion(values[i], proof, ContentHash::ZERO));
        }
        assert!(graph.prove(values.len() as u64).is_none());
    }
}
