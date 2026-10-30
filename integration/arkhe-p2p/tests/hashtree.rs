//! Offline verification of the public E02 Hashtree publication (root ce3b3bb9…).
//! Blocks were fetched from Blossom and stored unchanged; expected digests come
//! from Git (`fixtures/e02-hashtree/expected.json`), never from the blocks.
use arkhe_p2p::{
    hashtree::{BlockSource, DirBlockSource, EntryKind, HashtreeCid, HashtreeVerifier, TreeLimits},
    verify::ExpectedDigests,
    Error,
};
use serde_json::Value;
use std::cell::RefCell;
use std::path::{Path, PathBuf};

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/e02-hashtree");
const WASM: &str = "verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm_bg.wasm";

fn hex32(text: &str) -> [u8; 32] {
    hex::decode(text).unwrap().try_into().unwrap()
}
fn expected() -> Value {
    serde_json::from_str(&std::fs::read_to_string(format!("{FIXTURE}/expected.json")).unwrap())
        .unwrap()
}
fn root() -> HashtreeCid {
    let e = expected();
    HashtreeCid {
        hash: hex32(e["hashtree_root"]["hash"].as_str().unwrap()),
        key: Some(hex32(e["hashtree_root"]["key"].as_str().unwrap())),
    }
}
fn digests(path: &str) -> ExpectedDigests {
    let e = expected();
    let f = e["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == path)
        .unwrap();
    ExpectedDigests {
        sha256: hex32(f["sha256"].as_str().unwrap()),
        blake3: hex32(f["blake3"].as_str().unwrap()),
    }
}
fn blocks() -> DirBlockSource {
    DirBlockSource::new(format!("{FIXTURE}/blocks"))
}

/// Copy of the fixture blocks that a test may damage.
struct Scratch(PathBuf);
impl Scratch {
    fn new(tag: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("arkhe-p2p-ht-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        copy_dir(Path::new(&format!("{FIXTURE}/blocks")), &dir);
        Self(dir)
    }
    fn source(&self) -> DirBlockSource {
        DirBlockSource::new(&self.0)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}
/// Every working-tree file of the publication reconstructs to the Git bytes.
#[test]
fn all_e02_files_match_git_digests() {
    let source = blocks();
    let verifier = HashtreeVerifier::new(&source, root(), TreeLimits::default());
    let mut seen = vec![];
    let mut stack = vec![String::new()];
    while let Some(dir) = stack.pop() {
        for entry in verifier.list_dir(&dir).unwrap() {
            let path = if dir.is_empty() {
                entry.name.clone()
            } else {
                format!("{dir}/{}", entry.name)
            };
            match entry.kind {
                EntryKind::Dir if path != ".git" => stack.push(path),
                EntryKind::Dir => {}
                EntryKind::File => seen.push(path),
            }
        }
    }
    seen.sort();
    let e = expected();
    let files: Vec<&str> = e["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["path"].as_str().unwrap())
        .collect();
    let mut sorted = files.clone();
    sorted.sort();
    assert_eq!(
        seen, sorted,
        "tree working files differ from the Git commit"
    );
    assert_eq!(files.len(), 108);
    for path in files {
        let blob = verifier.verify_file(path, digests(path)).unwrap();
        assert_eq!(blob.digests().sha256, digests(path).sha256);
    }
}

/// D0 × D1: artifacts named by the retroactive E02 ReleaseManifest vector verify
/// against the Hashtree root recorded in that same manifest.
#[test]
fn release_manifest_artifacts_verify_from_hashtree() {
    let vectors: Value = serde_json::from_str(
        &std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/release_manifest_vectors.json"
        ))
        .unwrap(),
    )
    .unwrap();
    let manifest = &vectors["vectors"][0]["input"];
    assert_eq!(vectors["vectors"][0]["id"], "Release-e02-retroactive");
    let bytes32 = |v: &Value| -> [u8; 32] {
        v.as_array()
            .unwrap()
            .iter()
            .map(|b| b.as_u64().unwrap() as u8)
            .collect::<Vec<_>>()
            .try_into()
            .unwrap()
    };
    let cid = HashtreeCid {
        hash: bytes32(&manifest["hashtree"]["root_hash"]),
        key: Some(bytes32(&manifest["hashtree"]["decrypt_key"])),
    };
    assert_eq!(cid, root());
    let source = blocks();
    let verifier = HashtreeVerifier::new(&source, cid, TreeLimits::default());
    for artifact in manifest["artifacts"].as_array().unwrap() {
        let expected = ExpectedDigests {
            sha256: bytes32(&artifact["sha256"]),
            blake3: bytes32(&artifact["blake3"]),
        };
        let blob = verifier
            .verify_file(artifact["path"].as_str().unwrap(), expected)
            .unwrap();
        assert_eq!(
            blob.bytes().len() as u64,
            artifact["size"].as_u64().unwrap()
        );
    }
}

#[test]
fn wrong_expected_digest_is_rejected() {
    let source = blocks();
    let verifier = HashtreeVerifier::new(&source, root(), TreeLimits::default());
    let mut d = digests("README.md");
    d.blake3[0] ^= 1;
    assert!(matches!(
        verifier.verify_file("README.md", d),
        Err(Error::Blake3Mismatch)
    ));
    let mut d = digests("README.md");
    d.sha256[0] ^= 1;
    assert!(matches!(
        verifier.verify_file("README.md", d),
        Err(Error::Sha256Mismatch)
    ));
    // Correct digests for a different file do not authenticate this path.
    assert!(verifier.verify_file("README.md", digests(WASM)).is_err());
}

/// Records which blocks one verification touches.
struct Recording<'a>(&'a DirBlockSource, RefCell<Vec<[u8; 32]>>);
impl BlockSource for Recording<'_> {
    fn get(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>, Error> {
        self.1.borrow_mut().push(*hash);
        self.0.get(hash)
    }
}

/// Flipping one bit, truncating one byte or deleting any block the chunked
/// file uses breaks verification; damaging an unrelated block does not.
#[test]
fn corrupted_truncated_or_missing_blocks_are_rejected() {
    let scratch = Scratch::new("damage");
    let source = scratch.source();
    let recording = Recording(&source, RefCell::new(vec![]));
    HashtreeVerifier::new(&recording, root(), TreeLimits::default())
        .verify_file(WASM, digests(WASM))
        .unwrap();
    let used = recording.1.into_inner();
    // Root, two directories and the chunked file node with its chunks.
    assert!(used.len() >= 5, "{} blocks", used.len());
    let unrelated = ["README.md", ".gitignore"].map(|p| {
        let r = Recording(&source, RefCell::new(vec![]));
        HashtreeVerifier::new(&r, root(), TreeLimits::default())
            .verify_file(p, digests(p))
            .unwrap();
        let leaf = *r.1.borrow().last().unwrap();
        leaf
    });
    for hash in used.iter().chain(&unrelated) {
        let block = source.path_for(hash);
        let original = std::fs::read(&block).unwrap();
        let mut flipped = original.clone();
        flipped[original.len() / 2] ^= 0x01;
        for damage in [
            Some(flipped),
            Some(original[..original.len() - 1].to_vec()),
            None,
        ] {
            match &damage {
                Some(bytes) => std::fs::write(&block, bytes).unwrap(),
                None => std::fs::remove_file(&block).unwrap(),
            }
            let result = HashtreeVerifier::new(&source, root(), TreeLimits::default())
                .verify_file(WASM, digests(WASM));
            std::fs::write(&block, &original).unwrap();
            if !used.contains(hash) {
                assert!(result.is_ok(), "unrelated block affected the file");
                continue;
            }
            match (result, damage.is_some()) {
                (Err(Error::HashtreeInvalid("block SHA-256")), true) => {}
                (Err(Error::BlockUnavailable(h)), false) => assert_eq!(&h, hash),
                (other, _) => panic!("block {}: {other:?}", hex::encode(hash)),
            }
        }
    }
}

#[test]
fn wrong_key_or_root_is_rejected() {
    let source = blocks();
    let mut cid = root();
    cid.key.as_mut().unwrap()[0] ^= 1;
    let verifier = HashtreeVerifier::new(&source, cid, TreeLimits::default());
    assert!(matches!(
        verifier.verify_file("README.md", digests("README.md")),
        Err(Error::HashtreeInvalid("CHK decryption"))
    ));
    let mut cid = root();
    cid.key = None; // ciphertext is not a directory node
    let verifier = HashtreeVerifier::new(&source, cid, TreeLimits::default());
    assert!(verifier
        .verify_file("README.md", digests("README.md"))
        .is_err());
    let mut cid = root();
    cid.hash[31] ^= 1;
    let verifier = HashtreeVerifier::new(&source, cid, TreeLimits::default());
    assert!(matches!(
        verifier.verify_file("README.md", digests("README.md")),
        Err(Error::BlockUnavailable(_))
    ));
}

#[test]
fn absent_paths_and_limits() {
    let source = blocks();
    let verifier = HashtreeVerifier::new(&source, root(), TreeLimits::default());
    assert!(matches!(
        verifier.verify_file("no/such/file", digests("README.md")),
        Err(Error::PathAbsent)
    ));
    for bad in ["", "/README.md", "a//b", "../README.md", "specs/./e02"] {
        assert!(matches!(
            verifier.verify_file(bad, digests("README.md")),
            Err(Error::InvalidInput)
        ));
    }
    assert!(verifier.verify_file("specs", digests("README.md")).is_err());
    let tight = |limits: TreeLimits| {
        HashtreeVerifier::new(&source, root(), limits)
            .verify_file(WASM, digests(WASM))
            .unwrap_err()
    };
    let base = TreeLimits::default();
    assert!(matches!(
        tight(TreeLimits {
            max_blocks: 3,
            ..base
        }),
        Error::TooLarge
    ));
    assert!(matches!(
        tight(TreeLimits {
            max_file_bytes: 345_982,
            ..base
        }),
        Error::TooLarge
    ));
    assert!(matches!(
        tight(TreeLimits {
            max_fetched_bytes: 4096,
            ..base
        }),
        Error::TooLarge
    ));
}

#[test]
fn nhash_decoding() {
    let cid = HashtreeCid::from_nhash(
        "nhash1qqs0w5kv22as6p4a5fawc8a68wlulwfuq0v0aht8ekpp0wuqhzjdpuq9yznl7ngtx7cpslhfu6g583qsq4xx9r0dhfj36eycgjftlqmvd9t7xkk84gu",
    )
    .unwrap();
    assert_eq!(
        hex::encode(cid.hash),
        "f752cc52bb0d06bda27aec1fba3bbfcfb93c03d8fedd67cd8217bb80b8a4d0f0"
    );
    assert_eq!(
        hex::encode(cid.key.unwrap()),
        "a7ff4d0b37b0187ee9e69143c410054c628dedba651d64984492bf836c6957e3"
    );
    // Checksum, prefix and encoding failures.
    for bad in [
        "nhash1qqs0w5kv22as6p4a5fawc8a68wlulwfuq0v0aht8ekpp0wuqhzjdpuq9yznl7ngtx7cpslhfu6g583qsq4xx9r0dhfj36eycgjftlqmvd9t7xkk84gv",
        "npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett",
        "",
    ] {
        assert!(HashtreeCid::from_nhash(bad).is_err(), "{bad}");
    }
}
