//! Offline Hashtree (HTS-01, observed `hashtree-core` 0.2.91) tree verifier.
//!
//! Every stored block must hash (SHA-256) to the link that names it; CHK blocks
//! are decrypted with the link key and the plaintext must hash back to that key.
//! Nodes are decoded strictly; directories must be uniquely and strictly sorted.
//! The reconstructed file is released only as `VerifiedBlob` after the caller's
//! independent SHA-256 and BLAKE3 commitments both match. A Hashtree root says
//! which bytes a publisher committed to, never that those bytes are authorized.
use crate::verify::{ExpectedDigests, VerifiedBlob};
use crate::Error;
use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use sha2::{Digest, Sha256};
use std::cell::Cell;
use std::path::PathBuf;

/// Immutable root: SHA-256 of the stored root block plus optional CHK key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HashtreeCid {
    pub hash: [u8; 32],
    pub key: Option<[u8; 32]>,
}

impl HashtreeCid {
    /// Decode `nhash1…` (bech32, TLV 0 = hash, 5 = decrypt key). Path TLVs and
    /// repeated or unknown types are rejected: this profile pins a root only.
    pub fn from_nhash(text: &str) -> Result<Self, Error> {
        let text = text.strip_prefix("hashtree:").unwrap_or(text);
        let (hrp, data) = bech32::decode(text).map_err(|_| Error::InvalidInput)?;
        if hrp.as_str() != "nhash" {
            return Err(Error::InvalidInput);
        }
        let (mut hash, mut key) = (None, None);
        let mut rest = &data[..];
        while !rest.is_empty() {
            let [kind, len, tail @ ..] = rest else {
                return Err(Error::InvalidInput);
            };
            let value: [u8; 32] = tail
                .get(..*len as usize)
                .and_then(|v| v.try_into().ok())
                .ok_or(Error::InvalidInput)?;
            let slot = match kind {
                0 => &mut hash,
                5 => &mut key,
                _ => return Err(Error::InvalidInput),
            };
            if slot.replace(value).is_some() {
                return Err(Error::InvalidInput);
            }
            rest = &tail[*len as usize..];
        }
        Ok(Self {
            hash: hash.ok_or(Error::InvalidInput)?,
            key,
        })
    }
}

/// Untrusted block store keyed by SHA-256 of the stored bytes.
/// `Ok(None)` is unavailability, not evidence of absence or misbehaviour.
pub trait BlockSource {
    fn get(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>, Error>;
}

/// `aa/bb/<remaining 60 hex>` layout used by Hashtree filesystem stores.
pub struct DirBlockSource {
    root: PathBuf,
    max_block_bytes: u64,
}

impl DirBlockSource {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            max_block_bytes: 4 * 1024 * 1024,
        }
    }
    pub fn path_for(&self, hash: &[u8; 32]) -> PathBuf {
        let h = hex::encode(hash);
        self.root.join(&h[..2]).join(&h[2..4]).join(&h[4..])
    }
}

impl BlockSource for DirBlockSource {
    fn get(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>, Error> {
        let path = self.path_for(hash);
        match std::fs::metadata(&path) {
            Ok(meta) if meta.len() > self.max_block_bytes => Err(Error::TooLarge),
            Ok(_) => Ok(Some(std::fs::read(path)?)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct TreeLimits {
    /// Blocks fetched by one operation.
    pub max_blocks: usize,
    /// Stored bytes fetched by one operation.
    pub max_fetched_bytes: usize,
    /// Reconstructed file size.
    pub max_file_bytes: usize,
    pub max_depth: usize,
    pub max_links: usize,
}

impl Default for TreeLimits {
    fn default() -> Self {
        Self {
            max_blocks: 4096,
            max_fetched_bytes: 64 * 1024 * 1024,
            max_file_bytes: 16 * 1024 * 1024,
            max_depth: 32,
            max_links: 4096,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Dir,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirEntry {
    pub name: String,
    pub kind: EntryKind,
}

pub struct HashtreeVerifier<'a, S: BlockSource> {
    source: &'a S,
    root: HashtreeCid,
    limits: TreeLimits,
    blocks: Cell<usize>,
    fetched: Cell<usize>,
}

impl<'a, S: BlockSource> HashtreeVerifier<'a, S> {
    pub fn new(source: &'a S, root: HashtreeCid, limits: TreeLimits) -> Self {
        Self {
            source,
            root,
            limits,
            blocks: Cell::new(0),
            fetched: Cell::new(0),
        }
    }

    /// Reconstruct the file at `path` and release it only if both caller-side
    /// commitments match. Digests come from an independent source (e.g. a
    /// `ReleaseManifest` artifact), never from the tree being verified.
    pub fn verify_file(
        &self,
        path: &str,
        expected: ExpectedDigests,
    ) -> Result<VerifiedBlob, Error> {
        self.reset();
        let link = self.resolve(path)?;
        if link.kind == LinkKind::Dir {
            return Err(Error::HashtreeInvalid("path is a directory"));
        }
        let bytes = self.read_file(&link, 0)?;
        let sha: [u8; 32] = Sha256::digest(&bytes).into();
        if sha != expected.sha256 {
            return Err(Error::Sha256Mismatch);
        }
        if blake3::hash(&bytes).as_bytes() != &expected.blake3 {
            return Err(Error::Blake3Mismatch);
        }
        Ok(VerifiedBlob::new(bytes, expected))
    }

    /// Authenticated listing of one directory (`""` is the root).
    pub fn list_dir(&self, path: &str) -> Result<Vec<DirEntry>, Error> {
        self.reset();
        let link = if path.is_empty() {
            self.root_link()
        } else {
            self.resolve(path)?
        };
        let node = self.dir_node(&link)?;
        Ok(node
            .links
            .into_iter()
            .map(|l| DirEntry {
                kind: if l.kind == LinkKind::Dir {
                    EntryKind::Dir
                } else {
                    EntryKind::File
                },
                name: l.name.expect("directory links are named"),
            })
            .collect())
    }

    fn reset(&self) {
        self.blocks.set(0);
        self.fetched.set(0);
    }

    fn root_link(&self) -> Link {
        Link {
            hash: self.root.hash,
            key: self.root.key,
            name: None,
            size: None,
            kind: LinkKind::Dir,
        }
    }

    fn resolve(&self, path: &str) -> Result<Link, Error> {
        if path.is_empty()
            || path
                .split('/')
                .any(|s| s.is_empty() || s == "." || s == "..")
        {
            return Err(Error::InvalidInput);
        }
        let mut link = self.root_link();
        for (depth, segment) in path.split('/').enumerate() {
            if depth >= self.limits.max_depth {
                return Err(Error::TooLarge);
            }
            let node = self.dir_node(&link)?;
            link = node
                .links
                .into_iter()
                .find(|l| l.name.as_deref() == Some(segment))
                .ok_or(Error::PathAbsent)?;
        }
        Ok(link)
    }

    fn dir_node(&self, link: &Link) -> Result<Node, Error> {
        if link.kind != LinkKind::Dir {
            return Err(Error::HashtreeInvalid("not a directory"));
        }
        let node = decode_node(&self.block(link)?, self.limits.max_links)?
            .ok_or(Error::HashtreeInvalid("directory is not a tree node"))?;
        match node.kind {
            NodeKind::Dir => {}
            NodeKind::Fanout => {
                return Err(Error::HashtreeInvalid("fanout directories unsupported"))
            }
            NodeKind::File => return Err(Error::HashtreeInvalid("not a directory")),
        }
        let mut previous: Option<&str> = None;
        for l in &node.links {
            let name = l
                .name
                .as_deref()
                .ok_or(Error::HashtreeInvalid("unnamed entry"))?;
            if name.is_empty() || name.contains('/') || name == "." || name == ".." {
                return Err(Error::HashtreeInvalid("entry name"));
            }
            if previous.is_some_and(|p| p.as_bytes() >= name.as_bytes()) {
                return Err(Error::HashtreeInvalid("entries not strictly sorted"));
            }
            previous = Some(name);
        }
        Ok(node)
    }

    fn read_file(&self, link: &Link, depth: usize) -> Result<Vec<u8>, Error> {
        if depth > self.limits.max_depth {
            return Err(Error::TooLarge);
        }
        let plain = self.block(link)?;
        // HTS-01 readers sniff: a Blob-typed link whose plaintext is a File node is
        // chunked. The final caller digests resolve any residual ambiguity.
        let bytes = match decode_node(&plain, self.limits.max_links) {
            Ok(Some(node)) if node.kind == NodeKind::File => {
                let mut out = Vec::new();
                for chunk in &node.links {
                    if chunk.kind == LinkKind::Dir {
                        return Err(Error::HashtreeInvalid("directory inside file"));
                    }
                    let part = self.read_file(chunk, depth + 1)?;
                    if part.len() > self.limits.max_file_bytes - out.len() {
                        return Err(Error::TooLarge);
                    }
                    out.extend(part);
                }
                out
            }
            _ if link.kind == LinkKind::File => {
                return Err(Error::HashtreeInvalid("File link without File node"))
            }
            Ok(Some(_)) => return Err(Error::HashtreeInvalid("non-file node in file position")),
            _ => plain,
        };
        if bytes.len() > self.limits.max_file_bytes {
            return Err(Error::TooLarge);
        }
        if link.size.is_some_and(|s| s != bytes.len() as u64) {
            return Err(Error::HashtreeInvalid("declared size differs"));
        }
        Ok(bytes)
    }

    fn block(&self, link: &Link) -> Result<Vec<u8>, Error> {
        let count = self.blocks.get() + 1;
        if count > self.limits.max_blocks {
            return Err(Error::TooLarge);
        }
        self.blocks.set(count);
        let stored = self
            .source
            .get(&link.hash)?
            .ok_or(Error::BlockUnavailable(link.hash))?;
        let fetched = self.fetched.get() + stored.len();
        if fetched > self.limits.max_fetched_bytes {
            return Err(Error::TooLarge);
        }
        self.fetched.set(fetched);
        verify_block(&stored, link.hash, link.key)
    }
}

/// Check one stored block against its link and return the plaintext.
pub fn verify_block(
    stored: &[u8],
    hash: [u8; 32],
    key: Option<[u8; 32]>,
) -> Result<Vec<u8>, Error> {
    if <[u8; 32]>::from(Sha256::digest(stored)) != hash {
        return Err(Error::HashtreeInvalid("block SHA-256"));
    }
    let Some(key) = key else {
        return Ok(stored.to_vec());
    };
    let mut enc_key = [0u8; 32];
    hkdf::Hkdf::<Sha256>::new(Some(b"hashtree-chk"), &key)
        .expand(b"encryption-key", &mut enc_key)
        .map_err(|_| Error::HashtreeInvalid("CHK key derivation"))?;
    let plain = Aes256Gcm::new_from_slice(&enc_key)
        .map_err(|_| Error::HashtreeInvalid("CHK key"))?
        .decrypt(&Nonce::from([0u8; 12]), stored)
        .map_err(|_| Error::HashtreeInvalid("CHK decryption"))?;
    // Convergent key = SHA-256(plaintext): binds the key to the content.
    if <[u8; 32]>::from(Sha256::digest(&plain)) != key {
        return Err(Error::HashtreeInvalid("CHK key does not match plaintext"));
    }
    Ok(plain)
}

/// Child links a fetcher must follow from one verified plaintext block.
/// Mirrors the reader's sniffing; unknown shapes are leaves.
pub fn child_links(plain: &[u8], max_links: usize) -> Vec<([u8; 32], Option<[u8; 32]>)> {
    match decode_node(plain, max_links) {
        Ok(Some(node)) => node.links.iter().map(|l| (l.hash, l.key)).collect(),
        _ => Vec::new(),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LinkKind {
    Blob,
    File,
    Dir,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NodeKind {
    File,
    Dir,
    Fanout,
}

#[derive(Clone, Debug)]
struct Link {
    hash: [u8; 32],
    key: Option<[u8; 32]>,
    name: Option<String>,
    /// `None` for the root; directory links may declare 0.
    size: Option<u64>,
    kind: LinkKind,
}

struct Node {
    kind: NodeKind,
    links: Vec<Link>,
}

/// `Ok(None)`: not shaped like a tree node (a raw blob). `Err`: node-shaped but
/// malformed. Wire form: map {l: [link], t: 1|2|3}; link map keys h, k?, m?, n?, s, t?.
fn decode_node(plain: &[u8], max_links: usize) -> Result<Option<Node>, Error> {
    let mut reader = Msgpack {
        bytes: plain,
        pos: 0,
    };
    let Ok(Mp::Map(pairs)) = reader.value(0) else {
        return Ok(None);
    };
    if reader.pos != plain.len() {
        return Ok(None);
    }
    let mut fields = Keys::new(pairs);
    let (Some(links), Some(Mp::Uint(t))) = (fields.take("l"), fields.take("t")) else {
        return Ok(None);
    };
    let Mp::Array(links) = links else {
        return Ok(None);
    };
    if !fields.is_empty() {
        return Err(Error::HashtreeInvalid("unknown node field"));
    }
    let kind = match t {
        1 => NodeKind::File,
        2 => NodeKind::Dir,
        3 => NodeKind::Fanout,
        _ => return Err(Error::HashtreeInvalid("node type")),
    };
    if links.len() > max_links {
        return Err(Error::TooLarge);
    }
    let links = links
        .into_iter()
        .map(|link| {
            let Mp::Map(pairs) = link else {
                return Err(Error::HashtreeInvalid("link is not a map"));
            };
            let mut f = Keys::new(pairs);
            let hash = match f.take("h") {
                Some(Mp::Bin(b)) => b
                    .try_into()
                    .map_err(|_| Error::HashtreeInvalid("hash length"))?,
                _ => return Err(Error::HashtreeInvalid("link hash")),
            };
            let key = match f.take("k") {
                None | Some(Mp::Nil) => None,
                Some(Mp::Bin(b)) => Some(
                    b.try_into()
                        .map_err(|_| Error::HashtreeInvalid("key length"))?,
                ),
                _ => return Err(Error::HashtreeInvalid("link key")),
            };
            let name = match f.take("n") {
                None | Some(Mp::Nil) => None,
                Some(Mp::Str(s)) => Some(s),
                _ => return Err(Error::HashtreeInvalid("link name")),
            };
            let size = match f.take("s") {
                Some(Mp::Uint(s)) => s,
                _ => return Err(Error::HashtreeInvalid("link size")),
            };
            let kind = match f.take("t") {
                None | Some(Mp::Uint(0)) => LinkKind::Blob,
                Some(Mp::Uint(1)) => LinkKind::File,
                Some(Mp::Uint(2 | 3)) => LinkKind::Dir,
                _ => return Err(Error::HashtreeInvalid("link type")),
            };
            // Metadata is ignored by this profile; it never affects bytes or names.
            f.take("m");
            if !f.is_empty() {
                return Err(Error::HashtreeInvalid("unknown link field"));
            }
            Ok(Link {
                hash,
                key,
                name,
                // Directory links carry 0 in the observed encoder.
                size: (kind != LinkKind::Dir).then_some(size),
                kind,
            })
        })
        .collect::<Result<_, _>>()?;
    Ok(Some(Node { kind, links }))
}

struct Keys(Vec<(String, Mp)>);
impl Keys {
    fn new(pairs: Vec<(Mp, Mp)>) -> Self {
        Self(
            pairs
                .into_iter()
                // A non-text key becomes "" which is never taken, so `is_empty` fails.
                .map(|(k, v)| match k {
                    Mp::Str(k) => (k, v),
                    _ => (String::new(), v),
                })
                .collect(),
        )
    }
    fn take(&mut self, key: &str) -> Option<Mp> {
        let index = self.0.iter().position(|(k, _)| k == key)?;
        // Duplicate keys are ambiguous: leave the second copy so `is_empty` fails.
        Some(self.0.remove(index).1)
    }
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

#[derive(Debug)]
enum Mp {
    Nil,
    Bool,
    Uint(u64),
    Int,
    Float,
    Str(String),
    Bin(Vec<u8>),
    Array(Vec<Mp>),
    Map(Vec<(Mp, Mp)>),
}

struct Msgpack<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Msgpack<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], ()> {
        let end = self.pos.checked_add(n).ok_or(())?;
        let slice = self.bytes.get(self.pos..end).ok_or(())?;
        self.pos = end;
        Ok(slice)
    }
    fn be(&mut self, n: usize) -> Result<u64, ()> {
        Ok(self
            .take(n)?
            .iter()
            .fold(0, |acc, b| (acc << 8) | *b as u64))
    }
    fn count(&mut self, n: u64) -> Result<usize, ()> {
        // Each element needs at least one byte: bounds allocation by input size.
        if n > (self.bytes.len() - self.pos) as u64 {
            return Err(());
        }
        Ok(n as usize)
    }
    fn value(&mut self, depth: usize) -> Result<Mp, ()> {
        if depth > 32 {
            return Err(());
        }
        let b = self.take(1)?[0];
        Ok(match b {
            0x00..=0x7f => Mp::Uint(b as u64),
            0x80..=0x8f => self.map((b & 0x0f) as u64, depth)?,
            0x90..=0x9f => self.array((b & 0x0f) as u64, depth)?,
            0xa0..=0xbf => self.str((b & 0x1f) as usize)?,
            0xc0 => Mp::Nil,
            0xc2 | 0xc3 => Mp::Bool,
            0xc4..=0xc6 => {
                let n = self.be(1 << (b - 0xc4))?;
                let n = self.count(n)?;
                Mp::Bin(self.take(n)?.to_vec())
            }
            0xca => {
                self.take(4)?;
                Mp::Float
            }
            0xcb => {
                self.take(8)?;
                Mp::Float
            }
            0xcc..=0xcf => Mp::Uint(self.be(1 << (b - 0xcc))?),
            0xd0..=0xd3 => {
                self.take(1 << (b - 0xd0))?;
                Mp::Int
            }
            0xd9..=0xdb => {
                let n = self.be(1 << (b - 0xd9))? as usize;
                self.str(n)?
            }
            0xdc | 0xdd => {
                let n = self.be(2 << (b - 0xdc))?;
                self.array(n, depth)?
            }
            0xde | 0xdf => {
                let n = self.be(2 << (b - 0xde))?;
                self.map(n, depth)?
            }
            0xe0..=0xff => Mp::Int,
            // ext types and reserved 0xc1 are not part of tree nodes.
            _ => return Err(()),
        })
    }
    fn str(&mut self, n: usize) -> Result<Mp, ()> {
        let s = std::str::from_utf8(self.take(n)?).map_err(|_| ())?;
        Ok(Mp::Str(s.to_owned()))
    }
    fn array(&mut self, n: u64, depth: usize) -> Result<Mp, ()> {
        let n = self.count(n)?;
        let mut items = Vec::with_capacity(n);
        for _ in 0..n {
            items.push(self.value(depth + 1)?);
        }
        Ok(Mp::Array(items))
    }
    fn map(&mut self, n: u64, depth: usize) -> Result<Mp, ()> {
        let n = self.count(n)?;
        let mut pairs = Vec::with_capacity(n);
        for _ in 0..n {
            pairs.push((self.value(depth + 1)?, self.value(depth + 1)?));
        }
        Ok(Mp::Map(pairs))
    }
}
