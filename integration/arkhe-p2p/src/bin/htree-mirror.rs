//! Mirror one Hashtree root from a Blossom origin into a new directory, then
//! optionally verify files against an expectation produced from another source.
//! No publisher key, upload, Nostr lookup or mutable `npub/…` resolution.
use arkhe_p2p::{
    hashtree::{
        child_links, verify_block, DirBlockSource, HashtreeCid, HashtreeVerifier, TreeLimits,
    },
    transport::BlossomTransport,
    verify::ExpectedDigests,
    EndpointPolicy, Limits,
};
use std::{collections::HashSet, path::Path, time::Duration};
use url::Url;

const USAGE: &str = "usage: htree-mirror <origin> <nhash | root_hex:key_hex> <new-dir> \
                     [--expected expected.json] [--allow-loopback]";

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("mirror not verifiable: {error}");
        std::process::exit(1);
    }
}

fn hex32(text: &str) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    Ok(hex::decode(text)?
        .try_into()
        .map_err(|_| "expected 32 bytes")?)
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let loopback = take_flag(&mut args, "--allow-loopback");
    let expected = take_value(&mut args, "--expected")?;
    let [origin, root, out] = <[String; 3]>::try_from(args).map_err(|_| USAGE)?;
    let root = match root.split_once(':') {
        Some((hash, key)) => HashtreeCid {
            hash: hex32(hash)?,
            key: Some(hex32(key)?),
        },
        None => HashtreeCid::from_nhash(&root)?,
    };
    let out = Path::new(&out);
    if out.exists() {
        return Err("output directory must not exist".into());
    }
    let transport = BlossomTransport::new(
        vec![Url::parse(&origin)?],
        EndpointPolicy {
            allow_cleartext_loopback: loopback,
        },
    )?;
    let store = DirBlockSource::new(out);
    let limits = TreeLimits::default();
    let per_block = Limits {
        max_bytes: 4 * 1024 * 1024,
        deadline: Duration::from_secs(30),
    };
    let (mut queue, mut seen, mut total) = (vec![(root.hash, root.key)], HashSet::new(), 0usize);
    while let Some((hash, key)) = queue.pop() {
        if !seen.insert(hash) {
            continue;
        }
        if seen.len() > limits.max_blocks {
            return Err("block limit exceeded".into());
        }
        let stored = transport.fetch_block(hash, per_block).await?;
        total += stored.len();
        if total > limits.max_fetched_bytes {
            return Err("byte limit exceeded".into());
        }
        let plain = verify_block(&stored, hash, key)?;
        queue.extend(child_links(&plain, limits.max_links));
        let path = store.path_for(&hash);
        std::fs::create_dir_all(path.parent().unwrap())?;
        std::fs::write(path, stored)?;
    }
    println!("mirrored {} blocks, {total} bytes", seen.len());
    let Some(expected) = expected else {
        return Ok(());
    };
    let doc: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(expected)?)?;
    let verifier = HashtreeVerifier::new(&store, root, limits);
    let files = doc["files"].as_array().ok_or("expected.files")?;
    for f in files {
        let digests = ExpectedDigests {
            sha256: hex32(f["sha256"].as_str().ok_or("sha256")?)?,
            blake3: hex32(f["blake3"].as_str().ok_or("blake3")?)?,
        };
        verifier.verify_file(f["path"].as_str().ok_or("path")?, digests)?;
    }
    println!("verified {} files against the expectation", files.len());
    Ok(())
}

fn take_flag(args: &mut Vec<String>, flag: &str) -> bool {
    let before = args.len();
    args.retain(|a| a != flag);
    args.len() != before
}

fn take_value(args: &mut Vec<String>, flag: &str) -> Result<Option<String>, &'static str> {
    let Some(i) = args.iter().position(|a| a == flag) else {
        return Ok(None);
    };
    if i + 1 >= args.len() {
        return Err(USAGE);
    }
    let value = args.remove(i + 1);
    args.remove(i);
    Ok(Some(value))
}
