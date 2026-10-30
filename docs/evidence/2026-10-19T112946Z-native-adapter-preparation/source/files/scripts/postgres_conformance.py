"""Apply the real arkhe-sql migrations and security gates to an EMPTY test DB.
Requires an already-running PostgreSQL 16 container; no ports or admin URL needed.
"""
import argparse
import subprocess
import uuid
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', default='podman')
    parser.add_argument('--connection')
    parser.add_argument('--container', required=True)
    parser.add_argument('--sql-root', type=Path, default=Path(__file__).resolve().parents[1]/'storage/sql')
    args=parser.parse_args()
    engine=[args.engine]+(['--connection',args.connection] if args.connection else [])
    psql=engine+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']
    version=subprocess.check_output(psql+['-Atqc','SHOW server_version_num'],text=True).strip()
    if not 160000 <= int(version) < 170000: raise SystemExit('FAIL PostgreSQL 16 required')
    migrations=sorted((args.sql_root/'migrations').glob('*.sql'))
    if len(migrations)!=12: raise SystemExit('FAIL expected twelve arkhe-sql migrations')
    gate=args.sql_root/'tests/postgres16/phase1_security_gates.sql'
    if not gate.is_file(): raise SystemExit('FAIL missing security gates')
    database='arkhe_conformance_'+uuid.uuid4().hex
    subprocess.run(psql,input=('CREATE DATABASE '+database+';').encode(),check=True)
    psql[-1]=database
    print('Isolated test database: '+database,flush=True)
    for path in migrations+[gate,args.sql_root/'tests/postgres16/bugbounty_security_gates.sql']:
        print('Applying '+path.name,flush=True)
        subprocess.run(psql,input=path.read_bytes(),check=True)
    print('PASS PostgreSQL 16: arkhe-sql migrations + real RLS/append-only gates')
if __name__=='__main__': main()
