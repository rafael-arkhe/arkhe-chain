mod common;

use arkhe_chain::{
    encode_block, public_key, sign_attestation, sign_proposer, Account, ArkheNode, AttestOp, Attestation,
    Block, ChainError, Claim, Grant, Role, ATTEST_AUDIENCE, ATTEST_SCHEME_ED25519, ATTEST_VERSION, CHAIN_ID,
    GENESIS_ACCOUNT,
};
use arkhe_verify_core::rbb::mmr;

const TS: u64 = 1_700_000_000;
const ARTIFACT: [u8; 32] = [0xA1; 32];
const ACTION: [u8; 32] = [0xAC; 32];
const ROLES: [(&str, u8, Role); 5] = [
    ("requester", 0x82, Role::Requester),
    ("author", 0x83, Role::Author),
    ("evaluator", 0x84, Role::Evaluator),
    ("approver", 0x85, Role::Approver),
    ("executor", 0x86, Role::Executor),
];

fn secret(name: &str) -> [u8; 32] {
    match name {
        "root" => [0x81; 32],
        other => [ROLES.iter().find(|(id, ..)| *id == other).unwrap().1; 32],
    }
}

fn accounts() -> Vec<Account> {
    let mut accounts = common::accounts();
    for name in ["root", "requester", "author", "evaluator", "approver", "executor"] {
        accounts.push(Account {
            id: name.to_string(),
            public_key: public_key(&secret(name)).unwrap(),
            mldsa_public_key: None,
        });
    }
    accounts
}

fn grants() -> Vec<Grant> {
    ROLES
        .iter()
        .map(|(delegate, _, role)| Grant {
            delegate: delegate.to_string(),
            role: *role,
            grantor: "root".to_string(),
            expires: 1_000,
        })
        .collect()
}

fn node_a() -> ArkheNode {
    ArkheNode::new_with_grants("validator-a", &common::SECRET_A, common::validators(), accounts(), grants()).unwrap()
}

fn node_b() -> ArkheNode {
    ArkheNode::new_with_grants("validator-b", &common::SECRET_B, common::validators(), accounts(), grants()).unwrap()
}

fn signed(genesis: [u8; 32], signer: &str, nonce: u8, claim: Claim) -> Attestation {
    let mut att = Attestation {
        version: ATTEST_VERSION,
        scheme: ATTEST_SCHEME_ED25519,
        chain_id: CHAIN_ID.to_string(),
        genesis,
        audience: ATTEST_AUDIENCE.to_string(),
        signer: signer.to_string(),
        nonce: [nonce; 32],
        not_before: 0,
        expires: 50,
        claim,
        signature: [0; 64],
    };
    sign_attestation(&mut att, &secret(signer)).unwrap();
    att
}

/// Queue request, proposal, evaluation and approval. Returns the approval id.
fn queue_flow(node: &ArkheNode) -> [u8; 32] {
    let genesis = node.genesis_hash();
    let request = node
        .submit_attestation(signed(genesis, "requester", 1, Claim::Request { task: [7; 32], budget: 5 }))
        .unwrap();
    let proposal = node
        .submit_attestation(signed(genesis, "author", 1, Claim::Artifact { request, artifact: ARTIFACT }))
        .unwrap();
    let evaluation = node
        .submit_attestation(signed(
            genesis,
            "evaluator",
            1,
            Claim::Evaluation {
                artifact: ARTIFACT,
                suite: [1; 32],
                environment: [2; 32],
                evidence: [3; 32],
                passed: true,
            },
        ))
        .unwrap();
    let policy = node.attest_policy_digest().unwrap();
    node.submit_attestation(signed(
        genesis,
        "approver",
        1,
        Claim::Approval { action: ACTION, artifact: ARTIFACT, proposal, evaluation, policy, cost: 2 },
    ))
    .unwrap()
}

fn execution(genesis: [u8; 32], nonce: u8, approval: [u8; 32], artifact: [u8; 32]) -> Attestation {
    signed(genesis, "executor", nonce, Claim::Execution { approval, action: ACTION, artifact })
}

fn seal(node: &ArkheNode, timestamp: u64) -> Block {
    let proposal = node.propose_and_seal_block(timestamp).unwrap();
    assert!(proposal.rejected.is_empty(), "{:?}", proposal.rejected);
    proposal.block.unwrap()
}

fn resigned(mut block: Block) -> Vec<u8> {
    sign_proposer(&mut block, &common::SECRET_A).unwrap();
    encode_block(&block)
}

#[test]
fn grants_are_part_of_the_genesis_hash_and_no_grant_keeps_it() {
    let plain = ArkheNode::new("validator-a", &common::SECRET_A, common::validators(), accounts()).unwrap();
    let empty =
        ArkheNode::new_with_grants("validator-a", &common::SECRET_A, common::validators(), accounts(), vec![])
            .unwrap();
    assert_eq!(plain.genesis_hash(), empty.genesis_hash());
    assert_ne!(plain.genesis_hash(), node_a().genesis_hash());

    let mut longer = grants();
    longer[3].expires += 1;
    let other =
        ArkheNode::new_with_grants("validator-a", &common::SECRET_A, common::validators(), accounts(), longer)
            .unwrap();
    assert_ne!(other.genesis_hash(), node_a().genesis_hash());
    assert_ne!(other.attest_policy_digest().unwrap(), node_a().attest_policy_digest().unwrap());
}

#[test]
fn a_second_node_replays_the_ops_to_the_same_root_and_receipt() {
    let (a, b) = (node_a(), node_b());
    let approval = queue_flow(&a);
    assert_eq!(a.attest_count().unwrap(), 0);
    assert_eq!(a.attest_status(&approval).unwrap(), None);

    let first = seal(&a, TS);
    assert!(first.transactions.is_empty());
    assert_eq!(first.attestations.len(), 4);
    assert_eq!(first.header.state_root, a.header_at(1).unwrap().state_root);
    b.import_block(&encode_block(&first)).unwrap();
    assert_eq!(b.tip().unwrap(), a.tip().unwrap());
    assert_eq!(b.attest_root().unwrap(), a.attest_root().unwrap());
    let status = b.attest_status(&approval).unwrap().unwrap();
    assert!(status.signature_valid && status.authority_confirmed);
    assert_eq!((status.included, status.execution_recorded), (3, None));

    let genesis = a.genesis_hash();
    let signed_execution = execution(genesis, 1, approval, ARTIFACT);
    a.submit_attestation(signed_execution.clone()).unwrap();
    assert_eq!(
        a.submit_attestation(execution(genesis, 2, approval, ARTIFACT)),
        Err(ChainError::Attest("consumed"))
    );
    let second = seal(&a, TS + 1);
    b.import_block(&encode_block(&second)).unwrap();
    let receipt = b.attest_receipt(&approval).unwrap().unwrap();
    assert_eq!(Some(&receipt), a.attest_receipt(&approval).unwrap().as_ref());
    assert_eq!((receipt.height, receipt.leaf, receipt.cost), (2, 5, 2));
    assert_eq!((receipt.execution, receipt.executor.as_str()), (signed_execution.id(), "executor"));
    assert_eq!(b.attest_status(&approval).unwrap().unwrap().execution_recorded, Some(5));
    assert_eq!(
        b.submit_attestation(execution(genesis, 3, approval, ARTIFACT)),
        Err(ChainError::Attest("consumed"))
    );

    let (proof, record, root) = b.attest_inclusion_proof(receipt.leaf).unwrap();
    assert_eq!((record, root), (receipt.record(), a.attest_root().unwrap()));
    mmr::verify(&record, &proof, a.attest_count().unwrap(), &root).unwrap();
}

#[test]
fn the_header_root_covers_the_registry() {
    let (a, b) = (node_a(), node_b());
    let approval = queue_flow(&a);
    let first = seal(&a, TS);

    let mut fewer = first.clone();
    fewer.attestations.pop();
    assert_eq!(b.import_block(&resigned(fewer)), Err(ChainError::StateMismatch));

    let mut swapped = first.clone();
    swapped.attestations.swap(0, 3);
    assert_eq!(b.import_block(&resigned(swapped)), Err(ChainError::StateMismatch));

    let mut edited = first.clone();
    let AttestOp::Admit(att) = &mut edited.attestations[2];
    att.expires += 1;
    assert_eq!(b.import_block(&resigned(edited)), Err(ChainError::UnverifiedSignature));
    assert_eq!((b.height().unwrap(), b.attest_count().unwrap()), (0, 0));

    b.import_block(&encode_block(&first)).unwrap();
    let genesis = a.genesis_hash();
    a.submit_attestation(execution(genesis, 1, approval, ARTIFACT)).unwrap();
    let second = seal(&a, TS + 1);

    // The proposer cannot make an execution: it has to carry one that the
    // executor signed for this approval, action and artifact.
    let mut other = second.clone();
    other.attestations[0] = AttestOp::Admit(execution(genesis, 1, approval, [0xB2; 32]));
    assert_eq!(b.import_block(&resigned(other)), Err(ChainError::Attest("artifact")));

    let mut edited = second.clone();
    let AttestOp::Admit(att) = &mut edited.attestations[0];
    if let Claim::Execution { artifact, .. } = &mut att.claim {
        artifact[0] ^= 1;
    }
    assert_eq!(b.import_block(&resigned(edited)), Err(ChainError::UnverifiedSignature));

    let mut forged = second.clone();
    let AttestOp::Admit(att) = &mut forged.attestations[0];
    sign_attestation(att, &common::SECRET_A).unwrap();
    assert_eq!(b.import_block(&resigned(forged)), Err(ChainError::UnverifiedSignature));

    let mut by_approver = second.clone();
    let mut att = signed(genesis, "approver", 9, Claim::Execution { approval, action: ACTION, artifact: ARTIFACT });
    att.nonce = [9; 32];
    by_approver.attestations[0] = AttestOp::Admit(att);
    assert_eq!(b.import_block(&resigned(by_approver)), Err(ChainError::Attest("authority")));

    let mut twice = second.clone();
    twice.attestations.push(second.attestations[0].clone());
    assert_eq!(b.import_block(&resigned(twice)), Err(ChainError::Attest("replay")));
    let mut again = second.clone();
    again.attestations.push(AttestOp::Admit(execution(genesis, 2, approval, ARTIFACT)));
    assert_eq!(b.import_block(&resigned(again)), Err(ChainError::Attest("consumed")));
    assert_eq!(b.attest_receipt(&approval).unwrap(), None);
    b.import_block(&encode_block(&second)).unwrap();
    assert_eq!(b.attest_receipt(&approval).unwrap().unwrap().executor, "executor");
}

#[test]
fn a_transfer_and_ops_share_a_block_and_a_refused_op_is_left_out() {
    let a = node_a();
    let genesis = a.genesis_hash();
    assert_eq!(
        a.submit_attestation(signed([0; 32], "requester", 1, Claim::Request { task: [7; 32], budget: 5 })),
        Err(ChainError::Attest("domain"))
    );
    assert_eq!(
        a.submit_attestation(execution(genesis, 1, [9; 32], ARTIFACT)),
        Err(ChainError::Attest("unknown"))
    );
    assert_eq!(a.attest_pool_len().unwrap(), 0);
    assert_eq!(a.propose_and_seal_block(TS).unwrap_err(), ChainError::MempoolEmpty);

    a.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25)).unwrap();
    a.submit_attestation(signed(genesis, "requester", 1, Claim::Request { task: [7; 32], budget: 5 }))
        .unwrap();
    let block = seal(&a, TS);
    assert_eq!((block.transactions.len(), block.attestations.len()), (1, 1));
    assert_eq!(block.header.mmr_count, 1);
    assert_eq!(a.attest_count().unwrap(), 1);
    assert_eq!(a.attest_pool_len().unwrap(), 0);

    let b = node_b();
    b.import_block(&encode_block(&block)).unwrap();
    assert_eq!(b.balance("bob").unwrap(), 25);
    assert_eq!(b.attest_root().unwrap(), a.attest_root().unwrap());
}

#[test]
fn a_reopened_file_rebuilds_the_registry_and_needs_the_same_grants() {
    let path = std::env::temp_dir().join(format!(
        "arkhe-chain-attest-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let open = |grants| {
        ArkheNode::open_with_grants(&path, "validator-a", &common::SECRET_A, common::validators(), accounts(), grants)
    };
    let node = open(grants()).unwrap();
    let approval = queue_flow(&node);
    node.submit_attestation(execution(node.genesis_hash(), 1, approval, ARTIFACT)).unwrap();
    let block = seal(&node, TS);
    assert_eq!(block.attestations.len(), 5);
    let (tip, root, receipt) = (
        node.tip().unwrap(),
        node.attest_root().unwrap(),
        node.attest_receipt(&approval).unwrap().unwrap(),
    );
    drop(node);

    let again = open(grants()).unwrap();
    assert_eq!((again.tip().unwrap(), again.attest_root().unwrap()), (tip, root));
    assert_eq!(again.attest_count().unwrap(), 6);
    assert_eq!(again.attest_receipt(&approval).unwrap(), Some(receipt));
    drop(again);

    assert!(matches!(open(Vec::new()), Err(ChainError::Genesis)));
    let _ = std::fs::remove_file(&path);
}
