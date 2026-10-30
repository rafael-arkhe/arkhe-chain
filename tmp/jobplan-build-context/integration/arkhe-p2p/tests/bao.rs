use arkhe_p2p::{
    verify::{BaoVerifier, ExpectedDigests},
    Error,
};
use sha2::{Digest, Sha256};
use std::{
    cell::Cell,
    io::{Cursor, Read},
    rc::Rc,
};

fn digests(bytes: &[u8]) -> ExpectedDigests {
    ExpectedDigests {
        sha256: Sha256::digest(bytes).into(),
        blake3: *blake3::hash(bytes).as_bytes(),
    }
}

struct Counted {
    data: Cursor<Vec<u8>>,
    read: Rc<Cell<usize>>,
}
impl Read for Counted {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let n = self.data.read(buffer)?;
        self.read.set(self.read.get() + n);
        Ok(n)
    }
}

#[test]
fn bao_accepts_empty_and_multiple_chunk_boundaries() {
    for size in [0, 1, 1023, 1024, 1025, 16384, 16385, 131072] {
        let plain = vec![7; size];
        let (encoded, root) = bao::encode::encode(&plain);
        assert_eq!(root.as_bytes(), &digests(&plain).blake3);
        let result = BaoVerifier::new(digests(&plain), size.max(1))
            .unwrap()
            .verify(&encoded[..])
            .unwrap();
        assert_eq!(result.bytes(), plain);
    }
}

#[test]
fn corrupt_first_parent_is_rejected_before_reading_the_blob() {
    let plain = vec![7; 1024 * 1024];
    let (mut encoded, _) = bao::encode::encode(&plain);
    encoded[8] ^= 1;
    let total = encoded.len();
    let count = Rc::new(Cell::new(0));
    let input = Counted {
        data: Cursor::new(encoded),
        read: count.clone(),
    };
    assert!(matches!(
        BaoVerifier::new(digests(&plain), plain.len())
            .unwrap()
            .verify(input),
        Err(Error::BaoInvalid)
    ));
    assert!(
        count.get() < 1024,
        "read {} of {total} encoded bytes",
        count.get()
    );
}

#[test]
fn independently_wrong_roots_and_sha_are_rejected() {
    let plain = b"synthetic";
    let (encoded, _) = bao::encode::encode(plain);
    let mut expected = digests(plain);
    expected.blake3 = [0; 32];
    assert!(matches!(
        BaoVerifier::new(expected, 100)
            .unwrap()
            .verify(&encoded[..]),
        Err(Error::BaoInvalid)
    ));
    expected = digests(plain);
    expected.sha256 = [0; 32];
    assert!(matches!(
        BaoVerifier::new(expected, 100)
            .unwrap()
            .verify(&encoded[..]),
        Err(Error::Sha256Mismatch)
    ));
}

#[test]
fn truncated_data_changed_size_and_trailing_bytes_fail_closed() {
    let plain = vec![4; 32768];
    let (encoded, _) = bao::encode::encode(&plain);
    let verifier = BaoVerifier::new(digests(&plain), plain.len()).unwrap();
    for cut in [0, 7, 8, 71, encoded.len() - 1] {
        assert!(verifier.verify(&encoded[..cut]).is_err());
    }
    let mut trailing = encoded.clone();
    trailing.push(1);
    assert!(matches!(
        verifier.verify(&trailing[..]),
        Err(Error::BaoInvalid)
    ));
    let mut changed = encoded;
    changed[0] ^= 1;
    assert!(verifier.verify(&changed[..]).is_err());
}

#[test]
fn excessive_claimed_size_is_rejected_after_only_the_header() {
    let count = Rc::new(Cell::new(0));
    let input = Counted {
        data: Cursor::new(u64::MAX.to_le_bytes().to_vec()),
        read: count.clone(),
    };
    assert!(matches!(
        BaoVerifier::new(digests(b""), 100).unwrap().verify(input),
        Err(Error::TooLarge)
    ));
    assert_eq!(count.get(), 8);
    assert!(BaoVerifier::new(digests(b""), 0).is_err());
}
