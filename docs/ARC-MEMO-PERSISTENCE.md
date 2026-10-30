# Durable memo observation packages in PgWormGraph

The exported checkpoint can now be independently submitted to and checked against
[public Rekor](ARC-MEMO-REKOR.md). That optional adapter does not change the
transactional storage path described here.

This opt-in path stores the existing memo package after local consistency
verification. It does not authorize a payment, authenticate the RPC/invoice, or
submit anything to an external transparency service.

## Reused storage and atomic write

The existing tenant-scoped `wormgraph_records`, `mmr_checkpoints`, append ordering,
tenant advisory lock, SQL roles and append-only machinery are reused. The additive
migration `20261023000017_memo_observations.sql` adds only
`memo_observation_packages`, with ENABLE/FORCE RLS, restricted grants, immutable
rows, envelope/checkpoint foreign keys and a unique tenant/operation binding.
Historical migration files are unchanged; the new source hash is appended to the
existing migration lock. The RLS audit includes the new table.

`PgWormGraph::commit_memo_observation` verifies the raw memo and reconciliation,
serializes the MemoPackage and computes a new domain-separated package identity.
Within one transaction (synchronous_commit=on), it:

1. Serializes against other appends for that tenant.
2. Checks replay: identical operation/package returns the retained receipt;
   different bytes for an already bound operation fail.
3. Appends a `MemoObservationPackage/v1` envelope, explicitly NOT a work
   authorization or externally authenticated source admission.
4. Rebuilds the bounded tenant prefix MMR using existing graph record hashes and
   stores/compares the checkpoint with the existing stream/profile semantics.
5. Inserts the exact serialized package bytes and its retained checkpoint count.
6. Commits all three components together.

The caller remains responsible for authenticating who may submit an observation
and selecting the tenant. No new unauthenticated HTTP ingestion route is added.
Existing EvidenceReader/EvidenceCommitter interfaces and WorkIntent/WER identities
are unchanged. The new table is a payload store, not a replacement schema.

## Recovery and offline verification

`export_memo_observation` reads the retained package and envelope, checks the
package digest and operation binding, reloads the original checkpoint and rebuilds
its prefix. It derives a graph inclusion path, then verifies the complete export.
Older retained checkpoints remain recoverable after more records are appended.
The current prefix rebuild is bounded to one million leaves; it is a reference
implementation, not an incremental performance claim.

There are two distinct MMR contexts:

- The original reconciliation bundle's local record/checkpoint, unchanged.
- The durable tenant graph checkpoint, whose leaves are stored package identities
  (or other existing graph record hashes), NOT raw reconciliation record bytes.

The export carries exact package bytes, graph membership and graph identity.
`verify_export` requires a separately supplied tenant/stream/root/count/profile
pin and independently rechecks package identity, graph membership and the memo
reconciliation. The demo exports that pin from the SAME local database: it is
retained local trust, not an externally authenticated or distributed anchor.
No Rekor receipt, external timestamp, independent consensus proof or checkpoint
freshness claim follows from a successful check.

## Executed process-crash experiment

Run the audit with the existing labelled PostgreSQL 16 container reachable on the
local runtime connection:

```powershell
python scripts/memo_postgres_audit.py
```

The script provisions a fresh isolated database and restricted login, applies all
17 migrations through SQLx, runs checksum/RLS/append-only audits, builds the example,
and explicitly runs the otherwise ignored PostgreSQL integration test:

```powershell
cargo test --locked -p arkhe-wormgraph --test memo_postgres -- --ignored --nocapture --test-threads=1
```

The test requires `ARKHE_MEMO_DATABASE_URL`, `ARKHE_MEMO_TEST_ADMIN_URL` and
`ARKHE_MEMO_EXAMPLE_BINARY`; the audit configures these privately. Credentials are
retained only under ignored ops/local and subprocess environments, not public logs.
Do not run this test against a production or shared database: it installs a
test-only trigger in its isolated database to pause an uncommitted insert.

Observed checks:

- A child writer commits, flushes its receipt and is forcibly killed. A new
  connection loads the exact package bytes and verifies them successfully.
- Replay returns the same record/checkpoint; a coherent changed package with the
  same operation is rejected.
- Three graph leaves produce a verified export; the first checkpoint still
  reconstructs. Wrong pins, package corruption and an excessive leaf index fail.
- A second tenant cannot export the first tenant's record. A direct SQL read
  WITHOUT an application tenant predicate also returns zero under the other
  tenant context, exercising database RLS rather than just WHERE filtering.
- The restricted append role cannot UPDATE stored package rows.
- A test-only trigger pauses after envelope/checkpoint insertion but before
  package insertion. The writer is killed, the server backend is observed to
  close, and all three tables contain zero rows for the uncommitted tenant.

The test kills application processes; it does NOT restart PostgreSQL, simulate a
power failure, or qualify storage hardware. Existing application data/volumes are
not modified. Isolated audit databases are retained for inspection.

## Retained evidence

- [Final audit summary](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/summary.json).
- [Real PostgreSQL crash/recovery test output](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/crash-and-recovery.log).
- [Offline verification after DB reconstruction](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/offline-verify.log).
- [Exported durable proof](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/export/export.json).
- [Checksum audit](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/checksum-verify.log),
  [RLS audit](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/rls-audit.log),
  [append-only audit](../output/memo-postgres-audit-8cfd83aa088742daac03a176160a3713/append-only-audit.log).

The captured memo is real Testnet RPC evidence; its invoice remains synthetic.
External anchoring, authenticated source capture, fiscal validation, independent
checkpoint distribution and commercial demand remain separate work. Durable
storage is not evidence that a buyer values the feature or that competitors lack it.

## CLI

The example `memo_persistence` supports:

```text
commit BUNDLE TRUST
commit-hold BUNDLE TRUST         # crash-test helper only
export RECORD_HASH NEW_DIRECTORY
verify EXPORT GRAPH_PIN         # offline; no DB environment/connection required
```

Database commands require ARKHE_MEMO_DATABASE_URL and ARKHE_MEMO_TENANT. Keep URLs
in the environment and never paste credentials into command lines or public logs.
