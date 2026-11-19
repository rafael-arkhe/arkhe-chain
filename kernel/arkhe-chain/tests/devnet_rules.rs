//! The agreement, progress and recovery rules of `docs/regras.md`, one test
//! per rule. The agreement tests drive four nodes through the library. The
//! progress and recovery tests run four operators over TCP on 127.0.0.1.

mod common;

use std::path::PathBuf;

use arkhe_chain::{
    encode_block, encode_tx_list, genesis_peer_lines, import_synced, parse_configured_peer,
    public_key, run_operator, sign_precommit, ArkheNode, ChainError, ConfiguredPeer,
    OperatorHandle, OperatorRequest, Precommit, Validator, CHAIN_ID, GENESIS_ACCOUNT,
};

const TS: u64 = 1_700_000_000;
const IDS: [&str; 4] = ["val1", "val2", "val3", "val4"];

fn secret(index: usize) -> [u8; 32] {
    [0xA1 + index as u8; 32]
}

fn validators() -> Vec<Validator> {
    (0..4)
        .map(|index| Validator {
            id: IDS[index].to_string(),
            public_key: public_key(&secret(index)).unwrap(),
        })
        .collect()
}

fn node(index: usize) -> ArkheNode {
    ArkheNode::new(IDS[index], &secret(index), validators(), common::accounts()).unwrap()
}

/// A round 0 precommit by validator `index` for `hash` at `height`.
fn vote(index: usize, height: u64, hash: [u8; 32]) -> Precommit {
    let mut vote = Precommit {
        validator_id: IDS[index].to_string(),
        height,
        round: 0,
        block_hash: hash,
        parts: 1,
        part_hash: hash,
        chain_id: CHAIN_ID.to_string(),
        signature: [0u8; 64],
    };
    sign_precommit(&mut vote, &secret(index)).unwrap();
    vote
}

/// Seal one transfer on `sealer` and return the block bytes and hash.
fn seal(sealer: &ArkheNode, nonce: u64, recipient: &str, timestamp: u64) -> (Vec<u8>, [u8; 32]) {
    sealer
        .ingest(common::transfer(nonce, GENESIS_ACCOUNT, recipient, 5))
        .unwrap();
    let block = sealer
        .propose_and_seal_block(timestamp)
        .unwrap()
        .block
        .unwrap();
    (encode_block(&block), sealer.tip().unwrap())
}

// ---------------------------------------------------------------- agreement

#[test]
fn a1_a_height_commits_only_with_more_than_two_thirds_of_the_validators() {
    let observer = node(0);
    let (_, hash) = seal(&observer, 0, "bob", TS);
    assert_eq!(observer.bft_commit(1), Err(ChainError::QuorumAbsent));
    for (index, expected) in [(0, 0), (1, 0), (2, 1), (3, 1)] {
        observer.note_precommit(&vote(index, 1, hash)).unwrap();
        let _ = observer.bft_commit(1);
        assert_eq!(
            observer.committed_height().unwrap(),
            expected,
            "after vote {index}"
        );
    }
    // Committing does not move the tip, and a height above the next one waits.
    assert_eq!(observer.tip().unwrap(), hash);
    seal(&observer, 1, "bob", TS + 1);
    seal(&observer, 2, "bob", TS + 2);
    let third = observer.tip().unwrap();
    for index in 0..4 {
        observer.note_precommit(&vote(index, 3, third)).unwrap();
    }
    assert_eq!(observer.bft_commit(3), Err(ChainError::CommitGap));
    assert_eq!(observer.committed_height().unwrap(), 1);
}

#[test]
fn a2_a_node_counts_votes_only_for_its_own_canonical_block() {
    let (first, second, follower) = (node(0), node(1), node(2));
    let (block_a, hash_a) = seal(&first, 0, "bob", TS);
    let (block_b, hash_b) = seal(&second, 0, "carol", TS);
    assert_ne!(hash_a, hash_b);

    follower.import_block(&block_a).unwrap();
    assert_eq!(follower.import_block(&block_b), Err(ChainError::Fork));
    assert_eq!(
        (follower.tip().unwrap(), follower.fork_count().unwrap()),
        (hash_a, 1)
    );

    // Votes for the sibling, for an unknown block, by an outsider, or with a
    // signature that is not the validator's are not stored.
    assert_eq!(
        follower.note_precommit(&vote(1, 1, hash_b)),
        Err(ChainError::Fork)
    );
    assert_eq!(
        follower.note_precommit(&vote(1, 1, [7; 32])),
        Err(ChainError::UnknownBlock)
    );
    let mut outsider = vote(1, 1, hash_a);
    outsider.validator_id = "val9".to_string();
    assert_eq!(
        follower.note_precommit(&outsider),
        Err(ChainError::NotProposer)
    );
    let mut forged = vote(1, 1, hash_a);
    forged.validator_id = IDS[3].to_string();
    assert_eq!(
        follower.note_precommit(&forged),
        Err(ChainError::BadProposerSignature)
    );
    let mut elsewhere = vote(1, 1, hash_a);
    elsewhere.chain_id = "other-chain".to_string();
    assert_eq!(
        follower.note_precommit(&elsewhere),
        Err(ChainError::ChainId)
    );
    assert_eq!(follower.precommit_count(1).unwrap(), 0);

    // The same vote twice counts once.
    follower.note_precommit(&vote(0, 1, hash_a)).unwrap();
    follower.note_precommit(&vote(0, 1, hash_a)).unwrap();
    assert_eq!(follower.precommit_count(1).unwrap(), 1);
}

/// Two sealers split the validators two and two. `double_signers` validators
/// then sign both blocks. Returns which side committed.
fn split(double_signers: usize) -> (bool, bool) {
    let nodes: Vec<ArkheNode> = (0..4).map(node).collect();
    let (block_a, hash_a) = seal(&nodes[0], 0, "bob", TS);
    let (block_b, hash_b) = seal(&nodes[1], 0, "carol", TS);
    nodes[2].import_block(&block_a).unwrap();
    nodes[3].import_block(&block_b).unwrap();
    // Each validator signs the block that is canonical on its own node.
    let mut votes_a = vec![vote(0, 1, hash_a), vote(2, 1, hash_a)];
    let mut votes_b = vec![vote(1, 1, hash_b), vote(3, 1, hash_b)];
    // A double signer also signs the other block.
    if double_signers >= 1 {
        votes_a.push(vote(1, 1, hash_a));
    }
    if double_signers >= 2 {
        votes_b.push(vote(0, 1, hash_b));
    }
    for item in &votes_a {
        nodes[2].note_precommit(item).unwrap();
    }
    for item in &votes_b {
        nodes[3].note_precommit(item).unwrap();
    }
    let _ = nodes[2].bft_commit(1);
    let _ = nodes[3].bft_commit(1);
    (
        nodes[2].committed_height().unwrap() == 1,
        nodes[3].committed_height().unwrap() == 1,
    )
}

#[test]
fn a3_two_blocks_at_one_height_cannot_both_commit_with_one_double_signer() {
    // Honest validators: neither side reaches three votes.
    assert_eq!(split(0), (false, false));
    // One of four signs both blocks: at most one side commits.
    assert_eq!(split(1), (true, false));
}

#[test]
fn a4_two_double_signers_of_four_break_agreement() {
    // This is the bound, not a defect of the test: three of four votes can
    // be reached on both blocks once two validators sign both.
    assert_eq!(split(2), (true, true));
}

#[test]
fn a5_a_committed_block_is_not_replaced_by_a_sibling_or_a_longer_chain() {
    let (first, second) = (node(0), node(1));
    let (block_a, hash_a) = seal(&first, 0, "bob", TS);
    for index in 0..3 {
        first.note_precommit(&vote(index, 1, hash_a)).unwrap();
    }
    first.bft_commit(1).unwrap();

    let (block_b1, _) = seal(&second, 0, "carol", TS);
    let (block_b2, _) = seal(&second, 1, "carol", TS + 1);
    assert_eq!(first.import_block(&block_b1), Err(ChainError::Fork));
    assert_eq!(
        first.import_block(&block_b2),
        Err(ChainError::ParentMismatch)
    );
    assert_eq!((first.height().unwrap(), first.tip().unwrap()), (1, hash_a));
    assert_eq!(first.committed_height().unwrap(), 1);
    assert_eq!(first.block_hash_at(1).unwrap(), hash_a);

    // The other side, a block longer, does not adopt the committed block either.
    assert_eq!(second.import_block(&block_a), Err(ChainError::Fork));
    assert_eq!(second.height().unwrap(), 2);

    // The same proposer sealing a second block at a height is refused outright.
    let twin = node(0);
    let (other_a, _) = seal(&twin, 0, "dave", TS);
    assert_eq!(first.import_block(&other_a), Err(ChainError::Equivocation));
    assert_eq!(first.fork_count().unwrap(), 1);
}

#[test]
fn r4_a_synced_reimport_of_an_already_canonical_block_is_not_a_failed_walk() {
    let (sealer, follower) = (node(0), node(1));
    let (body, hash) = seal(&sealer, 0, "bob", TS);
    follower.import_block(&body).unwrap();
    assert_eq!(follower.tip().unwrap(), hash);
    // The sync walk asked for this body before a vote imported it. Re-import
    // answers ParentMismatch; the walk must not treat that as failure.
    assert_eq!(
        follower.import_block(&body),
        Err(ChainError::ParentMismatch)
    );
    import_synced(&follower, &body).unwrap();
    assert_eq!(
        (follower.height().unwrap(), follower.tip().unwrap()),
        (1, hash)
    );

    let (foreign_body, _) = seal(&node(2), 0, "carol", TS);
    assert_eq!(
        import_synced(&follower, &foreign_body),
        Err(ChainError::Fork)
    );
    assert_eq!(follower.tip().unwrap(), hash);
}

// ------------------------------------------------- progress and recovery

struct Net {
    dir: PathBuf,
    genesis: String,
    ports: [u16; 4],
}

impl Net {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "arkhe-chain-rules-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("inbox")).unwrap();
        let hex = |bytes: &[u8]| {
            bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        };
        let mut genesis = String::new();
        for validator in validators() {
            genesis.push_str(&format!(
                "validator {} {}\n",
                validator.id,
                hex(&validator.public_key)
            ));
        }
        for account in common::accounts() {
            genesis.push_str(&format!(
                "account {} {} {}\n",
                account.id,
                hex(&account.public_key),
                hex(&account.mldsa_public_key.unwrap())
            ));
        }
        // Ports the system just handed out and released.
        let ports = std::array::from_fn(|_| {
            std::net::TcpListener::bind("127.0.0.1:0")
                .unwrap()
                .local_addr()
                .unwrap()
                .port()
        });
        Self {
            dir,
            genesis,
            ports,
        }
    }

    fn data(&self, index: usize) -> PathBuf {
        self.dir.join(IDS[index])
    }

    fn peers(&self, index: usize) -> Vec<ConfiguredPeer> {
        let lines = genesis_peer_lines(&self.genesis).unwrap();
        lines
            .lines()
            .enumerate()
            .filter(|(other, _)| *other != index)
            .map(|(other, line)| {
                let peer = line.split_whitespace().nth(1).unwrap();
                parse_configured_peer(&format!(
                    "/ip4/127.0.0.1/tcp/{}/p2p/{peer}",
                    self.ports[other]
                ))
                .unwrap()
            })
            .collect()
    }

    async fn try_start(&self, index: usize) -> Result<OperatorHandle, ChainError> {
        run_operator(OperatorRequest {
            data: self.data(index),
            id: IDS[index].to_string(),
            secret: secret(index),
            genesis: self.genesis.clone(),
            listen: format!("/ip4/127.0.0.1/tcp/{}", self.ports[index])
                .parse()
                .unwrap(),
            peers: self.peers(index),
            once: false,
            txs: Vec::new(),
            // val1 is the only sealing process.
            seal_at: (index == 0).then_some(TS),
            announce: None,
        })
        .await
    }

    /// Start a node. A port that the previous process of this node has not
    /// released yet is tried again for a few seconds.
    async fn start(&self, index: usize) -> OperatorHandle {
        let mut last = None;
        for _ in 0..40 {
            match self.try_start(index).await {
                Ok(handle) => return handle,
                Err(error) => last = Some(error),
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        panic!("{} did not start: {last:?}", IDS[index]);
    }

    /// Hand one transfer to the sealer through its inbox.
    fn submit(&self, sealer: &OperatorHandle, nonce: u64) {
        let list = encode_tx_list(&[common::transfer(nonce, GENESIS_ACCOUNT, "bob", 1)]).unwrap();
        std::fs::write(self.dir.join("inbox").join(format!("{nonce:04}.txs")), list).unwrap();
        let taken = sealer.take_inbox(&self.dir.join("inbox")).unwrap();
        assert_eq!(taken.len(), 1);
        assert_eq!(taken[0].outcome, Ok(1));
    }
}

impl Drop for Net {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Run passes on every node until all of them hold `height` as tip and as
/// committed height, with one tip hash.
async fn settle(nodes: &[&OperatorHandle], height: u64) -> [u8; 32] {
    for _ in 0..60 {
        for node in nodes {
            node.catch_up().await.unwrap();
        }
        let seen: Vec<_> = nodes.iter().map(|node| node.status().unwrap()).collect();
        if seen.iter().all(|status| {
            status.height == height && status.committed == height && status.tip == seen[0].tip
        }) {
            return seen[0].tip;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let seen: Vec<_> = nodes
        .iter()
        .map(|node| {
            node.status()
                .map(|status| (status.height, status.committed))
        })
        .collect();
    panic!("the nodes did not settle at height {height}: {seen:?}");
}

/// Run a few sealer passes and return its height and waiting transfers.
async fn passes(sealer: &OperatorHandle) -> (u64, u64) {
    for _ in 0..3 {
        sealer.catch_up().await.unwrap();
    }
    let status = sealer.status().unwrap();
    (status.height, status.mempool)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn p1_the_sealer_seals_only_after_every_named_peer_answered() {
    let net = Net::new("progress");
    let val2 = net.start(1).await;
    let val3 = net.start(2).await;
    let val1 = net.start(0).await;

    // val4 is not running. The transfer is taken and waits.
    net.submit(&val1, 0);
    assert_eq!(passes(&val1).await, (0, 1));
    assert_eq!(val2.status().unwrap().height, 0);

    // With val4 up, the same transfer is sealed and committed on all four.
    let val4 = net.start(3).await;
    let first = settle(&[&val1, &val2, &val3, &val4], 1).await;
    assert_eq!(val1.status().unwrap().mempool, 0);

    // A follower that stops again holds the next block back.
    drop(val4);
    net.submit(&val1, 1);
    assert_eq!(passes(&val1).await, (1, 1));
    assert_eq!(val1.status().unwrap().tip, first);
    let val4 = net.start(3).await;
    settle(&[&val1, &val2, &val3, &val4], 2).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn r1_a_follower_that_lost_its_file_syncs_from_genesis_and_votes_again() {
    let net = Net::new("resync");
    let val2 = net.start(1).await;
    let val3 = net.start(2).await;
    let val4 = net.start(3).await;
    let val1 = net.start(0).await;
    for nonce in 0..2 {
        net.submit(&val1, nonce);
        settle(&[&val1, &val2, &val3, &val4], nonce + 1).await;
    }
    let tip = val1.status().unwrap().tip;

    drop(val3);
    std::fs::remove_file(net.data(2)).unwrap();
    let val3 = net.start(2).await;
    assert_eq!(settle(&[&val1, &val2, &val3, &val4], 2).await, tip);

    net.submit(&val1, 2);
    settle(&[&val1, &val2, &val3, &val4], 3).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn r2_a_restarted_node_resumes_from_its_file() {
    let net = Net::new("restart");
    let val2 = net.start(1).await;
    let val3 = net.start(2).await;
    let val4 = net.start(3).await;
    let val1 = net.start(0).await;
    net.submit(&val1, 0);
    let tip = settle(&[&val1, &val2, &val3, &val4], 1).await;

    // The sealer stops with a transfer waiting. The transfer is in its file.
    drop(val4);
    net.submit(&val1, 1);
    assert_eq!(passes(&val1).await, (1, 1));
    drop(val1);
    let val1 = net.start(0).await;
    let resumed = val1.status().unwrap();
    assert_eq!(
        (resumed.height, resumed.committed, resumed.mempool),
        (1, 1, 1)
    );
    assert_eq!(resumed.tip, tip);

    // A leftover temporary file keeps a node from starting until it is removed.
    let stale = net.data(3).with_extension("arkhe-tmp");
    std::fs::write(&stale, b"left by a killed process").unwrap();
    assert!(matches!(net.try_start(3).await, Err(ChainError::Snapshot)));
    std::fs::remove_file(&stale).unwrap();
    let val4 = net.start(3).await;
    assert_eq!(val4.status().unwrap().height, 1);

    settle(&[&val1, &val2, &val3, &val4], 2).await;
}
