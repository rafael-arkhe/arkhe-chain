use arkhe_superapp_pilot::*;
use std::{fs, path::PathBuf, sync::Arc};
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 3 {
        return Err("usage: run-client ARTIFACT_FILE_OR_HTTPS_URL TRUST_FILE AUDIT_FILE [consented-api ...]".into());
    }
    let artifact: Artifact = if args[0].starts_with("https://") || args[0].starts_with("http://") {
        fetch_artifact(&args[0])?
    } else {
        let data = fs::read(&args[0])?;
        if data.len() > MAX_BYTES * 8 {
            return Err("artifact too large".into());
        }
        serde_json::from_slice(&data)?
    };
    let trust: TrustRoot = serde_json::from_slice(&fs::read(&args[1])?)?;
    let client = Client::new(trust, Arc::new(SystemClock), PathBuf::from(&args[2]));
    let token = client.admit(&artifact, args[3..].to_vec())?;
    println!(
        "status={} digest={} metadata_query={}",
        client.status(&token),
        hex::encode(artifact.manifest.bundle_digest),
        token.can_query()
    );
    let result = client.execute(&token)?;
    println!("WASM_EXECUTED result={result}");
    Ok(())
}
