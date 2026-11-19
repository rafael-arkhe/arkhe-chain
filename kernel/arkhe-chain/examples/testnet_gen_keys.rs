//! Gera material local da testnet em `testnet/local/`.
//! Não imprime nem grava chaves privadas fora desse diretório.
//!
//! ```text
//! cargo run -p arkhe-chain --example testnet_gen_keys
//! ```

use std::io::Write;
use std::path::{Path, PathBuf};

use arkhe_chain::{public_key, sign_mldsa, Transaction, GENESIS_ACCOUNT};
use libp2p::identity;

fn main() {
    let root = network_root();
    let local = root.join("local");
    let keys = local.join("keys");
    let data = local.join("data");
    let announce = local.join("announce");
    let inbox = local.join("inbox");
    std::fs::create_dir_all(&keys).expect("keys dir");
    std::fs::create_dir_all(&data).expect("data dir");
    std::fs::create_dir_all(&announce).expect("announce dir");
    std::fs::create_dir_all(&inbox).expect("inbox dir");

    let validators = [
        ("validator-1", "19001"),
        ("validator-2", "19002"),
        ("validator-3", "19003"),
    ];
    let observer = ("observer-1", "19004");

    let mut genesis = String::from(
        "# Gênese local da testnet. Só chaves públicas. Gerado por testnet_gen_keys.\n",
    );
    let mut peer_ids = Vec::new();

    for (id, _port) in validators.iter().chain(std::iter::once(&observer)) {
        let secret = random_secret();
        write_hex_file(&keys.join(format!("{id}.ed25519.key")), &secret);
        let public = public_key(&secret).expect("ed25519 public");
        genesis.push_str(&format!("validator {id} {}\n", hex(&public)));
        peer_ids.push((id.to_string(), peer_id_of(&secret)));
    }

    let faucet_ed = random_secret();
    let faucet_mldsa = random_secret();
    write_hex_file(&keys.join("genesis-alloc.ed25519.key"), &faucet_ed);
    write_hex_file(&keys.join("genesis-alloc.mldsa.seed"), &faucet_mldsa);
    let faucet_pk = public_key(&faucet_ed).expect("faucet ed25519");
    let mut probe = Transaction {
        nonce: 0,
        sender: GENESIS_ACCOUNT.into(),
        recipient: GENESIS_ACCOUNT.into(),
        value: 0,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0u8; 64],
    };
    let faucet_mldsa_pk = sign_mldsa(&mut probe, &faucet_mldsa).expect("mldsa public");
    genesis.push_str(&format!(
        "account {GENESIS_ACCOUNT} {} {}\n",
        hex(&faucet_pk),
        hex(&faucet_mldsa_pk)
    ));

    let alice_ed = random_secret();
    let alice_mldsa = random_secret();
    write_hex_file(&keys.join("alice.ed25519.key"), &alice_ed);
    write_hex_file(&keys.join("alice.mldsa.seed"), &alice_mldsa);
    let alice_pk = public_key(&alice_ed).expect("alice ed25519");
    probe.sender = "alice".into();
    probe.recipient = "alice".into();
    probe.signature_mldsa.clear();
    let alice_mldsa_pk = sign_mldsa(&mut probe, &alice_mldsa).expect("alice mldsa");
    genesis.push_str(&format!(
        "account alice {} {}\n",
        hex(&alice_pk),
        hex(&alice_mldsa_pk)
    ));

    // Contas do fluxo de atestados (Ed25519). Sem papel Executor: no crate
    // local a execução é AttestOp::Execute do selador, não Claim assinada.
    genesis.push_str("\n# Contas e concessões do fluxo de atestados (só chaves públicas).\n");
    let root_secret = random_secret();
    write_hex_file(&keys.join("testnet-root.ed25519.key"), &root_secret);
    let root_pk = public_key(&root_secret).expect("root");
    genesis.push_str(&format!("account testnet-root {}\n", hex(&root_pk)));
    for (id, role) in [
        ("testnet-requester", "requester"),
        ("testnet-author", "author"),
        ("testnet-evaluator", "evaluator"),
        ("testnet-approver", "approver"),
    ] {
        let secret = random_secret();
        write_hex_file(&keys.join(format!("{id}.ed25519.key")), &secret);
        let public = public_key(&secret).expect("role key");
        genesis.push_str(&format!("account {id} {}\n", hex(&public)));
        genesis.push_str(&format!("grant {id} {role} testnet-root 1000000000\n"));
    }

    let genesis_path = local.join("genesis.txt");
    std::fs::write(&genesis_path, &genesis).expect("genesis");

    let peers_example = local.join("peers.txt");
    let mut peers =
        String::from("# Preencha com as linhas listen após o arranque (ou use collect-peers).\n");
    let fingerprint = arkhe_chain::genesis_fingerprint(&genesis).expect("fingerprint");
    peers.push_str(&format!("# genesis {}\n", hex(&fingerprint.hash)));
    for (id, peer) in &peer_ids {
        peers.push_str(&format!(
            "# {id} peer id {peer} — falta /ip4/.../tcp/.../p2p/...\n"
        ));
    }
    std::fs::write(&peers_example, peers).expect("peers");

    // 127.0.0.1 para orquestração nativa e peers locais. Docker usa 0.0.0.0
    // nos exemplos / compose.
    write_node_env(
        &local.join("node1.env"),
        "validator-1",
        &keys.join("validator-1.ed25519.key"),
        &data.join("node1"),
        &genesis_path,
        "/ip4/127.0.0.1/tcp/19001",
        &peers_example,
        true,
    );
    write_node_env(
        &local.join("node2.env"),
        "validator-2",
        &keys.join("validator-2.ed25519.key"),
        &data.join("node2"),
        &genesis_path,
        "/ip4/127.0.0.1/tcp/19002",
        &peers_example,
        false,
    );
    write_node_env(
        &local.join("node3.env"),
        "validator-3",
        &keys.join("validator-3.ed25519.key"),
        &data.join("node3"),
        &genesis_path,
        "/ip4/127.0.0.1/tcp/19003",
        &peers_example,
        false,
    );
    write_node_env(
        &local.join("observer.env"),
        "observer-1",
        &keys.join("observer-1.ed25519.key"),
        &data.join("observer"),
        &genesis_path,
        "/ip4/127.0.0.1/tcp/19004",
        &peers_example,
        false,
    );

    println!("local={}", local.display());
    println!("genesis={}", genesis_path.display());
    println!("blake3={}", hex(&fingerprint.hash));
    println!("validators={}", fingerprint.validators);
    println!("accounts={}", fingerprint.accounts);
    for (id, peer) in peer_ids {
        println!("peer_id {id} {peer}");
    }
    println!("chave privada só em {}", keys.display());
}

fn network_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("testnet")
}

fn write_node_env(
    path: &Path,
    id: &str,
    key: &Path,
    data: &Path,
    genesis: &Path,
    listen: &str,
    peers: &Path,
    seal: bool,
) {
    let announce = path
        .parent()
        .unwrap()
        .join("announce")
        .join(format!("{id}.peer"));
    let inbox = path.parent().unwrap().join("inbox");
    let mut text = format!(
        "ARKHE_ID={id}\nARKHE_KEY={}\nARKHE_DATA={}\nARKHE_GENESIS={}\nARKHE_LISTEN={listen}\nARKHE_PEER_FILE={}\nARKHE_ANNOUNCE={}\n",
        workspace_rel(key),
        workspace_rel(data),
        workspace_rel(genesis),
        workspace_rel(peers),
        workspace_rel(&announce),
    );
    if seal {
        // `now` = unix time no arranque (timestamp do bloco 1). Depois: pai+1.
        text.push_str(&format!(
            "ARKHE_SEAL=1\nARKHE_TIME=now\nARKHE_INBOX={}\n",
            workspace_rel(&inbox)
        ));
    } else {
        text.push_str("ARKHE_SEAL=0\n");
    }
    std::fs::write(path, text).expect("env");
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("kernel")
        .parent()
        .expect("workspace")
        .to_path_buf()
}

fn workspace_rel(path: &Path) -> String {
    let root = workspace_root();
    path.strip_prefix(&root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn write_hex_file(path: &Path, bytes: &[u8; 32]) {
    let mut file = std::fs::File::create(path).expect("create key");
    writeln!(file, "{}", hex(bytes)).expect("write key");
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn random_secret() -> [u8; 32] {
    let keypair = identity::ed25519::Keypair::generate();
    let mut out = [0u8; 32];
    out.copy_from_slice(keypair.secret().as_ref());
    out
}

fn peer_id_of(secret: &[u8; 32]) -> String {
    let mut raw = *secret;
    let secret = identity::ed25519::SecretKey::try_from_bytes(&mut raw).expect("secret");
    let keypair = identity::Keypair::from(identity::ed25519::Keypair::from(secret));
    keypair.public().to_peer_id().to_string()
}
