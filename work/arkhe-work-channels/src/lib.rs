#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChannelEnvelope {
    pub channel: String,
    pub authenticated_actor: String,
    pub payload: Vec<u8>,
}

/// Channels transport authenticated requests. They do not authorize.
pub fn transport_only(e: ChannelEnvelope) -> ChannelEnvelope {
    e
}

/// Validates structural transport bounds before handing bytes to orchestration.
/// Passing validation never authorizes a transition.
pub fn validate_envelope(
    envelope: &ChannelEnvelope,
    max_payload_bytes: usize,
) -> Result<(), &'static str> {
    if envelope.channel.is_empty() || envelope.channel != envelope.channel.trim() {
        return Err("invalid channel identifier");
    }
    if envelope.authenticated_actor.is_empty()
        || envelope.authenticated_actor != envelope.authenticated_actor.trim()
    {
        return Err("invalid authenticated_actor");
    }
    if envelope.payload.is_empty() {
        return Err("empty channel payload");
    }
    if envelope.payload.len() > max_payload_bytes {
        return Err("channel payload exceeds limit");
    }
    Ok(())
}
