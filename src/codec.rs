use crate::error::ChainError;
use crate::tx::{account_id, Block, BlockHeader, Transaction, MLDSA65_SIG_LEN};

pub(crate) fn encode_tx(tx: &Transaction) -> Vec<u8> {
    let mut out = Vec::new();
    write_tx(&mut out, tx);
    out
}

pub(crate) fn decode_tx(bytes: &[u8]) -> Result<Transaction, ChainError> {
    let mut rd = Rd { buf: bytes, i: 0 };
    let tx = read_tx(&mut rd)?;
    if rd.i != bytes.len() {
        return Err(ChainError::Malformed);
    }
    Ok(tx)
}

pub fn encode_block(block: &Block) -> Vec<u8> {
    let mut out = Vec::new();
    write_header(&mut out, &block.header);
    push_u32(&mut out, block.transactions.len() as u32);
    for tx in &block.transactions {
        write_tx(&mut out, tx);
    }
    out
}

pub fn decode_block(bytes: &[u8]) -> Result<Block, ChainError> {
    let mut rd = Rd { buf: bytes, i: 0 };
    let header = read_header(&mut rd)?;
    let n = rd.u32()? as usize;
    if n == 0 || n > 250 {
        return Err(ChainError::Malformed);
    }
    let mut transactions = Vec::with_capacity(n);
    for _ in 0..n {
        transactions.push(read_tx(&mut rd)?);
    }
    if rd.i != bytes.len() {
        return Err(ChainError::Malformed);
    }
    Ok(Block {
        header,
        transactions,
    })
}

fn write_header(out: &mut Vec<u8>, header: &BlockHeader) {
    write_header_body(out, header);
    out.extend_from_slice(&header.proposer_signature);
}

fn write_header_body(out: &mut Vec<u8>, header: &BlockHeader) {
    push_u64(out, header.block_number);
    out.extend_from_slice(&header.parent_hash);
    out.extend_from_slice(&header.state_root);
    push_u64(out, header.mmr_count);
    push_u64(out, header.timestamp);
    push_str(out, &header.proposer);
}

/// Canonical public preimage covered by a block proposer's signature.
pub fn proposer_message(block: &Block) -> Vec<u8> {
    let mut out = b"AKG:CHAIN:PROPOSER:v1\0".to_vec();
    write_header_body(&mut out, &block.header);
    push_u32(&mut out, block.transactions.len() as u32);
    for tx in &block.transactions {
        write_tx(&mut out, tx);
    }
    out
}

fn read_header(rd: &mut Rd<'_>) -> Result<BlockHeader, ChainError> {
    Ok(BlockHeader {
        block_number: rd.u64()?,
        parent_hash: rd.arr32()?,
        state_root: rd.arr32()?,
        mmr_count: rd.u64()?,
        timestamp: rd.u64()?,
        proposer: rd.account()?,
        proposer_signature: rd.arr64()?,
    })
}

fn write_tx(out: &mut Vec<u8>, tx: &Transaction) {
    push_u64(out, tx.nonce);
    push_str(out, &tx.sender);
    push_str(out, &tx.recipient);
    push_u64(out, tx.value);
    push_bytes(out, &tx.signature_mldsa);
    out.extend_from_slice(&tx.sender_signature);
    push_bytes(out, &tx.payload);
}

fn read_tx(rd: &mut Rd<'_>) -> Result<Transaction, ChainError> {
    let tx = Transaction {
        nonce: rd.u64()?,
        sender: rd.account()?,
        recipient: rd.account()?,
        value: rd.u64()?,
        signature_mldsa: rd.bytes(MLDSA65_SIG_LEN)?,
        sender_signature: rd.arr64()?,
        payload: rd.bytes(4096)?,
    };
    tx.check_shape()?;
    Ok(tx)
}

fn push_u32(out: &mut Vec<u8>, n: u32) {
    out.extend_from_slice(&n.to_be_bytes());
}
fn push_u64(out: &mut Vec<u8>, n: u64) {
    out.extend_from_slice(&n.to_be_bytes());
}
fn push_str(out: &mut Vec<u8>, s: &str) {
    push_u32(out, s.len() as u32);
    out.extend_from_slice(s.as_bytes());
}
fn push_bytes(out: &mut Vec<u8>, bytes: &[u8]) {
    push_u32(out, bytes.len() as u32);
    out.extend_from_slice(bytes);
}

struct Rd<'a> {
    buf: &'a [u8],
    i: usize,
}

impl Rd<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], ChainError> {
        let end = self.i.checked_add(n).ok_or(ChainError::Malformed)?;
        if end > self.buf.len() {
            return Err(ChainError::Malformed);
        }
        let slice = &self.buf[self.i..end];
        self.i = end;
        Ok(slice)
    }
    fn u32(&mut self) -> Result<u32, ChainError> {
        let bytes: [u8; 4] = self
            .take(4)?
            .try_into()
            .map_err(|_| ChainError::Malformed)?;
        Ok(u32::from_be_bytes(bytes))
    }
    fn u64(&mut self) -> Result<u64, ChainError> {
        let bytes: [u8; 8] = self
            .take(8)?
            .try_into()
            .map_err(|_| ChainError::Malformed)?;
        Ok(u64::from_be_bytes(bytes))
    }
    fn arr32(&mut self) -> Result<[u8; 32], ChainError> {
        self.take(32)?.try_into().map_err(|_| ChainError::Malformed)
    }
    fn arr64(&mut self) -> Result<[u8; 64], ChainError> {
        self.take(64)?.try_into().map_err(|_| ChainError::Malformed)
    }
    fn account(&mut self) -> Result<String, ChainError> {
        let n = self.u32()? as usize;
        if n == 0 || n > 128 {
            return Err(ChainError::Malformed);
        }
        let bytes = self.take(n)?;
        let text = std::str::from_utf8(bytes).map_err(|_| ChainError::Malformed)?;
        if !account_id(text) {
            return Err(ChainError::BadAccount);
        }
        Ok(text.to_string())
    }
    fn bytes(&mut self, max: usize) -> Result<Vec<u8>, ChainError> {
        let n = self.u32()? as usize;
        if n > max {
            return Err(ChainError::Malformed);
        }
        if n != 0 && n != max && max == MLDSA65_SIG_LEN {
            return Err(ChainError::BadSignatureLength);
        }
        Ok(self.take(n)?.to_vec())
    }
}
