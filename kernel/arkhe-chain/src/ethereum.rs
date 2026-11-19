use crate::error::ChainError;
use crate::tx::BlockHeader;

/// Domain of a citation from a sealed Arkhe block to an Ethereum execution block.
/// The citation is not a settlement and carries no Ethereum receipt.
pub const ETH_LINK_DOMAIN: &[u8] = b"AKG:ETH:LINK:v1\0";

/// Identifier of an Ethereum execution block, as supplied by the caller.
/// This crate does not fetch it and does not decide that Ethereum finalized it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EthereumExecutionId {
    pub number: u64,
    pub hash: [u8; 32],
}

/// A checked pairing of one sealed Arkhe block with one execution identifier.
/// `settled` is always false: the pairing does not move either chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EthereumLink {
    pub arkhe_height: u64,
    pub arkhe_block_hash: [u8; 32],
    pub state_root: [u8; 32],
    pub execution_number: u64,
    pub execution_hash: [u8; 32],
    pub commitment: [u8; 32],
    /// Always false. Confirmation does not settle either chain.
    pub settled: bool,
    /// True only on the value returned by a matching execution client.
    /// The snapshot does not store this bit.
    pub confirmed: bool,
}

pub fn ethereum_link_preimage(
    header: &BlockHeader,
    arkhe_block_hash: &[u8; 32],
    execution: EthereumExecutionId,
) -> Vec<u8> {
    let mut out = ETH_LINK_DOMAIN.to_vec();
    out.extend_from_slice(&header.block_number.to_be_bytes());
    out.extend_from_slice(arkhe_block_hash);
    out.extend_from_slice(&header.state_root);
    out.extend_from_slice(&execution.number.to_be_bytes());
    out.extend_from_slice(&execution.hash);
    out
}

pub fn ethereum_link_commitment(preimage: &[u8]) -> [u8; 32] {
    *blake3::hash(preimage).as_bytes()
}

pub fn ethereum_link(
    header: &BlockHeader,
    arkhe_block_hash: [u8; 32],
    execution: EthereumExecutionId,
) -> EthereumLink {
    let preimage = ethereum_link_preimage(header, &arkhe_block_hash, execution);
    EthereumLink {
        arkhe_height: header.block_number,
        arkhe_block_hash,
        state_root: header.state_root,
        execution_number: execution.number,
        execution_hash: execution.hash,
        commitment: ethereum_link_commitment(&preimage),
        settled: false,
        confirmed: false,
    }
}

/// Reads an Ethereum execution block hash.
/// [`AbsentExecutionRpc`] does not open a socket. [`HttpExecutionRpc`] opens
/// one connection, with TLS when the endpoint is `https`, and does not settle
/// either chain.
pub trait ExecutionRpc {
    fn execution_hash(&self, number: u64) -> Result<[u8; 32], ChainError>;
}

/// No execution client is configured.
#[derive(Debug, Default, Clone, Copy)]
pub struct AbsentExecutionRpc;

impl ExecutionRpc for AbsentExecutionRpc {
    fn execution_hash(&self, _number: u64) -> Result<[u8; 32], ChainError> {
        Err(ChainError::RpcAbsent)
    }
}

/// JSON-RPC `eth_getBlockByNumber` over HTTP. `https` uses the system trust
/// store. There is no authentication and no custom certificate. A missing
/// block, a refused connection, or a rejected certificate is `RpcUnavailable`.
#[derive(Debug, Clone)]
pub struct HttpExecutionRpc {
    pub endpoint: String,
}

impl HttpExecutionRpc {
    /// Latest execution block number. A pruned node can refuse an old number
    /// and still answer this one. The number is not a finality signal.
    pub fn head_number(&self) -> Result<u64, ChainError> {
        let value = self.rpc("eth_blockNumber", "[]")?;
        let Some(text) = value.get("result").and_then(|item| item.as_str()) else {
            return Err(ChainError::RpcUnavailable);
        };
        let hex = text.strip_prefix("0x").unwrap_or(text);
        if hex.is_empty() || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(ChainError::RpcUnavailable);
        }
        u64::from_str_radix(hex, 16).map_err(|_| ChainError::RpcUnavailable)
    }

    fn rpc(&self, method: &str, params: &str) -> Result<serde_json::Value, ChainError> {
        let body =
            format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"{method}\",\"params\":{params}}}");
        let raw = post_json(&self.endpoint, &body)?;
        let value: serde_json::Value =
            serde_json::from_str(&raw).map_err(|_| ChainError::RpcUnavailable)?;
        if value.get("error").is_some() {
            return Err(ChainError::RpcUnavailable);
        }
        Ok(value)
    }
}

impl ExecutionRpc for HttpExecutionRpc {
    fn execution_hash(&self, number: u64) -> Result<[u8; 32], ChainError> {
        let value = self.rpc("eth_getBlockByNumber", &format!("[\"0x{number:x}\",false]"))?;
        let Some(text) = value.pointer("/result/hash").and_then(|item| item.as_str()) else {
            return Err(ChainError::RpcUnavailable);
        };
        let hex = text.strip_prefix("0x").unwrap_or(text);
        if hex.len() != 64 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(ChainError::RpcUnavailable);
        }
        let mut hash = [0u8; 32];
        for (index, byte) in hash.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16)
                .map_err(|_| ChainError::RpcUnavailable)?;
        }
        Ok(hash)
    }
}

fn post_json(endpoint: &str, body: &str) -> Result<String, ChainError> {
    let (secure, rest) = if let Some(rest) = endpoint.strip_prefix("https://") {
        (true, rest)
    } else if let Some(rest) = endpoint.strip_prefix("http://") {
        (false, rest)
    } else {
        return Err(ChainError::RpcUnavailable);
    };
    let (host_port, path) = rest.split_once('/').unwrap_or((rest, ""));
    let (host, port) = host_port
        .split_once(':')
        .unwrap_or((host_port, if secure { "443" } else { "80" }));
    let port: u16 = port.parse().map_err(|_| ChainError::RpcUnavailable)?;
    let mut stream =
        std::net::TcpStream::connect((host, port)).map_err(|_| ChainError::RpcUnavailable)?;
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .map_err(|_| ChainError::RpcTimeout)?;
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(5)))
        .map_err(|_| ChainError::RpcTimeout)?;
    let request = format!(
        "POST /{path} HTTP/1.1\r\nHost: {host_port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let raw = if secure {
        let connector = native_tls::TlsConnector::builder()
            .build()
            .map_err(|_| ChainError::RpcUnavailable)?;
        let mut tls = connector
            .connect(host, stream)
            .map_err(|_| ChainError::RpcUnavailable)?;
        read_response(&mut tls, &request)?
    } else {
        read_response(&mut stream, &request)?
    };
    String::from_utf8(raw).map_err(|_| ChainError::RpcUnavailable)
}

const RPC_BODY_LIMIT: usize = 1024 * 1024;

fn read_response<S: std::io::Read + std::io::Write>(
    stream: &mut S,
    request: &str,
) -> Result<Vec<u8>, ChainError> {
    std::io::Write::write_all(stream, request.as_bytes())
        .map_err(|_| ChainError::RpcUnavailable)?;
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    loop {
        if let Some(body) = take_body(&buf)? {
            return Ok(body);
        }
        let read = stream.read(&mut tmp).map_err(|_| ChainError::RpcTimeout)?;
        if read == 0 {
            return take_body_at_end(&buf);
        }
        if buf.len() + read > RPC_BODY_LIMIT {
            return Err(ChainError::RpcUnavailable);
        }
        buf.extend_from_slice(&tmp[..read]);
    }
}

fn take_body(buf: &[u8]) -> Result<Option<Vec<u8>>, ChainError> {
    let Some(split) = header_end(buf) else {
        return Ok(None);
    };
    let head = std::str::from_utf8(&buf[..split]).map_err(|_| ChainError::RpcUnavailable)?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return Err(ChainError::RpcUnavailable);
    }
    let payload = &buf[split + 4..];
    if chunked(head) {
        return decode_chunked(payload);
    }
    match content_length(head) {
        Some(len) if payload.len() >= len => Ok(Some(payload[..len].to_vec())),
        Some(_) => Ok(None),
        None => Ok(None),
    }
}

fn take_body_at_end(buf: &[u8]) -> Result<Vec<u8>, ChainError> {
    let split = header_end(buf).ok_or(ChainError::RpcUnavailable)?;
    let head = std::str::from_utf8(&buf[..split]).map_err(|_| ChainError::RpcUnavailable)?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return Err(ChainError::RpcUnavailable);
    }
    let payload = &buf[split + 4..];
    if chunked(head) {
        return match decode_chunked(payload)? {
            Some(body) => Ok(body),
            None => Err(ChainError::RpcUnavailable),
        };
    }
    if let Some(len) = content_length(head) {
        if payload.len() < len {
            return Err(ChainError::RpcUnavailable);
        }
        return Ok(payload[..len].to_vec());
    }
    Ok(payload.to_vec())
}

fn header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|mark| mark == b"\r\n\r\n")
}

fn header_value<'a>(head: &'a str, name: &str) -> Option<&'a str> {
    head.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name).then(|| value.trim())
    })
}

fn chunked(head: &str) -> bool {
    header_value(head, "transfer-encoding")
        .is_some_and(|value| value.to_ascii_lowercase().contains("chunked"))
}

fn content_length(head: &str) -> Option<usize> {
    header_value(head, "content-length")?.parse().ok()
}

/// `Ok(None)` means the chunked body is not complete yet.
fn decode_chunked(mut payload: &[u8]) -> Result<Option<Vec<u8>>, ChainError> {
    let mut out = Vec::new();
    loop {
        let Some(line_end) = payload.windows(2).position(|mark| mark == b"\r\n") else {
            return Ok(None);
        };
        let line =
            std::str::from_utf8(&payload[..line_end]).map_err(|_| ChainError::RpcUnavailable)?;
        let size_hex = line.split(';').next().unwrap_or(line).trim();
        let size = usize::from_str_radix(size_hex, 16).map_err(|_| ChainError::RpcUnavailable)?;
        if size > RPC_BODY_LIMIT {
            return Err(ChainError::RpcUnavailable);
        }
        let data_at = line_end + 2;
        if size == 0 {
            return Ok(Some(out));
        }
        if payload.len() < data_at + size + 2 {
            return Ok(None);
        }
        if &payload[data_at + size..data_at + size + 2] != b"\r\n" {
            return Err(ChainError::RpcUnavailable);
        }
        if out.len() + size > RPC_BODY_LIMIT {
            return Err(ChainError::RpcUnavailable);
        }
        out.extend_from_slice(&payload[data_at..data_at + size]);
        payload = &payload[data_at + size + 2..];
    }
}
