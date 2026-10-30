// Manual fixture authoring only. CI never invokes this example.
#[path = "../tests/support/mod.rs"]
mod support;
fn main() {
    let intent = support::intent();
    let record = support::record(&intent);
    let policy = support::policy(&record);
    let output = serde_json::json!({"producer":"Rust static regression fixture; not an independent WER implementation", "intent":intent,"record":record,"policy":policy,"now":102});
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/golden/wer_vectors.json");
    std::fs::write(root, serde_json::to_string_pretty(&output).unwrap() + "\n").unwrap();
}
