mod common;

use arkhe_chain::{
    encode_tx_list, format_genesis, format_status, genesis_fingerprint, ingest_tx_list,
    next_status_line, parse_configured_peer, parse_genesis, parse_secret_hex, read_peer_file,
    ChainError, ChainStatus, GENESIS_ACCOUNT,
};

#[test]
fn a_genesis_file_names_validators_and_account_keys() {
    let text = "\n# comment\nvalidator validator-a 11\n";
    assert!(matches!(
        parse_genesis(text),
        Err(ChainError::Malformed)
    ));
    assert!(matches!(
        parse_genesis(""),
        Err(ChainError::EmptyValidators)
    ));
    assert!(matches!(
        parse_genesis("validator validator-a 0011\nvalidator validator-a 0011\n"),
        Err(ChainError::Malformed)
    ));

    let public = hex(&arkhe_chain::public_key(&common::SECRET_A).unwrap());
    let genesis = format!("validator validator-a {public}\naccount genesis-alloc {public}\n");
    let (validators, accounts) = parse_genesis(&genesis).unwrap();
    assert_eq!(validators.len(), 1);
    assert_eq!(validators[0].id, "validator-a");
    assert_eq!(accounts[0].id, "genesis-alloc");
    assert!(accounts[0].mldsa_public_key.is_none());
    assert_eq!(
        parse_secret_hex(&hex(&common::SECRET_B)).unwrap(),
        common::SECRET_B
    );
}

#[test]
fn a_configured_peer_must_name_one_peer_id() {
    assert_eq!(
        parse_configured_peer("/ip4/127.0.0.1/tcp/9").unwrap_err(),
        ChainError::Malformed
    );
    let peer = parse_configured_peer(
        "/ip4/127.0.0.1/tcp/9/p2p/12D3KooWPqT2nMDSiXUSx5D7fasaxhxKigVhcqfkKqrLghCq9jxz",
    )
    .unwrap();
    assert_eq!(peer.addr.to_string(), "/ip4/127.0.0.1/tcp/9");
    assert_eq!(
        peer.peer_id.to_string(),
        "12D3KooWPqT2nMDSiXUSx5D7fasaxhxKigVhcqfkKqrLghCq9jxz"
    );
}

#[test]
fn the_operator_process_listens_once_and_writes_the_file() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-operator-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(
        &genesis,
        format!("validator validator-b {public}\naccount bob {public}\n"),
    )
    .unwrap();

    let missing = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .output()
        .unwrap();
    assert_eq!(missing.status.code(), Some(2));

    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    let stdout = String::from_utf8(ran.stdout).unwrap();
    assert!(stdout.starts_with("listen /ip4/127.0.0.1/tcp/"), "{stdout}");
    assert!(stdout.contains("/p2p/12D3KooW"), "{stdout}");
    assert!(stdout.contains("height 0\n"), "{stdout}");
    assert!(stdout.contains("committed 0\n"), "{stdout}");
    assert!(stdout.contains(&format!("tip {}\n", "0".repeat(64))), "{stdout}");
    assert!(stdout.contains("mempool 0\n"), "{stdout}");
    assert!(stdout.contains("forks 0\n"), "{stdout}");
    assert!(std::fs::read(&data).unwrap().starts_with(b"AKGCHNS7"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_transaction_list_ingests_in_order_and_rejects_a_short_tail() {
    let node = common::node();
    let bytes = encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap();
    assert_eq!(ingest_tx_list(&node, &bytes).unwrap(), 1);
    assert_eq!(node.mempool_len().unwrap(), 1);
    let mut short = bytes.clone();
    short.extend_from_slice(&[0, 0, 0, 4]);
    let fresh = common::node();
    assert_eq!(
        ingest_tx_list(&fresh, &short).unwrap_err(),
        ChainError::Malformed
    );
    assert_eq!(fresh.mempool_len().unwrap(), 1);
}

#[test]
fn show_peers_prints_the_validator_peer_id_and_opens_nothing() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-peers-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let genesis = dir.join("genesis");
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    let text = format!("validator validator-b {public}\n");
    std::fs::write(&genesis, &text).unwrap();
    let expected = arkhe_chain::genesis_peer_lines(&text).unwrap();
    assert!(expected.starts_with("validator-b 12D3KooW"));
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--show-peers")
        .arg("--genesis")
        .arg(&genesis)
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0));
    assert_eq!(String::from_utf8(ran.stdout).unwrap(), expected);
    assert!(!dir.join("chain").exists());
    let missing = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--show-peers")
        .output()
        .unwrap();
    assert_eq!(missing.status.code(), Some(2));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn status_reads_the_file_without_rewriting_it() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-status-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0));
    let before = std::fs::read(&data).unwrap();
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(0));
    let text = String::from_utf8(status.stdout).unwrap();
    assert!(text.contains("height 0\n"), "{text}");
    assert!(text.contains("committed 0\n"), "{text}");
    assert!(text.contains(&format!("tip {}\n", "0".repeat(64))), "{text}");
    assert!(text.contains("mempool 0\n"), "{text}");
    assert!(text.contains("forks 0\n"), "{text}");
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let missing = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .output()
        .unwrap();
    assert_eq!(missing.status.code(), Some(2));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn status_prints_the_stored_genesis_without_rewriting_the_file() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-status-genesis-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    let text = format!("# note\nvalidator validator-b {}\n", public.to_uppercase());
    std::fs::write(&genesis, &text).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    let hash = genesis_fingerprint(&text).unwrap().hash;
    let mut hex_hash = String::with_capacity(64);
    for byte in hash {
        hex_hash.push_str(&format!("{byte:02x}"));
    }
    let before = std::fs::read(&data).unwrap();
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(0));
    let text_out = String::from_utf8(status.stdout).unwrap();
    assert!(text_out.contains(&format!("genesis {hex_hash}\n")), "{text_out}");
    assert!(String::from_utf8(ran.stdout).unwrap().contains(&format!("genesis {hex_hash}\n")));
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let mut old = before.clone();
    old.truncate(old.len() - 32);
    std::fs::write(&data, &old).unwrap();
    let absent = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .output()
        .unwrap();
    assert_eq!(absent.status.code(), Some(0));
    assert!(String::from_utf8(absent.stdout).unwrap().contains("genesis absent\n"));
    assert_eq!(std::fs::read(&data).unwrap(), old);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn status_checks_the_genesis_text_without_rewriting_the_file() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-status-check-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    let text = format!("validator validator-b {public}\n");
    std::fs::write(&genesis, &text).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    let before = std::fs::read(&data).unwrap();
    let same = dir.join("same");
    std::fs::write(&same, format!("\n# note\nvalidator validator-b {}\n", public.to_uppercase())).unwrap();
    let hash = genesis_fingerprint(&text).unwrap().hash;
    let mut hex_hash = String::with_capacity(64);
    for byte in hash {
        hex_hash.push_str(&format!("{byte:02x}"));
    }
    let checked = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .arg("--genesis")
        .arg(&same)
        .output()
        .unwrap();
    assert_eq!(checked.status.code(), Some(0), "{}", String::from_utf8_lossy(&checked.stderr));
    assert!(String::from_utf8(checked.stdout).unwrap().contains(&format!("genesis {hex_hash}\n")));
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let other = dir.join("other");
    std::fs::write(&other, format!("{text}validator validator-a {public}\n")).unwrap();
    let refused = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .arg("--genesis")
        .arg(&other)
        .output()
        .unwrap();
    assert_eq!(refused.status.code(), Some(1));
    assert!(refused.stdout.is_empty());
    assert_eq!(
        String::from_utf8(refused.stderr).unwrap(),
        "FAIL_CLOSED: GENESIS\n"
    );
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let mut old = before.clone();
    old.truncate(old.len() - 32);
    std::fs::write(&data, &old).unwrap();
    let unbound = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .arg("--genesis")
        .arg(&genesis)
        .output()
        .unwrap();
    assert_eq!(unbound.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(unbound.stderr).unwrap(),
        "FAIL_CLOSED: GENESIS\n"
    );
    assert_eq!(std::fs::read(&data).unwrap(), old);
    let usage = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--genesis")
        .arg(&genesis)
        .output()
        .unwrap();
    assert_eq!(usage.status.code(), Some(2));
    assert!(usage.stderr.is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn the_process_does_not_adopt_a_file_without_the_genesis_hash() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-adopt-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    let start = |genesis: &std::path::Path| {
        std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
            .arg("--data")
            .arg(&data)
            .arg("--id")
            .arg("validator-b")
            .arg("--key")
            .arg(&key)
            .arg("--genesis")
            .arg(genesis)
            .arg("--listen")
            .arg("/ip4/127.0.0.1/tcp/0")
            .arg("--once")
            .output()
            .unwrap()
    };
    let created = start(&genesis);
    assert_eq!(created.status.code(), Some(0), "{}", String::from_utf8_lossy(&created.stderr));
    let again = start(&genesis);
    assert_eq!(again.status.code(), Some(0), "{}", String::from_utf8_lossy(&again.stderr));
    let bound = std::fs::read(&data).unwrap();
    let other = dir.join("other");
    std::fs::write(&other, format!("validator validator-a {public}\n")).unwrap();
    let mismatched = start(&other);
    assert_eq!(mismatched.status.code(), Some(1));
    assert!(mismatched.stdout.is_empty());
    assert_eq!(
        String::from_utf8(mismatched.stderr).unwrap(),
        "FAIL_CLOSED: GENESIS\n"
    );
    assert_eq!(std::fs::read(&data).unwrap(), bound);
    let mut old = bound.clone();
    old.truncate(old.len() - 32);
    std::fs::write(&data, &old).unwrap();
    let unbound = start(&genesis);
    assert_eq!(unbound.status.code(), Some(1));
    assert!(unbound.stdout.is_empty());
    assert_eq!(
        String::from_utf8(unbound.stderr).unwrap(),
        "FAIL_CLOSED: GENESIS\n"
    );
    assert_eq!(std::fs::read(&data).unwrap(), old);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_second_process_does_not_open_the_file_the_first_still_holds() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-busy-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    let announce = dir.join("listen");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    struct Stop(std::process::Child);
    impl Drop for Stop {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let mut child = Stop(
        std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--announce")
        .arg(&announce)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap(),
    );
    let mut held = false;
    for _ in 0..50 {
        if announce.exists() {
            held = true;
            break;
        }
        if child.0.try_wait().unwrap().is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(held, "the process exited before holding the file");
    let before = std::fs::read(&data).unwrap();
    let second = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(second.status.code(), Some(1));
    assert!(second.stdout.is_empty());
    assert_eq!(String::from_utf8(second.stderr).unwrap(), "FAIL_CLOSED: BUSY\n");
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(0));
    assert!(String::from_utf8(status.stdout).unwrap().contains("height 0\n"));
    assert_eq!(std::fs::read(&data).unwrap(), before);
    drop(child);
    let restarted = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(
        restarted.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&restarted.stderr)
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn status_counts_a_waiting_transaction_without_rewriting_the_file() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-mempool-status-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let node = arkhe_chain::ArkheNode::open(
        &data,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    drop(node);
    let before = std::fs::read(&data).unwrap();
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(0));
    let text = String::from_utf8(status.stdout).unwrap();
    assert!(text.contains("height 0\n"), "{text}");
    assert!(text.contains("committed 0\n"), "{text}");
    assert!(text.contains("mempool 1\n"), "{text}");
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn status_counts_a_stored_fork_without_changing_the_tip() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-fork-status-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let node = arkhe_chain::ArkheNode::open(
        &data,
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    node.ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    node.propose_and_seal_block(1_700_000_000).unwrap();
    let tip = node.tip().unwrap();
    let other = common::peer();
    other
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "carol", 10))
        .unwrap();
    let rival = other
        .propose_and_seal_block(1_700_000_000)
        .unwrap()
        .block
        .unwrap();
    assert_eq!(
        node.import_block(&arkhe_chain::encode_block(&rival))
            .unwrap_err(),
        ChainError::Fork
    );
    drop(node);
    let before = std::fs::read(&data).unwrap();
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(0));
    let text = String::from_utf8(status.stdout).unwrap();
    assert!(text.contains("height 1\n"), "{text}");
    assert!(text.contains("forks 1\n"), "{text}");
    assert!(text.contains(&format!("tip {}\n", hex(&tip))), "{text}");
    assert_eq!(std::fs::read(&data).unwrap(), before);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn announce_writes_the_listen_address_as_a_peer_value() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-announce-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    let announce = dir.join("listen");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--announce")
        .arg(&announce)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    let stdout = String::from_utf8(ran.stdout).unwrap();
    let line = stdout
        .lines()
        .next()
        .and_then(|first| first.strip_prefix("listen "))
        .unwrap_or("");
    assert!(line.contains("/p2p/12D3KooW"), "{stdout}");
    let hash = genesis_fingerprint(&std::fs::read_to_string(&genesis).unwrap())
        .unwrap()
        .hash;
    let mut hex_hash = String::with_capacity(64);
    for byte in hash {
        hex_hash.push_str(&format!("{byte:02x}"));
    }
    assert_eq!(
        std::fs::read_to_string(&announce).unwrap(),
        format!("{line}\n# genesis {hex_hash}\n")
    );
    let read = read_peer_file(&announce).unwrap();
    assert_eq!(read.peers.len(), 1);
    assert_eq!(read.genesis, Some(hash));
    parse_configured_peer(line).unwrap();
    let refused = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .arg("--announce")
        .arg(&announce)
        .output()
        .unwrap();
    assert_eq!(refused.status.code(), Some(2));
    let failed = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(dir.join("other"))
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--announce")
        .arg(&dir)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(failed.status.code(), Some(1));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_different_announced_genesis_does_not_create_the_chain_file() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-announce-genesis-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    let announce = dir.join("listen");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    let text = format!("validator validator-b {public}\n");
    std::fs::write(&genesis, &text).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--announce")
        .arg(&announce)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    let hash = genesis_fingerprint(&text).unwrap().hash;
    assert_eq!(read_peer_file(&announce).unwrap().genesis, Some(hash));
    let follower = dir.join("follower");
    let other = dir.join("other");
    let other_key = hex(&arkhe_chain::public_key(&common::SECRET_A).unwrap());
    std::fs::write(&other, format!("validator validator-a {other_key}\n")).unwrap();
    std::fs::write(dir.join("other-key"), hex(&common::SECRET_A)).unwrap();
    let refused = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&follower)
        .arg("--id")
        .arg("validator-a")
        .arg("--key")
        .arg(dir.join("other-key"))
        .arg("--genesis")
        .arg(&other)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer-file")
        .arg(&announce)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(refused.status.code(), Some(1));
    assert!(refused.stdout.is_empty());
    assert_eq!(
        String::from_utf8(refused.stderr).unwrap(),
        "FAIL_CLOSED: GENESIS\n"
    );
    assert!(!follower.exists());
    let noted = dir.join("noted");
    let mut noted_text = std::fs::read_to_string(&announce).unwrap();
    noted_text.push_str("# genesis ");
    noted_text.push_str(&"11".repeat(32));
    noted_text.push('\n');
    std::fs::write(&noted, noted_text).unwrap();
    let malformed = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(dir.join("third"))
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer-file")
        .arg(&noted)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(malformed.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(malformed.stderr).unwrap(),
        "FAIL_CLOSED: MALFORMED\n"
    );
    assert!(!dir.join("third").exists());
    let same = dir.join("same");
    let mut only = String::from("# genesis ");
    for byte in hash {
        only.push_str(&format!("{byte:02x}"));
    }
    only.push('\n');
    std::fs::write(&same, only).unwrap();
    let created = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(dir.join("fourth"))
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer-file")
        .arg(&same)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(created.status.code(), Some(0), "{}", String::from_utf8_lossy(&created.stderr));
    assert!(dir.join("fourth").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_synced_seal_uses_the_parent_timestamp_plus_one() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-seal-after-sync-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let mut text = String::new();
    for validator in common::validators() {
        text.push_str(&format!(
            "validator {} {}\n",
            validator.id,
            hex(&validator.public_key)
        ));
    }
    for account in common::accounts() {
        text.push_str(&format!(
            "account {} {}",
            account.id,
            hex(&account.public_key)
        ));
        if let Some(key) = account.mldsa_public_key {
            text.push(' ');
            text.push_str(&hex(&key));
        }
        text.push('\n');
    }
    let genesis = dir.join("genesis");
    std::fs::write(&genesis, &text).unwrap();
    let server_key = dir.join("server-key");
    let client_key = dir.join("client-key");
    std::fs::write(&server_key, hex(&common::SECRET_A)).unwrap();
    std::fs::write(&client_key, hex(&common::SECRET_B)).unwrap();
    let first = encode_tx_list(&[common::transfer(0, GENESIS_ACCOUNT, "bob", 25)]).unwrap();
    let second = encode_tx_list(&[common::transfer(1, GENESIS_ACCOUNT, "bob", 10)]).unwrap();
    std::fs::write(dir.join("first"), &first).unwrap();
    std::fs::write(dir.join("second"), &second).unwrap();
    let announce = dir.join("listen");
    struct Stop(std::process::Child);
    impl Drop for Stop {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let mut server = Stop(
        std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
            .arg("--data")
            .arg(dir.join("server"))
            .arg("--id")
            .arg("validator-a")
            .arg("--key")
            .arg(&server_key)
            .arg("--genesis")
            .arg(&genesis)
            .arg("--listen")
            .arg("/ip4/127.0.0.1/tcp/0")
            .arg("--tx")
            .arg(dir.join("first"))
            .arg("--seal")
            .arg("--time")
            .arg("1700000000")
            .arg("--announce")
            .arg(&announce)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap(),
    );
    let mut peer = String::new();
    for _ in 0..50 {
        if let Ok(text) = std::fs::read_to_string(&announce) {
            if let Some(line) = text.lines().next() {
                if line.contains("/p2p/") {
                    peer = line.to_string();
                    break;
                }
            }
        }
        if server.0.try_wait().unwrap().is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(peer.contains("/p2p/"), "the server exited before sealing");
    let client = dir.join("client");
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&client)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&client_key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer")
        .arg(&peer)
        .arg("--tx")
        .arg(dir.join("second"))
        .arg("--seal")
        .arg("--time")
        .arg("50")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    assert!(ran.stderr.is_empty());
    let opened = arkhe_chain::ArkheNode::open(
        &client,
        "validator-b",
        &common::SECRET_B,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(opened.height().unwrap(), 2);
    assert_eq!(opened.header_at(1).unwrap().timestamp, 1_700_000_000);
    assert_eq!(opened.header_at(2).unwrap().timestamp, 1_700_000_001);
    assert_eq!(opened.precommit_count(2).unwrap(), 2);
    assert_eq!(opened.precommit_round(2, "validator-b").unwrap(), Some(0));
    assert_eq!(opened.precommit_round(2, "validator-a").unwrap(), Some(0));
    assert_eq!(opened.committed_height().unwrap(), 2);
    let tip = opened.tip().unwrap();
    drop(opened);
    drop(server);
    let server_node = arkhe_chain::ArkheNode::open(
        dir.join("server"),
        "validator-a",
        &common::SECRET_A,
        common::validators(),
        common::accounts(),
    )
    .unwrap();
    assert_eq!(server_node.height().unwrap(), 2);
    assert_eq!(server_node.tip().unwrap(), tip);
    assert_eq!(server_node.header_at(2).unwrap().timestamp, 1_700_000_001);
    assert_eq!(server_node.precommit_count(2).unwrap(), 2);
    assert_eq!(server_node.committed_height().unwrap(), 2);
    assert_eq!(server_node.fork_count().unwrap(), 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_failed_first_dial_removes_the_file_it_just_created() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-fresh-dial-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let server_genesis = dir.join("server-genesis");
    let client_genesis = dir.join("client-genesis");
    let mut server_text = String::new();
    let mut client_text = String::new();
    for validator in common::validators() {
        let line = format!("validator {} {}\n", validator.id, hex(&validator.public_key));
        server_text.push_str(&line);
        client_text.push_str(&line);
    }
    for (index, account) in common::accounts().into_iter().enumerate() {
        let mut line = format!("account {} {}", account.id, hex(&account.public_key));
        if let Some(key) = account.mldsa_public_key {
            line.push(' ');
            line.push_str(&hex(&key));
        }
        line.push('\n');
        server_text.push_str(&line);
        if index == 0 {
            client_text.push_str(&line);
        }
    }
    std::fs::write(&server_genesis, &server_text).unwrap();
    std::fs::write(&client_genesis, &client_text).unwrap();
    let server_key = dir.join("server-key");
    let client_key = dir.join("client-key");
    std::fs::write(&server_key, hex(&common::SECRET_A)).unwrap();
    std::fs::write(&client_key, hex(&common::SECRET_B)).unwrap();
    let announce = dir.join("listen");
    struct Stop(std::process::Child);
    impl Drop for Stop {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let mut server = Stop(
        std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
            .arg("--data")
            .arg(dir.join("server"))
            .arg("--id")
            .arg("validator-a")
            .arg("--key")
            .arg(&server_key)
            .arg("--genesis")
            .arg(&server_genesis)
            .arg("--listen")
            .arg("/ip4/127.0.0.1/tcp/0")
            .arg("--announce")
            .arg(&announce)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap(),
    );
    let mut peer = String::new();
    for _ in 0..50 {
        if let Ok(text) = std::fs::read_to_string(&announce) {
            if let Some(line) = text.lines().next() {
                if line.contains("/p2p/") {
                    peer = line.to_string();
                    break;
                }
            }
        }
        if server.0.try_wait().unwrap().is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(peer.contains("/p2p/"), "the server exited before announcing");
    let fresh = dir.join("fresh");
    let refused = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&fresh)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&client_key)
        .arg("--genesis")
        .arg(&client_genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer")
        .arg(&peer)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(refused.status.code(), Some(1), "{}", String::from_utf8_lossy(&refused.stderr));
    assert!(refused.stdout.is_empty());
    assert_eq!(
        String::from_utf8(refused.stderr).unwrap(),
        "FAIL_CLOSED: P2P: genesis\n"
    );
    assert!(!fresh.exists());
    let kept = dir.join("kept");
    let created = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&kept)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&client_key)
        .arg("--genesis")
        .arg(&client_genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(created.status.code(), Some(0), "{}", String::from_utf8_lossy(&created.stderr));
    let before = std::fs::read(&kept).unwrap();
    let again = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&kept)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&client_key)
        .arg("--genesis")
        .arg(&client_genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer")
        .arg(&peer)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(again.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(again.stderr).unwrap(),
        "FAIL_CLOSED: P2P: genesis\n"
    );
    assert_eq!(std::fs::read(&kept).unwrap(), before);
    drop(server);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_peer_file_lists_only_the_named_addresses() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-peer-file-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let peers = dir.join("peers");
    let line = "/ip4/127.0.0.1/tcp/9/p2p/12D3KooWPqT2nMDSiXUSx5D7fasaxhxKigVhcqfkKqrLghCq9jxz";
    std::fs::write(&peers, format!("\n# comment\n{line}\n")).unwrap();
    let read = read_peer_file(&peers).unwrap();
    assert_eq!(read.peers.len(), 1);
    assert_eq!(read.peers[0].addr.to_string(), "/ip4/127.0.0.1/tcp/9");
    assert_eq!(read.genesis, None);
    // A UTF-8 BOM must not turn `# genesis <hash>` into a multiaddr.
    let hash = [0xab; 32];
    let mut bombed = vec![0xef, 0xbb, 0xbf];
    bombed.extend_from_slice(format!("# genesis {}\n{line}\n", hex(&hash)).as_bytes());
    std::fs::write(&peers, bombed).unwrap();
    let read = read_peer_file(&peers).unwrap();
    assert_eq!(read.peers.len(), 1);
    assert_eq!(read.genesis, Some(hash));
    std::fs::write(&peers, format!("{line}\nnot-an-address\n")).unwrap();
    assert_eq!(read_peer_file(&peers).unwrap_err(), ChainError::Malformed);
    assert_eq!(
        read_peer_file(&dir.join("missing")).unwrap_err(),
        ChainError::Snapshot
    );

    let data = dir.join("chain");
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    std::fs::write(&peers, "# nobody\n").unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&data)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer-file")
        .arg(&peers)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    std::fs::write(&peers, "not-an-address\n").unwrap();
    let bad = dir.join("bad-chain");
    let failed = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(&bad)
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer-file")
        .arg(&peers)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(failed.status.code(), Some(1));
    assert!(!bad.exists());
    std::fs::write(&peers, "# nobody\n").unwrap();
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&data)
        .arg("--peer-file")
        .arg(&peers)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(2));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_chain_error_is_printed_before_exit() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-error-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let missing = dir.join("missing");
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .arg("--data")
        .arg(&missing)
        .output()
        .unwrap();
    assert_eq!(status.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(status.stderr).unwrap(),
        "FAIL_CLOSED: SNAPSHOT\n"
    );
    assert!(status.stdout.is_empty());
    assert!(!missing.exists());

    let usage = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--status")
        .output()
        .unwrap();
    assert_eq!(usage.status.code(), Some(2));
    assert!(usage.stderr.is_empty());

    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    let peers = dir.join("peers");
    std::fs::write(&peers, "not-an-address\n").unwrap();
    let failed = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(dir.join("chain"))
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--peer-file")
        .arg(&peers)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(failed.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(failed.stderr).unwrap(),
        "FAIL_CLOSED: MALFORMED\n"
    );
    assert!(!dir.join("chain").exists());
    let refused = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(dir.join("other"))
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--announce")
        .arg(&dir)
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(refused.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(refused.stderr).unwrap(),
        "FAIL_CLOSED: SNAPSHOT\n"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn show_genesis_hashes_the_parsed_file_and_opens_nothing() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-genesis-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let genesis = dir.join("genesis");
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    let text = format!("validator validator-b {public}\n");
    let commented = format!("\n# comment\nvalidator validator-b {}\n\n", public.to_uppercase());
    let fingerprint = genesis_fingerprint(&text).unwrap();
    assert_eq!(genesis_fingerprint(&commented).unwrap().hash, fingerprint.hash);
    assert_eq!(fingerprint.validators, 1);
    assert_eq!(fingerprint.accounts, 0);
    let changed = format!("{text}validator validator-a {public}\n");
    assert_ne!(genesis_fingerprint(&changed).unwrap().hash, fingerprint.hash);
    std::fs::write(&genesis, commented).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--show-genesis")
        .arg("--genesis")
        .arg(&genesis)
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(0));
    assert_eq!(
        String::from_utf8(ran.stdout).unwrap(),
        format_genesis(&fingerprint)
    );
    assert!(!dir.join("chain").exists());
    let empty = dir.join("empty");
    std::fs::write(&empty, "# nobody\n").unwrap();
    let failed = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--show-genesis")
        .arg("--genesis")
        .arg(&empty)
        .output()
        .unwrap();
    assert_eq!(failed.status.code(), Some(1));
    assert_eq!(
        String::from_utf8(failed.stderr).unwrap(),
        "FAIL_CLOSED: EMPTY_VALIDATORS\n"
    );
    let usage = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--show-genesis")
        .output()
        .unwrap();
    assert_eq!(usage.status.code(), Some(2));
    assert!(usage.stderr.is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_status_line_is_printed_only_when_it_changes() {
    let same = ChainStatus {
        height: 0,
        committed: 0,
        tip: [0; 32],
        mempool: 0,
        forks: 0,
        genesis: Some([0; 32]),
    };
    assert!(next_status_line(&same, &same).is_none());
    let waiting = ChainStatus {
        mempool: 1,
        ..same.clone()
    };
    let line = next_status_line(&same, &waiting).unwrap();
    assert_eq!(line, format_status(&waiting));
    assert!(line.contains("height 0\n"));
    assert!(line.contains("mempool 1\n"));
    let other = ChainStatus {
        genesis: Some([1; 32]),
        ..same
    };
    let changed = next_status_line(&waiting, &other).unwrap();
    assert!(changed.contains(&format!("genesis {}\n", "01".repeat(32))));
    assert!(format_status(&ChainStatus {
        genesis: None,
        ..other
    })
    .contains("genesis absent\n"));
}

#[test]
fn seal_without_a_timestamp_exits_with_usage() {
    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-seal-usage-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let key = dir.join("key");
    let genesis = dir.join("genesis");
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    std::fs::write(&genesis, format!("validator validator-b {public}\n")).unwrap();
    let ran = std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
        .arg("--data")
        .arg(dir.join("chain"))
        .arg("--id")
        .arg("validator-b")
        .arg("--key")
        .arg(&key)
        .arg("--genesis")
        .arg(&genesis)
        .arg("--listen")
        .arg("/ip4/127.0.0.1/tcp/0")
        .arg("--seal")
        .arg("--once")
        .output()
        .unwrap();
    assert_eq!(ran.status.code(), Some(2));
    let _ = std::fs::remove_dir_all(&dir);
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn a_genesis_grant_line_is_parsed_hashed_and_opened_by_the_process() {
    use arkhe_chain::{parse_genesis_grants, ArkheNode, Role};

    let public = hex(&arkhe_chain::public_key(&common::SECRET_B).unwrap());
    let base = format!("validator validator-b {public}\naccount bob {public}\naccount root {public}\n");
    let text = format!("{base}# roles\ngrant bob approver root 500\ngrant bob evaluator root 7\n");

    let grants = parse_genesis_grants(&text).unwrap();
    assert_eq!(grants.len(), 2);
    assert_eq!(
        (grants[0].delegate.as_str(), grants[0].role, grants[0].grantor.as_str(), grants[0].expires),
        ("bob", Role::Approver, "root", 500)
    );
    assert_eq!((grants[1].role, grants[1].expires), (Role::Evaluator, 7));
    assert!(parse_genesis_grants(&base).unwrap().is_empty());
    let (validators, accounts) = parse_genesis(&text).unwrap();
    assert_eq!((validators.len(), accounts.len()), (1, 2));

    for bad in [
        "grant bob approver root",
        "grant bob approver root 500 extra",
        "grant bob owner root 500",
        "grant bob Approver root 500",
        "grant bob approver root 0500",
        "grant bob approver root +5",
        "grant bob approver root -1",
    ] {
        let text = format!("{base}{bad}\n");
        assert!(matches!(parse_genesis(&text), Err(ChainError::Malformed)), "{bad}");
        assert!(matches!(parse_genesis_grants(&text), Err(ChainError::Malformed)), "{bad}");
    }

    let with = genesis_fingerprint(&text).unwrap();
    let without = genesis_fingerprint(&base).unwrap();
    assert_ne!(with.hash, without.hash);
    assert_eq!((with.validators, with.accounts), (1, 2));
    let node = ArkheNode::new_with_grants("validator-b", &common::SECRET_B, validators, accounts, grants).unwrap();
    assert_eq!(node.genesis_hash(), with.hash);

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-grants-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let (data, key, genesis) = (dir.join("chain"), dir.join("key"), dir.join("genesis"));
    std::fs::write(&key, hex(&common::SECRET_B)).unwrap();
    let run = |text: &str| {
        std::fs::write(&genesis, text).unwrap();
        std::process::Command::new(env!("CARGO_BIN_EXE_arkhe-chain"))
            .arg("--data")
            .arg(&data)
            .arg("--id")
            .arg("validator-b")
            .arg("--key")
            .arg(&key)
            .arg("--genesis")
            .arg(&genesis)
            .arg("--listen")
            .arg("/ip4/127.0.0.1/tcp/0")
            .arg("--once")
            .output()
            .unwrap()
    };

    // A grant to an account the genesis does not name does not create the file.
    let unknown = run(&format!("{base}grant carol approver root 500\n"));
    assert_ne!(unknown.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&unknown.stderr).contains("BAD_ACCOUNT"));
    assert!(!data.exists());

    let ran = run(&text);
    assert_eq!(ran.status.code(), Some(0), "{}", String::from_utf8_lossy(&ran.stderr));
    assert!(String::from_utf8(ran.stdout).unwrap().contains(&format!("genesis {}\n", hex(&with.hash))));

    // The stored file opens only with the same grants.
    let other = run(&base);
    assert_ne!(other.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&other.stderr).contains("GENESIS"));
    let longer = run(&text.replace(" 500", " 501"));
    assert_ne!(longer.status.code(), Some(0));
    assert_eq!(run(&text).status.code(), Some(0));

    let open = |grants| {
        let (validators, accounts) = parse_genesis(&text).unwrap();
        ArkheNode::open_with_grants(&data, "validator-b", &common::SECRET_B, validators, accounts, grants)
    };
    assert!(matches!(open(Vec::new()), Err(ChainError::Genesis)));
    let node = open(parse_genesis_grants(&text).unwrap()).unwrap();
    assert_eq!(node.genesis_hash(), with.hash);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn the_sealing_operator_takes_lists_from_the_inbox_and_seals_them() {
    use arkhe_chain::{run_operator, OperatorRequest};

    let dir = std::env::temp_dir().join(format!(
        "arkhe-chain-inbox-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let inbox = dir.join("inbox");
    std::fs::create_dir_all(&inbox).unwrap();
    let mut genesis = format!(
        "validator validator-a {}\n",
        hex(&arkhe_chain::public_key(&common::SECRET_A).unwrap())
    );
    for account in common::accounts() {
        genesis.push_str(&format!(
            "account {} {} {}\n",
            account.id,
            hex(&account.public_key),
            hex(&account.mldsa_public_key.unwrap())
        ));
    }
    let handle = run_operator(OperatorRequest {
        data: dir.join("chain"),
        id: "validator-a".into(),
        secret: common::SECRET_A,
        genesis,
        listen: "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
        peers: Vec::new(),
        once: false,
        txs: Vec::new(),
        seal_at: Some(1_700_000_000),
        announce: None,
    })
    .await
    .unwrap();

    assert!(handle.take_inbox(&inbox).unwrap().is_empty());
    let list = |nonce, recipient: &str| {
        encode_tx_list(&[common::transfer(nonce, GENESIS_ACCOUNT, recipient, 25)]).unwrap()
    };
    std::fs::write(inbox.join("0002-late.txs"), list(5, "carol")).unwrap();
    std::fs::write(inbox.join("0001-first.txs"), list(0, "bob")).unwrap();
    let mut short = list(1, "dave");
    short.pop();
    std::fs::write(inbox.join("0003-short.txs"), short).unwrap();
    std::fs::write(inbox.join("notes.txt"), b"not a list").unwrap();
    std::fs::write(inbox.join("0004-writing.txs.partial"), list(1, "erin")).unwrap();

    let taken = handle.take_inbox(&inbox).unwrap();
    let seen: Vec<_> = taken.iter().map(|file| (file.name.as_str(), file.outcome.clone())).collect();
    assert_eq!(
        seen,
        vec![
            ("0001-first.txs", Ok(1)),
            ("0002-late.txs", Err(ChainError::BadNonce)),
            ("0003-short.txs", Err(ChainError::Malformed)),
        ]
    );
    for name in ["0001-first.txs.done", "0002-late.txs.rejected", "0003-short.txs.rejected", "notes.txt", "0004-writing.txs.partial"] {
        assert!(inbox.join(name).exists(), "{name}");
    }
    assert!(handle.take_inbox(&inbox).unwrap().is_empty());

    let before = handle.status().unwrap();
    assert_eq!((before.height, before.mempool), (0, 1));
    handle.catch_up().await.unwrap();
    let after = handle.status().unwrap();
    assert_eq!((after.height, after.mempool), (1, 0));
    assert!(handle.take_inbox(&dir.join("absent")).is_err());
    drop(handle);
    let _ = std::fs::remove_dir_all(&dir);
}
