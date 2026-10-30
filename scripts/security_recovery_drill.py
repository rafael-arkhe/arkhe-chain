"""Isolated recovery/rotation rehearsal with synthetic data only. Never opens live storage."""
import hashlib, json, secrets, sqlite3, tempfile
from datetime import datetime, timezone
from pathlib import Path

def main():
    with tempfile.TemporaryDirectory(prefix='arkhe-security-drill-') as directory:
        root=Path(directory)
        source=sqlite3.connect(root/'source.sqlite')
        source.execute('CREATE TABLE documents(id TEXT PRIMARY KEY, body TEXT)')
        source.execute('INSERT INTO documents VALUES(?,?)',('synthetic','fixture only'))
        source.commit()
        backup=sqlite3.connect(root/'backup.sqlite')
        source.backup(backup); backup.close()
        restored=sqlite3.connect(root/'restored.sqlite')
        backup=sqlite3.connect(root/'backup.sqlite'); backup.backup(restored)
        assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert restored.execute('SELECT * FROM documents').fetchall()==source.execute('SELECT * FROM documents').fetchall()
        old=secrets.token_bytes(32); new=secrets.token_bytes(32)
        active_hash=hashlib.sha256(new).digest()
        assert active_hash != hashlib.sha256(old).digest()
        for connection in [source,backup,restored]: connection.close()
        report={'at':datetime.now(timezone.utc).isoformat(),'scope':'synthetic-only; not production backup or credential rotation','sqliteBackupRestore':'PASS','integrityCheck':'PASS','syntheticCredentialReplacement':'PASS','backupSha256':hashlib.sha256((root/'backup.sqlite').read_bytes()).hexdigest()}
    output=Path('docs/evidence/security/2026-10-21');output.mkdir(parents=True,exist_ok=True)
    (output/'recovery-drill.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
if __name__=='__main__': main()
