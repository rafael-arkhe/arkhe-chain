from pathlib import Path

def sub(path, old, new, count=1):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{path}: expected {count} of {old[:80]!r}, found {found}")
    target = Path(str(file) + ".new")
    target.write_bytes(text.replace(old, new, count).encode("utf-8"))
    file.unlink()
    target.replace(file)

p2p = r"D:\arkhe\kernel\arkhe-chain\src\p2p.rs"
sub(
    p2p,
    """/// Those peers are not dialed again in this call. If no named peer accepts a
/// vote, an unanswered peer yields `P2p("timeout")` and a different genesis
/// yields `P2p("genesis")`. The local vote stays. Votes learned from the named peers are then forwarded to that
""",
    """/// Those peers are not dialed again in this call. A peer id that is not a
/// validator does not end this walk and is not dialed again in this call. If
/// no named peer accepts a vote, an unanswered peer yields `P2p("timeout")`,
/// a different genesis yields `P2p("genesis")`, a peer that does not speak
/// the protocol yields `P2p("unsupported-protocol")`, and an outsider yields
/// `P2p("peer")`. The local vote stays. Votes learned from the named peers are then forwarded to that
""",
)
sub(
    p2p,
    """        let mut unanswered = Vec::new();
        let mut foreign = Vec::new();
        let mut silent = Vec::new();
        let mut reached = false;
        for peer in peers {
            deliver_configured(
                node,
                peer,
                &vote,
                &mut unanswered,
                &mut foreign,
                &mut silent,
                &mut reached,
            )
            .await?;
        }
        for stored in node.precommits_at(height)? {
            if stored.validator_id == node.node_id() {
                continue;
            }
            for peer in peers {
                deliver_configured(
                    node,
                    peer,
                    &stored,
                    &mut unanswered,
                    &mut foreign,
                    &mut silent,
                    &mut reached,
                )
                .await?;
            }
        }
        if !reached && !unanswered.is_empty() {
            return Err(ChainError::P2p("timeout"));
        }
        if !reached && !foreign.is_empty() {
            return Err(ChainError::P2p("genesis"));
        }
        if !reached && !silent.is_empty() {
            return Err(ChainError::P2p("unsupported-protocol"));
        }
""",
    """        let mut unanswered = Vec::new();
        let mut foreign = Vec::new();
        let mut silent = Vec::new();
        let mut outsiders = Vec::new();
        let mut reached = false;
        for peer in peers {
            deliver_configured(
                node,
                peer,
                &vote,
                &mut unanswered,
                &mut foreign,
                &mut silent,
                &mut outsiders,
                &mut reached,
            )
            .await?;
        }
        for stored in node.precommits_at(height)? {
            if stored.validator_id == node.node_id() {
                continue;
            }
            for peer in peers {
                deliver_configured(
                    node,
                    peer,
                    &stored,
                    &mut unanswered,
                    &mut foreign,
                    &mut silent,
                    &mut outsiders,
                    &mut reached,
                )
                .await?;
            }
        }
        if !reached && !unanswered.is_empty() {
            return Err(ChainError::P2p("timeout"));
        }
        if !reached && !foreign.is_empty() {
            return Err(ChainError::P2p("genesis"));
        }
        if !reached && !silent.is_empty() {
            return Err(ChainError::P2p("unsupported-protocol"));
        }
        if !reached && !outsiders.is_empty() {
            return Err(ChainError::P2p("peer"));
        }
""",
)
sub(
    p2p,
    """    unanswered: &mut Vec<ConfiguredPeer>,
    foreign: &mut Vec<ConfiguredPeer>,
    silent: &mut Vec<ConfiguredPeer>,
    reached: &mut bool,
) -> Result<(), ChainError> {
    if unanswered.iter().any(|item| item == peer)
        || foreign.iter().any(|item| item == peer)
        || silent.iter().any(|item| item == peer)
    {
        return Ok(());
    }
""",
    """    unanswered: &mut Vec<ConfiguredPeer>,
    foreign: &mut Vec<ConfiguredPeer>,
    silent: &mut Vec<ConfiguredPeer>,
    outsiders: &mut Vec<ConfiguredPeer>,
    reached: &mut bool,
) -> Result<(), ChainError> {
    if unanswered.iter().any(|item| item == peer)
        || foreign.iter().any(|item| item == peer)
        || silent.iter().any(|item| item == peer)
        || outsiders.iter().any(|item| item == peer)
    {
        return Ok(());
    }
""",
)
sub(
    p2p,
    """        Err(ChainError::P2p("unsupported-protocol")) => {
            silent.push(peer.clone());
            Ok(())
        }
        Err(error) => Err(error),
""",
    """        Err(ChainError::P2p("unsupported-protocol")) => {
            silent.push(peer.clone());
            Ok(())
        }
        Err(ChainError::P2p("peer")) => {
            outsiders.push(peer.clone());
            Ok(())
        }
        Err(error) => Err(error),
""",
)
sub(
    p2p,
    """/// tip that is not 32 bytes does not end the list. Alone, that result stays
/// `P2p("tip")` and nothing is stored. Any other error
/// stops the rest of the list. There is no
/// discovery and no retry of a refused validator.
""",
    """/// tip that is not 32 bytes does not end the list. Alone, that result stays
/// `P2p("tip")` and nothing is stored. A peer id that is not a validator
/// does not end the list. Alone, that result stays `P2p("peer")` and nothing
/// is stored. Any other error
/// stops the rest of the list. There is no
/// discovery and no retry of a refused validator.
""",
)
sub(
    p2p,
    """    let mut saw_tip = false;
    let mut imported_total = 0u64;
""",
    """    let mut saw_tip = false;
    let mut saw_outsider = false;
    let mut imported_total = 0u64;
""",
)
sub(
    p2p,
    """            Err(ChainError::P2p("tip")) => saw_tip = true,
            Err(error) => return Err(error),
""",
    """            Err(ChainError::P2p("tip")) => saw_tip = true,
            Err(ChainError::P2p("peer")) => saw_outsider = true,
            Err(error) => return Err(error),
""",
)
sub(
    p2p,
    """    } else if saw_fork {
        Err(ChainError::P2p("fork"))
    } else if saw_self {
""",
    """    } else if saw_fork {
        Err(ChainError::P2p("fork"))
    } else if saw_outsider {
        Err(ChainError::P2p("peer"))
    } else if saw_self {
""",
)

test = r"D:\arkhe\kernel\arkhe-chain\tests\block_sync.rs"
sub(
    test,
    "async fn configured_peers_skip_self_and_stop_on_an_outsider() {",
    '''async fn an_outsider_does_not_hide_a_peer_that_extends_the_local_tip() {
    let outsider = ConfiguredPeer {
        addr: "/ip4/127.0.0.1/tcp/9".parse().unwrap(),
        peer_id: common::outsider().peer_id(),
    };
    let client = common::peer();
    let alone = sync_configured(&client, &[outsider.clone()])
        .await
        .unwrap_err();
    assert_eq!(alone, ChainError::P2p("peer"));
    assert_eq!(client.height().unwrap(), 0);
    assert_eq!(client.balance("bob").unwrap(), 0);
    assert_eq!(client.fork_count().unwrap(), 0);

    let server_node = Arc::new(common::node());
    server_node
        .ingest(common::transfer(0, GENESIS_ACCOUNT, "bob", 25))
        .unwrap();
    server_node.propose_and_seal_block(TS).unwrap();
    let tip = server_node.tip().unwrap();
    let server = spawn_server(Arc::clone(&server_node)).await.unwrap();
    let live = ConfiguredPeer {
        addr: server.listen_addr.clone(),
        peer_id: server.local_peer_id,
    };
    let imported = sync_configured(&client, &[outsider.clone(), live.clone()])
        .await
        .unwrap();
    assert_eq!(imported, 1);
    assert_eq!(client.height().unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(client.balance("bob").unwrap(), 25);
    assert_eq!(client.fork_count().unwrap(), 0);

    let refused = attest_configured(&client, &common::SECRET_B, &[outsider.clone()])
        .await
        .unwrap_err();
    assert_eq!(refused, ChainError::P2p("peer"));
    assert_eq!(client.committed_height().unwrap(), 0);
    assert_eq!(client.precommit_count(1).unwrap(), 1);
    assert_eq!(client.tip().unwrap(), tip);

    let committed = attest_configured(&client, &common::SECRET_B, &[outsider, live])
        .await
        .unwrap();
    assert_eq!(committed, 1);
    assert_eq!(client.committed_height().unwrap(), 1);
    assert_eq!(server_node.committed_height().unwrap(), 1);
    assert_eq!(client.precommit_count(1).unwrap(), 2);
    assert_eq!(server_node.precommit_count(1).unwrap(), 2);
    assert_eq!(client.tip().unwrap(), tip);
    assert_eq!(server_node.tip().unwrap(), tip);
}

#[tokio::test]
async fn configured_peers_skip_self_and_stop_on_an_outsider() {''',
)

sub(
    r"D:\arkhe\kernel\arkhe-chain\docs\sincronizacao.md",
    'Sozinho, o resultado continua `P2p("tip")` e nada é gravado. O import que fecha',
    'Sozinho, o resultado continua `P2p("tip")` e nada é gravado. Um par que não é validador não esconde o par seguinte. Sozinho, o resultado continua `P2p("peer")` e nada é gravado. O import que fecha',
)
sub(
    r"D:\arkhe\kernel\arkhe-chain\docs\homologacao.md",
    'Sozinho, o resultado continua `P2p("tip")` e nada é gravado. `AKGCHNS6` abre',
    'Sozinho, o resultado continua `P2p("tip")` e nada é gravado. Um par que não é validador não esconde o par seguinte. Sozinho, o resultado continua `P2p("peer")` e nada é gravado. `AKGCHNS6` abre',
)
print("patched")
