use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub fn verify_receipt_json(signed_json: &str, signer_pub_hex: &str) -> String {
    arkhe_pix_receipt::verify_receipt_json(signed_json, signer_pub_hex)
}
