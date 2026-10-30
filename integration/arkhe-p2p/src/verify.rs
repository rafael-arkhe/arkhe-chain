use crate::{Error, Limits};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncRead, AsyncReadExt};

/// Both digests describe the SAME raw bytes, never ciphertext vs plaintext.
#[derive(Clone, Copy, Debug)]
pub struct ExpectedDigests {
    pub sha256: [u8; 32],
    pub blake3: [u8; 32],
}

/// Opaque result: callers cannot construct or mutate a verified blob.
///
/// ```compile_fail
/// use arkhe_p2p::verify::{ExpectedDigests, VerifiedBlob};
/// let forged = VerifiedBlob {
///     bytes: vec![],
///     digests: ExpectedDigests { sha256: [0; 32], blake3: [0; 32] },
/// };
/// ```
#[derive(Debug)]
pub struct VerifiedBlob {
    bytes: Vec<u8>,
    digests: ExpectedDigests,
}

impl VerifiedBlob {
    /// Only verifiers in this crate construct a seal, after both digests match.
    pub(crate) fn new(bytes: Vec<u8>, digests: ExpectedDigests) -> Self {
        Self { bytes, digests }
    }
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub fn digests(&self) -> ExpectedDigests {
        self.digests
    }
}

pub struct DualVerifier {
    expected: ExpectedDigests,
    limits: Limits,
}

/// Synchronous combined-Bao decoder for finite/offline inputs.
/// The BLAKE3 root authenticates decoded chunks internally; SHA-256 describes
/// decoded plaintext, NOT the Bao encoding. No output escapes before both pass.
/// A blocking `Read` is not cancellable: do not attach network sockets here.
pub struct BaoVerifier {
    expected: ExpectedDigests,
    max_bytes: usize,
}

impl BaoVerifier {
    pub fn new(expected: ExpectedDigests, max_bytes: usize) -> Result<Self, Error> {
        if max_bytes == 0 || max_bytes > 16 * 1024 * 1024 {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            expected,
            max_bytes,
        })
    }

    pub fn verify<R: std::io::Read>(&self, mut reader: R) -> Result<VerifiedBlob, Error> {
        use std::io::{Cursor, Read};
        let mut header = [0; 8];
        reader
            .read_exact(&mut header)
            .map_err(|_| Error::BaoInvalid)?;
        // Untrusted length is an allocation/work rejection bound, not evidence.
        if u64::from_le_bytes(header) > self.max_bytes as u64 {
            return Err(Error::TooLarge);
        }
        let max_chunks = self.max_bytes.div_ceil(1024);
        let max_wire = 8 + self.max_bytes + 64 * max_chunks.saturating_sub(1);
        let input = Read::take(
            Read::chain(Cursor::new(header), reader),
            (max_wire + 1) as u64,
        );
        let hash = bao::Hash::from(self.expected.blake3);
        let mut decoder = bao::decode::Decoder::new(input, &hash);
        let mut bytes = Vec::new();
        let mut sha = Sha256::new();
        let mut buffer = [0; 16 * 1024];
        loop {
            let count = decoder.read(&mut buffer).map_err(|_| Error::BaoInvalid)?;
            if count == 0 {
                break;
            }
            if count > self.max_bytes.saturating_sub(bytes.len()) {
                return Err(Error::TooLarge);
            }
            sha.update(&buffer[..count]);
            bytes.extend_from_slice(&buffer[..count]);
        }
        let (mut input, _) = decoder.into_inner();
        // This adapter's framing is strict even though Bao permits trailing data.
        if input.read(&mut [0]).map_err(|_| Error::BaoInvalid)? != 0 {
            return Err(Error::BaoInvalid);
        }
        let sha: [u8; 32] = sha.finalize().into();
        if sha != self.expected.sha256 {
            return Err(Error::Sha256Mismatch);
        }
        Ok(VerifiedBlob {
            bytes,
            digests: self.expected,
        })
    }
}

impl DualVerifier {
    pub fn new(expected: ExpectedDigests, limits: Limits) -> Result<Self, Error> {
        Ok(Self {
            expected,
            limits: limits.validate()?,
        })
    }

    pub async fn verify<R: AsyncRead + Unpin>(&self, mut reader: R) -> Result<VerifiedBlob, Error> {
        tokio::time::timeout(self.limits.deadline, async {
            let mut sha = Sha256::new();
            let mut blake = blake3::Hasher::new();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 16 * 1024];
            loop {
                let count = reader.read(&mut buffer).await?;
                if count == 0 {
                    break;
                }
                if count > self.limits.max_bytes.saturating_sub(bytes.len()) {
                    return Err(Error::TooLarge);
                }
                sha.update(&buffer[..count]);
                blake.update(&buffer[..count]);
                bytes.extend_from_slice(&buffer[..count]);
            }
            let sha: [u8; 32] = sha.finalize().into();
            if sha != self.expected.sha256 {
                return Err(Error::Sha256Mismatch);
            }
            if blake.finalize().as_bytes() != &self.expected.blake3 {
                return Err(Error::Blake3Mismatch);
            }
            Ok(VerifiedBlob {
                bytes,
                digests: self.expected,
            })
        })
        .await
        .map_err(|_| Error::Timeout)?
    }
}
