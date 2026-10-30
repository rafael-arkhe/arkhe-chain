# Publisher teaching laboratory

Run from the repository root:

```powershell
python docs/ebook/lab/publisher.py --output docs/ebook/evidence/publisher-demo.json
python -m unittest discover -s docs/ebook/lab -v
```

Python standard library only. No network, credentials, production databases,
payments, or external publication. All database files are created in isolated
temporary directories and removed by their owning temporary-directory context.
The explicit JSON output persists at the requested location.

This is a teaching model with its own `book-publisher-lab/v1` profile, NOT an
implementation of Arkhe wire types. It uses SHA-256, deterministic JSON and a
fixture HMAC, not Arkhe CBOR/BLAKE3, Ed25519, COSE, PQC or a public signature.
Its local journal has no owner-token recovery API, production tenancy layer,
concurrency qualification, or hardware isolation guarantee. The destination
is a second local database used to demonstrate uncertainty across two commits.

Do not deploy this code or reuse its fixture keys. The book explains how its
lessons map to the inspected native contracts and where the mapping stops.
