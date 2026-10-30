// Minimal fixed DNS wire format for a private fixture; never a recursive resolver.
pub fn valid_nonce(nonce: &str) -> bool {
    nonce.len() == 64
        && nonce
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
pub fn dns_query(nonce: &str) -> Vec<u8> {
    assert!(valid_nonce(nonce));
    let mut packet = vec![0x41, 0x4b, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    for label in [&nonce[..32], &nonce[32..], "arkhe", "invalid"] {
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.extend_from_slice(&[0, 0, 1, 0, 1]);
    packet
}
pub fn query_nonce(packet: &[u8]) -> Option<String> {
    if packet.len() != 97 || packet[12] != 32 || packet[45] != 32 {
        return None;
    }
    let nonce = String::from_utf8([&packet[13..45], &packet[46..78]].concat()).ok()?;
    if !valid_nonce(&nonce) || dns_query(&nonce) != packet {
        return None;
    }
    Some(nonce)
}
pub fn dns_reply(query: &[u8]) -> Vec<u8> {
    let mut reply = query.to_vec();
    reply[2] = 0x84;
    reply[3] = 0;
    reply[7] = 1;
    reply.extend_from_slice(&[0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 1, 0, 4, 192, 0, 2, 123]);
    reply
}
