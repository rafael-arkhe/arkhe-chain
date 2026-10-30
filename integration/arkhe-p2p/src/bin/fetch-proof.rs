use arkhe_p2p::{
    discovery::Candidate, transport::BlossomTransport, verify::ExpectedDigests, EndpointPolicy,
    Limits,
};
use std::{
    path::Path,
    time::{Duration, Instant},
};
use url::Url;

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("retrieval not verifiable: {error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 4 && !(args.len() == 5 && args[4] == "--allow-loopback") {
        return Err(
            "usage: fetch-proof <origin> <sha256> <blake3> <new-output-file> [--allow-loopback]"
                .into(),
        );
    }
    let origin = Url::parse(&args[0])?;
    let sha256: [u8; 32] = hex::decode(&args[1])?
        .try_into()
        .map_err(|_| "invalid SHA-256 length")?;
    let blake3: [u8; 32] = hex::decode(&args[2])?
        .try_into()
        .map_err(|_| "invalid BLAKE3 length")?;
    let candidate = Candidate {
        url: origin.join(&hex::encode(sha256))?,
        sha256,
        mime: None,
        publisher: None,
    };
    let transport = BlossomTransport::new(
        vec![origin],
        EndpointPolicy {
            allow_cleartext_loopback: args.len() == 5,
        },
    )?;
    let started = Instant::now();
    let blob = transport
        .fetch(
            &candidate,
            ExpectedDigests { sha256, blake3 },
            Limits {
                max_bytes: 16 * 1024 * 1024,
                deadline: Duration::from_secs(10),
            },
        )
        .await?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    // Caller receives a file only after both digests pass. Never overwrite one.
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(Path::new(&args[3]))?;
    std::io::Write::write_all(&mut file, blob.bytes())?;
    println!(
        "{}",
        serde_json::json!({
            "integrity_verified": true, "bytes": blob.bytes().len(), "elapsed_ms": elapsed_ms,
            "sha256": hex::encode(sha256), "blake3": hex::encode(blake3),
        })
    );
    Ok(())
}
