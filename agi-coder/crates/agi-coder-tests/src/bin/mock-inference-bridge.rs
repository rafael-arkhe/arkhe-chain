//! Test fixture only; never represents actual model execution.
use agi_coder_core::ContentHash;
use agi_coder_inference::{
    BridgeRequest, FinishReason, Generation, BRIDGE_PROTOCOL, DEEPINFER_REVISION,
};
use std::io::{Read, Write};
fn main() {
    let scenario = std::env::args().nth(1).unwrap_or_else(|| "ok".into());
    let mut bytes = Vec::new();
    std::io::stdin().read_to_end(&mut bytes).unwrap();
    let request: BridgeRequest = serde_json::from_slice(&bytes).unwrap();
    if scenario == "timeout" {
        std::thread::sleep(std::time::Duration::from_secs(30));
    }
    if scenario == "error" {
        eprintln!("sensitive prompt diagnostics must not leak into returned errors");
        std::process::exit(2);
    }
    if scenario == "stdout-overflow" {
        let _ = std::io::stdout().write_all(&vec![b'x'; 2 * 1024 * 1024]);
        return;
    }
    if scenario == "stderr-overflow" {
        let _ = std::io::stderr().write_all(&vec![b'x'; 512 * 1024]);
        return;
    }
    if scenario == "invalid-json" {
        println!("engine log, not a response");
        return;
    }
    let mut response = Generation {
        protocol: BRIDGE_PROTOCOL,
        request_digest: request.request_digest,
        model: request.request.model,
        engine_revision: DEEPINFER_REVISION.into(),
        text: "unverified generated proposal".into(),
        output_tokens: 4,
        finish_reason: FinishReason::Stop,
    };
    match scenario.as_str() {
        "wrong-request" => response.request_digest = ContentHash::ZERO,
        "wrong-model" => response.model = "wrong-model".into(),
        "wrong-revision" => response.engine_revision = "floating-main".into(),
        "wrong-protocol" => response.protocol = 2,
        "zero-tokens" => response.output_tokens = 0,
        "too-many-tokens" => response.output_tokens = request.request.sampling.max_tokens + 1,
        "empty-text" => response.text.clear(),
        "echo-sampling" => {
            response.text = serde_json::to_string(&request.request.sampling).unwrap()
        }
        _ => {}
    }
    println!("{}", serde_json::to_string(&response).unwrap());
    if scenario == "duplicate-response" {
        println!("{}", serde_json::to_string(&response).unwrap());
    }
}
