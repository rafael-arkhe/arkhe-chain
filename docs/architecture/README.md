# Reorganization record

- `moves.json`: promoted environment root and assigned the 13 original bundles to layers.
- `additional-moves.json`: archived superseded workspace definitions and placed adapters.
- `operational-moves.json`: preserved obsolete CI, SQL credentials/compose examples and legacy operational SQL.

Directory changes used verified absolute paths within this workspace. Existing
PostgreSQL data and generated credentials were retained. Original Cargo workspace
manifests/locks, Node lock snapshots, workflow definitions and source manifests
are preserved under `archive/workspace-manifests`; historical P0/Phase A trees
remain source snapshots rather than active competing implementations.

The current authority is the root Cargo/pnpm workspace and `config/architecture.json`.
`python scripts/check_architecture.py` validates layout/contracts; source identities
are refreshed and checked with `python scripts/source_manifest.py --write`.
Source manifests exclude generated build output, caches and local credentials.
