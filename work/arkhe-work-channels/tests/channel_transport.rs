use arkhe_work_channels::{transport_only, validate_envelope, ChannelEnvelope};

#[test]
fn transport_preserves_bytes_and_validates_bounds_without_authority() {
    let env = ChannelEnvelope {
        channel: "intra-http".into(),
        authenticated_actor: "operator-1".into(),
        payload: b"proposed-intent".to_vec(),
    };
    assert!(validate_envelope(&env, 64).is_ok());
    assert_eq!(transport_only(env.clone()), env);

    // Oversized payload is rejected.
    assert_eq!(
        validate_envelope(&env, 4).unwrap_err(),
        "channel payload exceeds limit"
    );

    // Padded or blank actor/channel and empty payload fail closed.
    let mut padded_actor = env.clone();
    padded_actor.authenticated_actor = " operator-1 ".into();
    assert!(validate_envelope(&padded_actor, 64).is_err());

    let mut blank_channel = env.clone();
    blank_channel.channel = String::new();
    assert!(validate_envelope(&blank_channel, 64).is_err());

    let mut empty_payload = env;
    empty_payload.payload.clear();
    assert!(validate_envelope(&empty_payload, 64).is_err());
}
