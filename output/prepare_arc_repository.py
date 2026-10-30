"""Export the Arc work and its local dependency closure, without runtime state."""
import hashlib,json,re,shutil,tomllib
from pathlib import Path
SRC=Path('D:/arkhe')
DST=SRC/'output/arkhe-arc-repository'
SKIP={'node_modules','target','__pycache__','.git','dist','pkg'}
records=[]
def copy(relative):
    source=SRC/relative
    files=source.rglob('*') if source.is_dir() else [source]
    for file in files:
        if not file.is_file() or any(p in SKIP for p in file.relative_to(SRC).parts): continue
        rel=file.relative_to(SRC)
        if file.name.startswith('.env') and file.name not in ('.env.example','.env.template'): continue
        target=DST/rel;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(file,target)
        records.append({'path':rel.as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
members=['kernel/arkhe-core','evidence/arkhe-wormgraph','storage/sql/crates/arkhe-sql','storage/sql/crates/arkhe-sql-migrate','verification/crates/arkhe-verify-core','verification/crates/arkhe-verify-cli']
for path in members+['storage/sql/migrations','storage/sql/docs','storage/sql/schema','storage/sql/sql','storage/sql/tests','storage/sql/scripts','storage/sql/README.md','storage/sql/Makefile','verification/tests','verification/vectors','verification/docs','verification/scripts','integrations/arc-observer','integrations/cosign','tests/golden_vectors.json','tests/classification_vectors.json','integration/arkhe-gov/fixtures/cin-synthetic.json','config/migrations.lock.json','Cargo.lock','rust-toolchain.toml','.cargo/config.toml']:
    copy(path)
for path in sorted((SRC/'docs').glob('ARC-*.md')): copy(path.relative_to(SRC))
for path in sorted((SRC/'output').iterdir()):
    if path.is_dir() and path.name.startswith(('arc-','memo-postgres-audit-')): copy(path.relative_to(SRC))
for name in ['memo_postgres_audit.py']:
    copy('scripts/'+name)
toml=(SRC/'Cargo.toml').read_text()
toml=re.sub(r'members = \[.*?\]', 'members = '+json.dumps(members,indent=2),toml,count=1,flags=re.S)
(DST/'Cargo.toml').write_text(toml)
(DST/'package.json').write_text(json.dumps({'name':'@arkhe/arc','version':'0.1.0','private':True,'packageManager':'pnpm@11.25.0','engines':{'node':'^22.22.2 || ^24.15.0 || >=26.0.0'},'scripts':{'test':'pnpm --filter @arkhe/sigstore-verifier test','check:release':'python scripts/check_release.py'}},indent=2)+'\n')
(DST/'pnpm-workspace.yaml').write_text('packages:\n  - "integrations/cosign"\n')
shutil.copyfile(SRC/'pnpm-lock.yaml',DST/'pnpm-lock.yaml')
(DST/'docs/provenance').mkdir(parents=True,exist_ok=True)
(DST/'docs/provenance/source-export.json').write_text(json.dumps({'source':'Arkhe local workspace snapshot','export_date':'2026-10-23','scope':'Arc work and six-crate local dependency closure; unrelated applications and operational state excluded','byte_identical_copies':records,'adapted_files':['Cargo.toml','package.json','pnpm-workspace.yaml','Cargo.lock','pnpm-lock.yaml']},indent=2)+'\n')
notes=[('cd1e6405-2510-4efc-ba65-1fd32601fc27','01-platform-review'),('19ca9e25-2e24-431a-98d5-2bcb7808f887','02-hypothesis-review'),('375907ca-2b51-49b0-8d75-9e7c9455b8b4','03-data-gap'),('ed5a37ea-f40a-44b2-a338-c5c38412da8f','04-brazil-data'),('b1433bb2-ed31-45f5-a89d-074f60623703','05-resources'),('a6ac7386-3764-4b18-9eba-57b60345e418','06-arkhe-arc'),('c624eb84-6f16-47f4-93c8-a697f99120ad','07-inclusion-limits'),('8ba20f1e-588e-497d-8062-e408954e51ba','08-scope'),('614d5af6-a055-4b64-9ac1-950de0339ddf','09-prototype-review'),('593b7319-3e6c-4451-bdcb-53b8d2cd78c1','10-first-execution'),('6d811398-db5e-4280-b48a-bce826c12d97','11-mutation-survivors'),('5fdf29d9-0684-40d4-9b5b-f9fc4ba56678','12-real-capture'),('b1dc716c-fa96-4f47-96ad-3e72ad0ad1c9','13-reference-rule'),('d376ec4e-ce50-4cca-ba80-52041b700119','14-memo-rule'),('b4665ad2-08bb-43ef-820d-62e166a867c3','15-rust-memo-verification'),('49ed44b2-aed2-437a-b8f4-a99ead969168','16-ecosystem-review'),('9c9a045c-cb53-4851-ae30-7b239aeb3b79','17-persistence-review'),('5fe3de3b-bc1f-4440-9c07-622ff16a19ea','18-funding-notes'),('963734c5-3c7d-4671-89cf-50f9c23d4d7a','19-pilot-contact-notes')]
dest=DST/'docs/research/user-supplied';dest.mkdir(parents=True,exist_ok=True)
for id,name in notes:
    f=Path('C:/Users/Lemes/.codex/attachments')/id/'Texto colado.txt'
    if f.exists():
        (dest/(name+'.md')).write_text('> Historical user-supplied material, not independently verified for this release. Claims and labels in the original text are not release guarantees. Later technical documents supersede earlier proposals.\n\n'+f.read_text(encoding='utf-8'),encoding='utf-8')
print(f'Copied {len(records)} source/evidence files; {len(notes)} historical notes; {sum(r["bytes"] for r in records):,} bytes')
