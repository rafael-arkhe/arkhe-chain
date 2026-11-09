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
/// one plain HTTP connection and does not settle either chain.
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

/// JSON-RPC `eth_getBlockByNumber` over plain HTTP. There is no TLS and no
/// authentication. A missing block or a refused connection is `RpcUnavailable`.
#[derive(Debug, Clone)]
pub struct HttpExecutionRpc {
    pub endpoint: String,
}

impl ExecutionRpc for HttpExecutionRpc {
    fn execution_hash(&self, number: u64) -> Result<[u8; 32], ChainError> {
        let body = format!(
            "{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBlockByNumber\",\"params\":[\"0x{number:x}\",false]}}"
        );
        let raw = post_json(&self.endpoint, &body)?;
        let value: serde_json::Value =
            serde_json::from_str(&raw).map_err(|_| ChainError::RpcUnavailable)?;
        if value.get("error").is_some() {
            return Err(ChainError::RpcUnavailable);
        }
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
    let rest = endpoint
        .strip_prefix("http://")
        .ok_or(ChainError::RpcUnavailable)?;
    let (host_port, path) = rest.split_once('/').unwrap_or((rest, ""));
    let (host, port) = host_port.split_once(':').unwrap_or((host_port, "80"));
    let port: u16 = port.parse().map_err(|_| ChainError::RpcUnavailable)?;
    let mut stream = std::net::TcpStream::connect((host, port)).map_err(|_| ChainError::RpcUnavailable)?;
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
    std::io::Write::write_all(&mut stream, request.as_bytes()).map_err(|_| ChainError::RpcUnavailable)?;
    let mut raw = Vec::new();
    std::io::Read::read_to_end(&mut stream, &mut raw).map_err(|_| ChainError::RpcTimeout)?;
    let text = String::from_utf8(raw).map_err(|_| ChainError::RpcUnavailable)?;
    let (head, payload) = text.split_once("\r\n\r\n").ok_or(ChainError::RpcUnavailable)?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return Err(ChainError::RpcUnavailable);
    }
    Ok(payload.to_string())
}
