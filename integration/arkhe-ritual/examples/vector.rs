use arkhe_ritual::{
    crypto::{canonical, digest, Envelope},
    protocol::{Authorization, AUTH},
};
use ed25519_dalek::SigningKey;
use uuid::Uuid;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let auth = Authorization {
        id: Uuid::nil(),
        challenge: Uuid::nil(),
        tenant: Uuid::nil(),
        request: [1; 32],
        effect: [2; 32],
        analysis: [3; 32],
        policy: [4; 32],
        profile: "arkhe-ritual-mock-v1".into(),
        allow: true,
        issued: 1700000000,
        expires: 1700000300,
    };
    let key = SigningKey::from_bytes(&[7; 32]);
    let signed = Envelope::sign(&auth, AUTH, &key)?;
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"domain_hex":hex::encode(AUTH),"json":String::from_utf8(signed.json)?,"cbor_hex":hex::encode(canonical(&auth)?),"digest_hex":hex::encode(digest(AUTH,&auth)?),"public_key_hex":hex::encode(key.verifying_key().to_bytes()),"signature_hex":hex::encode(signed.signature)})
        )?
    );
    Ok(())
}
