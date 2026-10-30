from pathlib import Path
import re, sys

root=Path(__file__).resolve().parents[1]
migrations="\n".join(p.read_text() for p in sorted((root/"migrations").glob("*.sql")))

checks = {
    "runtime NOSUPERUSER": "CREATE ROLE arkhe_append NOLOGIN NOSUPERUSER NOBYPASSRLS" in migrations,
    "read NOSUPERUSER": "CREATE ROLE arkhe_read NOLOGIN NOSUPERUSER NOBYPASSRLS" in migrations,
    "FORCE RLS": "FORCE ROW LEVEL SECURITY" in migrations,
    "append-only trigger": "BEFORE UPDATE OR DELETE" in migrations,
    "explicit revoke": "REVOKE UPDATE, DELETE, TRUNCATE" in migrations,
    "tenant assert": "app.tenant_id is not set" in migrations,
    "operation idempotency": "PRIMARY KEY (tenant_id, operation_type, idempotency_key)" in migrations,
    "MMR profile digest": "profile_digest" in migrations,
}
bad=[]
for name, ok in checks.items():
    print(("PASS" if ok else "FAIL"), name)
    if not ok: bad.append(name)
raise SystemExit(1 if bad else 0)
