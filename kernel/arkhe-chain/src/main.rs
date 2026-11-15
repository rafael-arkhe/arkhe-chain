use std::io::{self, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use arkhe_chain::{
    format_genesis, format_status, genesis_fingerprint, genesis_peer_lines, next_status_line,
    parse_configured_peer,
    read_operator_files, read_peer_file, read_status, run_operator, ChainError, OperatorRequest,
};

enum CliError {
    Usage,
    Failed(String),
}

fn main() -> ExitCode {
    match std::env::args().nth(1).as_deref() {
        None => ExitCode::from(2),
        Some("--help") => ExitCode::from(2),
        Some(_) => match parse_args(std::env::args().skip(1)) {
            Err(CliError::Usage) => ExitCode::from(2),
            Err(CliError::Failed(text)) => {
                eprintln!("{text}");
                ExitCode::from(1)
            }
            Ok((request, inbox)) => {
                let once = request.once;
                let runtime = match tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(err) => {
                        eprintln!("{err}");
                        return ExitCode::from(1);
                    }
                };
                match runtime.block_on(run_operator(request)) {
                    Ok(handle) => match handle.status() {
                        Err(err) => {
                            eprintln!("{err}");
                            ExitCode::from(1)
                        }
                        Ok(mut seen) => {
                            println!("listen {}", handle.listen_line());
                            print!("{}", format_status(&seen));
                            if once {
                                drop(handle);
                                ExitCode::SUCCESS
                            } else {
                                runtime.block_on(async {
                                    loop {
                                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                                        if let Some(dir) = &inbox {
                                            match handle.take_inbox(dir) {
                                                Ok(files) => {
                                                    for file in files {
                                                        match file.outcome {
                                                            Ok(count) => println!(
                                                                "inbox {} ingested {count}",
                                                                file.name
                                                            ),
                                                            Err(err) => println!(
                                                                "inbox {} rejected {err}",
                                                                file.name
                                                            ),
                                                        }
                                                    }
                                                    let _ = io::stdout().flush();
                                                }
                                                Err(err) => {
                                                    eprintln!("{err}");
                                                    return ExitCode::from(1);
                                                }
                                            }
                                        }
                                        if let Err(err) = handle.catch_up().await {
                                            eprintln!("{err}");
                                            return ExitCode::from(1);
                                        }
                                        match handle.status() {
                                            Ok(status) => {
                                                if let Some(line) = next_status_line(&seen, &status)
                                                {
                                                    print!("{line}");
                                                    let _ = io::stdout().flush();
                                                    seen = status;
                                                }
                                            }
                                            Err(err) => {
                                                eprintln!("{err}");
                                                return ExitCode::from(1);
                                            }
                                        }
                                    }
                                })
                            }
                        }
                    },
                    Err(err) => {
                        eprintln!("{err}");
                        ExitCode::from(1)
                    }
                }
            }
        },
    }
}

/// `--inbox <dir>` goes with `--seal` and without `--once`: only the sealing
/// process reads the directory, once per pass.
fn parse_args(
    args: impl Iterator<Item = String>,
) -> Result<(OperatorRequest, Option<PathBuf>), CliError> {
    let mut inbox = None;
    let mut data = None;
    let mut id = None;
    let mut key = None;
    let mut genesis = None;
    let mut listen = None;
    let mut peers = Vec::new();
    let mut once = false;
    let mut show_peers = false;
    let mut show_genesis = false;
    let mut status = false;
    let mut txs = None;
    let mut seal = false;
    let mut time = None;
    let mut announce = None;
    let mut peer_file = false;
    let mut announced_genesis = None;
    let mut args = args.peekable();
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--once" => once = true,
            "--show-peers" => show_peers = true,
            "--show-genesis" => show_genesis = true,
            "--status" => status = true,
            "--seal" => seal = true,
            "--data" => data = Some(need(&mut args)?),
            "--id" => id = Some(need(&mut args)?),
            "--key" => key = Some(need(&mut args)?),
            "--genesis" => genesis = Some(need(&mut args)?),
            "--listen" => listen = Some(need(&mut args)?),
            "--tx" => txs = Some(need(&mut args)?),
            "--time" => {
                let text = need(&mut args)?;
                time = Some(text.parse::<u64>().map_err(|_| CliError::Usage)?);
            }
            "--announce" => announce = Some(PathBuf::from(need(&mut args)?)),
            "--inbox" => inbox = Some(PathBuf::from(need(&mut args)?)),
            "--peer-file" => {
                peer_file = true;
                let path = need(&mut args)?;
                let file = read_peer_file(std::path::Path::new(&path)).map_err(failed)?;
                if let Some(hash) = file.genesis {
                    match announced_genesis {
                        Some(stored) if stored != hash => {
                            return Err(failed(ChainError::Malformed));
                        }
                        Some(_) => {}
                        None => announced_genesis = Some(hash),
                    }
                }
                peers.extend(file.peers);
            }
            "--peer" => peers.push(parse_configured_peer(&need(&mut args)?).map_err(failed)?),
            _ => return Err(CliError::Usage),
        }
    }
    if status as u8 + show_peers as u8 + show_genesis as u8 > 1 {
        return Err(CliError::Usage);
    }
    if inbox.is_some() && (status || show_peers || show_genesis || once || !seal) {
        return Err(CliError::Usage);
    }
    if let Some(dir) = &inbox {
        if !dir.is_dir() {
            return Err(failed(ChainError::Snapshot));
        }
    }
    if status {
        let Some(data) = data.as_deref() else {
            return Err(CliError::Usage);
        };
        if id.is_some()
            || key.is_some()
            || listen.is_some()
            || seal
            || time.is_some()
            || txs.is_some()
            || once
            || !peers.is_empty()
            || announce.is_some()
            || peer_file
            || show_genesis
            || inbox.is_some()
        {
            return Err(CliError::Usage);
        }
        let status = read_status(std::path::Path::new(data)).map_err(failed)?;
        if let Some(genesis) = genesis.as_deref() {
            let text = std::fs::read_to_string(genesis).map_err(|_| failed(ChainError::Snapshot))?;
            let fingerprint = genesis_fingerprint(&text).map_err(failed)?;
            match status.genesis {
                Some(stored) if stored == fingerprint.hash => {}
                _ => return Err(failed(ChainError::Genesis)),
            }
        }
        print!("{}", format_status(&status));
        std::process::exit(0);
    }
    if show_peers {
        let Some(genesis) = genesis.as_deref() else {
            return Err(CliError::Usage);
        };
        if data.is_some()
            || id.is_some()
            || key.is_some()
            || listen.is_some()
            || seal
            || time.is_some()
            || txs.is_some()
            || once
            || !peers.is_empty()
            || announce.is_some()
            || peer_file
            || show_genesis
            || inbox.is_some()
        {
            return Err(CliError::Usage);
        }
        let text = std::fs::read_to_string(genesis).map_err(|_| failed(ChainError::Snapshot))?;
        let lines = genesis_peer_lines(&text).map_err(failed)?;
        print!("{lines}");
        std::process::exit(0);
    }
    if show_genesis {
        let Some(genesis) = genesis.as_deref() else {
            return Err(CliError::Usage);
        };
        if data.is_some()
            || id.is_some()
            || key.is_some()
            || listen.is_some()
            || seal
            || time.is_some()
            || txs.is_some()
            || once
            || !peers.is_empty()
            || announce.is_some()
            || peer_file
            || inbox.is_some()
        {
            return Err(CliError::Usage);
        }
        let text = std::fs::read_to_string(genesis).map_err(|_| failed(ChainError::Snapshot))?;
        let fingerprint = genesis_fingerprint(&text).map_err(failed)?;
        print!("{}", format_genesis(&fingerprint));
        std::process::exit(0);
    }
    if seal != time.is_some() {
        return Err(CliError::Usage);
    }
    if let Some(expected) = announced_genesis {
        let Some(path) = genesis.as_deref() else {
            return Err(CliError::Usage);
        };
        let text = std::fs::read_to_string(path).map_err(|_| failed(ChainError::Snapshot))?;
        let fingerprint = genesis_fingerprint(&text).map_err(failed)?;
        if fingerprint.hash != expected {
            return Err(failed(ChainError::Genesis));
        }
    }
    let (data, id, key, genesis, listen) = match (data, id, key, genesis, listen) {
        (Some(data), Some(id), Some(key), Some(genesis), Some(listen)) => {
            (data, id, key, genesis, listen)
        }
        _ => return Err(CliError::Usage),
    };
    let listen = listen.parse().map_err(|_| failed(ChainError::Malformed))?;
    let (secret, genesis) =
        read_operator_files(PathBuf::from(key).as_path(), PathBuf::from(genesis).as_path())
            .map_err(failed)?;
    let txs = match txs {
        Some(path) => std::fs::read(path).map_err(|_| failed(ChainError::Snapshot))?,
        None => Vec::new(),
    };
    Ok((
        OperatorRequest {
            data: PathBuf::from(data),
            id,
            secret,
            genesis,
            listen,
            peers,
            once,
            txs,
            seal_at: time,
            announce,
        },
        inbox,
    ))
}

fn failed(err: ChainError) -> CliError {
    CliError::Failed(err.to_string())
}

fn need(args: &mut std::iter::Peekable<impl Iterator<Item = String>>) -> Result<String, CliError> {
    args.next().ok_or(CliError::Usage)
}
